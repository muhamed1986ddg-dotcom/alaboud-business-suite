import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const api=fs.readFileSync(new URL("../src/api.js",import.meta.url),"utf8");
const customers=fs.readFileSync(new URL("../src/screens/Customers.jsx",import.meta.url),"utf8");
const details=fs.readFileSync(new URL("../src/screens/CustomerDetails.jsx",import.meta.url),"utf8");

test("financial writes use one POST and bounded confirmation recovery",()=>{
  assert.match(api,/config\.timeout=method==="get"\?45000:30000/);
  assert.match(api,/OPERATION_CONFIRMATION_DELAYS=\[500,1000,1500,2500,4000\]/);
  assert.match(api,/COMMITTED","SUCCESS","COMPLETED/);
  assert.match(api,/FAILED","REJECTED","ROLLED_BACK/);
  assert.match(api,/OPERATION_STATUS_UNKNOWN/);
  assert.doesNotMatch(api,/_alaboudWriteReplayCount|api\.request\(error\.config\)/);
});

test("both payment forms block double submit throughout verification",()=>{
  for(const source of [customers,details]){
    assert.match(source,/if\(savingPayment\)return/);
    assert.match(source,/disabled=\{savingPayment\}/);
    assert.match(source,/onConfirmationState:state=>\{if\(paymentMountedRef\.current\)setPaymentConfirmationState\(state\);\}/);
    assert.match(source,/paymentMountedRef\.current=false/);
    assert.match(source,/جاري التحقق/);
    assert.match(source,/تعذر تأكيد حالة الدفعة حاليًا/);
  }
  assert.equal((customers.match(/api\.post\(`\/customers\/\$\{paymentForm\.customerId\}\/payments`/g)||[]).length,1);
  assert.equal((details.match(/api\.post\(`\/customers\/\$\{id\}\/payments`/g)||[]).length,1);
});
