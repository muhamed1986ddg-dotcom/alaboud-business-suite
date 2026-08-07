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
  "55P03", // lock not available / lock_timeout
  "57014", // query canceled / statement_timeout
  "PG_CLIENT_HARD_TIMEOUT", // local hard deadline destroyed the checked-out client
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
    "query read timeout",
    "statement timeout",
    "lock timeout",
    "canceling statement due to statement timeout",
    "canceling statement due to lock timeout",
    "getaddrinfo enotfound",
    "getaddrinfo eai_again",
    "temporary failure in name resolution"
  ].some((part) => message.includes(part));
}


function hardTimeoutError(label, timeoutMs) {
  const error = new Error(`PostgreSQL ${label} hard timeout after ${timeoutMs}ms`);
  error.code = "PG_CLIENT_HARD_TIMEOUT";
  error.status = 503;
  error.publicMessage = "قاعدة البيانات تستعيد الاتصال. تم إيقاف الطلب المعلق بأمان وسيُعاد التحقق تلقائيًا.";
  return error;
}

async function withHardTimeout(promiseFactory, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(promiseFactory),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(hardTimeoutError(label, timeoutMs)), timeoutMs);
        timer.unref?.();
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function destroyPgClient(client, reason = "watchdog-timeout") {
  if (!client) return;
  try { client.connection?.stream?.destroy?.(hardTimeoutError(reason, 0)); } catch {}
  try { client.release?.(true); } catch {}
}

async function runClientStep(client, queryConfig, timeoutMs, label) {
  let timer;
  let timedOut = false;
  const queryPromise = Promise.resolve().then(() => client.query(queryConfig));
  try {
    return await Promise.race([
      queryPromise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          const error = hardTimeoutError(label, timeoutMs);
          // Promise.race alone does not cancel a node-postgres query. Destroy
          // the socket so the underlying query cannot keep a PoolClient busy
          // after the HTTP request has already timed out.
          try { client.connection?.stream?.destroy?.(error); } catch {}
          reject(error);
        }, timeoutMs);
        timer.unref?.();
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    if (timedOut) queryPromise.catch(() => undefined);
  }
}

async function runClientTask(client, taskFactory, timeoutMs, label) {
  let timer;
  let timedOut = false;
  const taskPromise = Promise.resolve().then(taskFactory);
  try {
    return await Promise.race([
      taskPromise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          const error = hardTimeoutError(label, timeoutMs);
          try { client.connection?.stream?.destroy?.(error); } catch {}
          reject(error);
        }, timeoutMs);
        timer.unref?.();
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    if (timedOut) taskPromise.catch(() => undefined);
  }
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
    this.healthProbePromise = null;
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
      // Never let a request sit in the pool queue indefinitely. Interactive
      // mutations should either get a usable connection quickly or return a
      // retryable 503 so the idempotency recovery path can take over.
      connectionTimeoutMillis: Math.max(1000, Number(process.env.PG_CONNECT_TIMEOUT_MS || 4000)),
      // node-postgres client-side guard. Server-side transaction limits are
      // also applied with SET LOCAL in save() so an advisory lock or query can
      // never leave PATCH/DELETE pending forever.
      query_timeout: Math.max(1000, Number(process.env.PG_QUERY_TIMEOUT_MS || 12000)),
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
      this.connectionState = "reconnecting";
      this.lastDisconnectedAt = new Date().toISOString();
      this.lastConnectionError = error;
      this.consecutiveConnectionFailures += 1;
      this.logger.warn(`PostgreSQL ${context} connection error handled: ${label}`);
      // Do not reset the entire pool from the checked-out client's error
      // event. The request's catch/retry path owns recovery. Resetting here
      // can race with another active edit/delete transaction and make that
      // healthy request fail with "Connection terminated unexpectedly".
    };
    client.on("error", onError);
    return () => {
      if (typeof client.removeListener === "function") client.removeListener("error", onError);
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
    const maxBudgetMs = Math.max(2500, Number(budgetMs || process.env.PG_RECOVERY_BUDGET_MS || 20000));
    const startedAt = Date.now();
    this.recoveryPromise = (async () => {
      this.connectionState = "reconnecting";
      let probeAttempt = 0;
      let lastError = null;
      await this.resetPool(reason);
      while (Date.now() - startedAt < maxBudgetMs) {
        probeAttempt += 1;
        let client;
        let probeError = null;
        try {
          client = await this.acquireClient({ timeoutMs: Math.min(2500, maxBudgetMs), context: "recovery-probe-connect" });
          await runClientStep(client, { text: "SELECT 1", query_timeout: 1200 }, 1700, "recovery-probe");
          this.connectionState = "connected";
          this.lastConnectedAt = new Date().toISOString();
          this.lastConnectionError = null;
          this.consecutiveConnectionFailures = 0;
          this.logger.info(`PostgreSQL connection recovered after ${probeAttempt} probe(s)`);
          return true;
        } catch (error) {
          probeError = error;
          lastError = error;
          this.lastConnectionError = error;
          this.lastDisconnectedAt = new Date().toISOString();
          this.consecutiveConnectionFailures += 1;
          if (!isTransientPostgresError(error)) throw error;
          if (client) { try { client.release(true); client = null; } catch {} }
          if (probeAttempt % 3 === 0) await this.resetPool(`recovery-probe:${error.code || error.message}`);
          const delay = retryDelay(Math.min(probeAttempt, 5), 350, 2500);
          this.logger.warn(`PostgreSQL recovery probe ${probeAttempt} failed; retrying in ${delay}ms. ${error.code || error.message}`);
          await wait(delay);
        } finally {
          if (client) { try { client.release(Boolean(probeError)); } catch {} }
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

  async queryWithRetry(text, params = [], { operation = "query", attempts, queryTimeoutMs, recoveryBudgetMs } = {}) {
    const maxAttempts = Math.max(1, Number(attempts || process.env.PG_QUERY_RETRIES || 6));
    const baseMs = Math.max(100, Number(process.env.PG_RETRY_BASE_MS || 500));
    const maxMs = Math.max(baseMs, Number(process.env.PG_RETRY_MAX_MS || 16000));
    const timeoutMs = Math.max(500, Number(queryTimeoutMs || process.env.PG_QUERY_TIMEOUT_MS || 12000));
    const acquireTimeoutMs = Math.max(750, Math.min(timeoutMs, Number(process.env.PG_QUERY_ACQUIRE_TIMEOUT_MS || 3500)));
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let client;
      let attemptError = null;
      let detach = () => {};
      try {
        client = await this.acquireClient({ timeoutMs: acquireTimeoutMs, context: `${operation}-connect` });
        detach = this.attachClientErrorGuard(client, `${operation}-client`);
        const result = await runClientStep(
          client,
          { text, values: params, query_timeout: timeoutMs },
          timeoutMs + 500,
          operation
        );
        this.connectionState = "connected";
        this.lastConnectedAt = new Date().toISOString();
        this.lastConnectionError = null;
        this.consecutiveConnectionFailures = 0;
        return result;
      } catch (error) {
        lastError = error;
        attemptError = error;
        if (!isTransientPostgresError(error) || attempt === maxAttempts) {
          if (isTransientPostgresError(error)) {
            error.status = 503;
            error.code = error.code || "DATABASE_TEMPORARILY_UNAVAILABLE";
            error.publicMessage = "قاعدة البيانات تعيد الاتصال حاليًا. لم يتم حفظ أي تغيير، يرجى المحاولة بعد لحظات.";
          }
          throw error;
        }
        // Throw away the failed client immediately before recovery. This is
        // crucial on Render: a dead TLS socket must never be returned to pg.Pool.
        if (client) { try { client.release(true); client = null; } catch {} }
        await this.recoverConnection(`${operation}:${error.code || error.message}`, { budgetMs: Number(recoveryBudgetMs || process.env.PG_QUERY_RECOVERY_BUDGET_MS || 6000) });
        const delay = retryDelay(attempt, baseMs, maxMs);
        this.logger.warn(`PostgreSQL ${operation} unavailable; retrying (${attempt}/${maxAttempts}) in ${delay}ms. ${error.code || error.message}`);
        await wait(delay);
      } finally {
        try { detach(); } catch {}
        if (client) { try { client.release(Boolean(attemptError)); } catch {} }
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
            client = await this.acquireClient({ timeoutMs: Number(process.env.PG_MIRROR_CONNECT_TIMEOUT_MS || 3500), context: "mirror-connect" });
            detach = this.attachClientErrorGuard(client, "mirror-client");
            await runClientStep(client, { text: "BEGIN", query_timeout: 2500 }, 3000, "mirror-begin");
            await runClientStep(client, { text: "SET LOCAL statement_timeout = '8000ms'; SET LOCAL lock_timeout = '2500ms'", query_timeout: 3000 }, 3500, "mirror-guards");
            await runClientTask(client, () => this.projector.project(client, next), 9000, "mirror-project");
            await runClientStep(client, { text: "COMMIT", query_timeout: 2500 }, 3000, "mirror-commit");
            this.lastMirrorError = null;
          } catch (error) {
            this.lastMirrorError = error;
            if (client && !isTransientPostgresError(error)) { try { await runClientStep(client, { text: "ROLLBACK", query_timeout: 1000 }, 1500, "mirror-rollback"); } catch {} }
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

  async acquireClient({ timeoutMs = 4500, context = "pool-connect" } = {}) {
    try {
      return await withHardTimeout(() => this.pool.connect(), Math.max(750, Number(timeoutMs)), context);
    } catch (error) {
      if (isTransientPostgresError(error)) {
        this.connectionState = "reconnecting";
        this.lastDisconnectedAt = new Date().toISOString();
        this.lastConnectionError = error;
        this.consecutiveConnectionFailures += 1;
        // Do not await pool recreation here; fail the request quickly and let
        // recovery continue independently. This prevents an HTTP request from
        // inheriting a long pool.end()/DNS recovery wait.
        this.resetPool(`${context}:${error.code || error.message}`).catch(() => undefined);
      }
      throw error;
    }
  }

  async waitForInteractiveWriteReady({ timeoutMs } = {}) {
    if (this.connectionState !== "reconnecting") return true;
    const budgetMs = Math.max(750, Number(timeoutMs || process.env.PG_INTERACTIVE_READY_TIMEOUT_MS || 3000));
    // If a recovery probe is already running, do not start a financial write on
    // the same unhealthy pool. Wait only a short bounded window, then fail fast
    // so the browser can retry the SAME idempotent operation after recovery.
    if (this.recoveryPromise) {
      await withHardTimeout(() => this.recoveryPromise, budgetMs, "write-readiness");
      return true;
    }
    try {
      await withHardTimeout(
        () => this.pool.query({ text: "SELECT 1", query_timeout: Math.min(1500, budgetMs) }),
        Math.min(2000, budgetMs),
        "write-readiness-probe"
      );
      this.connectionState = "connected";
      this.lastConnectedAt = new Date().toISOString();
      this.lastConnectionError = null;
      this.consecutiveConnectionFailures = 0;
      return true;
    } catch (error) {
      if (isTransientPostgresError(error)) {
        error.status = 503;
        error.code = error.code || "DATABASE_TEMPORARILY_UNAVAILABLE";
        error.publicMessage = error.publicMessage || "قاعدة البيانات قيد الاستعادة. سيتم إعادة محاولة العملية تلقائيًا.";
      }
      throw error;
    }
  }

  async save(snapshot, options = {}) {
    // Financial state is committed synchronously in one PostgreSQL transaction.
    // Durable writes are serialized in-process by mutateDurable/durableSaveChain.
    // PostgreSQL's app_state UPSERT supplies row-level serialization. Avoid an
    // advisory lock here because a disrupted writer can make later PATCH/DELETE
    // return 503 even though the database health probe is already 200.
    const interactive = options.interactive !== false;
    const attempts = Math.max(1, Number(interactive ? (process.env.PG_INTERACTIVE_WRITE_RETRIES || 2) : (process.env.PG_WRITE_RETRIES || 6)));
    const baseMs = Math.max(100, Number(process.env.PG_RETRY_BASE_MS || 250));
    const maxMs = Math.max(baseMs, Number(process.env.PG_WRITE_RETRY_MAX_MS || (interactive ? 2500 : 4000)));
    const retryBudgetMs = Math.max(1000, Number(interactive ? (process.env.PG_INTERACTIVE_WRITE_BUDGET_MS || 7000) : (process.env.PG_WRITE_RETRY_BUDGET_MS || 15000)));
    const lockTimeoutMs = Math.max(500, Number(process.env.PG_INTERACTIVE_LOCK_TIMEOUT_MS || 2500));
    const statementTimeoutMs = Math.max(lockTimeoutMs + 500, Number(process.env.PG_INTERACTIVE_STATEMENT_TIMEOUT_MS || 6500));
    const clientQueryTimeoutMs = Math.max(statementTimeoutMs + 500, Number(process.env.PG_INTERACTIVE_CLIENT_QUERY_TIMEOUT_MS || 8000));
    const hardStepTimeoutMs = Math.max(clientQueryTimeoutMs + 500, Number(process.env.PG_INTERACTIVE_HARD_STEP_TIMEOUT_MS || 9000));
    const startedAt = Date.now();
    const payload = JSON.stringify(snapshot);
    let lastError;

    if (interactive) await this.waitForInteractiveWriteReady({ timeoutMs: Number(process.env.PG_INTERACTIVE_READY_TIMEOUT_MS || 3000) });

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      let client;
      let attemptError = null;
      let detach = () => {};
      try {
        client = await this.acquireClient({ timeoutMs: Number(process.env.PG_INTERACTIVE_ACQUIRE_TIMEOUT_MS || 4000), context: "durable-write-connect" });
        detach = this.attachClientErrorGuard(client, "durable-write-client");
        await runClientStep(client, { text: "BEGIN", query_timeout: clientQueryTimeoutMs }, hardStepTimeoutMs, "begin");
        // Bound both advisory-lock waiting and statement execution on the
        // PostgreSQL server. This is the key guard against transactions that
        // stayed Pending in Chrome Network for 30+ seconds.
        await runClientStep(client, {
          text: `SET LOCAL lock_timeout = '${lockTimeoutMs}ms'; SET LOCAL statement_timeout = '${statementTimeoutMs}ms'; SET LOCAL idle_in_transaction_session_timeout = '${statementTimeoutMs + 2000}ms'`,
          query_timeout: clientQueryTimeoutMs
        }, hardStepTimeoutMs, "transaction-guards");
        // Keep the financial write fully durable and commit app_state plus the
        // idempotency receipt in ONE PostgreSQL transaction/round trip. Previously these were three separate queries between
        // BEGIN/COMMIT, which was noticeable on Render's network latency.
        const operationReceipt = options.operationReceipt;
        let responseJson = "null";
        if (operationReceipt?.key) {
          try { responseJson = JSON.stringify(operationReceipt.result ?? null); } catch {}
        }
        const result = operationReceipt?.key
          ? await runClientStep(client, {
              text: `WITH saved AS (
                 INSERT INTO app_state (state_key,payload,revision,updated_at)
                 VALUES ('main',$1::jsonb,1,NOW())
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
              values: [
                payload,
                String(operationReceipt.key),
                String(operationReceipt.method || "POST"),
                String(operationReceipt.path || "/"),
                operationReceipt.companyId ? String(operationReceipt.companyId) : null,
                operationReceipt.branchId ? String(operationReceipt.branchId) : null,
                responseJson
              ],
              query_timeout: clientQueryTimeoutMs
            }, hardStepTimeoutMs, "state-write-with-receipt")
          : await runClientStep(client, {
              text: `WITH saved AS (
                 INSERT INTO app_state (state_key,payload,revision,updated_at)
                 VALUES ('main',$1::jsonb,1,NOW())
                 ON CONFLICT (state_key)
                 DO UPDATE SET payload=EXCLUDED.payload,
                               revision=app_state.revision+1,
                               updated_at=NOW()
                 RETURNING revision
               )
               SELECT revision FROM saved`,
              values: [payload],
              query_timeout: clientQueryTimeoutMs
            }, hardStepTimeoutMs, "state-write");
        await runClientStep(client, { text: "COMMIT", query_timeout: clientQueryTimeoutMs }, hardStepTimeoutMs, "commit");
        this.lastCommittedRevision = Number(result.rows?.[0]?.revision || 0);
        this.connectionState = "connected";
        this.lastConnectedAt = new Date().toISOString();
        this.lastConnectionError = null;
        this.consecutiveConnectionFailures = 0;
        this.queueRelationalMirror(snapshot,{ immutableSnapshot: options.immutableSnapshot === true });
        return { revision: this.lastCommittedRevision };
      } catch (error) {
        lastError = error;
        attemptError = error;
        // Never let cleanup keep the HTTP request Pending. When the socket is
        // already broken (or a hard deadline fired), ROLLBACK itself can wait
        // forever in node-postgres. Destroy that client in finally instead.
        if (client && !isTransientPostgresError(error)) {
          try { await runClientStep(client, { text: "ROLLBACK", query_timeout: 1000 }, 1500, "rollback"); } catch {}
        }
        if (isTransientPostgresError(error)) {
          this.connectionState = "reconnecting";
          this.lastDisconnectedAt = new Date().toISOString();
          this.lastConnectionError = error;
          this.consecutiveConnectionFailures += 1;
        }
        // A connection can drop while COMMIT is returning even though the
        // transaction was committed by PostgreSQL. The operation receipt lives
        // in that SAME transaction, so use a fresh pool connection to resolve
        // this ambiguity before replaying the edit/delete.
        if (isTransientPostgresError(error) && options.operationReceipt?.key) {
          try {
            await this.resetPool(`ambiguous-commit:${error.code || error.message}`);
            const receipt = await this.queryWithRetry(
              `SELECT app_revision FROM operation_receipts WHERE operation_key=$1 AND status='COMMITTED' LIMIT 1`,
              [String(options.operationReceipt.key)],
              { operation: "ambiguous-commit-receipt", attempts: 1, queryTimeoutMs: 2500, recoveryBudgetMs: 2500 }
            );
            if (receipt.rows?.[0]) {
              this.lastCommittedRevision = Number(receipt.rows[0].app_revision || 0);
              this.connectionState = "connected";
              this.lastConnectedAt = new Date().toISOString();
              this.lastConnectionError = null;
              this.consecutiveConnectionFailures = 0;
              this.queueRelationalMirror(snapshot,{ immutableSnapshot: options.immutableSnapshot === true });
              return { revision: this.lastCommittedRevision, recoveredFromAmbiguousCommit: true };
            }
          } catch (receiptError) {
            this.logger.warn(`PostgreSQL ambiguous commit verification deferred: ${receiptError?.code || receiptError?.message || receiptError}`);
          }
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
        await this.recoverConnection(`write:${error.code || error.message}`, { budgetMs: Number(process.env.PG_WRITE_RECOVERY_BUDGET_MS || 3000) });
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

  async query(text, params = [], options = {}) {
    return this.queryWithRetry(text, params, { operation: "query", ...options });
  }

  async health() {
    // Health must never wait behind a broken PostgreSQL socket. Return the
    // adapter's live connection state synchronously and run a tiny probe in
    // the background. Chrome /api/health therefore remains responsive even
    // while a financial write is being recovered.
    const pool = this.pool;
    const knownConnected = this.connectionState === "connected";
    if (pool && !this.healthProbePromise) {
      this.healthProbePromise = (async () => {
        let client;
        let probeError = null;
        try {
          client = await this.acquireClient({ timeoutMs: 1000, context: "health-probe-connect" });
          await runClientStep(client, { text: "SELECT 1", query_timeout: 700 }, 900, "health-probe");
        } catch (error) {
          probeError = error;
          throw error;
        } finally {
          if (client) { try { client.release(Boolean(probeError)); } catch {} }
        }
      })().then(() => {
        this.connectionState = "connected";
        this.lastConnectedAt = new Date().toISOString();
        this.lastConnectionError = null;
        this.consecutiveConnectionFailures = 0;
      }).catch((error) => {
        this.connectionState = "reconnecting";
        this.lastDisconnectedAt = new Date().toISOString();
        this.lastConnectionError = error;
        this.consecutiveConnectionFailures += 1;
        if (isTransientPostgresError(error)) this.resetPool(`health-probe:${error.code || error.message}`).catch(() => undefined);
      }).finally(() => { this.healthProbePromise = null; });
    }
    return {
      ok: knownConnected,
      mode: this.mode,
      relationalMirrorEnabled: this.relationalMirrorEnabled,
      latencyMs: 0,
      poolGeneration: this.poolGeneration,
      poolTotal: Number(pool?.totalCount || 0),
      poolIdle: Number(pool?.idleCount || 0),
      poolWaiting: Number(pool?.waitingCount || 0),
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
