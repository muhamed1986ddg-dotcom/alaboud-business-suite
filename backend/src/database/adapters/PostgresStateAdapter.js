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
    this.lastPoolResetAt = 0;
    this.minimumPoolResetIntervalMs = Math.max(1000, Number(process.env.PG_POOL_RESET_MIN_INTERVAL_MS || 5000));
    this.connectionState = "connecting";
    this.lastConnectedAt = null;
    this.lastDisconnectedAt = null;
    this.lastConnectionError = null;
    this.consecutiveConnectionFailures = 0;
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
      // Ignore errors emitted by a pool that has already been replaced.
      if (pool !== this.pool) return;
      this.markDisconnected(error);
      this.logger.error(`PostgreSQL idle client error (pool ${generation}):`, error.message);
      if (isTransientPostgresError(error)) {
        this.resetPool(`idle-client:${error.code || error.message}`, { force: false }).catch(() => {});
      }
    });
    return pool;
  }


  markConnected() {
    this.connectionState = "connected";
    this.lastConnectedAt = new Date().toISOString();
    this.lastConnectionError = null;
    this.consecutiveConnectionFailures = 0;
  }

  markDisconnected(error) {
    this.connectionState = "reconnecting";
    this.lastDisconnectedAt = new Date().toISOString();
    this.lastConnectionError = error || null;
    this.consecutiveConnectionFailures += 1;
  }

  async probePool(pool, { attempts = 3, baseMs = 750, maxMs = 5000 } = {}) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        await pool.query("SELECT 1");
        return true;
      } catch (error) {
        lastError = error;
        if (!isTransientPostgresError(error) || attempt === attempts) break;
        await wait(retryDelay(attempt, baseMs, maxMs));
      }
    }
    throw lastError || new Error("PostgreSQL readiness probe failed");
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

  async resetPool(reason = "transient-error", { force = false } = {}) {
    if (this.poolResetPromise) return this.poolResetPromise;

    const now = Date.now();
    const recentlyReset = now - this.lastPoolResetAt < this.minimumPoolResetIntervalMs;
    if (!force && recentlyReset && this.pool) {
      try {
        await this.probePool(this.pool, { attempts: 1 });
        this.markConnected();
        return this.pool;
      } catch {
        // The current pool is still unhealthy; continue with one controlled reset.
      }
    }

    this.poolResetPromise = (async () => {
      const oldPool = this.pool;
      this.connectionState = "reconnecting";
      const candidate = this.createPool();
      try {
        // Never publish a new pool until PostgreSQL confirms it is accepting queries.
        await this.probePool(candidate, {
          attempts: Math.max(2, Number(process.env.PG_POOL_RECOVERY_PROBES || 5)),
          baseMs: Math.max(250, Number(process.env.PG_POOL_RECOVERY_BASE_MS || 1000)),
          maxMs: Math.max(1000, Number(process.env.PG_POOL_RECOVERY_MAX_MS || 15000))
        });
        this.pool = candidate;
        this.lastPoolResetAt = Date.now();
        this.markConnected();
        this.logger.warn(`PostgreSQL pool recovered after ${reason}`);
        if (oldPool && oldPool !== candidate) {
          Promise.race([oldPool.end().catch(() => undefined), wait(2000)]).catch(() => undefined);
        }
        return candidate;
      } catch (error) {
        try { await candidate.end(); } catch {}
        this.markDisconnected(error);
        this.logger.warn(`PostgreSQL pool recovery deferred after ${reason}: ${error.code || error.message}`);
        throw error;
      }
    })().finally(() => { this.poolResetPromise = null; });
    return this.poolResetPromise;
  }

  async waitForRecovery(operation = "query") {
    // When one request is already rebuilding/probing the pool, all other
    // requests must wait for that same recovery attempt. Otherwise they keep
    // hitting the known-broken pool and create an error storm in Render logs.
    if (this.poolResetPromise) {
      try {
        return await this.poolResetPromise;
      } catch {
        // The caller's retry loop will apply backoff and try recovery again.
      }
    }
    if (this.connectionState === "reconnecting") {
      try {
        return await this.resetPool(`${operation}:recovery-gate`);
      } catch {
        // PostgreSQL may still be starting (57P03). Do not fan out resets.
      }
    }
    return this.pool;
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
        const activePool = await this.waitForRecovery(operation);
        const result = await activePool.query(text, params);
        this.markConnected();
        return result;
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
        this.markDisconnected(error);
        try {
          await this.resetPool(`${operation}:${error.code || error.message}`);
        } catch {
          // Recovery may legitimately fail while PostgreSQL is in 57P03 startup mode.
          // The outer retry loop applies backoff and probes again.
        }
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
          const activePool = await this.waitForRecovery("mirror");
          client = await activePool.connect();
          detach = this.attachClientErrorGuard(client, "mirror-client");
          await client.query("BEGIN");
          await this.projector.project(client, next);
          await client.query("COMMIT");
          this.lastMirrorError = null;
        } catch (error) {
          this.lastMirrorError = error;
          if (client) { try { await client.query("ROLLBACK"); } catch {} }
          this.logger.warn(`Relational mirror deferred: ${error?.code || error?.message || error}`);
          // Preserve the newest snapshot while PostgreSQL is recovering. It is
          // retried after a bounded delay rather than being silently discarded.
          if (isTransientPostgresError(error) && !this.mirrorPendingSnapshot) {
            this.mirrorPendingSnapshot = next;
            await wait(Math.max(1000, Number(process.env.PG_MIRROR_RETRY_DELAY_MS || 5000)));
          }
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
    const attempts = Math.max(1, Number(interactive ? (process.env.PG_INTERACTIVE_WRITE_RETRIES || 4) : (process.env.PG_WRITE_RETRIES || 6)));
    const baseMs = Math.max(100, Number(process.env.PG_RETRY_BASE_MS || 250));
    const maxMs = Math.max(baseMs, Number(process.env.PG_WRITE_RETRY_MAX_MS || (interactive ? 2500 : 4000)));
    const retryBudgetMs = Math.max(1000, Number(interactive ? (process.env.PG_INTERACTIVE_WRITE_BUDGET_MS || 12000) : (process.env.PG_WRITE_RETRY_BUDGET_MS || 15000)));
    const startedAt = Date.now();
    const payload = JSON.stringify(snapshot);
    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const activePool = await this.waitForRecovery("write");
        await activePool.query(
          `INSERT INTO app_state (state_key,payload,updated_at)
           VALUES ('main',$1::jsonb,NOW())
           ON CONFLICT (state_key)
           DO UPDATE SET payload=EXCLUDED.payload,updated_at=NOW()`,
          [payload]
        );
        this.markConnected();
        this.queueRelationalMirror(snapshot);
        return;
      } catch (error) {
        lastError = error;
        if (isTransientPostgresError(error)) {
          this.markDisconnected(error);
        }
        const budgetExhausted = Date.now() - startedAt >= retryBudgetMs;
        if (!isTransientPostgresError(error) || attempt === attempts || budgetExhausted) {
          if (isTransientPostgresError(error)) {
            error.status = 503;
            error.code = error.code || "DATABASE_TEMPORARILY_UNAVAILABLE";
            error.publicMessage = "تعذر تأكيد الحفظ الآن بسبب اتصال قاعدة البيانات. لم يتم اعتماد التغيير، يرجى المحاولة بعد لحظات.";
          }
          throw error;
        }
        try {
          await this.resetPool(`write:${error.code || error.message}`);
        } catch {
          // Keep the write pending in this request until the retry budget expires.
        }
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
      lastMirrorError: this.lastMirrorError?.message || null,
      connectionState: this.connectionState,
      lastConnectedAt: this.lastConnectedAt,
      lastDisconnectedAt: this.lastDisconnectedAt,
      consecutiveConnectionFailures: this.consecutiveConnectionFailures,
      lastConnectionError: this.lastConnectionError?.message || null
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
