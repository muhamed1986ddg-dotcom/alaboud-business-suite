import test from "node:test";
import assert from "node:assert/strict";
import svc from "./services/zero-balance-whatsapp.js";
test("v25.14.113 zero balance template is editable",()=>{
  assert.match(svc.zeroBalanceMessage("محمد"),/أبو إسلام/);
  assert.equal(svc.zeroBalanceMessage("محمد","أهلاً {customerName}\nأبو إسلام"),"أهلاً محمد\nأبو إسلام");
});
