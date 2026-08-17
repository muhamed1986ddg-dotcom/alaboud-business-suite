import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {test} from "node:test";
import {fileURLToPath} from "node:url";

const testDir=path.dirname(fileURLToPath(import.meta.url));
const projectRoot=path.resolve(testDir,"../..");
const screen=fs.readFileSync(path.join(projectRoot,"frontend/src/screens/CapitalOverview.jsx"),"utf8");
const app=fs.readFileSync(path.join(projectRoot,"frontend/src/App.jsx"),"utf8");
const server=fs.readFileSync(path.join(projectRoot,"backend/src/server.js"),"utf8");

test("capital overview separates cumulative, monthly and fixed-inventory periods",()=>{
  assert.match(screen,/فصل الفترات المحاسبية/);
  assert.match(screen,/نتيجة الشهر/);
  assert.match(screen,/الذمم الشاملة/);
  assert.match(screen,/الجرد النهائي/);
  assert.match(screen,/closedInventory\.finalValue/);
  assert.match(screen,/closedInventory\.inventoryDifference/);
});

test("an unclosed inventory is never presented as a zero-cash final value",()=>{
  assert.match(screen,/لا يمكن حساب قيمة الجرد النهائية بافتراض أن كاش الخزنة صفر/);
  assert.match(screen,/navigate\?\.\("reports-profits"\)/);
  assert.match(app,/CapitalOverview navigate=\{navigate\}/);
});

test("heuristic indicators are removed from the accounting surface",()=>{
  assert.doesNotMatch(screen,/const healthScore=/);
  assert.doesNotMatch(screen,/const projectedNet=/);
  assert.doesNotMatch(screen,/const profitChange=/);
  assert.doesNotMatch(screen,/<h3>🏥 صحة الشركة<\/h3>/);
  assert.doesNotMatch(screen,/<h3>🔮 توقع نهاية الشهر<\/h3>/);
  assert.doesNotMatch(screen,/<article[^>]*comparison-card/);
  assert.match(screen,/تم إيقاف توقع نهاية الشهر/);
});

test("backend publishes cent-reconciled capital, debt and monthly totals",()=>{
  assert.match(server,/calculateCapitalOverviewFinancials\(\{/);
  assert.match(server,/netDebt:accounting\.netDebt/);
  assert.match(server,/netCapital:accounting\.comprehensiveNetCapital/);
  assert.match(server,/equityNetCapital:accounting\.equityNetCapital/);
  assert.match(server,/monthlyNet:accounting\.monthlyNet/);
});
