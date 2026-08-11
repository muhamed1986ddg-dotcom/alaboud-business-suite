"use strict";
const fs=require("fs"),path=require("path"),assert=require("assert");
const s=fs.readFileSync(path.join(__dirname,"database/adapters/PostgresStateAdapter.js"),"utf8");
const start=s.indexOf("async acquireClient(");
const end=s.indexOf("async waitForInteractiveWriteReady(",start);
const a=s.slice(start,end);
assert(start>0&&end>start);
assert(!a.includes("withHardTimeout(() => this.pool.connect()"),
  "pool.connect must not be abandoned behind Promise.race");
assert(a.includes("client?.release?.(true)"),
  "late PoolClient must be destroyed/released");
assert(a.includes("pool !== this.pool"),
  "late client from replaced pool must be rejected");
assert(a.includes("localAcquireDeadline"),
  "local wait deadline must be distinguished from real DB failure");
assert(a.includes("if (!localAcquireDeadline)"),
  "local pool pressure must not recreate the whole pool");

const connectMatch=s.match(/PG_CONNECT_TIMEOUT_MS \|\| (\d+)/);
const interactiveMatch=s.match(/PG_INTERACTIVE_ACQUIRE_TIMEOUT_MS \|\| (\d+)/);
assert(connectMatch,"PG_CONNECT_TIMEOUT_MS default must be explicit");
assert(interactiveMatch,"PG_INTERACTIVE_ACQUIRE_TIMEOUT_MS default must be explicit");
const connectMs=Number(connectMatch[1]);
const interactiveMs=Number(interactiveMatch[1]);
assert(connectMs>=3000&&connectMs<=30000,`connect timeout must stay bounded, got ${connectMs}`);
assert(interactiveMs>=1000&&interactiveMs<=15000,`interactive acquire timeout must stay bounded, got ${interactiveMs}`);
console.log(`PostgreSQL PoolClient leak regression: OK (connect=${connectMs}ms interactive=${interactiveMs}ms)`);
