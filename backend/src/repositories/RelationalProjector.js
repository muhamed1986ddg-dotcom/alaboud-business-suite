const { mapState } = require("../migration/StateToRelationalMapper");

const TABLE_CONFIG = {
  companies: { key: ["id"] },
  users: { key: ["id"] },
  customers: { key: ["id"] },
  partners: { key: ["id"] },
  transactions: { key: ["id"] },
  payments: { key: ["id"] },
  debts: { key: ["id"] },
  debt_payments: { key: ["id"] },
  expenses: { key: ["id"] },
  capital_movements: { key: ["id"] },
  exchange_rates: { key: ["id"] },
  settings: { key: ["company_id", "setting_key"] }
};

function quote(identifier) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) throw new Error(`Unsafe SQL identifier: ${identifier}`);
  return `"${identifier}"`;
}

function buildUpsert(table, row, keyColumns) {
  const columns = Object.keys(row);
  const values = columns.map((column) => {
    const value = row[column];
    return column === "raw_payload" || column === "setting_value" || column === "details"
      ? JSON.stringify(value ?? {})
      : value;
  });
  const placeholders = columns.map((_, index) => `$${index + 1}`);
  const mutable = columns.filter((column) => !keyColumns.includes(column));
  const conflict = keyColumns.map(quote).join(",");
  const update = mutable.length
    ? `DO UPDATE SET ${mutable.map((column) => `${quote(column)}=EXCLUDED.${quote(column)}`).join(",")}`
    : "DO NOTHING";
  const sql = `INSERT INTO ${quote(table)} (${columns.map(quote).join(",")}) VALUES (${placeholders.join(",")}) ON CONFLICT (${conflict}) ${update}`;
  return { sql, values };
}

class RelationalProjector {
  constructor({ logger = console } = {}) {
    this.logger = logger;
  }

  async project(client, snapshot) {
    const mapped = mapState(snapshot);
    const counts = {};

    for (const [table, config] of Object.entries(TABLE_CONFIG)) {
      const rows = mapped[table] || [];
      for (const row of rows) {
        const { sql, values } = buildUpsert(table, row, config.key);
        await client.query(sql, values);
      }
      counts[table] = rows.length;
    }

    await this.#deleteMissingRows(client, mapped);
    return counts;
  }

  async #deleteMissingRows(client, mapped) {
    const companyIds = (mapped.companies || []).map((row) => row.id);
    if (!companyIds.length) return;

    const childTables = [
      "debt_payments", "payments", "transactions", "debts", "expenses",
      "capital_movements", "exchange_rates", "settings", "partners", "customers", "users"
    ];

    for (const table of childTables) {
      const config = TABLE_CONFIG[table];
      const rows = mapped[table] || [];
      if (config.key.length !== 1 || config.key[0] !== "id") continue;
      const ids = rows.map((row) => row.id);
      await client.query(
        `DELETE FROM ${quote(table)} WHERE company_id = ANY($1::text[]) AND NOT (id = ANY($2::text[]))`,
        [companyIds, ids]
      );
    }
  }
}

module.exports = { RelationalProjector, buildUpsert, TABLE_CONFIG };
