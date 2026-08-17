import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
import path from "node:path";
import {test} from "node:test";
import {fileURLToPath} from "node:url";

const require=createRequire(import.meta.url);
const {calculateNetCapital}=require("../../backend/src/finance/MonthlyInventoryFinancials.js");
const testDir=path.dirname(fileURLToPath(import.meta.url));
const projectRoot=path.resolve(testDir,"../..");
const screen=fs.readFileSync(path.join(projectRoot,"frontend/src/screens/CapitalOverview.jsx"),"utf8");
const server=fs.readFileSync(path.join(projectRoot,"backend/src/server.js"),"utf8");

test("equity uses contributions, withdrawals, realized net profit and distributions only",()=>{
  assert.equal(calculateNetCapital({
    capitalContributions:1000,
    capitalWithdrawals:100,
    realizedNetProfit:150,
    profitDistributions:50
  }),1000);
});

test("capital overview preserves the equity-only subtotal internally",()=>{
  assert.match(screen,/capitalContributions-capitalWithdrawals\+realizedNetProfit-profitDistributions/);
  assert.match(screen,/const equityNetCapital=/);
  assert.match(screen,/equityNetCapital\+netDebt/);
  assert.doesNotMatch(screen,/المال الكلي − إجمالي الالتزامات/);
  assert.doesNotMatch(screen,/المال الكلي \{money\(totalMoney\)\} − الالتزامات/);
});

test("receivables and payables remain visible and also feed comprehensive capital",()=>{
  assert.match(screen,/صافي الذمم/);
  assert.match(screen,/إجمالي الذمم لنا[\s\S]*money\(debtForUs\)/);
  assert.match(screen,/إجمالي الذمم علينا[\s\S]*money\(debtOnUs\)/);
  assert.match(screen,/صافي رأس المال الشامل/);
  assert.match(server,/const capitalPosition=calculateInventoryPosition\(store,\{toCad,customerBalances\}\);/);
  assert.match(server,/capitalPosition\.manualReceivables/);
  assert.match(server,/capitalPosition\.manualPayables/);
});
