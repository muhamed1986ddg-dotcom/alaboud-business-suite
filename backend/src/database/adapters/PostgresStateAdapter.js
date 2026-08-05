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
  const syscall = String(error?.syscall || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  if (TRANSIENT_CODES.has(code) || code.startsWith("08")) return true;
  // Render private DNS can be temporarily unavailable while PostgreSQL is
  // restarting or its private network record is being refreshed.
  if (["ENOTFOUND", "EAI_AGAIN", "ETIMEOUT", "ECONNRESET", "ECONNREFUSED"].includes(code)) return true;
  if (syscall === "getaddrinfo" && ["ENOTFOUND", "EAI_AGAIN"].includes(code)) return true;
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
    "timeout expired",
    "getaddrinfo enotfound",
    "getaddrinfo eai_again",
    "temporary failure in name resolution"
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
    this.mirrorPendingSnapshot = null;
    this.mirrorPromise = Promise.resolve();
    this.mirrorRunning = false;
    this.lastMirrorError = null;
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

  queueRelationalMirror(snapshot) {
    if (!this.relationalMirrorEnabled) return;
    // The JSONB app_state row is the durable source of truth. Relational tables
    // are a reporting/search mirror, so they must not delay interactive saves.
    this.mirrorPendingSnapshot = structuredClone(snapshot);
    if (this.mirrorRunning) return;
    this.mirrorRunning = true;
    this.mirrorPromise = (async () => {
      while (this.mirrorPendingSnapshot) {
        const next = this.mirrorPendingSnapshot;
        this.mirrorPendingSnapshot = null;
        let client;
        let detach = () => {};
        try {
          client = await this.pool.connect();
          detach = this.attachClientErrorGuard(client, "mirror-client");
          await client.query("BEGIN");
          await this.projector.project(client, next);
          await client.query("COMMIT");
          this.lastMirrorError = null;
        } catch (error) {
          this.lastMirrorError = error;
          if (client) { try { await client.query("ROLLBACK"); } catch {} }
          this.logger.warn(`Relational mirror deferred: ${error?.code || error?.message || error}`);
          // Do not retry in a tight loop. The next successful app mutation will
          // enqueue the newest complete snapshot and repair the mirror.
        } finally {
          try { detach(); } catch {}
          if (client) { try { client.release(Boolean(this.lastMirrorError)); } catch {} }
        }
      }
    })().finally(() => { this.mirrorRunning = false; });
  }

  async save(snapshot, options = {}) {
    // A single UPSERT statement is already atomic in PostgreSQL. Using a
    // checked-out client plus BEGIN/COMMIT added two network round trips and
    // made every button wait longer, especially on Render free instances.
    const interactive = options.interactive !== false;
    const attempts = Math.max(1, Number(interactive ? (process.env.PG_INTERACTIVE_WRITE_RETRIES || 2) : (process.env.PG_WRITE_RETRIES || 6)));
    const baseMs = Math.max(100, Number(process.env.PG_RETRY_BASE_MS || 250));
    const maxMs = Math.max(baseMs, Number(process.env.PG_WRITE_RETRY_MAX_MS || (interactive ? 1200 : 4000)));
    const retryBudgetMs = Math.max(1000, Number(interactive ? (process.env.PG_INTERACTIVE_WRITE_BUDGET_MS || 2500) : (process.env.PG_WRITE_RETRY_BUDGET_MS || 15000)));
    const startedAt = Date.now();
    const payload = JSON.stringify(snapshot);
    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        await this.pool.query(
          `INSERT INTO app_state (state_key,payload,updated_at)
           VALUES ('main',$1::jsonb,NOW())
           ON CONFLICT (state_key)
           DO UPDATE SET payload=EXCLUDED.payload,updated_at=NOW()`,
          [payload]
        );
        this.queueRelationalMirror(snapshot);
        return;
      } catch (error) {
        lastError = error;
        const budgetExhausted = Date.now() - startedAt >= retryBudgetMs;
        if (!isTransientPostgresError(error) || attempt === attempts || budgetExhausted) {
          if (isTransientPostgresError(error)) {
            error.status = 503;
            error.code = error.code || "DATABASE_TEMPORARILY_UNAVAILABLE";
            error.publicMessage = "تعذر تأكيد الحفظ الآن بسبب اتصال قاعدة البيانات. لم يتم اعتماد التغيير، يرجى المحاولة بعد لحظات.";
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
      poolGeneration: this.poolGeneration,
      mirrorPending: this.mirrorRunning || Boolean(this.mirrorPendingSnapshot),
      lastMirrorError: this.lastMirrorError?.message || null
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
