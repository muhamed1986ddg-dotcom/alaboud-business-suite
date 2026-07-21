const assert = require("assert");
const { buildUpsert, RelationalProjector } = require("./RelationalProjector");

const built = buildUpsert("customers", { id: "c1", company_id: "co1", name: "Ali", raw_payload: { a: 1 } }, ["id"]);
assert.match(built.sql, /ON CONFLICT \("id"\) DO UPDATE/);
assert.strictEqual(built.values[3], JSON.stringify({ a: 1 }));

(async () => {
  const calls = [];
  const client = { query: async (sql, values) => { calls.push({ sql, values }); return { rows: [] }; } };
  const projector = new RelationalProjector();
  const counts = await projector.project(client, {
    companies: [{ id: "co1", name: "ALABOUD", active: true }],
    users: [], customers: [{ id: "c1", companyId: "co1", name: "Ali" }]
  });
  assert.strictEqual(counts.customers, 1);
  assert.ok(calls.some((call) => call.sql.includes('INSERT INTO "customers"')));
  assert.ok(calls.some((call) => call.sql.includes('DELETE FROM "customers"')));
  console.log("RelationalProjector selftest passed");
})().catch((error) => { console.error(error); process.exit(1); });
