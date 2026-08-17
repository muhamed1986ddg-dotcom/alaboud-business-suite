"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const {
  calculatePartnerDebtBuckets,
  aggregateDebtBuckets,
  calculateCompanyDebtPosition
}=require("./finance/CompanyDebtPosition");
const {calculateInventoryPosition}=require("./finance/MonthlyInventoryFinancials");

const store={
  partners:[
    {
      id:"company-1",
      name:"شركة اختبار",
      accountCurrency:"USD",
      externalBalances:{USD:{receivable:1000,payable:100,balance:900}}
    }
  ],
  partnerTransactions:[
    {id:"r1",partnerId:"company-1",type:"RECEIVABLE",amount:1000,currency:"CAD"},
    {id:"p1",partnerId:"company-1",type:"PAYABLE",amount:857.22,currency:"CAD"}
  ],
  partnerPayments:[],
  generalDebts:[],
  generalDebtPayments:[]
};

// The old cross-page mismatch was exactly the gross payable that one page
// subtracted before classification while another page left on the opposite side.
const buckets=calculatePartnerDebtBuckets(store,store.partners[0]);
assert.strictEqual(buckets.localBuckets.length,1);
assert.strictEqual(buckets.localBuckets[0].currency,"CAD");
assert.strictEqual(buckets.localBuckets[0].receivable,142.78);
assert.strictEqual(buckets.localBuckets[0].payable,0);
assert.strictEqual(buckets.localBuckets[0].net,142.78);

const toCad=(amount,currency)=>String(currency).toUpperCase()==="USD"?Number(amount)*1.4:Number(amount);
const partnerTotals=aggregateDebtBuckets(buckets,{toTarget:toCad});
assert.strictEqual(Number(partnerTotals.receivable.toFixed(2)),1542.78);
assert.strictEqual(Number(partnerTotals.payable.toFixed(2)),140.00);
assert.strictEqual(Number(partnerTotals.net.toFixed(2)),1402.78);

const companyPosition=calculateCompanyDebtPosition(store,{toCad});
assert.strictEqual(Number(companyPosition.receivable.toFixed(2)),1542.78);
assert.strictEqual(Number(companyPosition.payable.toFixed(2)),140.00);
assert.strictEqual(Number(companyPosition.companyReceivables.toFixed(2)),142.78);
assert.strictEqual(Number(companyPosition.partnerAssets.toFixed(2)),1400.00);

const inventoryPosition=calculateInventoryPosition(store,{toCad,customerBalances:{receivable:0,payable:0}});
assert.strictEqual(Number((inventoryPosition.companyReceivables+inventoryPosition.partnerAssets).toFixed(2)),1542.78);
assert.strictEqual(Number(inventoryPosition.companyPayables.toFixed(2)),140.00);

const server=fs.readFileSync(path.join(__dirname,"server.js"),"utf8");
const general=server.slice(server.indexOf('app.get("/api/general-debts"'),server.indexOf('app.post("/api/general-debts"'));
const capital=server.slice(server.indexOf('app.get("/api/capital-overview"'),server.indexOf('function inventoryLocalDate'));
const partners=server.slice(server.indexOf('app.get("/api/partners"'),server.indexOf('function resolvePartnerConnector'));
assert(general.includes("calculatePartnerDebtBuckets(store,partner)"),"general debts must build company rows from the central formula");
assert(general.includes("calculateCompanyDebtPosition(store"),"general debts total must use the central formula");
assert(general.includes("currencyConversion(store"),"general debts must use the shared automatic exchange graph");
assert(!general.includes("const latestRates = new Map()"),"general debts must not maintain a second all-rates exchange graph");
assert(capital.includes("calculateCompanyDebtPosition(store,{toCad})"),"capital overview must use the central company formula");
assert(partners.includes("calculatePartnerDebtBuckets(store,partner)"),"companies page must use the central company formula");

console.log("company debt consistency v25.14.84: OK");
