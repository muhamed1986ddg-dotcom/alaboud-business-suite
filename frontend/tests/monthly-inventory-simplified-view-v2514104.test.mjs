import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

test("monthly inventory uses four official summary cards and backend finalInventory",()=>{
  const source=readFileSync(new URL("../src/screens/ReportsProfits.jsx",import.meta.url),"utf8");
  for(const label of ["صافي الشركات","صافي ديون العملاء","صافي الأرباح","الكاش في الخزنة","الجرد النهائي"]){
    assert.match(source,new RegExp(label));
  }
  assert.match(source,/api\.post\("\/monthly-inventory\/preview",\{vaultCashByCurrency\}\)/);
  assert.match(source,/inventoryDisplay\.finalInventory\?\?inventoryDisplay\.finalValue/);
  assert.match(source,/تسويات\/ذمم أخرى/);
  assert.match(source,/للعرض فقط — لا يُضاف مرة ثانية/);
  assert.doesNotMatch(source,/const previewFinalValue=previewTotalAssets-previewTotalLiabilities/);
  assert.doesNotMatch(source,/\+ enteredVaultCash/);
});
