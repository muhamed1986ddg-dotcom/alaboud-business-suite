import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../src/screens/CustomerDetails.jsx",import.meta.url),"utf8");

test("modern grouped customer payment amount is editable while legacy batches stay protected",()=>{
  const start=source.indexOf('<form className="card form edit-panel" data-app-editor="customer-payment"');
  const end=source.indexOf("</form>",start);
  const editor=source.slice(start,end);
  assert.ok(start>=0,"customer payment editor must exist");
  assert.ok(editor.includes('value={editingPayment.amount ?? ""}'));
  assert.ok(editor.includes('onChange={e=>setEditingPayment({...editingPayment,amount:e.target.value})}'));
  assert.ok(editor.includes('readOnly={Boolean(editingPayment.isGroupedPayment&&editingPayment.recordType!=="CUSTOMER_PAYMENT_RECEIPT")}'));
  assert.ok(editor.includes("سيعيد النظام توزيع المبلغ تلقائيًا"));
  assert.ok(editor.includes("هذه دفعة قديمة موزعة"));
});
