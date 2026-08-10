"use strict";

const assert = require("assert");
const tick = () => new Promise(resolve => setImmediate(resolve));
const fs = require("fs");
const path = require("path");
const { createIdempotencyMiddleware, requireIdempotencyKey } = require("./reliability/idempotency");

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    on() {}
  };
}

(async()=>{
// Financial writes must fail closed when a caller does not provide an operation key.
{
  const req = { get: () => "" };
  const res = response();
  let continued = false;
  requireIdempotencyKey(req, res, () => { continued = true; });
  assert.equal(continued, false);
  assert.equal(res.statusCode, 428);
  assert.equal(res.body.code, "IDEMPOTENCY_KEY_REQUIRED");
}

// A duplicate request that arrives while the first one is still in flight must not execute twice.
{
  const middleware = createIdempotencyMiddleware({ ttlMs: 5000, maxEntries: 50 });
  const req = {
    method: "POST",
    path: "/api/customers/c1/payments",
    user: { companyId: "company-1" },
    get(name) { return String(name).toLowerCase() === "idempotency-key" ? "payment-op-1" : ""; }
  };
  const first = response();
  let firstExecutions = 0;
  middleware(req, first, () => { firstExecutions += 1; });
  await tick();
  assert.equal(firstExecutions, 1);

  const duplicate = response();
  let duplicateExecutions = 0;
  middleware(req, duplicate, () => { duplicateExecutions += 1; });
  await tick();
  assert.equal(duplicateExecutions, 0);
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.body.code, "DUPLICATE_OPERATION_IN_PROGRESS");

  first.status(201).json({ ok: true, amount: 4000 });
  const replay = response();
  middleware(req, replay, () => { throw new Error("committed request must replay instead of executing"); });
  await tick();
  assert.equal(replay.statusCode, 201);
  assert.deepEqual(replay.body, { ok: true, amount: 4000 });
  assert.equal(replay.headers["idempotency-replayed"], "true");
}

const server = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
const store = fs.readFileSync(path.join(__dirname, "store.js"), "utf8");
const financialRoutes = [
  'app.post("/api/transactions", auth, requireIdempotencyKey, async',
  'app.post("/api/customers/:id/payments", auth, requireIdempotencyKey, async',
  'app.post("/api/transactions/:id/payments", auth, requireIdempotencyKey, async',
  'app.patch("/api/payments/:id", auth, requireIdempotencyKey, async',
  'app.delete("/api/payments/:id", auth, requireIdempotencyKey, async',
  'app.post("/api/general-debts", auth, requireIdempotencyKey, async',
  'app.post("/api/general-debts/:id/payments", auth, requireIdempotencyKey, async',
  'app.post("/api/expenses", auth, requireIdempotencyKey, async',
  'app.post("/api/capital", auth, requireIdempotencyKey, async',
  'app.post("/api/partners/:id/payments", auth, requireIdempotencyKey, async'
];
for (const route of financialRoutes) assert(server.includes(route), `missing idempotency guard: ${route}`);

// All durable mutations are serialized on one chain, so two simultaneous balance-changing
// requests cannot both calculate from the same pre-commit in-memory snapshot.
assert(store.includes("let durableMutationChain=Promise.resolve()"));
assert(store.includes("const task=durableMutationChain.then(execute,execute)"));
assert(store.includes("durableMutationChain=task.catch(()=>undefined)"));

console.log("v25.14.51 write reliability guard: OK");

})().catch(error=>{console.error(error);process.exit(1);});
