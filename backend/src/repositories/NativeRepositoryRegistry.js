const { PostgresEntityRepository } = require("./PostgresEntityRepository");

class NativeRepositoryRegistry {
  constructor({ query = null, logger = console } = {}) {
    this.enabled = Boolean(query) && String(process.env.POSTGRES_NATIVE_READS || "true").toLowerCase() !== "false";
    this.logger = logger;
    this.metrics = { nativeSuccess: 0, fallback: 0, errors: 0, totalDurationMs: 0 };
    const nativeQuery = this.enabled ? query : null;
    const make = (table) => new PostgresEntityRepository({ query: nativeQuery, table, logger });
    this.customers = make("customers");
    this.partners = make("partners");
    this.exchangeRates = make("exchange_rates");
    this.transactions = make("transactions");
    this.payments = make("payments");
    this.debts = make("debts");
    this.debtPayments = make("debt_payments");
    this.expenses = make("expenses");
    this.capitalMovements = make("capital_movements");
  }

  async withFallback(label, nativeRead, fallbackRead) {
    if (!this.enabled) { this.metrics.fallback += 1; return fallbackRead(); }
    const startedAt = Date.now();
    try {
      const rows = await nativeRead();
      if (rows !== null && rows !== undefined) {
        this.metrics.nativeSuccess += 1;
        this.metrics.totalDurationMs += Date.now() - startedAt;
        return rows;
      }
      this.metrics.fallback += 1;
      return fallbackRead();
    } catch (error) {
      this.metrics.errors += 1;
      this.metrics.fallback += 1;
      this.logger.warn(`[POSTGRES_NATIVE_READ_FALLBACK] ${label}: ${error.message}`);
      return fallbackRead();
    }
  }

  health() {
    const averageDurationMs = this.metrics.nativeSuccess
      ? +(this.metrics.totalDurationMs / this.metrics.nativeSuccess).toFixed(2) : 0;
    return { enabled: this.enabled, ...this.metrics, averageDurationMs };
  }
}

module.exports = NativeRepositoryRegistry;
