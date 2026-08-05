const { Pool } = require("pg");
const MigrationRunner = require("../MigrationRunner");
const { RelationalProjector } = require("../../repositories/RelationalProjector");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function errorText(error) {
  return `${String(error?.code || "")} ${String(error?.message || "")}`.toLowerCase();
}

function isConnectionError(error) {
  const text = errorText(error);
  const code = String(error?.code || "").toUpperCase();

  return (
    code.startsWith("08") ||
    ["57P01", "57P02", "57P03"].includes(code) ||
    [
      "connection terminated",
      "connection ended",
      "connection closed",
      "terminating connection",
      "econnreset",
      "econnrefused",
      "socket hang up",
      "server closed the connection",
      "not queryable",
      "database system is in recovery mode",
      "database system is starting up",
      "cannot connect now",
      "connection timeout"
    ].some((value) => text.includes(value))
  );
}

function envNumber(name, fallback, minimum = 1) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.max(minimum, value) : fallback;
}

class PostgresStateAdapter {
  constructor({ connectionString, normalize, logger = console }) {
    if (!connectionString) throw new Error("PostgreSQL connectionString is required");
    if (typeof normalize !== "function") throw new Error("normalize function is required");

    this.connectionString = connectionString;
    this.normalize = normalize;
    this.logger = logger;
    this.mode = "postgres-native-transition";
    this.closed = false;
    this.relationalMirrorEnabled =
      String(process.env.RELATIONAL_MIRROR_ENABLED || "true").toLowerCase() !== "false";
    this.projector = new RelationalProjector({ logger });

    const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);

    this.pool = new Pool({
      connectionString,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: envNumber("PG_POOL_MAX", 5),
      idleTimeoutMillis: envNumber("PG_IDLE_TIMEOUT_MS", 30000, 1000),
      connectionTimeoutMillis: envNumber("PG_CONNECT_TIMEOUT_MS", 15000, 1000),
      query_timeout: envNumber("PG_QUERY_TIMEOUT_MS", 30000, 1000),
      statement_timeout: envNumber("PG_STATEMENT_TIMEOUT_MS", 30000, 1000),
      keepAlive: true,
      keepAliveInitialDelayMillis: envNumber("PG_KEEPALIVE_DELAY_MS", 10000, 1000),
      allowExitOnIdle: false
    });

    // pg requires an error listener for idle pooled clients. The broken client is
    // automatically removed by the pool and a fresh one is created on the next query.
    this.pool.on("error", (error) => {
      if (isConnectionError(error)) {
        this.logger.warn(`PostgreSQL idle connection lost; pool will reconnect: ${error.message}`);
        return;
      }
      this.logger.error("Unexpected PostgreSQL pool error:", error);
    });
  }

  ensureOpen() {
    if (this.closed) throw new Error("PostgresStateAdapter is closed");
  }

  retryCount(name = "PG_OPERATION_RETRIES", fallback = 5) {
    return envNumber(name, fallback);
  }

  retryDelay(attempt) {
    const base = envNumber("PG_RETRY_DELAY_MS", 750, 100);
    return Math.min(base * (2 ** Math.max(0, attempt - 1)), 10000);
  }

  async withRetry(operationName, operation, attempts = this.retryCount()) {
    this.ensureOpen();
    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (!isConnectionError(error) || attempt === attempts) throw error;

        const delay = this.retryDelay(attempt);
        this.logger.warn(
          `PostgreSQL ${operationName} connection failed; retrying (${attempt}/${attempts}) in ${delay}ms: ${error.message}`
        );
        await wait(delay);
      }
    }

    throw lastError;
  }

  async init() {
    await this.withRetry("initialization", async () => {
      const runner = new MigrationRunner({ pool: this.pool, logger: this.logger });
      await runner.run();
      await this.pool.query(`CREATE TABLE IF NOT EXISTS app_state (
        state_key TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    });
  }

  async load() {
    return this.withRetry("load", async () => {
      const result = await this.pool.query(
        "SELECT payload FROM app_state WHERE state_key=$1",
        ["main"]
      );
      return result.rows.length ? this.normalize(result.rows[0].payload) : null;
    });
  }

  async save(snapshot) {
    const attempts = this.retryCount("PG_WRITE_RETRIES", 6);
    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      this.ensureOpen();
      let client = null;
      let transactionStarted = false;
      let released = false;

      try {
        client = await this.pool.connect();
        await client.query("BEGIN");
        transactionStarted = true;

        await client.query(
          `INSERT INTO app_state (state_key,payload,updated_at)
           VALUES ($1,$2::jsonb,NOW())
           ON CONFLICT (state_key)
           DO UPDATE SET payload=EXCLUDED.payload,updated_at=NOW()`,
          ["main", JSON.stringify(snapshot)]
        );

        if (this.relationalMirrorEnabled) {
          await this.projector.project(client, snapshot);
        }

        await client.query("COMMIT");
        transactionStarted = false;
        client.release();
        released = true;
        return;
      } catch (error) {
        lastError = error;

        if (client && transactionStarted) {
          try { await client.query("ROLLBACK"); } catch (_) {}
        }

        if (client && !released) {
          try { client.release(isConnectionError(error)); } catch (_) {}
          released = true;
        }

        if (!isConnectionError(error) || attempt === attempts) throw error;

        const delay = this.retryDelay(attempt);
        this.logger.warn(
          `PostgreSQL write connection failed; retrying (${attempt}/${attempts}) in ${delay}ms: ${error.message}`
        );
        await wait(delay);
      } finally {
        if (client && !released) {
          try { client.release(); } catch (_) {}
        }
      }
    }

    throw lastError;
  }

  async query(text, params = []) {
    return this.withRetry("query", () => this.pool.query(text, params));
  }

  async health() {
    const startedAt = Date.now();
    try {
      await this.withRetry("health check", () => this.pool.query("SELECT 1"), 2);
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
        error: error.message
      };
    }
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    await this.pool.end();
  }
}

PostgresStateAdapter.isConnectionError = isConnectionError;
module.exports = PostgresStateAdapter;
