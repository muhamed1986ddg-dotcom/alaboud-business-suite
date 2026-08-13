import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css=fs.readFileSync(new URL("../src/styles/components.css",import.meta.url),"utf8");
const statement=fs.readFileSync(new URL("../src/screens/CustomerDetails.jsx",import.meta.url),"utf8");

test("live customer statement has a scoped high-contrast dark surface",()=>{
  assert.match(statement,/invoice-sheet simple-customer-statement/);
  assert.match(css,/v25\.14\.76 — customer statement screen contrast/);
  assert.match(css,/\.simple-customer-statement\{[\s\S]*?background:linear-gradient[\s\S]*?color:#f8fafc!important/);
  assert.match(css,/\.simple-customer-statement \.simple-statement-table td\{[\s\S]*?background:#0d1a2d!important[\s\S]*?color:#f8fafc!important/);
  assert.match(css,/\.simple-customer-statement \.simple-statement-payments strong\{color:#86efac!important\}/);
  assert.match(css,/\.simple-customer-statement \.simple-statement-total strong\{color:#f2ca62!important\}/);
});

test("printed statement remains white with black text",()=>{
  const printBlock=css.slice(css.lastIndexOf("@media print{"));
  assert.match(printBlock,/\.simple-customer-statement\{[\s\S]*?background:#fff!important;color:#000!important/);
  assert.match(printBlock,/\.simple-customer-statement \.simple-statement-table th\{background:#eee!important;color:#000!important\}/);
  assert.match(printBlock,/\.simple-customer-statement \.simple-statement-table td strong\{color:#000!important\}/);
});
