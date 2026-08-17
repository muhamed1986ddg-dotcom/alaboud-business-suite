#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const MigrationRunner = require("../database/MigrationRunner");
const RelationalMigrationEngine = require("./RelationalMigrationEngine");
const { postgresSslOptions } = require("../database/postgres-tls");

function parseArgs(argv) {
  const [command = "migrate", ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index].startsWith("--")) options[rest[index].slice(2)] = rest[index + 1] && !rest[index + 1].startsWith("--") ? rest[++index] : true;
  }
  return { command, options };
}
function createPool() {
  const connectionString = String(process.env.DATABASE_URL || "").trim();
  if (!connectionString) throw new Error("DATABASE_URL is required for relational migration");
  return new Pool({ connectionString, ssl: postgresSslOptions(connectionString) });
}
async function loadSource(pool, filePath) {
  if (filePath) {
    const resolved = path.resolve(filePath);
    return { source: JSON.parse(fs.readFileSync(resolved, "utf8")), sourceType: "json_file", sourceReference: resolved };
  }
  const state = await pool.query("SELECT data FROM app_state WHERE id=1");
  if (!state.rowCount) throw new Error("app_state does not contain data; pass --file <backup.json>");
  return { source: state.rows[0].data, sourceType: "app_state", sourceReference: "app_state:1" };
}
async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  const pool = createPool();
  try {
    await new MigrationRunner({ pool }).run();
    const engine = new RelationalMigrationEngine({ pool });
    let output;
    if (command === "migrate") {
      const input = await loadSource(pool, options.file);
      output = await engine.migrate(input.source, input);
    } else if (command === "verify") output = await engine.verify(options.run);
    else if (command === "rollback") output = await engine.rollback(options.run);
    else throw new Error(`Unknown command: ${command}`);
    console.log(JSON.stringify(output, null, 2));
  } finally { await pool.end(); }
}
main().catch((error) => { console.error(`Migration failed: ${error.message}`); process.exitCode = 1; });
