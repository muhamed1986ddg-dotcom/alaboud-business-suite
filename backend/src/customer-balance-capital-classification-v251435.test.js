const assert=require("assert");
const {customerSummary,customerBalanceTotals}=require("./finance/FinancialEngine");
const {calculateReceivableSummary}=require("./finance/ReceivableSummary");

const store={
  customers:[
    {id:"c-recv",name:"عميل عليه",oldBalance:1000,oldBalanceType:"RECEIVABLE"},
    {id:"c-pay",name:"عميل له",oldBalance:250,oldBalanceType:"PAYABLE"},
  ],
  transactions:[],payments:[]
};
const recv=customerSummary(store,store.customers[0]);
const pay=customerSummary(store,store.customers[1]);
assert.equal(recv.finalBalance,1000);
assert.equal(pay.finalBalance,-250);
const totals=customerBalanceTotals(store);
assert.deepEqual(totals,{currency:"CAD",receivable:1000,payable:250,net:750});
const summary=calculateReceivableSummary({customerReceivable:totals.receivable,customerPayable:totals.payable,companyReceivable:100,companyPayable:40});
assert.equal(summary.receivable,1100);
assert.equal(summary.payable,290);
assert.equal(summary.net,810);
assert.equal(summary.breakdown.customerPayable,250);
console.log("v25.14.35 customer receivable/payable capital classification tests passed");
