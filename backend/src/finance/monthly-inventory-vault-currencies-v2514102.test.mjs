import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {test} from "node:test";

const require=createRequire(import.meta.url);
const {calculateVaultCashSnapshot,calculateInventorySnapshot,legacyVaultCashDetails}=require("./MonthlyInventoryFinancials.js");

const rates={USD:1.3826,EUR:1.51,GBP:1.72};
const resolve=(from)=>rates[from]?{factor:rates[from],path:[from,"CAD"],updatedAt:"2026-08-20T12:00:00.000Z",source:"TEST_RATE"}:null;

test("USD vault cash is converted to CAD by the authoritative supplied rate",()=>{
  const result=calculateVaultCashSnapshot({CAD:5000,USD:1000},resolve);
  assert.equal(result.vaultCash,6382.60);
  assert.equal(result.vaultCashByCurrency.USD,1000);
  assert.equal(result.vaultCashExchangeRates.USD.factor,1.3826);
  assert.equal(result.vaultCashExchangeRates.USD.convertedCad,1382.60);
});

test("multiple currencies are converted separately instead of adding raw amounts",()=>{
  const result=calculateVaultCashSnapshot({CAD:5000,USD:1000,EUR:100},resolve);
  assert.equal(result.vaultCash,6533.60);
  assert.notEqual(result.vaultCash,6100);
});

test("currency detail does not double count in the final inventory",()=>{
  const vault=calculateVaultCashSnapshot({CAD:5000,USD:1000},resolve);
  const before=calculateInventorySnapshot({vaultCash:vault.vaultCash,partnerAssets:100});
  const after=calculateInventorySnapshot({vaultCash:vault.vaultCash,partnerAssets:100,vaultCashByCurrency:vault.vaultCashByCurrency,vaultCashExchangeRates:vault.vaultCashExchangeRates});
  assert.equal(after.finalValue,before.finalValue);
  assert.equal(after.finalValue,6482.60);
});

test("historical inventory stays fixed when live exchange rates change",()=>{
  const fixed=calculateVaultCashSnapshot({USD:1000},resolve);
  const stored=calculateInventorySnapshot({vaultCash:fixed.vaultCash});
  rates.USD=2;
  assert.equal(calculateInventorySnapshot({...stored,vaultCashByCurrency:fixed.vaultCashByCurrency,vaultCashExchangeRates:fixed.vaultCashExchangeRates}).finalValue,1382.60);
});

test("legacy scalar vault cash remains CAD and unchanged",()=>{
  const legacy=legacyVaultCashDetails(725.45);
  assert.deepEqual(legacy.vaultCashByCurrency,{CAD:725.45,USD:0});
  assert.equal(calculateInventorySnapshot({vaultCash:725.45,...legacy}).finalValue,725.45);
});
