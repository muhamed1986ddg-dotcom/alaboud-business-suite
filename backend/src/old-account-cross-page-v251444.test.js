"use strict";
const assert=require("assert");
const fs=require("fs");const path=require("path");
const {customerSummary,customerBalanceTotals}=require("./finance/FinancialEngine");
const store={customers:[
 {id:"recv",name:"عميل عليه",oldBalance:1000,oldBalanceType:"RECEIVABLE"},
 {id:"pay",name:"عميل له",oldBalance:250,oldBalanceType:"PAYABLE"}
],transactions:[],payments:[]};
const recv=customerSummary(store,store.customers[0]);
const pay=customerSummary(store,store.customers[1]);
assert.equal(recv.finalBalance,1000);assert.equal(recv.oldBalanceLabel,"عليه");
assert.equal(pay.finalBalance,-250);assert.equal(pay.oldBalanceLabel,"له");
const totals=customerBalanceTotals(store); assert.equal(totals.receivable,1000);assert.equal(totals.payable,250);assert.equal(totals.net,750);assert.equal(totals.currency,"CAD");
const customers=fs.readFileSync(path.join(__dirname,"../../frontend/src/screens/Customers.jsx"),"utf8");
assert(customers.includes("customer-old-balance-badge"));
assert(customers.includes("الرصيد النهائي له"));
assert(customers.includes("openingType===\"PAYABLE\"?-opening:opening"));
const server=fs.readFileSync(path.join(__dirname,"server.js"),"utf8");
assert(server.includes("customerPayables"));
const repo=fs.readFileSync(path.join(__dirname,"repositories/PostgresEntityRepository.js"),"utf8");
assert(repo.includes("oldBalanceType"));assert(repo.includes("THEN -1 ELSE 1 END"));
console.log("v25.14.44 old-account cross-page consistency OK");
