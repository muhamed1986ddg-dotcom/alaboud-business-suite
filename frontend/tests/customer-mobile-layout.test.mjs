import fs from "node:fs";
import assert from "node:assert/strict";
const css=fs.readFileSync(new URL("../src/styles.css",import.meta.url),"utf8");
for(const token of [
  "v25.12.3 — Mobile-first customer list and customer record",
  ".customer-transfer-table td:nth-child(1)::before",
  ".customer-row-actions",
  "padding-bottom:140px",
  "grid-template-columns:minmax(105px,42%) minmax(0,1fr)"
]) assert.ok(css.includes(token),`missing mobile layout rule: ${token}`);
console.log("customer mobile layout checks passed");
