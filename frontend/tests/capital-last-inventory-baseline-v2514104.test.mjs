import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

test("capital overview labels and displays the approved inventory baseline",()=>{
  const source=readFileSync(new URL("../src/screens/CapitalOverview.jsx",import.meta.url),"utf8");
  assert.match(source,/رأس المال الأصلي — آخر جرد معتمد/);
  assert.match(source,/تاريخ آخر جرد/);
  assert.match(source,/صافي رأس المال الحالي/);
  assert.match(source,/data\.capitalBasis==="LAST_APPROVED_INVENTORY"/);
  assert.match(source,/data\.capitalContributionsAfterInventory/);
  assert.match(source,/data\.netProfitAfterInventory/);
  assert.match(source,/يستخدم المنطق التراكمي القديم مؤقتًا/);
});
