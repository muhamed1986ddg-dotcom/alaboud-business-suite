const crypto = require("crypto");
const { mapState, TABLE_ORDER } = require("./StateToRelationalMapper");

const TABLE_COLUMNS = {
  companies: ["id","name","code","base_currency","is_active","created_at","updated_at","raw_payload"],
  users: ["id","company_id","username","email","password_hash","role","is_active","last_login_at","created_at","updated_at","raw_payload"],
  customers: ["id","company_id","name","phone","email","address","credit_limit_cad","opening_balance_cad","is_active","created_at","updated_at","raw_payload"],
  partners: ["id","company_id","name","connector_type","external_account_id","is_active","created_at","updated_at","raw_payload"],
  transactions: ["id","company_id","customer_id","partner_id","transaction_type","status","amount","currency","exchange_rate","cad_amount","cost_cad","profit_cad","reference_number","transaction_date","created_by","created_at","updated_at","raw_payload"],
  payments: ["id","company_id","customer_id","transaction_id","amount","currency","exchange_rate","cad_amount","payment_date","created_by","created_at","raw_payload"],
  debts: ["id","company_id","customer_id","partner_id","direction","status","amount","currency","exchange_rate","cad_amount","due_date","description","created_by","created_at","updated_at","raw_payload"],
  debt_payments: ["id","company_id","debt_id","amount","currency","exchange_rate","cad_amount","payment_date","created_by","created_at","raw_payload"],
  expenses: ["id","company_id","category","description","amount","currency","exchange_rate","cad_amount","expense_date","created_by","created_at","updated_at","raw_payload"],
  capital_movements: ["id","company_id","movement_type","amount","currency","exchange_rate","cad_amount","description","movement_date","created_by","created_at","raw_payload"],
  exchange_rates: ["id","company_id","base_currency","quote_currency","buy_rate","sell_rate","source","effective_at","created_at","raw_payload"],
  settings: ["company_id","setting_key","setting_value","updated_at"],
  audit_logs: ["company_id","user_id","action","entity_type","entity_id","ip_address","details","created_at"]
};
const PK_COLUMNS = { settings: ["company_id","setting_key"], audit_logs: [] };
const DELETE_ORDER = [...TABLE_ORDER].reverse();

class RelationalMigrationEngine {
  constructor({ pool, logger = console }) { this.pool = pool; this.logger = logger; }

  async migrate(source, { sourceType = "app_state", sourceReference = null } = {}) {
    const runId = crypto.randomUUID();
    const mapped = mapState(source);
    const sourceCounts = Object.fromEntries(TABLE_ORDER.map((table) => [table, mapped[table].length]));
    const insertedIds = Object.fromEntries(TABLE_ORDER.map((table) => [table, []]));
    const insertedCounts = Object.fromEntries(TABLE_ORDER.map((table) => [table, 0]));
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`INSERT INTO data_import_runs(id, source_type, source_reference, status, source_counts)
        VALUES ($1,$2,$3,'running',$4::jsonb)`, [runId, sourceType, sourceReference, JSON.stringify(sourceCounts)]);
      for (const table of TABLE_ORDER) {
        for (const row of mapped[table]) {
          const result = await this.insertRow(client, table, row);
          if (result.inserted) {
            insertedCounts[table] += 1;
            insertedIds[table].push(result.key);
          }
        }
      }
      const verification = await this.verifyWithClient(client, sourceCounts, insertedCounts);
      await client.query(`UPDATE data_import_runs SET status='completed', inserted_counts=$2::jsonb, inserted_ids=$3::jsonb,
        verification=$4::jsonb, completed_at=NOW() WHERE id=$1`, [runId, JSON.stringify(insertedCounts), JSON.stringify(insertedIds), JSON.stringify(verification)]);
      await client.query("COMMIT");
      return { runId, sourceCounts, insertedCounts, insertedIds, verification };
    } catch (error) {
      await client.query("ROLLBACK");
      try { await this.pool.query(`INSERT INTO data_import_runs(id, source_type, source_reference, status, source_counts, error_message, completed_at)
        VALUES ($1,$2,$3,'failed',$4::jsonb,$5,NOW()) ON CONFLICT (id) DO UPDATE SET status='failed', error_message=$5, completed_at=NOW()`,
        [runId, sourceType, sourceReference, JSON.stringify(sourceCounts), error.message]); } catch (_) {}
      throw error;
    } finally { client.release(); }
  }

  async insertRow(client, table, row) {
    const columns = TABLE_COLUMNS[table];
    const values = columns.map((column) => {
      const value = row[column];
      return ["raw_payload","setting_value","details"].includes(column) ? JSON.stringify(value || {}) : value;
    });
    const params = columns.map((_, index) => `$${index + 1}${["raw_payload","setting_value","details"].includes(columns[index]) ? '::jsonb' : ''}`).join(",");
    const conflict = table === "settings" ? "(company_id, setting_key) DO NOTHING" : table === "audit_logs" ? "DO NOTHING" : "(id) DO NOTHING";
    const returning = table === "settings" ? "company_id, setting_key" : table === "audit_logs" ? "id" : "id";
    const result = await client.query(`INSERT INTO ${table} (${columns.join(",")}) VALUES (${params}) ON CONFLICT ${conflict} RETURNING ${returning}`, values);
    if (!result.rowCount) return { inserted: false, key: null };
    const returned = result.rows[0];
    const key = table === "settings" ? [returned.company_id, returned.setting_key] : returned.id;
    return { inserted: true, key };
  }

  async verifyWithClient(client, sourceCounts, insertedCounts) {
    const tables = {};
    let ok = true;
    for (const table of TABLE_ORDER) {
      const countResult = await client.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
      const totalRows = countResult.rows[0].count;
      const expectedInserted = insertedCounts[table];
      const tableOk = totalRows >= expectedInserted;
      tables[table] = { source: sourceCounts[table], inserted: expectedInserted, totalRows, ok: tableOk };
      if (!tableOk) ok = false;
    }
    return { ok, checkedAt: new Date().toISOString(), tables };
  }

  async verify(runId = null) {
    const run = runId
      ? await this.pool.query("SELECT * FROM data_import_runs WHERE id=$1", [runId])
      : await this.pool.query("SELECT * FROM data_import_runs WHERE status='completed' ORDER BY started_at DESC LIMIT 1");
    if (!run.rowCount) throw new Error("No completed migration run was found");
    const row = run.rows[0];
    const client = await this.pool.connect();
    try {
      const verification = await this.verifyWithClient(client, row.source_counts || {}, row.inserted_counts || {});
      await client.query("UPDATE data_import_runs SET verification=$2::jsonb WHERE id=$1", [row.id, JSON.stringify(verification)]);
      return { runId: row.id, ...verification };
    } finally { client.release(); }
  }

  async rollback(runId = null) {
    const result = runId
      ? await this.pool.query("SELECT * FROM data_import_runs WHERE id=$1 AND status='completed'", [runId])
      : await this.pool.query("SELECT * FROM data_import_runs WHERE status='completed' ORDER BY started_at DESC LIMIT 1");
    if (!result.rowCount) throw new Error("No completed migration run is available to roll back");
    const run = result.rows[0];
    const insertedIds = run.inserted_ids || {};
    const deletedCounts = {};
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const table of DELETE_ORDER) {
        const keys = Array.isArray(insertedIds[table]) ? insertedIds[table] : [];
        if (!keys.length) { deletedCounts[table] = 0; continue; }
        if (table === "settings") {
          let count = 0;
          for (const key of keys) {
            const deletion = await client.query("DELETE FROM settings WHERE company_id=$1 AND setting_key=$2", key);
            count += deletion.rowCount;
          }
          deletedCounts[table] = count;
        } else {
          const deletion = await client.query(`DELETE FROM ${table} WHERE id = ANY($1::${table === 'audit_logs' ? 'bigint' : 'text'}[])`, [keys]);
          deletedCounts[table] = deletion.rowCount;
        }
      }
      await client.query("UPDATE data_import_runs SET status='rolled_back', rolled_back_at=NOW() WHERE id=$1", [run.id]);
      await client.query("COMMIT");
      return { runId: run.id, deletedCounts };
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
}

module.exports = RelationalMigrationEngine;
