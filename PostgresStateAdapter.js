const { Pool } = require("pg");
const MigrationRunner = require("../MigrationRunner");
const { RelationalProjector } = require("../../repositories/RelationalProjector");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isConnectionError(error) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  const connectionMessages = [
    "connection",
    "terminating",
    "terminated",
    "econnreset",
    "econnrefused",
    "socket",
    "not queryable",
    "server closed",
    "connection ended",
    "connection timeout",
    "timeout expired",
    "database system is in recovery mode",
    "the database system is starting up",
    "57p01",
    "57p02",
    "57p03",
    "08000",
    "08001",
    "08003",
    "08004",
    "08006",
    "08007",
    "08p01"
  ];

  return (
    code.startsWith("08") ||
    ["57p01", "57p02", "57p03"].includes(code) ||
    connectionMessages.some((value) => message.includes(value))
  );
}

function positiveNumber(value, fallback, minimum = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, parsed);
}

class PostgresStateAdapter {
  constructor({ connectionString, normalize, logger = console }) {
    if (!connectionString) {
      throw new Error("PostgreSQL connectionString is required");
    }

    if (typeof normalize !== "function") {
      throw new Error("PostgresStateAdapter requires a normalize function");
    }

    this.connectionString = connectionString;
    this.normalize = normalize;
    this.logger = logger;
    this.mode = "postgres-native-transition";
    this.closed = false;

    this.relationalMirrorEnabled =
      String(process.env.RELATIONAL_MIRROR_ENABLED || "true").toLowerCase() !== "false";

    this.projector = new RelationalProjector({ logger });

    const isLocal =
      String(connectionString).includes("localhost") ||
      String(connectionString).includes("127.0.0.1");

    this.pool = new Pool({
      connectionString,
      ssl: isLocal ? false : { rejectUnauthorized: false },

      max: positiveNumber(process.env.PG_POOL_MAX, 5),
      min: 0,

      idleTimeoutMillis: positiveNumber(
        process.env.PG_IDLE_TIMEOUT_MS,
        30000,
        1000
      ),

      connectionTimeoutMillis: positiveNumber(
        process.env.PG_CONNECT_TIMEOUT_MS,
        15000,
        1000
      ),

      query_timeout: positiveNumber(
        process.env.PG_QUERY_TIMEOUT_MS,
        30000,
        1000
      ),

      statement_timeout: positiveNumber(
        process.env.PG_STATEMENT_TIMEOUT_MS,
        30000,
        1000
      ),

      keepAlive: true,
      keepAliveInitialDelayMillis: positiveNumber(
        process.env.PG_KEEPALIVE_DELAY_MS,
        10000,
        1000
      ),

      allowExitOnIdle: false
    });

    /*
     * مهم جداً:
     * أخطاء العملاء الخاملين يجب أن يكون لها مستمع حتى لا تتحول إلى
     * uncaught exception وتُسقط عملية Node.js.
     */
    this.pool.on("error", (error) => {
      const message = error?.message || String(error);

      if (isConnectionError(error)) {
        this.logger.warn(
          `PostgreSQL idle connection was lost and removed from the pool: ${message}`
        );
        return;
      }

      this.logger.error("Unexpected PostgreSQL pool error:", error);
    });

    this.pool.on("connect", (client) => {
      /*
       * يمنع أي خطأ يصدر من العميل نفسه من المرور دون تسجيل.
       * Pool يدير إعادة الاتصال تلقائياً عند الطلب التالي.
       */
      client.on("error", (error) => {
        const message = error?.message || String(error);

        if (isConnectionError(error)) {
          this.logger.warn(`PostgreSQL client connection error: ${message}`);
          return;
        }

        this.logger.error("Unexpected PostgreSQL client error:", error);
      });
    });
  }

  getRetryCount() {
    return positiveNumber(process.env.PG_OPERATION_RETRIES, 4);
  }

  getRetryDelay(attempt) {
    const baseDelay = positiveNumber(process.env.PG_RETRY_DELAY_MS, 500, 100);
    return Math.min(baseDelay * attempt, 5000);
  }

  ensureOpen() {
    if (this.closed) {
      throw new Error("PostgresStateAdapter is already closed");
    }
  }

  async runWithRetry(operationName, operation, options = {}) {
    this.ensureOpen();

    const attempts = positiveNumber(
      options.attempts,
      this.getRetryCount()
    );

    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        const retryable = isConnectionError(error);
        if (!retryable || attempt === attempts) {
          this.logger.error(
            `PostgreSQL operation "${operationName}" failed after ${attempt} attempt(s):`,
            error
          );
          throw error;
        }

        const delay = this.getRetryDelay(attempt);

        this.logger.warn(
          `PostgreSQL operation "${operationName}" lost its connection; retrying ` +
          `(${attempt}/${attempts}) in ${delay}ms`
        );

        await wait(delay);
      }
    }

    throw lastError;
  }

  async init() {
    return this.runWithRetry("initialization", async () => {
      const runner = new MigrationRunner({
        pool: this.pool,
        logger: this.logger
      });

      await runner.run();

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS app_state (
          state_key TEXT PRIMARY KEY,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      this.logger.info?.("PostgresStateAdapter initialized successfully");
    });
  }

  async load() {
    return this.runWithRetry("load app state", async () => {
      const result = await this.pool.query(
        "SELECT payload FROM app_state WHERE state_key = $1",
        ["main"]
      );

      if (!result.rows.length) {
        return null;
      }

      return this.normalize(result.rows[0].payload);
    });
  }

  async save(snapshot) {
    this.ensureOpen();

    const attempts = positiveNumber(
      process.env.PG_WRITE_RETRIES,
      this.getRetryCount()
    );

    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      let client = null;
      let transactionStarted = false;
      let clientReleased = false;

      try {
        client = await this.pool.connect();

        await client.query("BEGIN");
        transactionStarted = true;

        await client.query(
          `
            INSERT INTO app_state (state_key, payload, updated_at)
            VALUES ($1, $2::jsonb, NOW())
            ON CONFLICT (state_key)
            DO UPDATE SET
              payload = EXCLUDED.payload,
              updated_at = NOW()
          `,
          ["main", JSON.stringify(snapshot)]
        );

        if (this.relationalMirrorEnabled) {
          await this.projector.project(client, snapshot);
        }

        await client.query("COMMIT");
        transactionStarted = false;

        client.release();
        clientReleased = true;

        return;
      } catch (error) {
        lastError = error;

        if (client && transactionStarted) {
          try {
            await client.query("ROLLBACK");
          } catch (rollbackError) {
            this.logger.warn(
              `PostgreSQL rollback failed: ${rollbackError?.message || rollbackError}`
            );
          }
        }

        if (client && !clientReleased) {
          /*
           * عند خطأ اتصال يتم تدمير العميل بدل إعادته إلى Pool.
           * أما الأخطاء العادية فيُعاد العميل للاستعمال.
           */
          try {
            client.release(isConnectionError(error));
          } catch (releaseError) {
            this.logger.warn(
              `PostgreSQL client release failed: ${releaseError?.message || releaseError}`
            );
          }
          clientReleased = true;
        }

        const retryable = isConnectionError(error);

        if (!retryable || attempt === attempts) {
          this.logger.error(
            `PostgreSQL save failed after ${attempt} attempt(s):`,
            error
          );
          throw error;
        }

        const delay = this.getRetryDelay(attempt);

        this.logger.warn(
          `PostgreSQL write connection failed; retrying ` +
          `(${attempt}/${attempts}) in ${delay}ms`
        );

        await wait(delay);
      } finally {
        if (client && !clientReleased) {
          try {
            client.release();
          } catch (releaseError) {
            this.logger.warn(
              `PostgreSQL final client release failed: ${releaseError?.message || releaseError}`
            );
          }
        }
      }
    }

    throw lastError;
  }

  async query(text, params = []) {
    return this.runWithRetry("query", () => this.pool.query(text, params));
  }

  async health() {
    const startedAt = Date.now();

    try {
      await this.runWithRetry(
        "health check",
        () => this.pool.query("SELECT 1"),
        { attempts: 2 }
      );

      return {
        ok: true,
        mode: this.mode,
        relationalMirrorEnabled: this.relationalMirrorEnabled,
        latencyMs: Date.now() - startedAt,
        pool: {
          total: this.pool.totalCount,
          idle: this.pool.idleCount,
          waiting: this.pool.waitingCount
        }
      };
    } catch (error) {
      return {
        ok: false,
        mode: this.mode,
        relationalMirrorEnabled: this.relationalMirrorEnabled,
        latencyMs: Date.now() - startedAt,
        error: error?.message || String(error),
        pool: {
          total: this.pool.totalCount,
          idle: this.pool.idleCount,
          waiting: this.pool.waitingCount
        }
      };
    }
  }

  async close() {
    if (this.closed) return;

    this.closed = true;

    try {
      await this.pool.end();
      this.logger.info?.("PostgreSQL pool closed successfully");
    } catch (error) {
      this.logger.error("Failed to close PostgreSQL pool:", error);
      throw error;
    }
  }
}

module.exports = PostgresStateAdapter;
