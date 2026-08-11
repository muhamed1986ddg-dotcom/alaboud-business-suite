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
    const normalizedName = `regexp_replace(translate(lower(c.name), 'أإآىة', 'ااايه'), '^[[:space:]]*ال', '')`;
    const orders = {
      "name-asc": `${normalizedName} ASC, c.name ASC, c.created_at ASC`,
      "name-desc": `${normalizedName} DESC, c.name DESC, c.created_at DESC`,
      "newest": "c.created_at DESC, c.name ASC",
      "oldest": "c.created_at ASC, c.name ASC",
      "balance-desc": "customer_balance_cad DESC, c.name ASC",
      "last-transfer": "last_transaction_at DESC NULLS LAST, c.name ASC",
      "overdue-desc": "overdue_days DESC, customer_balance_cad DESC, c.name ASC",
    };
    const orderBy = orders[sort] || orders["name-asc"];
    const term = String(search || "").trim();
    const values = [companyId];
    let filter = `c.company_id=$1 AND COALESCE((c.raw_payload->>'isDeleted')::boolean,false)=false`;
    if (term) {
      values.push(`%${term}%`);
      filter += ` AND (c.name ILIKE $2 OR COALESCE(c.phone,'') ILIKE $2 OR COALESCE(c.raw_payload->>'customerNumber','') ILIKE $2 OR COALESCE(c.raw_payload->>'identityNumber','') ILIKE $2)`;
    }
    const countResult = await this.query(`SELECT COUNT(*)::int AS count FROM ${quote(this.table)} c WHERE ${filter}`, values);
    values.push(safeLimit, safeOffset);
    const limitIndex = values.length - 1;
    const offsetIndex = values.length;
    const metrics = `
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(GREATEST(COALESCE(t.cad_amount,t.amount,0)-COALESCE(p.paid,0),0)),0) AS transaction_balance,
          MAX(t.transaction_date) AS last_transaction_at,
          MIN(t.transaction_date) FILTER (WHERE GREATEST(COALESCE(t.cad_amount,t.amount,0)-COALESCE(p.paid,0),0)>0) AS oldest_unpaid_at
        FROM transactions t
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(COALESCE(py.cad_amount,py.amount,0)),0) AS paid
          FROM payments py
          WHERE py.company_id=c.company_id AND py.transaction_id=t.id
            AND COALESCE((py.raw_payload->>'isDeleted')::boolean,false)=false
        ) p ON TRUE
        WHERE t.company_id=c.company_id AND t.customer_id=c.id
          AND COALESCE((t.raw_payload->>'isDeleted')::boolean,false)=false
          AND UPPER(COALESCE(t.status,''))<>'CANCELLED'
      ) fm ON TRUE`;
    const result = await this.query(
      `SELECT c.*,
        ((CASE WHEN UPPER(COALESCE(c.raw_payload->>'oldBalanceType','RECEIVABLE'))='PAYABLE' THEN -1 ELSE 1 END)
          * GREATEST(COALESCE(c.opening_balance_cad,0)-COALESCE((c.raw_payload->>'oldBalancePaid')::numeric,0),0)
          + COALESCE(fm.transaction_balance,0)) AS customer_balance_cad,
        fm.last_transaction_at,
        CASE WHEN fm.oldest_unpaid_at IS NULL THEN 0 ELSE GREATEST(0,(CURRENT_DATE-fm.oldest_unpaid_at::date)) END AS overdue_days
       FROM ${quote(this.table)} c ${metrics}
       WHERE ${filter} ORDER BY ${orderBy} LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
      values
    );
    return { rows: result.rows.map(row => ({...mergeRaw(row), finalBalance:Number(row.customer_balance_cad||0), lastTransactionDate:row.last_transaction_at||null, overdueDays:Number(row.overdue_days||0)})), total: Number(countResult.rows[0]?.count || 0) };
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
