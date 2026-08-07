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
    this.mirrorScheduleTimer = null;
    this.lastMirrorError = null;
    this.poolGeneration = 0;
    this.poolResetPromise = null;
    this.recoveryPromise = null;
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
      min: Math.max(0, Number(process.env.PG_POOL_MIN || 1)),
      // Keep one warm PostgreSQL connection during an active session. The old
      // 30s idle eviction frequently forced a new TLS/database handshake just
      // before an add/edit/delete operation.
      idleTimeoutMillis: Math.max(1000, Number(process.env.PG_IDLE_TIMEOUT_MS || 900000)),
      connectionTimeoutMillis: Math.max(1000, Number(process.env.PG_CONNECT_TIMEOUT_MS || 10000)),
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000
    });
    const generation = ++this.poolGeneration;
    pool.on("error", (error) => {
      this.connectionState = "reconnecting";
      this.lastDisconnectedAt = new Date().toISOString();
      this.lastConnectionError = error;
      this.consecutiveConnectionFailures += 1;
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
      this.connectionState = "reconnecting";
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


  async recoverConnection(reason = "transient-error", { budgetMs } = {}) {
    if (this.recoveryPromise) return this.recoveryPromise;
    const maxBudgetMs = Math.max(5000, Number(budgetMs || process.env.PG_RECOVERY_BUDGET_MS || 70000));
    const startedAt = Date.now();
    this.recoveryPromise = (async () => {
      this.connectionState = "reconnecting";
      let probeAttempt = 0;
      let lastError = null;
      await this.resetPool(reason);
      while (Date.now() - startedAt < maxBudgetMs) {
        probeAttempt += 1;
        try {
          await this.pool.query("SELECT 1");
          this.connectionState = "connected";
          this.lastConnectedAt = new Date().toISOString();
          this.lastConnectionError = null;
          this.consecutiveConnectionFailures = 0;
          this.logger.info(`PostgreSQL connection recovered after ${probeAttempt} probe(s)`);
          return true;
        } catch (error) {
          lastError = error;
          this.lastConnectionError = error;
          this.lastDisconnectedAt = new Date().toISOString();
          this.consecutiveConnectionFailures += 1;
          if (!isTransientPostgresError(error)) throw error;
          // Recreate the pool only occasionally; repeatedly creating pools while
          // PostgreSQL is still starting causes a connection storm on Render.
          if (probeAttempt % 4 === 0) await this.resetPool(`recovery-probe:${error.code || error.message}`);
          const delay = retryDelay(Math.min(probeAttempt, 6), 750, 10000);
          this.logger.warn(`PostgreSQL recovery probe ${probeAttempt} failed; retrying in ${delay}ms. ${error.code || error.message}`);
          await wait(delay);
        }
      }
      const error = lastError || new Error("DATABASE_RECOVERY_TIMEOUT");
      error.status = 503;
      error.code = "DATABASE_TEMPORARILY_UNAVAILABLE";
      error.publicMessage = "قاعدة البيانات قيد الاستعادة حاليًا. لم يتم حفظ أي تغيير، يرجى الانتظار قليلًا ثم المحاولة مرة أخرى.";
      throw error;
    })().finally(() => { this.recoveryPromise = null; });
    return this.recoveryPromise;
  }

  async init() {
    const runner = new MigrationRunner({ pool: this.pool, logger: this.logger });
    await runner.run();
    await this.queryWithRetry(`CREATE TABLE IF NOT EXISTS app_state (
      state_key TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      revision BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`, [], { operation: "initialization" });
    await this.queryWithRetry("ALTER TABLE app_state ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0", [], { operation: "initialization-revision" });
    await this.queryWithRetry(`CREATE TABLE IF NOT EXISTS operation_receipts (
      operation_key TEXT PRIMARY KEY,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      company_id TEXT,
      branch_id TEXT,
      status TEXT NOT NULL DEFAULT 'COMMITTED',
      response_body JSONB,
      app_revision BIGINT,
      committed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`, [], { operation: "initialization-operation-receipts" });
    await this.queryWithRetry("CREATE INDEX IF NOT EXISTS idx_operation_receipts_committed_at ON operation_receipts(committed_at)", [], { operation: "initialization-operation-receipts-index" });
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
        const result = await this.pool.query(text, params);
        this.connectionState = "connected";
        this.lastConnectedAt = new Date().toISOString();
        this.lastConnectionError = null;
        this.consecutiveConnectionFailures = 0;
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
        await this.recoverConnection(`${operation}:${error.code || error.message}`, { budgetMs: Number(process.env.PG_QUERY_RECOVERY_BUDGET_MS || 70000) });
        const delay = retryDelay(attempt, baseMs, maxMs);
        this.logger.warn(`PostgreSQL ${operation} unavailable; retrying (${attempt}/${maxAttempts}) in ${delay}ms. ${error.code || error.message}`);
        await wait(delay);
      }
    }
    throw lastError;
  }

  queueRelationalMirror(snapshot, { immutableSnapshot = false } = {}) {
    if (!this.relationalMirrorEnabled) return;
    // The JSONB app_state row is the durable source of truth. Relational tables
    // are only a reporting/search mirror. Coalesce bursts of interactive writes
    // so add/edit/delete operations do not immediately compete with a full mirror
    // projection for PostgreSQL connections and CPU.
    this.mirrorPendingSnapshot = immutableSnapshot ? snapshot : structuredClone(snapshot);
    if (this.mirrorRunning || this.mirrorScheduleTimer) return;
    const delayMs = Math.max(0, Number(process.env.RELATIONAL_MIRROR_DELAY_MS || 1500));
    this.mirrorScheduleTimer = setTimeout(() => {
      this.mirrorScheduleTimer = null;
      if (this.mirrorRunning || !this.mirrorPendingSnapshot) return;
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
          } finally {
            try { detach(); } catch {}
            if (client) { try { client.release(Boolean(this.lastMirrorError)); } catch {} }
          }
        }
      })().finally(() => { this.mirrorRunning = false; });
    }, delayMs);
    this.mirrorScheduleTimer.unref?.();
  }

  async save(snapshot, options = {}) {
    // Financial state is committed synchronously in one PostgreSQL transaction.
    // The advisory transaction lock serializes writers across multiple Node
    // instances, while SELECT ... FOR UPDATE protects the state row itself.
    const interactive = options.interactive !== false;
    const attempts = Math.max(1, Number(interactive ? (process.env.PG_INTERACTIVE_WRITE_RETRIES || 2) : (process.env.PG_WRITE_RETRIES || 6)));
    const baseMs = Math.max(100, Number(process.env.PG_RETRY_BASE_MS || 250));
    const maxMs = Math.max(baseMs, Number(process.env.PG_WRITE_RETRY_MAX_MS || (interactive ? 2500 : 4000)));
    const retryBudgetMs = Math.max(1000, Number(interactive ? (process.env.PG_INTERACTIVE_WRITE_BUDGET_MS || 7000) : (process.env.PG_WRITE_RETRY_BUDGET_MS || 15000)));
    const startedAt = Date.now();
    const payload = JSON.stringify(snapshot);
    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      let client;
      let attemptError = null;
      let detach = () => {};
      try {
        client = await this.pool.connect();
        detach = this.attachClientErrorGuard(client, "durable-write-client");
        await client.query("BEGIN");
        // Keep the financial write fully durable, but collapse the advisory
        // lock + app_state upsert + idempotency receipt into ONE PostgreSQL
        // round trip. Previously these were three separate queries between
        // BEGIN/COMMIT, which was noticeable on Render's network latency.
        const operationReceipt = options.operationReceipt;
        let responseJson = "null";
        if (operationReceipt?.key) {
          try { responseJson = JSON.stringify(operationReceipt.result ?? null); } catch {}
        }
        const result = operationReceipt?.key
          ? await client.query(
              `WITH lock_row AS (
                 SELECT pg_advisory_xact_lock(hashtext('alaboud:app_state:main')) AS locked
               ), saved AS (
                 INSERT INTO app_state (state_key,payload,revision,updated_at)
                 SELECT 'main',$1::jsonb,1,NOW() FROM lock_row
                 ON CONFLICT (state_key)
                 DO UPDATE SET payload=EXCLUDED.payload,
                               revision=app_state.revision+1,
                               updated_at=NOW()
                 RETURNING revision
               ), receipt AS (
                 INSERT INTO operation_receipts
                   (operation_key,method,path,company_id,branch_id,status,response_body,app_revision,committed_at)
                 SELECT $2,$3,$4,$5,$6,'COMMITTED',$7::jsonb,revision,NOW() FROM saved
                 ON CONFLICT (operation_key)
                 DO UPDATE SET status='COMMITTED',
                               response_body=EXCLUDED.response_body,
                               app_revision=EXCLUDED.app_revision,
                               committed_at=NOW()
                 RETURNING operation_key
               )
               SELECT revision FROM saved`,
              [
                payload,
                String(operationReceipt.key),
                String(operationReceipt.method || "POST"),
                String(operationReceipt.path || "/"),
                operationReceipt.companyId ? String(operationReceipt.companyId) : null,
                operationReceipt.branchId ? String(operationReceipt.branchId) : null,
                responseJson
              ]
            )
          : await client.query(
              `WITH lock_row AS (
                 SELECT pg_advisory_xact_lock(hashtext('alaboud:app_state:main')) AS locked
               ), saved AS (
                 INSERT INTO app_state (state_key,payload,revision,updated_at)
                 SELECT 'main',$1::jsonb,1,NOW() FROM lock_row
                 ON CONFLICT (state_key)
                 DO UPDATE SET payload=EXCLUDED.payload,
                               revision=app_state.revision+1,
                               updated_at=NOW()
                 RETURNING revision
               )
               SELECT revision FROM saved`,
              [payload]
            );
        await client.query("COMMIT");
        this.lastCommittedRevision = Number(result.rows?.[0]?.revision || 0);
        this.connectionState = "connected";
        this.lastConnectedAt = new Date().toISOString();
        this.lastConnectionError = null;
        this.consecutiveConnectionFailures = 0;
        this.queueRelationalMirror(snapshot,{ immutableSnapshot: options.immutableSnapshot === true });
        return { revision: this.lastCommittedRevision };
      } catch (error) {
        lastError = error;
        if (client) { try { await client.query("ROLLBACK"); } catch {} }
        if (isTransientPostgresError(error)) {
          this.connectionState = "reconnecting";
          this.lastDisconnectedAt = new Date().toISOString();
          this.lastConnectionError = error;
          this.consecutiveConnectionFailures += 1;
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
        await this.recoverConnection(`write:${error.code || error.message}`, { budgetMs: Number(process.env.PG_WRITE_RECOVERY_BUDGET_MS || 4500) });
        const delay = retryDelay(attempt, baseMs, maxMs);
        this.logger.warn(`PostgreSQL write unavailable; retrying (${attempt}/${attempts}) in ${delay}ms. ${error.code || error.message}`);
        await wait(delay);
      } finally {
        try { detach(); } catch {}
        if (client) { try { client.release(Boolean(attemptError)); } catch {} }
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
      lastConnectionError: this.lastConnectionError?.message || null,
      lastCommittedRevision: this.lastCommittedRevision || 0
    };
  }

  async close() {
    if (this.mirrorScheduleTimer) { clearTimeout(this.mirrorScheduleTimer); this.mirrorScheduleTimer = null; }
    const pool = this.pool;
    this.pool = null;
    if (pool) await pool.end();
  }
}

PostgresStateAdapter.isTransientPostgresError = isTransientPostgresError;
PostgresStateAdapter.retryDelay = retryDelay;
module.exports = PostgresStateAdapter;
