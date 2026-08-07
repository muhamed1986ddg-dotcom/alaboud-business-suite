"use strict";
const assert=require("assert");
const {calculateInventoryPayables,calculateInventoryMonthProfit}=require("./MonthlyInventoryFinancials");

const store={
  partners:[
    {id:"p1",accountCurrency:"USD",externalBalances:{USD:{payable:40,receivable:0,balance:-40}}},
    {id:"p2",accountCurrency:"CAD",externalPayable:25}
  ],
  partnerTransactions:[{partnerId:"p1",type:"PAYABLE",amount:100,currency:"CAD"}],
  partnerPayments:[{partnerId:"p1",direction:"PAID",amount:30,currency:"CAD"}],
  generalDebts:[{id:"d1",type:"PAYABLE",amount:80,currency:"CAD"}],
  generalDebtPayments:[{debtId:"d1",amount:20}],
  transactions:[
    {id:"t1",transferDate:"2026-08-05"},
    {id:"t2",transferDate:"2026-07-31"},
    {id:"t3",transferDate:"2026-08-06",status:"CANCELLED"}
  ],
  expenses:[{date:"2026-08-06",cadAmount:12.5},{date:"2026-07-01",cadAmount:99}]
};
const toCad=(amount,currency)=>currency==="USD"?Number(amount)*1.4:Number(amount);
const payable=calculateInventoryPayables(store,{toCad});
assert.strictEqual(payable.companyLocal,70);
assert.strictEqual(payable.companyExternal,81); // USD 40*1.4 + CAD 25
assert.strictEqual(payable.manual,60);
assert.strictEqual(payable.total,211);
const profit=calculateInventoryMonthProfit(store,{month:"2026-08",transactionFinancials:()=>({totalProfit:50})});
assert.strictEqual(profit.grossProfit,50);
assert.strictEqual(profit.expenses,12.5);
assert.strictEqual(profit.netProfit,37.5);
console.log("MonthlyInventoryFinancials.test.js: OK");
