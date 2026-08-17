import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {test} from "node:test";
import {fileURLToPath} from "node:url";

const testDir=path.dirname(fileURLToPath(import.meta.url));
const projectRoot=path.resolve(testDir,"../..");
const screen=fs.readFileSync(path.join(projectRoot,"frontend/src/screens/CapitalOverview.jsx"),"utf8");
const server=fs.readFileSync(path.join(projectRoot,"backend/src/server.js"),"utf8");

test("primary capital value includes comprehensive customer and company net debt",()=>{
  assert.match(screen,/data\.comprehensiveNetCapital \?\? data\.netCapital/);
  assert.match(screen,/equityNetCapital\+netDebt/);
  assert.match(screen,/صافي رأس المال الشامل/);
  assert.match(screen,/إجمالي الدين لنا/);
  assert.match(screen,/إجمالي الدين علينا/);
});

test("API preserves equity separately and publishes comprehensive capital as primary",()=>{
  assert.match(server,/netCapital:accounting\.comprehensiveNetCapital/);
  assert.match(server,/comprehensiveNetCapital:accounting\.comprehensiveNetCapital/);
  assert.match(server,/equityNetCapital:accounting\.equityNetCapital/);
});
