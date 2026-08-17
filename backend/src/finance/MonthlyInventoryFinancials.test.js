"use strict";
const assert=require("assert");
const {calculateInventoryPosition,calculateInventoryPayables,calculateInventoryMonthProfit}=require("./MonthlyInventoryFinancials");

const store={
  partners:[
    {id:"p1",accountCurrency:"USD",externalBalances:{USD:{payable:40,receivable:20,balance:-20}}},
    {id:"p2",accountCurrency:"CAD",externalPayable:25}
  ],
  partnerTransactions:[
    {partnerId:"p1",type:"PAYABLE",amount:100,currency:"CAD"},
    {partnerId:"p1",type:"RECEIVABLE",amount:50,currency:"CAD"}
  ],
  partnerPayments:[
    {partnerId:"p1",direction:"PAID",amount:30,currency:"CAD"},
    {partnerId:"p1",direction:"RECEIVED",amount:10,currency:"CAD"}
  ],
  generalDebts:[
    {id:"d1",type:"PAYABLE",amount:80,currency:"CAD"},
    {id:"d2",type:"RECEIVABLE",amount:50,currency:"CAD"}
  ],
  generalDebtPayments:[{debtId:"d1",amount:20},{debtId:"d2",amount:10}],
  transactions:[
    {id:"t1",transferDate:"2026-08-05"},
    {id:"t2",transferDate:"2026-07-31"},
    {id:"t3",transferDate:"2026-08-06",status:"CANCELLED"}
  ],
  expenses:[{date:"2026-08-06",cadAmount:12.5},{date:"2026-07-01",cadAmount:99}]
};
const toCad=(amount,currency)=>currency==="USD"?Number(amount)*1.4:Number(amount);
const payable=calculateInventoryPayables(store,{toCad});
assert.strictEqual(payable.companyLocal,30);
assert.strictEqual(payable.companyExternal,81); // USD 40*1.4 + CAD 25
assert.strictEqual(payable.manual,60);
assert.strictEqual(payable.total,171);
const position=calculateInventoryPosition(store,{toCad,customerBalances:{receivable:200,payable:35}});
assert.deepStrictEqual(position,{
  partnerAssets:28,
  customerReceivables:200,
  companyReceivables:0,
  manualReceivables:40,
  customerPayables:35,
  companyPayables:111,
  manualPayables:60,
  companyLocalPayables:30,
  partnerPayables:81,
  excludedManualDuplicateCount:0,
  manualDebtReviewFlags:[],
  excludedPartnerDuplicateCount:0,
  partnerReviewFlags:[]
});

const linkedStore={
  customers:[{id:"c1",name:"عميل"}],
  partners:[{id:"p3",name:"شركة مرتبطة",accountCurrency:"USD",externalBalances:{USD:{receivable:20,payable:0,balance:20}}}],
  partnerTransactions:[
    {id:"mirror",partnerId:"p3",type:"RECEIVABLE",amount:20,currency:"USD",sourceRef:"PARTNER_EXTERNAL:p3:USD"},
    {id:"independent",partnerId:"p3",type:"RECEIVABLE",amount:5,currency:"USD"}
  ],
  partnerPayments:[],
  generalDebts:[
    {id:"linked-manual",type:"RECEIVABLE",amount:25,currency:"CAD",customerId:"c1"},
    {id:"independent-manual",type:"RECEIVABLE",amount:10,currency:"CAD"}
  ],
  generalDebtPayments:[]
};
const linkedPosition=calculateInventoryPosition(linkedStore,{toCad,customerBalances:{receivable:0,payable:0}});
assert.strictEqual(linkedPosition.partnerAssets,28);
assert.strictEqual(linkedPosition.companyReceivables,7);
assert.strictEqual(linkedPosition.manualReceivables,10);
assert.strictEqual(linkedPosition.excludedPartnerDuplicateCount,1);
assert.strictEqual(linkedPosition.excludedManualDuplicateCount,1);
assert.strictEqual(linkedPosition.partnerReviewFlags.length,1);
assert.equal(linkedPosition.manualDebtReviewFlags[0].reviewStatus,"LINKED_DUPLICATE");
const profit=calculateInventoryMonthProfit(store,{month:"2026-08",transactionFinancials:()=>({totalProfit:50})});
assert.strictEqual(profit.grossProfit,50);
assert.strictEqual(profit.expenses,12.5);
assert.strictEqual(profit.netProfit,37.5);
console.log("MonthlyInventoryFinancials.test.js: OK");
