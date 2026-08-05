const { Pool } = require("pg");
const MigrationRunner = require("../MigrationRunner");
const { RelationalProjector } = require("../../repositories/RelationalProjector");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const TRANSIENT_CODES = new Set([
  "57P01", // admin shutdown
  "57P02", // crash shutdown
  "57P03", // cannot connect now / recovery mode
  "57P04", // database dropped
  "53300", // too many connections
  "08000", "08001", "08003", "08004", "08006", "08007", "08P01"
]);

function isTransientPostgresError(error) {
  const code = String(error?.code || "").toUpperCase();
  const message = String(error?.message || "").toLowerCase();
  if (TRANSIENT_CODES.has(code) || code.startsWith("08")) return true;
  return [
    "connection terminated",
    "connection reset",
    "connection refused",
    "connection closed",
    "terminating connection",
    "database system is in recovery mode",
    "database system is not yet accepting connections",
    "consistent recovery state has not been yet reached",
    "client has encountered a connection error and is not queryable",
    "econnreset",
    "econnrefused",
    "etimedout",
    "socket hang up",
    "not queryable",
    "timeout expired"
  ].some((part) => message.includes(part));
}

function retryDelay(attempt, baseMs = 500, maxMs = 16000) {
  const exponential = Math.min(maxMs, baseMs * (2 ** Math.max(0, attempt - 1)));
  const jitter = Math.floor(exponential * 0.15 * Math.random());
  return exponential + jitter;
}

class PostgresStateAdapter {
  constructor({ connectionString, normalize, logger = console }) {
    this.connectionString = connectionString;
    this.normalize = normalize;
    this.logger = logger;
    this.mode = "postgres-native-transition";
    this.relationalMirrorEnabled = String(process.env.RELATIONAL_MIRROR_ENABLED || "true").toLowerCase() !== "false";
    this.projector = new RelationalProjector({ logger });
    this.poolGeneration = 0;
    this.poolResetPromise = null;
    this.pool = this.createPool();
  }

  createPool() {
    const pool = new Pool({
      connectionString: this.connectionString,
      ssl: this.connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
      max: Math.max(1, Number(process.env.PG_POOL_MAX || 5)),
      idleTimeoutMillis: Math.max(1000, Number(process.env.PG_IDLE_TIMEOUT_MS || 30000)),
      connectionTimeoutMillis: Math.max(1000, Number(process.env.PG_CONNECT_TIMEOUT_MS || 10000)),
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000
    });
    const generation = ++this.poolGeneration;
    pool.on("error", (error) => {
      this.logger.error(`PostgreSQL idle client error (pool ${generation}):`, error.message);
      if (isTransientPostgresError(error)) this.resetPool(`idle-client:${error.code || error.message}`).catch(() => {});
    });
    return pool;
  }

  attachClientErrorGuard(client, context = "checked-out-client") {
    if (!client || typeof client.on !== "function") return () => {};
    let handled = false;
    const onError = (error) => {
      handled = true;
      const label = error?.code || error?.message || "unknown-error";
      this.logger.warn(`PostgreSQL ${context} connection error handled: ${label}`);
      if (isTransientPostgresError(error)) {
        this.resetPool(`${context}:${label}`).catch((resetError) => {
          this.logger.error("PostgreSQL pool reset failed after client error:", resetError?.message || resetError);
        });
      }
    };
    client.on("error", onError);
    return () => {
      if (!handled && typeof client.removeListener === "function") client.removeListener("error", onError);
    };
  }

  async resetPool(reason = "transient-error") {
    if (this.poolResetPromise) return this.poolResetPromise;
    this.poolResetPromise = (async () => {
      const oldPool = this.pool;
      const newPool = this.createPool();
      this.pool = newPool;
      this.logger.warn(`PostgreSQL pool recreated after ${reason}`);
      if (oldPool && oldPool !== newPool) {
        Promise.race([
          oldPool.end().catch(() => undefined),
          wait(2000)
        ]).catch(() => undefined);
      }
    })().finally(() => { this.poolResetPromise = null; });
    return this.poolResetPromise;
  }

  async init() {
    const runner = new MigrationRunner({ pool: this.pool, logger: this.logger });
    await runner.run();
    await this.queryWithRetry(`CREATE TABLE IF NOT EXISTS app_state (
      state_key TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`, [], { operation: "initialization" });
  }

  async load() {
    const result = await this.queryWithRetry("SELECT payload FROM app_state WHERE state_key='main'", [], { operation: "load" });
    return result.rows.length ? this.normalize(result.rows[0].payload) : null;
  }

  async queryWithRetry(text, params = [], { operation = "query", attempts } = {}) {
    const maxAttempts = Math.max(1, Number(attempts || process.env.PG_QUERY_RETRIES || 6));
    const baseMs = Math.max(100, Number(process.env.PG_RETRY_BASE_MS || 500));
    const maxMs = Math.max(baseMs, Number(process.env.PG_RETRY_MAX_MS || 16000));
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.pool.query(text, params);
      } catch (error) {
        lastError = error;
        if (!isTransientPostgresError(error) || attempt === maxAttempts) {
          if (isTransientPostgresError(error)) {
            error.status = 503;
            error.code = error.code || "DATABASE_TEMPORARILY_UNAVAILABLE";
            error.publicMessage = "قاعدة البيانات تعيد الاتصال حاليًا. لم يتم حفظ أي تغيير، يرجى المحاولة بعد لحظات.";
          }
          throw error;
        }
        await this.resetPool(`${operation}:${error.code || error.message}`);
        const delay = retryDelay(attempt, baseMs, maxMs);
        this.logger.warn(`PostgreSQL ${operation} unavailable; retrying (${attempt}/${maxAttempts}) in ${delay}ms. ${error.code || error.message}`);
        await wait(delay);
      }
    }
    throw lastError;
  }

  async save(snapshot) {
    const attempts = Math.max(1, Number(process.env.PG_WRITE_RETRIES || 8));
    const baseMs = Math.max(100, Number(process.env.PG_RETRY_BASE_MS || 500));
    const maxMs = Math.max(baseMs, Number(process.env.PG_RETRY_MAX_MS || 16000));
    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      let client;
      let detachClientErrorGuard = () => {};
      try {
        client = await this.pool.connect();
        detachClientErrorGuard = this.attachClientErrorGuard(client, "write-client");
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO app_state (state_key,payload,updated_at)
           VALUES ('main',$1::jsonb,NOW())
           ON CONFLICT (state_key)
           DO UPDATE SET payload=EXCLUDED.payload,updated_at=NOW()`,
          [JSON.stringify(snapshot)]
        );
        if (this.relationalMirrorEnabled) await this.projector.project(client, snapshot);
        await client.query("COMMIT");
        detachClientErrorGuard();
        client.release();
        return;
      } catch (error) {
        lastError = error;
        if (client) {
          try { await client.query("ROLLBACK"); } catch {}
          try { detachClientErrorGuard(); } catch {}
          try { client.release(isTransientPostgresError(error)); } catch {}
        }

        if (!isTransientPostgresError(error) || attempt === attempts) {
          if (isTransientPostgresError(error)) {
            error.status = 503;
            error.code = error.code || "DATABASE_TEMPORARILY_UNAVAILABLE";
            error.publicMessage = "قاعدة البيانات تعيد الاتصال حاليًا. لم يتم حفظ أي تغيير، يرجى المحاولة بعد لحظات.";
          }
          throw error;
        }

        await this.resetPool(`write:${error.code || error.message}`);
        const delay = retryDelay(attempt, baseMs, maxMs);
        this.logger.warn(`PostgreSQL write unavailable; retrying (${attempt}/${attempts}) in ${delay}ms. ${error.code || error.message}`);
        await wait(delay);
      }
    }
    throw lastError;
  }

  async query(text, params = []) {
    return this.queryWithRetry(text, params, { operation: "query" });
  }

  async health() {
    const startedAt = Date.now();
    await this.queryWithRetry("SELECT 1", [], { operation: "health", attempts: 2 });
    return {
      ok: true,
      mode: this.mode,
      relationalMirrorEnabled: this.relationalMirrorEnabled,
      latencyMs: Date.now() - startedAt,
      poolGeneration: this.poolGeneration
    };
  }

  async close() {
    const pool = this.pool;
    this.pool = null;
    if (pool) await pool.end();
  }
}

PostgresStateAdapter.isTransientPostgresError = isTransientPostgresError;
PostgresStateAdapter.retryDelay = retryDelay;
module.exports = PostgresStateAdapter;
