const fs = require("fs");
const path = require("path");

class MigrationRunner {
  constructor({ pool, migrationsDir = path.resolve(__dirname, "../../migrations"), logger = console }) {
    this.pool = pool;
    this.migrationsDir = migrationsDir;
    this.logger = logger;
  }

  async run() {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    if (!fs.existsSync(this.migrationsDir)) return [];
    const files = fs.readdirSync(this.migrationsDir)
      .filter((name) => /^\d+_.+\.sql$/.test(name))
      .sort();
    const applied = await this.pool.query("SELECT version FROM schema_migrations");
    const completed = new Set(applied.rows.map((row) => row.version));
    const executed = [];

    for (const file of files) {
      if (completed.has(file)) continue;
      const sql = fs.readFileSync(path.join(this.migrationsDir, file), "utf8");
      const client = await this.pool.connect();
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations(version) VALUES ($1) ON CONFLICT DO NOTHING", [file]);
        executed.push(file);
        this.logger.log(`Database migration applied: ${file}`);
      } catch (error) {
        this.logger.error(`Database migration failed (${file}):`, error.message);
        throw error;
      } finally {
        client.release();
      }
    }
    return executed;
  }
}

module.exports = MigrationRunner;
