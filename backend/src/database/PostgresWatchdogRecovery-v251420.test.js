"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");
const source=fs.readFileSync(path.join(__dirname,"adapters","PostgresStateAdapter.js"),"utf8");
for(const token of [
  "async function runClientStep",
  "client.connection?.stream?.destroy?.(error)",
  "async acquireClient",
  "durable-write-connect",
  "recovery-probe-connect",
  "health-probe-connect",
  "poolWaiting",
  "runClientTask(client, () => this.projector.project(client, next)",
  "client.release(true)"
]) assert(source.includes(token),`missing watchdog token: ${token}`);
assert(!source.includes('await this.queryWithRetry("SELECT 1", [], { operation: "health"'),"health must not synchronously block on PostgreSQL");
console.log("PostgreSQL watchdog recovery v25.14.20 test passed");
