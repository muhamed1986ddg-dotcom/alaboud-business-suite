import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css=fs.readFileSync(new URL("../src/styles/components.css",import.meta.url),"utf8");
const statement=fs.readFileSync(new URL("../src/screens/CustomerDetails.jsx",import.meta.url),"utf8");

test("mobile customer statement uses dedicated cards instead of the wide desktop table",()=>{
  assert.match(statement,/simple-statement-desktop-table/);
  assert.match(statement,/simple-statement-mobile-list/);
  assert.match(statement,/simple-statement-mobile-card__title">حوالة رقم/);
  assert.match(statement,/simple-statement-mobile-field--total/);
  assert.match(statement,/simple-statement-mobile-card__title">دفعة رقم/);
  assert.match(css,/@media\(max-width:700px\)\{[\s\S]*?\.simple-customer-statement \.simple-statement-desktop-table\{display:none!important\}/);
  assert.match(css,/\.simple-customer-statement \.simple-statement-mobile-list\{[\s\S]*?display:grid;[\s\S]*?min-width:0/);
});

test("mobile statement cards cannot create horizontal overflow",()=>{
  assert.match(css,/\.simple-customer-statement\{[\s\S]*?max-width:100%!important;[\s\S]*?overflow-x:hidden!important/);
  assert.match(css,/\.simple-customer-statement \.simple-statement-mobile-card\{[\s\S]*?width:100%;[\s\S]*?min-width:0;[\s\S]*?overflow:hidden/);
  assert.match(css,/\.simple-customer-statement \.simple-statement-mobile-card__grid\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/\.simple-customer-statement \.simple-statement-mobile-field strong\{[\s\S]*?white-space:normal!important;[\s\S]*?overflow-wrap:anywhere/);
});

test("desktop and print keep the full statement tables",()=>{
  const printBlock=css.slice(css.lastIndexOf("@media print{"));
  assert.match(printBlock,/\.simple-customer-statement \.simple-statement-desktop-table\{display:block!important\}/);
  assert.match(printBlock,/\.simple-customer-statement \.simple-statement-mobile-list,[\s\S]*?display:none!important/);
});
