import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import test from "node:test";

const require=createRequire(import.meta.url);
const {resolveInventoryCapital,isAfterInventoryApproval}=require("./CapitalOverviewFinancials.js");

test("approved final inventory becomes the fixed original capital",()=>{
  const first={originalCapital:100000,originalCapitalDate:"2026-07-20",finalInventory:100000};
  const result=resolveInventoryCapital({latestInventory:first,capitalContributionsAfterInventory:5000,capitalWithdrawalsAfterInventory:2000,netProfitAfterInventory:3000,profitDistributionsAfterInventory:500});
  assert.equal(result.originalCapital,100000);
  assert.equal(result.currentCapital,105500);
  assert.equal(first.originalCapital,100000);
});

test("a newer approved inventory replaces the baseline without carrying old-period movements twice",()=>{
  const oldResult=resolveInventoryCapital({latestInventory:{finalInventory:100000},capitalContributionsAfterInventory:5000,netProfitAfterInventory:3000});
  assert.equal(oldResult.currentCapital,108000);
  const newResult=resolveInventoryCapital({latestInventory:{finalInventory:108000},capitalContributionsAfterInventory:1000,netProfitAfterInventory:200});
  assert.equal(newResult.currentCapital,109200);
});

test("legacy data without an approved inventory keeps the old cumulative result",()=>{
  const result=resolveInventoryCapital({legacyCurrentCapital:177176.17,capitalContributionsAfterInventory:999999,netProfitAfterInventory:999999});
  assert.equal(result.capitalBasis,"LEGACY_CUMULATIVE");
  assert.equal(result.currentCapital,177176.17);
  assert.equal(result.originalCapital,undefined);
});

test("precise approval timestamp includes later same-day movements only",()=>{
  const boundary={approvedAt:"2026-08-20T15:30:00.000Z",inventoryDate:"2026-08-20"};
  assert.equal(isAfterInventoryApproval({createdAt:"2026-08-20T15:29:00.000Z"},boundary),false);
  assert.equal(isAfterInventoryApproval({createdAt:"2026-08-20T15:30:00.000Z"},boundary),false);
  assert.equal(isAfterInventoryApproval({createdAt:"2026-08-20T15:31:00.000Z"},boundary),true);
  assert.equal(isAfterInventoryApproval({createdAt:"2026-08-21T00:00:00.000Z"},boundary),true);
});

test("legacy inventory date preserves the previous safe day boundary",()=>{
  const legacy={inventoryDate:"2026-08-20"};
  assert.equal(isAfterInventoryApproval({createdAt:"2026-08-20T23:59:00.000Z"},legacy),false);
  assert.equal(isAfterInventoryApproval({date:"2026-08-21"},legacy),true);
});

test("inventory close persists the approved baseline and capital overview filters later dates",()=>{
  const server=readFileSync(new URL("../server.js",import.meta.url),"utf8");
  assert.match(server,/originalCapital:draft\.finalInventory\?\?draft\.finalValue/);
  assert.match(server,/originalCapitalDate:local\.date/);
  assert.match(server,/originalCapitalApprovedAt:approvedAt/);
  assert.match(server,/originalCapitalInventoryId:inventoryId/);
  assert.match(server,/isAfterInventoryApproval\(item,\{approvedAt:originalCapitalApprovedAt,inventoryDate:originalCapitalDate\}\)/);
  assert.doesNotMatch(server,/currentCapital=.*totalReceivables/);
});
