"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const adapter = fs.readFileSync(path.join(__dirname,"adapters","PostgresStateAdapter.js"),"utf8");
const idempotency = fs.readFileSync(path.join(__dirname,"..","reliability","idempotency.js"),"utf8");
const server = fs.readFileSync(path.join(__dirname,"..","server.js"),"utf8");

function envDefault(name){
  const marker=`${name} || `;
  const index=adapter.indexOf(marker);
  assert(index>=0,`${name} default must be explicit`);
  const tail=adapter.slice(index+marker.length,index+marker.length+10);
  const match=tail.match(/^(\d+)/);
  assert(match,`${name} default must be numeric`);
  return Number(match[1]);
}
const connectMs=envDefault("PG_CONNECT_TIMEOUT_MS");
const acquireMs=envDefault("PG_INTERACTIVE_ACQUIRE_TIMEOUT_MS");
const lockMs=envDefault("PG_INTERACTIVE_LOCK_TIMEOUT_MS");
const statementMs=envDefault("PG_INTERACTIVE_STATEMENT_TIMEOUT_MS");
const clientMs=envDefault("PG_INTERACTIVE_CLIENT_QUERY_TIMEOUT_MS");
const hardMs=envDefault("PG_INTERACTIVE_HARD_STEP_TIMEOUT_MS");
assert(connectMs<=30000,"pool acquisition must stay bounded");
assert(acquireMs<=15000,"interactive pool acquisition must stay bounded");
assert(lockMs<=10000,"advisory/row lock wait must stay bounded");
assert(statementMs<=30000,"write statement timeout must stay bounded server-side");
assert(clientMs<=35000,"client query timeout must stay bounded");
assert(hardMs<=40000,"hard write step timeout must stay bounded");
assert(lockMs<statementMs&&statementMs<clientMs&&clientMs<hardMs,"timeout layers must increase outward");
assert.match(adapter,/SET LOCAL lock_timeout/,"interactive transaction must set lock_timeout");
assert.match(adapter,/SET LOCAL statement_timeout/,"interactive transaction must set statement_timeout");
assert.match(adapter,/query_timeout: clientQueryTimeoutMs/,"interactive client queries must have a client-side timeout");
assert.match(adapter,/"55P03"/,"lock timeout must be classified as transient");
assert.match(adapter,/"57014"/,"statement timeout must be classified as transient");
assert.match(adapter,/async query\(text, params = \[\], options = \{\}\)/,"database query options must reach queryWithRetry");
assert.match(idempotency,/idempotency-receipt-preflight/,'idempotency preflight lookup must use bounded policy');
assert.match(idempotency,/attempts: 1/,'idempotency preflight must not enter long recovery loops');
assert.match(idempotency,/PG_IDEMPOTENCY_LOOKUP_TIMEOUT_MS \|\| 2000/,'idempotency receipt lookup must fail open quickly');
const opStatus=server.match(/operation:"operation-status",attempts:1,queryTimeoutMs:(\d+),recoveryBudgetMs:(\d+)/);
assert(opStatus,"operation status polling policy must be explicit");
assert(Number(opStatus[1])<=2500&&Number(opStatus[2])<=2500,"operation status polling must stay bounded");
console.log(`Transaction write timeout recovery: OK (${lockMs}/${statementMs}/${clientMs}/${hardMs}ms)`);
