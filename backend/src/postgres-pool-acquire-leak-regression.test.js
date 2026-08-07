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
assert(s.includes("PG_CONNECT_TIMEOUT_MS || 12000"));
assert(s.includes("PG_INTERACTIVE_ACQUIRE_TIMEOUT_MS || 6000"));
console.log("PostgreSQL PoolClient leak regression: OK");
