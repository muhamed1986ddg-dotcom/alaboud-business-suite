const { PostgresEntityRepository } = require("./PostgresEntityRepository");

class NativeRepositoryRegistry {
  constructor({ query = null, logger = console } = {}) {
    this.enabled = Boolean(query) && String(process.env.POSTGRES_NATIVE_READS || "true").toLowerCase() !== "false";
    this.logger = logger;
    const nativeQuery = this.enabled ? query : null;
    this.customers = new PostgresEntityRepository({ query: nativeQuery, table: "customers", logger });
    this.partners = new PostgresEntityRepository({ query: nativeQuery, table: "partners", logger });
    this.exchangeRates = new PostgresEntityRepository({ query: nativeQuery, table: "exchange_rates", logger });
  }

  async withFallback(label, nativeRead, fallbackRead) {
    if (!this.enabled) return fallbackRead();
    try {
      const rows = await nativeRead();
      return Array.isArray(rows) ? rows : fallbackRead();
    } catch (error) {
      this.logger.warn(`[POSTGRES_NATIVE_READ_FALLBACK] ${label}: ${error.message}`);
      return fallbackRead();
    }
  }
}

module.exports = NativeRepositoryRegistry;
