"use strict";
const assert=require("assert/strict");
const fs=require("fs");
const path=require("path");
const {planGroupedCustomerPayment}=require("./finance/CustomerPaymentReallocation");

{
  const plan=planGroupedCustomerPayment([
    {transaction:{id:"t1"},remaining:100},
    {transaction:{id:"t2"},remaining:200}
  ],150,0);
  assert.deepEqual(plan.allocations,[
    {transactionId:"t1",amount:100},
    {transactionId:"t2",amount:50}
  ]);
  assert.equal(plan.oldBalanceAllocation,0);
  assert.equal(plan.oldBalanceAfter,0);
}

{
  const plan=planGroupedCustomerPayment([
    {transaction:{id:"t1"},remaining:200}
  ],250,100);
  assert.deepEqual(plan.allocations,[{transactionId:"t1",amount:200}]);
  assert.equal(plan.oldBalanceAllocation,50);
  assert.equal(plan.oldBalanceAfter,50);
}

assert.throws(
  ()=>planGroupedCustomerPayment([{transaction:{id:"t1"},remaining:100}],150,25),
  /الدفعة أكبر من الرصيد المتبقي/
);
assert.throws(()=>planGroupedCustomerPayment([],0,100),/مبلغ الدفعة غير صحيح/);

const server=fs.readFileSync(path.join(__dirname,"server.js"),"utf8");
const service=fs.readFileSync(path.join(__dirname,"services/customer-payment-edit.js"),"utf8");
const start=server.indexOf('app.patch("/api/payments/:id"');
const end=server.indexOf('app.delete("/api/payments/:id"',start);
const route=server.slice(start,end);
assert(route.includes("editGroupedCustomerPayment"));
assert(service.includes("const amountChanged=Math.abs(requestedAmount-previousAmount)>0.001"));
assert(service.includes("planGroupedCustomerPayment(rows,requestedAmount,oldBalanceRemaining)"));
assert(service.includes('reason:"إعادة توزيع بعد تعديل مبلغ الدفعة"'));
assert(service.includes("receipt.originalAmount=+requestedAmount.toFixed(2)"));
assert(service.includes("assertBalancedEntry(["));
assert(service.includes("replacedAllocationIds"));

console.log("v25.14.95 grouped customer payment amount edit: OK");
