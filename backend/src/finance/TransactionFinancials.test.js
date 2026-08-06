"use strict";
const assert = require("node:assert/strict");
const { authoritativeTransactionRate, transactionFinancials } = require("./TransactionFinancials");

assert.equal(authoritativeTransactionRate({finalRate:1.47, customerRate:12.6654}), 1.47);
assert.equal(authoritativeTransactionRate({amount:100,totalCustomerDue:152,transferFee:5,feeMethod:"ADD",customerRate:12.6654}), 1.47);
assert.equal(authoritativeTransactionRate({amount:100,costRate:1.40,exchangeProfit:7,customerRate:12.6654}), 1.47);

const a = transactionFinancials({amount:100, costRate:1.40, finalRate:1.47, customerRate:12.6654, transferFee:5, feeMethod:"ADD"});
assert.equal(a.convertedCad,147);
assert.equal(a.totalCustomerDue,152);
assert.ok(Math.abs(a.exchangeProfit-7)<1e-9);
assert.ok(Math.abs(a.totalProfit-12)<1e-9);
assert.equal(a.valid,true);

const rows=[
 {amount:100,costRate:1.40,finalRate:1.47,customerRate:12.6654,transferFee:0},
 {amount:200,costRate:1.45,finalRate:1.50,customerRate:9.99,transferFee:10}
];
const totalExchangeProfit=rows.reduce((sum,row)=>sum+transactionFinancials(row).exchangeProfit,0);
assert.ok(Math.abs(totalExchangeProfit-17)<1e-9);
console.log("TransactionFinancials tests passed");
