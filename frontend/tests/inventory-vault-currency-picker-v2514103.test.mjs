import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import {addVaultCurrency,availableVaultCurrencies,buildVaultCashRows,removeVaultCurrency,savedVaultCurrencies,vaultCashCadTotal} from "../src/inventoryVaultCurrencies.js";

test("only explicitly added currencies appear and duplicates are rejected",()=>{
  let balances={};
  assert.deepEqual(buildVaultCashRows(balances,{}),[]);
  balances=addVaultCurrency(balances,"USD");
  assert.deepEqual(Object.keys(balances),["USD"]);
  balances=addVaultCurrency(balances,"EUR");
  assert.deepEqual(Object.keys(balances),["USD","EUR"]);
  const unchanged=addVaultCurrency(balances,"USD");
  assert.strictEqual(unchanged,balances);
  assert.deepEqual(availableVaultCurrencies(["CAD","USD","EUR"],balances),["CAD"]);
});

test("removing one currency preserves every other currency",()=>{
  assert.deepEqual(removeVaultCurrency({CAD:"500",USD:"1000",EUR:"20"},"USD"),{CAD:"500",EUR:"20"});
});

test("saved inventory exposes exactly the currencies present in its snapshot",()=>{
  assert.deepEqual(savedVaultCurrencies({USD:1000,EUR:750}),[{currency:"USD",amount:1000},{currency:"EUR",amount:750}]);
});

test("picker visibility changes do not alter the converted vault total",()=>{
  const rates={USD:{factor:1.3826},EUR:{factor:1.5}};
  const usdRows=buildVaultCashRows({CAD:5000,USD:1000},rates);
  assert.equal(vaultCashCadTotal(usdRows),6382.60);
  const withEur=buildVaultCashRows({CAD:5000,USD:1000,EUR:100},rates);
  assert.equal(vaultCashCadTotal(withEur),6532.60);
  assert.equal(vaultCashCadTotal(buildVaultCashRows(removeVaultCurrency({CAD:5000,USD:1000,EUR:100},"EUR"),rates)),6382.60);
});

test("inventory UI includes the compact empty, add and remove controls",()=>{
  const source=readFileSync(new URL("../src/screens/ReportsProfits.jsx",import.meta.url),"utf8");
  assert.match(source,/لم تتم إضافة أي عملة إلى الخزنة/);
  assert.match(source,/إضافة عملة/);
  assert.match(source,/deleteVaultCurrency/);
  assert.match(source,/availableVaultCurrencyOptions\.map/);
});
