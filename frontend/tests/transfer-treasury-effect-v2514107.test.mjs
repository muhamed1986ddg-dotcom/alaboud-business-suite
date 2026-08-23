import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const customers=fs.readFileSync(new URL("../src/screens/Customers.jsx",import.meta.url),"utf8");
const transactions=fs.readFileSync(new URL("../src/screens/Transactions.jsx",import.meta.url),"utf8");
const customerDetails=fs.readFileSync(new URL("../src/screens/CustomerDetails.jsx",import.meta.url),"utf8");
const treasury=fs.readFileSync(new URL("../src/screens/Treasury.jsx",import.meta.url),"utf8");

test("transfer forms do not expose or submit cash-delivery controls",()=>{
  for(const source of [customers,transactions,customerDetails]){
    assert.doesNotMatch(source,/treasuryEffect|deliveryRate/);
  }
  assert.match(treasury,/cash-delivery/);
  assert.match(treasury,/deliveryRate:Number\(delivery\.deliveryRate\)/);
  assert.match(treasury,/سعر الصرف الفعلي وقت التسليم/);
});
