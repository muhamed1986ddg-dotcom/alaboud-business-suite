"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const adapter = fs.readFileSync(path.join(__dirname,"adapters","PostgresStateAdapter.js"),"utf8");
const idempotency = fs.readFileSync(path.join(__dirname,"..","reliability","idempotency.js"),"utf8");
const server = fs.readFileSync(path.join(__dirname,"..","server.js"),"utf8");

assert.match(adapter,/PG_CONNECT_TIMEOUT_MS \|\| 4000/,"pool acquisition must be bounded");
assert.match(adapter,/PG_INTERACTIVE_LOCK_TIMEOUT_MS \|\| 2500/,"advisory lock wait must be bounded");
assert.match(adapter,/PG_INTERACTIVE_STATEMENT_TIMEOUT_MS \|\| 6500/,"write statement must be bounded server-side");
assert.match(adapter,/SET LOCAL lock_timeout/,"interactive transaction must set lock_timeout");
assert.match(adapter,/SET LOCAL statement_timeout/,"interactive transaction must set statement_timeout");
assert.match(adapter,/query_timeout: clientQueryTimeoutMs/,"interactive client queries must have a client-side timeout");
assert.match(adapter,/"55P03"/,"lock timeout must be classified as transient");
assert.match(adapter,/"57014"/,"statement timeout must be classified as transient");
assert.match(adapter,/async query\(text, params = \[\], options = \{\}\)/,"database query options must reach queryWithRetry");
assert.match(idempotency,/idempotency-receipt-preflight/,'idempotency preflight lookup must use bounded policy');
assert.match(idempotency,/attempts: 1/,'idempotency preflight must not enter long recovery loops');
assert.match(idempotency,/PG_IDEMPOTENCY_LOOKUP_TIMEOUT_MS \|\| 2000/,'idempotency receipt lookup must fail open quickly');
assert.match(server,/operation:"operation-status",attempts:1,queryTimeoutMs:2500/,'operation status polling must be bounded');

console.log("Transaction write timeout recovery v25.14.18 test passed");
