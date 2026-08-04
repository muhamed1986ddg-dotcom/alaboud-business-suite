const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/i;

function quote(identifier) {
  if (!SAFE_IDENTIFIER.test(identifier)) throw new Error(`Unsafe SQL identifier: ${identifier}`);
  return `"${identifier}"`;
}

function mergeRaw(row) {
  const raw = row && typeof row.raw_payload === "object" && row.raw_payload ? row.raw_payload : {};
  const result = { ...raw };
  const aliases = {
    company_id: "companyId", customer_id: "customerId", transaction_id: "transactionId",
    debt_id: "debtId", partner_id: "partnerId", created_by: "createdBy", updated_by: "updatedBy",
    created_at: "createdAt", updated_at: "updatedAt", deleted_at: "deletedAt",
    base_currency: "baseCurrency", quote_currency: "quoteCurrency", buy_rate: "buyRate",
    sell_rate: "sellRate", connector_type: "connectorType", external_account_id: "externalAccountId",
    opening_balance_cad: "oldBalance", is_active: "active", effective_at: "effectiveAt",
    cad_amount: "cadAmount", exchange_rate: "exchangeRate", transfer_fee: "transferFee",
    total_customer_due: "totalCustomerDue", cost_rate: "costRate", client_rate: "clientRate",
    exchange_profit: "exchangeProfit", total_profit: "totalProfit", due_date: "dueDate",
    paid_amount: "paidAmount"
  };
  for (const [key, value] of Object.entries(row || {})) {
    if (key === "raw_payload") continue;
    const target = aliases[key] || key;
    if (value !== null && value !== undefined) result[target] = value;
  }
  return result;
}

class PostgresEntityRepository {
  constructor({ query, table, logger = console }) {
    if (!SAFE_IDENTIFIER.test(table)) throw new Error("Unsafe repository table");
    this.query = query;
    this.table = table;
    this.logger = logger;
  }

  async listByCompany(companyId, { orderBy = "created_at DESC", includeDeleted = true } = {}) {
    if (!this.query) return null;
    if (!/^[a-z_]+\s+(ASC|DESC)$/i.test(orderBy)) throw new Error("Unsafe repository order");
    const deletionFilter = includeDeleted ? "" : " AND COALESCE((raw_payload->>'isDeleted')::boolean,false)=false";
    const result = await this.query(
      `SELECT * FROM ${quote(this.table)} WHERE company_id=$1${deletionFilter} ORDER BY ${orderBy}`,
      [companyId]
    );
    return result.rows.map(mergeRaw);
  }

  async listCustomersPage(companyId, { search = "", sort = "name-asc", limit = 50, offset = 0 } = {}) {
    if (!this.query || this.table !== "customers") return null;
    const safeLimit = Math.min(500, Math.max(1, Number(limit) || 50));
    const safeOffset = Math.max(0, Number(offset) || 0);
    const normalizedName = `regexp_replace(translate(lower(name), 'أإآىة', 'ااايه'), '^[[:space:]]*ال', '')`;
    const orders = {
      "name-asc": `${normalizedName} ASC, name ASC, created_at ASC`,
      "name-desc": `${normalizedName} DESC, name DESC, created_at DESC`,
      "newest": "created_at DESC, name ASC",
      "oldest": "created_at ASC, name ASC",
    };
    const orderBy = orders[sort] || orders["name-asc"];
    const term = String(search || "").trim();
    const values = [companyId];
    let filter = `company_id=$1 AND COALESCE((raw_payload->>'isDeleted')::boolean,false)=false`;
    if (term) {
      values.push(`%${term}%`);
      filter += ` AND (name ILIKE $2 OR COALESCE(phone,'') ILIKE $2 OR COALESCE(raw_payload->>'customerNumber','') ILIKE $2 OR COALESCE(raw_payload->>'identityNumber','') ILIKE $2)`;
    }
    const countResult = await this.query(`SELECT COUNT(*)::int AS count FROM ${quote(this.table)} WHERE ${filter}`, values);
    values.push(safeLimit, safeOffset);
    const limitIndex = values.length - 1;
    const offsetIndex = values.length;
    const result = await this.query(
      `SELECT * FROM ${quote(this.table)} WHERE ${filter} ORDER BY ${orderBy} LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
      values
    );
    return { rows: result.rows.map(mergeRaw), total: Number(countResult.rows[0]?.count || 0) };
  }

  async findById(companyId, id) {
    if (!this.query) return null;
    const result = await this.query(`SELECT * FROM ${quote(this.table)} WHERE company_id=$1 AND id=$2 LIMIT 1`, [companyId, id]);
    return result.rows.length ? mergeRaw(result.rows[0]) : null;
  }

  async countByCompany(companyId) {
    if (!this.query) return null;
    const result = await this.query(`SELECT COUNT(*)::int AS count FROM ${quote(this.table)} WHERE company_id=$1`, [companyId]);
    return Number(result.rows[0]?.count || 0);
  }
}

module.exports = { PostgresEntityRepository, mergeRaw, quote };
