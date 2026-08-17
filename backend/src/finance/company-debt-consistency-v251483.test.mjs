import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
import {test} from "node:test";

const require=createRequire(import.meta.url);
const {calculateInventoryPosition,calculatePartnerBalances}=require("./MonthlyInventoryFinancials.js");

const store={
  partners:[{
    id:"company-1",
    name:"شركة اختبار",
    accountCurrency:"USD",
    externalBalances:{USD:{receivable:100,payable:20,balance:80}}
  }],
  partnerTransactions:[
    {id:"local-receivable",partnerId:"company-1",type:"RECEIVABLE",amount:300,currency:"CAD"},
    {id:"local-payable",partnerId:"company-1",type:"PAYABLE",amount:50,currency:"CAD"},
    {
      id:"external-mirror",
      partnerId:"company-1",
      type:"RECEIVABLE",
      amount:100,
      currency:"USD",
      sourceRef:"PARTNER_EXTERNAL:company-1:USD"
    }
  ],
  partnerPayments:[
    {id:"received",partnerId:"company-1",transactionId:"local-receivable",direction:"RECEIVED",amount:25,currency:"CAD"},
    {id:"paid",partnerId:"company-1",transactionId:"local-payable",direction:"PAID",amount:10,currency:"CAD"}
  ],
  generalDebts:[],
  generalDebtPayments:[]
};

const toCad=(amount,currency)=>currency==="USD"?Number(amount)*1.4:Number(amount);

test("company receivable and payable stay gross, converted and deduplicated",()=>{
  const result=calculatePartnerBalances(store,{toCad});

  assert.deepEqual({
    localReceivable:result.companyReceivables,
    externalReceivable:result.partnerAssets,
    localPayable:result.companyLocalPayables,
    externalPayable:result.partnerPayables,
    totalReceivable:result.companyReceivables+result.partnerAssets,
    totalPayable:result.companyPayables,
    excludedMirrors:result.excludedPartnerDuplicateCount
  },{
    localReceivable:275,
    externalReceivable:140,
    localPayable:40,
    externalPayable:28,
    totalReceivable:415,
    totalPayable:68,
    excludedMirrors:1
  });
});

test("capital and inventory consume the exact same company balance",()=>{
  const company=calculatePartnerBalances(store,{toCad});
  const inventory=calculateInventoryPosition(store,{toCad,customerBalances:{receivable:0,payable:0}});

  assert.equal(inventory.companyReceivables+inventory.partnerAssets,company.companyReceivables+company.partnerAssets);
  assert.equal(inventory.companyPayables,company.companyPayables);
});

test("companies and general-debts endpoints use the canonical company summary",()=>{
  const server=fs.readFileSync(new URL("../server.js",import.meta.url),"utf8");
  assert.match(server,/const companyBalances=companyDebtSummary\(store,\{targetCurrency:summaryCurrency\}\)/);
  assert.match(server,/const aggregate=companyDebtSummary\(calculationStore,\{targetCurrency:summaryCurrency\}\)/);
  assert.match(server,/const totalBalance=companyDebtSummary\(store,\{targetCurrency:"CAD",partnerIds:\[partner\.id\]\}\)/);
  assert.match(server,/const partnerBalances=companyDebtSummary\(store,\{targetCurrency:"CAD"\}\)/);
  assert.match(server,/const findConversion = \(from,to\)=>currencyConversion\(store,from,to\)/);
});
