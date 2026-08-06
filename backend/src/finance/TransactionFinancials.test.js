"use strict";
const assert = require("assert");
const { authoritativeTransactionRate, transactionFinancials } = require("./TransactionFinancials");

assert.equal(authoritativeTransactionRate({finalRate:1.47, customerRate:12.6654}), 1.47);
assert.equal(authoritativeTransactionRate({customerRate:1.48}), 1.48);

const a = transactionFinancials({amount:100, costRate:1.40, finalRate:1.47, customerRate:12.6654, transferFee:5, feeMethod:"ADD"});
assert.equal(a.convertedCad,147);
assert.equal(a.totalCustomerDue,152);
assert.ok(Math.abs(a.exchangeProfit-7)<1e-9);
assert.ok(Math.abs(a.totalProfit-12)<1e-9);

const rows=[
 {amount:100,costRate:1.40,finalRate:1.47,customerRate:12.6654,transferFee:0},
 {amount:200,costRate:1.35,finalRate:1.50,customerRate:9.99,transferFee:10}
];
const totals=rows.reduce((out,row)=>{const f=transactionFinancials(row);out.cad+=f.convertedCad;out.profit+=f.totalProfit;return out;},{cad:0,profit:0});
assert.equal(totals.cad,447);
assert.ok(Math.abs(totals.profit-47)<1e-9);
console.log("TransactionFinancials tests passed");
