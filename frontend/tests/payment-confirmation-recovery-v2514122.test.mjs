import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

const root=resolve(import.meta.dirname,"..");
const api=readFileSync(resolve(root,"src/api.js"),"utf8");
const customers=readFileSync(resolve(root,"src/screens/Customers.jsx"),"utf8");
const details=readFileSync(resolve(root,"src/screens/CustomerDetails.jsx"),"utf8");

test("ambiguous customer payment uses bounded confirmation recovery without replay",()=>{
  assert.match(api,/config\.timeout=method==="get"\?45000:30000/);
  assert.ok(api.includes("const delays=[500,1000,1500,2500,4000]"));
  assert.ok(api.includes('successStatuses=new Set(["COMMITTED","SUCCESS","COMPLETED"])'));
  assert.ok(api.includes('failedStatuses=new Set(["FAILED","REJECTED","ROLLED_BACK"])'));
  assert.ok(api.includes("تعذر تأكيد حالة الدفعة حاليًا. يرجى تحديث حساب العميل قبل محاولة التسجيل مرة أخرى."));
  assert.ok(api.includes("تعذر تسجيل الدفعة. لم يتم حفظ العملية."));
  assert.equal(api.includes("_alaboudWriteReplayCount"),false);
  assert.ok(api.includes("Idempotency-Key"));
});

test("customer payment UI blocks duplicate submit and refreshes after recovered success",()=>{
  for(const source of [customers,details]){
    assert.ok(source.includes("paymentSubmitRef.current"));
    assert.ok(source.includes("if(paymentSubmitRef.current)return"));
    assert.ok(source.includes("disabled={savingPayment}"));
    assert.ok(source.includes("mountedRef.current"));
    assert.ok(source.includes("error.alaboudUserMessage"));
  }
  assert.ok(customers.includes("Promise.allSettled([load(),loadDebtSummary()])"));
  assert.ok(details.includes("await load()"));
});
