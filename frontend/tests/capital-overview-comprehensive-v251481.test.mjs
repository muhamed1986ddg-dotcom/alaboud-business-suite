import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {test} from "node:test";
import {fileURLToPath} from "node:url";

const testDir=path.dirname(fileURLToPath(import.meta.url));
const projectRoot=path.resolve(testDir,"../..");
const screen=fs.readFileSync(path.join(projectRoot,"frontend/src/screens/CapitalOverview.jsx"),"utf8");
const server=fs.readFileSync(path.join(projectRoot,"backend/src/server.js"),"utf8");

test("legacy primary capital still includes comprehensive debt before the first inventory",()=>{
  assert.match(screen,/data\.comprehensiveNetCapital \?\? data\.netCapital/);
  assert.match(screen,/equityNetCapital\+netDebt/);
  assert.match(screen,/data\.capitalBasis==="LAST_APPROVED_INVENTORY"/);
  assert.match(screen,/إجمالي الدين لنا/);
  assert.match(screen,/إجمالي الدين علينا/);
});

test("API publishes the approved-inventory current capital and preserves the legacy value",()=>{
  assert.match(server,/netCapital:currentCapital/);
  assert.match(server,/comprehensiveNetCapital:currentCapital/);
  assert.match(server,/legacyComprehensiveNetCapital:accounting\.comprehensiveNetCapital/);
});
