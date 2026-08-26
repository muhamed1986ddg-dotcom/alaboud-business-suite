import test from"node:test";import assert from"node:assert/strict";import fs from"node:fs";
const source=fs.readFileSync(new URL("./routes/notifications.js",import.meta.url),"utf8");
test("v25.14.115 filters soft-deleted customers from overdue surfaces",()=>{
  const marker=".filter(customer=>customer&&!customer.isDeleted)";
  assert.ok(source.split(marker).length-1>=2,"both overdue surfaces must filter soft-deleted customers");
});
