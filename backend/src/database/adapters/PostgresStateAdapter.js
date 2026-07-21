const { Pool } = require("pg");

class PostgresStateAdapter {
  constructor({ connectionString, normalize, logger = console }) {
    this.connectionString = connectionString;
    this.normalize = normalize;
    this.logger = logger;
    this.mode = "postgres-state";
    this.pool = new Pool({
      connectionString,
      ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
      max: Math.max(1, Number(process.env.PG_POOL_MAX || 5)),
      idleTimeoutMillis: Math.max(1000, Number(process.env.PG_IDLE_TIMEOUT_MS || 30000)),
      connectionTimeoutMillis: Math.max(1000, Number(process.env.PG_CONNECT_TIMEOUT_MS || 10000))
    });
  }

  async init() {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS app_state (
      state_key TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  }

  async load() {
    const result = await this.pool.query("SELECT payload FROM app_state WHERE state_key='main'");
    return result.rows.length ? this.normalize(result.rows[0].payload) : null;
  }

  async save(snapshot) {
    await this.pool.query(
      `INSERT INTO app_state (state_key,payload,updated_at)
       VALUES ('main',$1::jsonb,NOW())
       ON CONFLICT (state_key)
       DO UPDATE SET payload=EXCLUDED.payload,updated_at=NOW()`,
      [JSON.stringify(snapshot)]
    );
  }

  async health() {
    const startedAt = Date.now();
    await this.pool.query("SELECT 1");
    return { ok: true, mode: this.mode, latencyMs: Date.now() - startedAt };
  }

  async close() {
    await this.pool.end();
  }
}

module.exports = PostgresStateAdapter;
