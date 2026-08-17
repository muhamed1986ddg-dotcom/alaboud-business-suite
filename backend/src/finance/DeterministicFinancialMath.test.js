"use strict";

const assert = require("assert");
const { transactionFinancials, authoritativeTransactionRate } = require("./TransactionFinancials");
const { customerSummary, customerDebtSummary } = require("./FinancialEngine");

const exact = transactionFinancials({ amount: "100", finalRate: "1.47", costRate: "1.40", transferFee: "0.10", feeMethod: "ADD" });
assert.strictEqual(exact.convertedCad, 147);
assert.strictEqual(exact.totalCustomerDue, 147.1);
assert.strictEqual(exact.exchangeProfit, 7);
assert.strictEqual(exact.transferFee, 0.1);
assert.strictEqual(exact.totalProfit, 7.1);

const fractional = transactionFinancials({ amount: "0.1", finalRate: "2", costRate: "1", transferFee: "0.2", feeMethod: "ADD" });
assert.strictEqual(fractional.convertedCad, 0.2);
assert.strictEqual(fractional.totalCustomerDue, 0.4);
assert.strictEqual(fractional.exchangeProfit, 0.1);
assert.strictEqual(fractional.transferFee, 0.2);
assert.strictEqual(fractional.totalProfit, 0.3);

const legacy = { amount: "100", finalRate: "1.4700", customerRate: "12.6654", costRate: "1.4" };
assert.strictEqual(authoritativeTransactionRate(legacy), 1.47);

const transactions = Array.from({ length: 1000 }, (_, index) => ({
  id: `t-${index}`,
  customerId: "c1",
  amount: "0.01",
  finalRate: "1.50",
  costRate: "1.40",
  transferFee: "0.01",
  feeMethod: "ADD",
  transferDate: "2026-08-06",
}));
const store = { transactions, payments: [], customers: [{ id: "c1", name: "Test" }] };
const summary = customerSummary(store, store.customers[0]);
assert.strictEqual(summary.totalTransactions, 25);
assert.strictEqual(summary.finalBalance, 25);
assert.strictEqual(customerDebtSummary(store).totalDebtCad, 25);

console.log("DeterministicFinancialMath.test.js: OK");
