"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {transactionFinancials}=require("./TransactionFinancials");
const rows=[
 {amount:2315,costRate:1.47,finalRate:1.50,customerRate:12.6654,transferFee:0,transferDate:"2026-07-28"},
 {amount:11500,costRate:1.40,finalRate:1.41,customerRate:12.6654,transferFee:3581,transferDate:"2026-07-28"}
];
const exchangeProfit=rows.reduce((sum,row)=>sum+transactionFinancials(row).exchangeProfit,0);
assert.equal(+exchangeProfit.toFixed(2),184.45);
const server=fs.readFileSync(path.join(__dirname,"..","server.js"),"utf8");
assert(server.includes('!t.isDeleted&&t.status!=="CANCELLED"'));
assert(server.includes('inRange(t.transferDate||t.createdAt)'));
assert(server.includes('String(t.transferDate||t.createdAt||"").slice(0,7)'));
console.log("Report profit integrity tests passed");
