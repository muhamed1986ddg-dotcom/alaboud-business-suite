"use strict";
const assert=require("assert");
const {transactionFinancials}=require("./finance/TransactionFinancials");
function cadRate(quoted, quoteCad){return Number(quoted)*Number(quoteCad)}
const costCad=cadRate(1.00,1.40); // 1 USD quote per transfer unit, USD/CAD 1.40
const clientCad=cadRate(1.02,1.40);
const f=transactionFinancials({amount:1000,currency:"USD",costRate:costCad,finalRate:clientCad,feeMethod:"SPREAD"});
assert.equal(f.convertedCad,1428);
assert.equal(f.exchangeProfit,28);
assert.equal(f.totalCustomerDue,1428);
const legacy=transactionFinancials({amount:1000,currency:"USD",costRate:1.40,finalRate:1.428,feeMethod:"SPREAD"});
assert.deepEqual({due:f.totalCustomerDue,profit:f.exchangeProfit},{due:legacy.totalCustomerDue,profit:legacy.exchangeProfit});
console.log("multicurrency transfer rates v25.14.120: OK");
