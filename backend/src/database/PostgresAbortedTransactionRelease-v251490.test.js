"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(
  path.resolve(__dirname, "../database/adapters/PostgresStateAdapter.js"),
  "utf8"
);

// Ordinary query retries keep their existing connection-error policy.
assert(
  source.includes(
    'client.release(isConnectionError(attemptError) && String(attemptError?.code || "") !== "57014")'
  ),
  "queryWithRetry client release policy changed unexpectedly"
);

// Durable writes run inside BEGIN/COMMIT. Any failed attempt must destroy
// the checked-out client so an aborted PostgreSQL transaction can never
// return to the write pool.
const durableReleaseMatches =
  source.match(/client\.release\(Boolean\(attemptError\)\)/g) || [];

assert.strictEqual(
  durableReleaseMatches.length,
  1,
  "durable write must have exactly one failed-attempt release guard"
);

assert(
  source.includes("await runClientStep(client, { text: \"BEGIN\"") &&
  source.includes("client.release(Boolean(attemptError));"),
  "durable transaction failed-client disposal guard missing"
);

// SQLSTATE 57014 is transient, but after BEGIN a canceled statement can leave
// the transaction aborted. The durable-write finally block must therefore
// destroy that client rather than return it to the pool.
assert(
  source.includes('"57014", // query canceled / statement_timeout'),
  "57014 transient classification missing"
);

console.log("v25.14.90 PostgreSQL aborted transaction release regression: OK");