import assert from "node:assert/strict";
import {createRequire} from "node:module";
import test from "node:test";

const require=createRequire(import.meta.url);
const {calculateInventorySnapshot,calculateInventoryPresentation}=require("./MonthlyInventoryFinancials.js");

test("simplified presentation preserves the official final inventory exactly",()=>{
  const snapshot=calculateInventorySnapshot({
    netCapital:1800,
    vaultCash:1000,
    partnerAssets:300,
    companyReceivables:200,
    companyPayables:50,
    customerReceivables:500,
    customerPayables:100,
    manualReceivables:70,
    manualPayables:20
  });
  const before=snapshot.finalValue;
  const view=calculateInventoryPresentation(snapshot,999);
  assert.equal(before,1900);
  assert.equal(view.finalInventory,before);
  assert.equal(view.netCompanies,450);
  assert.equal(view.netCustomers,400);
  assert.equal(view.netManualDebts,50);
  assert.equal(view.netProfit,999);
  assert.equal(view.finalInventory,view.netCompanies+view.netCustomers+view.netManualDebts+snapshot.vaultCash);
});

test("profit is informational and vault cash enters the official result once",()=>{
  const snapshot=calculateInventorySnapshot({vaultCash:6382.60,partnerAssets:100});
  assert.equal(snapshot.finalValue,6482.60);
  assert.equal(calculateInventoryPresentation(snapshot,0).finalInventory,6482.60);
  assert.equal(calculateInventoryPresentation(snapshot,25000).finalInventory,6482.60);
});

test("non-zero manual debts remain represented inside final inventory",()=>{
  const withManual=calculateInventorySnapshot({vaultCash:100,manualReceivables:25,manualPayables:5});
  const withoutManual=calculateInventorySnapshot({vaultCash:100});
  const view=calculateInventoryPresentation(withManual,0);
  assert.equal(view.netManualDebts,20);
  assert.equal(view.finalInventory-withoutManual.finalValue,20);
});
