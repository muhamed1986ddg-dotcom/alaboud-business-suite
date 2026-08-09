const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.join(__dirname, "adapters/PostgresStateAdapter.js"), "utf8");

// Regression for v25.14.28: queryWithRetry/save called an undefined
// isConnectionError() inside a swallowed try/catch, so client.release() was skipped.
assert(source.includes("function isConnectionError(error)"), "isConnectionError helper must be defined");
assert(source.includes("client.release(isConnectionError(attemptError)"), "release path must classify broken clients");
assert(source.includes('code === "PG_CLIENT_HARD_TIMEOUT"'), "hard-timeout client must be destroyable");
assert(source.includes('code.startsWith("08")'), "SQLSTATE connection errors must be destroyable");

console.log("PoolClient release regression v25.14.29: OK");
