const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function main() {
  const databaseUrl = String(process.env.DATABASE_URL || '').trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const input = path.resolve(process.argv[2] || path.join(__dirname, '../data/store.json'));
  if (!fs.existsSync(input)) throw new Error(`Input file not found: ${input}`);

  const payload = JSON.parse(fs.readFileSync(input, 'utf8'));
  const requiredArrays = ['users','customers','transactions','payments'];
  for (const key of requiredArrays) {
    if (!Array.isArray(payload[key])) throw new Error(`Invalid store: ${key} must be an array`);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  try {
    await pool.query('BEGIN');
    await pool.query(`CREATE TABLE IF NOT EXISTS app_state (
      state_key TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    const previous = await pool.query("SELECT payload FROM app_state WHERE state_key='main'");
    if (previous.rows.length) {
      const backupKey = `backup_${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)}`;
      await pool.query(
        'INSERT INTO app_state (state_key,payload,updated_at) VALUES ($1,$2::jsonb,NOW()) ON CONFLICT (state_key) DO NOTHING',
        [backupKey, JSON.stringify(previous.rows[0].payload)]
      );
      console.log(`Created PostgreSQL backup row: ${backupKey}`);
    }

    await pool.query(`INSERT INTO app_state (state_key,payload,updated_at)
      VALUES ('main',$1::jsonb,NOW())
      ON CONFLICT (state_key) DO UPDATE SET payload=EXCLUDED.payload,updated_at=NOW()`,
      [JSON.stringify(payload)]);
    await pool.query('COMMIT');
    console.log(`Imported ${payload.customers.length} customers, ${payload.transactions.length} transactions, and ${payload.payments.length} payments.`);
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
