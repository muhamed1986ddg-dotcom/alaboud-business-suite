const { Pool } = require("pg");
const MigrationRunner = require("../MigrationRunner");
const { RelationalProjector } = require("../../repositories/RelationalProjector");
const { postgresSslOptions } = require("../postgres-tls");

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

function isConnectionError(error) {
  if (!error) return false;
  const code = String(error?.code || "").toUpperCase();
  const syscall = String(error?.syscall || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();

  // Only destroy a checked-out PoolClient when the underlying connection is
  // unusable. SQL-level timeouts such as 57014/55P03 are intentionally NOT
  // classified here: node-postgres can safely return those clients after the
  // transaction has been rolled back/ended.
  if (code === "PG_CLIENT_HARD_TIMEOUT" || code.startsWith("08")) return true;
  if (["57P01", "57P02", "57P03", "57P04"].includes(code)) return true;
  if (["ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EPIPE"].includes(code)) return true;
  if (syscall === "getaddrinfo" && ["ENOTFOUND", "EAI_AGAIN"].includes(code)) return true;

  return [
    "connection terminated",
    "connection reset",
    "connection refused",
    "connection closed",
    "terminating connection",
    "server closed the connection",
    "socket hang up",
    "not queryable",
    "econnreset",
    "econnrefused",
    "etimedout",
    "broken pipe"
  ].some((part) => message.includes(part));
}

function isTransientPostgresError(error) {
  const code = String(error?.code || "").toUpperCase();
  const syscall = String(error?.syscall || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  if (TRANSIENT_CODES.has(code) || code.startsWith("08")) return true;
  // Hosted private DNS can be temporarily unavailable while PostgreSQL is
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
    this.relationalMirrorEnabled = String(process.env.RELATIONAL_MIRROR_ENABLED || "false").toLowerCase() === "true";
    this.projector = new RelationalProjector({ logger });
    this.mirrorPendingSnapshot = null;
    this.mirrorPromise = Promise.resolve();
    this.mirrorRunning = false;
    this.mirrorScheduleTimer = null;
    this.lastMirrorError = null;
    this.poolGeneration = 0;
    this.poolResetPromise = null;
    this.writePoolResetPromise = null;
    this.recoveryPromise = null;
    this.healthProbePromise = null;
    this.lastHealthProbeAt = 0;
    this.connectionState = "connecting";
    this.lastConnectedAt = null;
    this.lastDisconnectedAt = null;
    this.lastConnectionError = null;
    this.consecutiveConnectionFailures = 0;
    // Revision loaded from PostgreSQL and advanced only after a confirmed COMMIT.
    // It is used for optimistic protection against a stale full-state snapshot.
    this.lastCommittedRevision = 0;
    this.pool = this.createPool("general");
    // Financial mutations use a physically separate pool. Background health,
    // exchange-rate refreshes, reporting and relational projection can no
    // longer recycle or congest the sockets used by add/edit/delete.
    this.writePool = this.createPool("write");
  }

  createPool(role = "general") {
    const isWritePool = role === "write";
    const pool = new Pool({
      connectionString: this.connectionString,
      ssl: postgresSslOptions(this.connectionString),
      max: Math.max(1, Number(isWritePool ? (process.env.PG_WRITE_POOL_MAX || 2) : (process.env.PG_POOL_MAX || 3))),
      min: 0,
      // Keep one warm PostgreSQL connection during an active session. The old
      // 30s idle eviction frequently forced a new TLS/database handshake just
      // before an add/edit/delete operation.
      idleTimeoutMillis: Math.max(1000, Number(process.env.PG_IDLE_TIMEOUT_MS || 900000)),
      // Never let a request sit in the pool queue indefinitely. Interactive
      // mutations should either get a usable connection quickly or return a
      // retryable 503 so the idempotency recovery path can take over.
      connectionTimeoutMillis: Math.max(3000, Number(process.env.PG_CONNECT_TIMEOUT_MS || 20000)),
      // node-postgres client-side guard. Server-side transaction limits are
      // also applied with SET LOCAL in save() so an advisory lock or query can
      // never leave PATCH/DELETE pending forever.
      query_timeout: Math.max(1000, Number(process.env.PG_QUERY_TIMEOUT_MS || 30000)),
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000
    });
    const generation = ++this.poolGeneration;
    pool.on("error", (error) => {
      // Ignore late errors emitted by a pool generation that has already been
      // retired. Otherwise an old socket can recycle the brand-new pool.
      const currentPool = isWritePool ? this.writePool : this.pool;
      if (currentPool && currentPool !== pool) return;
      this.connectionState = "reconnecting";
      this.lastDisconnectedAt = new Date().toISOString();
      this.lastConnectionError = error;
      this.consecutiveConnectionFailures += 1;
      this.logger.error(`PostgreSQL ${role} idle client error (pool ${generation}):`, error.message);
      if (isTransientPostgresError(error)) {
        const reset = isWritePool ? this.resetWritePool.bind(this) : this.resetPool.bind(this);
        reset(`idle-client:${error.code || error.message}`).catch(() => {});
      }
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


  async resetWritePool(reason = "transient-write-error") {
    if (this.writePoolResetPromise) return this.writePoolResetPromise;
    this.writePoolResetPromise = (async () => {
      const oldPool = this.writePool;
      const newPool = this.createPool("write");
      this.writePool = newPool;
      this.connectionState = "reconnecting";
      this.logger.warn(`PostgreSQL write pool recreated after ${reason}`);
      if (oldPool && oldPool !== newPool) {
        Promise.race([oldPool.end().catch(() => undefined), wait(2000)]).catch(() => undefined);
      }
    })().finally(() => { this.writePoolResetPromise = null; });
    return this.writePoolResetPromise;
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
      operation_key TEXT NOT NULL,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      company_id TEXT,
      branch_id TEXT,
      status TEXT NOT NULL DEFAULT 'COMMITTED',
      response_body JSONB,
      app_revision BIGINT,
      committed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      scope_key TEXT NOT NULL DEFAULT 'public:*'
    )`, [], { operation: "initialization-operation-receipts" });
    await this.queryWithRetry("ALTER TABLE operation_receipts ADD COLUMN IF NOT EXISTS scope_key TEXT", [], { operation: "initialization-operation-receipts-scope" });
    await this.queryWithRetry("CREATE UNIQUE INDEX IF NOT EXISTS uq_operation_receipts_scope_key ON operation_receipts(scope_key,operation_key,method,path)", [], { operation: "initialization-operation-receipts-unique" });
    await this.queryWithRetry("CREATE INDEX IF NOT EXISTS idx_operation_receipts_committed_at ON operation_receipts(committed_at)", [], { operation: "initialization-operation-receipts-index" });
  }

  async load() {
    const result = await this.queryWithRetry("SELECT payload,revision FROM app_state WHERE state_key='main'", [], { operation: "load" });
    if (!result.rows.length) { this.lastCommittedRevision = 0; return null; }
    this.lastCommittedRevision = Number(result.rows[0].revision || 0);
    return this.normalize(result.rows[0].payload);
  }

  async queryWithRetry(text, params = [], { operation = "query", attempts, queryTimeoutMs, recoveryBudgetMs } = {}) {
    const maxAttempts = Math.max(1, Number(attempts || process.env.PG_QUERY_RETRIES || 6));
    const baseMs = Math.max(100, Number(process.env.PG_RETRY_BASE_MS || 500));
    const maxMs = Math.max(baseMs, Number(process.env.PG_RETRY_MAX_MS || 16000));
    const timeoutMs = Math.max(500, Number(queryTimeoutMs || process.env.PG_QUERY_TIMEOUT_MS || 30000));
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
        // crucial on hosted networks: a dead TLS socket must never be returned to pg.Pool.
        if (client) { try { client.release(true); client = null; } catch {} }
        await this.recoverConnection(`${operation}:${error.code || error.message}`, { budgetMs: Number(recoveryBudgetMs || process.env.PG_QUERY_RECOVERY_BUDGET_MS || 6000) });
        const delay = retryDelay(attempt, baseMs, maxMs);
        this.logger.warn(`PostgreSQL ${operation} unavailable; retrying (${attempt}/${maxAttempts}) in ${delay}ms. ${error.code || error.message}`);
        await wait(delay);
      } finally {
        try { detach(); } catch {}
        if (client) { try { client.release(isConnectionError(attemptError) && String(attemptError?.code || "") !== "57014"); } catch {} }
      }
    }
    throw lastError;
  }

  queueRelationalMirror(snapshot, { immutableSnapshot = false } = {}) {
    if (!this.relationalMirrorEnabled) return;
    // app_state is the durable source of truth. The relational projection is
    // background reporting infrastructure and must not compete with a user's
    // next edit/delete. Debounce it after the LAST successful write instead of
    // starting shortly after the first add.
    this.mirrorPendingSnapshot = immutableSnapshot ? snapshot : structuredClone(snapshot);

    if (this.mirrorScheduleTimer) {
      clearTimeout(this.mirrorScheduleTimer);
      this.mirrorScheduleTimer = null;
    }

    const delayMs = Math.max(10000, Number(process.env.RELATIONAL_MIRROR_DELAY_MS || 30000));
    this.mirrorScheduleTimer = setTimeout(() => {
      this.mirrorScheduleTimer = null;
      if (this.mirrorRunning || !this.mirrorPendingSnapshot) return;

      // If another request is already waiting for a PostgreSQL connection,
      // yield to the interactive request and try the mirror later.
      if (Number(this.pool?.waitingCount || 0) > 0) {
        const latest = this.mirrorPendingSnapshot;
        this.mirrorPendingSnapshot = null;
        this.queueRelationalMirror(latest, { immutableSnapshot: true });
        return;
      }

      this.mirrorRunning = true;
      this.mirrorPromise = (async () => {
        const next = this.mirrorPendingSnapshot;
        this.mirrorPendingSnapshot = null;
        let client;
        let detach = () => {};
        let mirrorError = null;
        try {
          client = await this.acquireClient({
            timeoutMs: Number(process.env.PG_MIRROR_CONNECT_TIMEOUT_MS || 2000),
            context: "mirror-connect"
          });
          detach = this.attachClientErrorGuard(client, "mirror-client");
          await runClientStep(client, { text: "BEGIN", query_timeout: 1500 }, 1800, "mirror-begin");
          await runClientStep(client, {
            text: "SET LOCAL statement_timeout = '4500ms'; SET LOCAL lock_timeout = '900ms'",
            query_timeout: 1500
          }, 1800, "mirror-guards");
          await runClientTask(client, () => this.projector.project(client, next), 5000, "mirror-project");
          await runClientStep(client, { text: "COMMIT", query_timeout: 1500 }, 1800, "mirror-commit");
          this.lastMirrorError = null;
        } catch (error) {
          mirrorError = error;
          this.lastMirrorError = error;
          if (client && !isTransientPostgresError(error)) {
            try { await runClientStep(client, { text: "ROLLBACK", query_timeout: 600 }, 800, "mirror-rollback"); } catch {}
          }
          // Preserve the newest state for the next quiet period, but never retry
          // immediately and compete again with edit/delete.
          if (!this.mirrorPendingSnapshot) this.mirrorPendingSnapshot = next;
          this.logger.warn(`Relational mirror deferred: ${error?.code || error?.message || error}`);
        } finally {
          try { detach(); } catch {}
          if (client) { try { client.release(Boolean(mirrorError)); } catch {} }
        }
      })().finally(() => {
        this.mirrorRunning = false;
        if (this.mirrorPendingSnapshot && !this.mirrorScheduleTimer) {
          const latest = this.mirrorPendingSnapshot;
          this.mirrorPendingSnapshot = null;
          this.queueRelationalMirror(latest, { immutableSnapshot: true });
        }
      });
    }, delayMs);
    this.mirrorScheduleTimer.unref?.();
  }

  async acquireClient({ timeoutMs = 4500, context = "pool-connect", poolRole = "general" } = {}) {
    // Never wrap pool.connect() in Promise.race without cleaning up the late
    // result. node-postgres cannot cancel pool.connect(); if it resolves after
    // our HTTP deadline, that PoolClient must be released/destroyed or the pool
    // is slowly exhausted.
    const pool = poolRole === "write" ? this.writePool : this.pool;
    if (!pool) {
      const error = new Error("PostgreSQL pool is not available");
      error.code = "PG_POOL_UNAVAILABLE";
      error.status = 503;
      throw error;
    }

    const deadlineMs = Math.max(750, Number(timeoutMs));
    let timer = null;
    let timedOut = false;
    let completed = false;
    const connectPromise = Promise.resolve().then(() => pool.connect());

    try {
      return await new Promise((resolve, reject) => {
        timer = setTimeout(() => {
          if (completed) return;
          timedOut = true;
          completed = true;
          reject(hardTimeoutError(context, deadlineMs));
        }, deadlineMs);
        timer.unref?.();

        connectPromise.then(
          (client) => {
            if (timedOut || completed || (poolRole === "general" && pool !== this.pool) || (poolRole === "write" && pool !== this.writePool)) {
              // Critical leak guard: a client that arrives after the request
              // deadline must NEVER remain checked out.
              try { client?.release?.(true); } catch {}
              return;
            }
            completed = true;
            if (timer) clearTimeout(timer);
            resolve(client);
          },
          (error) => {
            if (timedOut || completed) return;
            completed = true;
            if (timer) clearTimeout(timer);
            reject(error);
          }
        );
      });
    } catch (error) {
      const localAcquireDeadline = error?.code === "PG_CLIENT_HARD_TIMEOUT";
      if (isTransientPostgresError(error)) {
        this.connectionState = "reconnecting";
        this.lastDisconnectedAt = new Date().toISOString();
        this.lastConnectionError = error;
        this.consecutiveConnectionFailures += 1;

        // A local wait deadline can mean pool pressure, not a dead database.
        // Recreating the pool on that signal caused cascading 503s. Only real
        // socket/DNS/PostgreSQL errors recreate it.
        if (!localAcquireDeadline) {
          (poolRole === "write" ? this.resetWritePool(`${context}:${error.code || error.message}`) : this.resetPool(`${context}:${error.code || error.message}`)).catch(() => undefined);
        }
      }
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
      if (timedOut) connectPromise.catch(() => undefined);
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
    const lockTimeoutMs = Math.max(500, Number(process.env.PG_INTERACTIVE_LOCK_TIMEOUT_MS || 5000));
    const statementTimeoutMs = Math.max(lockTimeoutMs + 500, Number(process.env.PG_INTERACTIVE_STATEMENT_TIMEOUT_MS || 20000));
    const clientQueryTimeoutMs = Math.max(statementTimeoutMs + 500, Number(process.env.PG_INTERACTIVE_CLIENT_QUERY_TIMEOUT_MS || 25000));
    const hardStepTimeoutMs = Math.max(clientQueryTimeoutMs + 500, Number(process.env.PG_INTERACTIVE_HARD_STEP_TIMEOUT_MS || 30000));
    const startedAt = Date.now();
    const payload = JSON.stringify(snapshot);
    let lastError;

    // The write itself is the authoritative readiness check. Do not block
    // financial writes on a cached reconnecting flag or a background recovery
    // promise that may already be stale.
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      let client;
      let attemptError = null;
      let detach = () => {};
      try {
        client = await this.acquireClient({ timeoutMs: Number(process.env.PG_INTERACTIVE_ACQUIRE_TIMEOUT_MS || 10000), context: "durable-write-connect", poolRole: "write" });
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
        // BEGIN/COMMIT, which is noticeable on hosted network latency.
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
                         WHERE app_state.revision=$9
                 RETURNING revision
               ), receipt AS (
                 INSERT INTO operation_receipts
                   (scope_key,operation_key,method,path,company_id,branch_id,status,response_body,app_revision,committed_at)
                 SELECT $7,$2,$3,$4,$5,$6,'COMMITTED',$8::jsonb,revision,NOW() FROM saved
                 ON CONFLICT (scope_key,operation_key,method,path)
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
                `company:${String(operationReceipt.companyId || "public")}`,
                responseJson,
                Number(this.lastCommittedRevision || 0)
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
                         WHERE app_state.revision=$2
                 RETURNING revision
               )
               SELECT revision FROM saved`,
              values: [payload, Number(this.lastCommittedRevision || 0)],
              query_timeout: clientQueryTimeoutMs
            }, hardStepTimeoutMs, "state-write");
        if (!result.rows?.[0]) {
          const conflict = new Error("Application state changed before this write could commit");
          conflict.code = "STALE_STATE_REVISION";
          conflict.status = 409;
          conflict.publicMessage = "تم تحديث البيانات من جلسة أخرى قبل حفظ هذه العملية. لم يتم اعتماد التغيير؛ حدّث الصفحة ثم أعد المحاولة.";
          conflict.retryable = true;
          throw conflict;
        }
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
            await this.resetWritePool(`ambiguous-commit:${error.code || error.message}`);
            const receiptClient = await this.acquireClient({ timeoutMs: 2500, context: "ambiguous-commit-receipt-connect", poolRole: "write" });
            let receipt;
            try {
              receipt = await runClientStep(receiptClient, { text:
              `SELECT app_revision FROM operation_receipts
                 WHERE scope_key=$1 AND operation_key=$2 AND method=$3 AND path=$4 AND status='COMMITTED' LIMIT 1`,
                values: [`company:${String(options.operationReceipt.companyId || "public")}`, String(options.operationReceipt.key), String(options.operationReceipt.method || "POST"), String(options.operationReceipt.path || "/")], query_timeout: 2000 }, 2500, "ambiguous-commit-receipt");
            } finally { try { receiptClient.release(); } catch {} }
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
        await this.resetWritePool(`write:${error.code || error.message}`);
        const delay = retryDelay(attempt, baseMs, maxMs);
        this.logger.warn(`PostgreSQL write unavailable; retrying (${attempt}/${attempts}) in ${delay}ms. ${error.code || error.message}`);
        await wait(delay);
      } finally {
        try { detach(); } catch {}
        if (client) {
          try {
            // Any failed attempt happened after BEGIN. Even when PostgreSQL keeps
            // the socket connected (for example SQLSTATE 57014), the transaction
            // may be aborted and must never be returned to the write pool.
            client.release(Boolean(attemptError));
          } catch {}
        }
      }
    }
    throw lastError;
  }

  async query(text, params = [], options = {}) {
    return this.queryWithRetry(text, params, { operation: "query", ...options });
  }

  async health() {
    // Observational only: /health must never reset/recreate the PostgreSQL pool.
    // The frontend polls this endpoint while add/edit/delete are running. A
    // short health-probe timeout used to reset the same pool used by the write,
    // producing transactions=503 while health itself still returned 200.
    const pool = this.pool;
    const knownConnected = this.connectionState === "connected";
    const nowMs = Date.now();
    const minProbeIntervalMs = Math.max(5000, Number(process.env.PG_HEALTH_PROBE_INTERVAL_MS || 15000));
    const poolBusy = Number(pool?.waitingCount || 0) > 0;

    if (
      pool &&
      !poolBusy &&
      !this.healthProbePromise &&
      (!this.lastHealthProbeAt || nowMs - this.lastHealthProbeAt >= minProbeIntervalMs)
    ) {
      this.lastHealthProbeAt = nowMs;
      this.healthProbePromise = (async () => {
        let client;
        let probeError = null;
        try {
          client = await this.acquireClient({
            timeoutMs: Number(process.env.PG_HEALTH_ACQUIRE_TIMEOUT_MS || 2500),
            context: "health-probe-connect"
          });
          await runClientStep(client, { text: "SELECT 1", query_timeout: 1200 }, 1600, "health-probe");
          return true;
        } catch (error) {
          probeError = error;
          return false;
        } finally {
          if (client) {
            try { client.release(Boolean(probeError)); } catch {}
          }
        }
      })().then((ok) => {
        if (ok) {
          this.connectionState = "connected";
          this.lastConnectedAt = new Date().toISOString();
          this.lastConnectionError = null;
          this.consecutiveConnectionFailures = 0;
        }
        // Failed health probes are telemetry only. They do NOT change the pool,
        // do NOT mark reconnecting, and do NOT interfere with financial writes.
      }).finally(() => {
        this.healthProbePromise = null;
      });
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
      writePoolTotal: Number(this.writePool?.totalCount || 0),
      writePoolIdle: Number(this.writePool?.idleCount || 0),
      writePoolWaiting: Number(this.writePool?.waitingCount || 0),
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
    const writePool = this.writePool;
    this.pool = null;
    this.writePool = null;
    if (pool) await pool.end();
    if (writePool && writePool !== pool) await writePool.end();
  }
}

PostgresStateAdapter.isConnectionError = isConnectionError;
PostgresStateAdapter.isTransientPostgresError = isTransientPostgresError;
PostgresStateAdapter.retryDelay = retryDelay;
module.exports = PostgresStateAdapter;
