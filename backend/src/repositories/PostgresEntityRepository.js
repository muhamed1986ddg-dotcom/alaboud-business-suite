function mergeRaw(row) {
  const raw = row && typeof row.raw_payload === "object" && row.raw_payload ? row.raw_payload : {};
  const result = { ...raw };
  const aliases = {
    company_id: "companyId", created_at: "createdAt", updated_at: "updatedAt",
    base_currency: "baseCurrency", quote_currency: "quoteCurrency", buy_rate: "buyRate",
    sell_rate: "sellRate", connector_type: "connectorType", external_account_id: "externalAccountId",
    opening_balance_cad: "oldBalance", is_active: "active", effective_at: "effectiveAt"
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
    this.query = query;
    this.table = table;
    this.logger = logger;
  }

  async listByCompany(companyId, { orderBy = "created_at DESC" } = {}) {
    if (!this.query) return null;
    if (!/^[a-z_]+$/i.test(this.table) || !/^[a-z_ ]+(ASC|DESC)?$/i.test(orderBy)) {
      throw new Error("Unsafe repository query configuration");
    }
    const result = await this.query(`SELECT * FROM ${this.table} WHERE company_id=$1 ORDER BY ${orderBy}`, [companyId]);
    return result.rows.map(mergeRaw);
  }
}

module.exports = { PostgresEntityRepository, mergeRaw };
