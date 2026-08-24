import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const treasury=fs.readFileSync(new URL("../src/screens/Treasury.jsx",import.meta.url),"utf8");
const styles=fs.readFileSync(new URL("../src/styles.css",import.meta.url),"utf8");

test("Treasury exposes the inventory carry-forward form and financial preview",()=>{
  assert.match(treasury,/إضافة كاش من الجرد السابق/);
  assert.match(treasury,/\/treasury\/inventory-carry-forward/);
  assert.match(treasury,/carryUsdBasis=carryForward\.currency==="CAD"&&carryRate>0\?carryQuantity\/carryRate:0/);
  assert.match(treasury,/carryExpectedAverage/);
  assert.match(treasury,/USD basis للكاش المرحّل/);
  assert.match(treasury,/finalizedPeriods\.map/);
});

test("carry-forward preview is responsive without horizontal overflow",()=>{
  assert.match(styles,/\.treasury-carry-forward-preview\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(styles,/@media\(max-width:768px\)\{[\s\S]*?\.treasury-carry-forward-preview\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(styles,/\.treasury-carry-forward-form\{max-width:100%;overflow:hidden/);
  for(const width of [360,390,412])assert(width<=768);
});
