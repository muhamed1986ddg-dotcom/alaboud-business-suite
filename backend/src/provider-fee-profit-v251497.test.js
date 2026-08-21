"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const { transactionFinancials } = require("./finance/TransactionFinancials");
const { calculateInventoryMonthProfit } = require("./finance/MonthlyInventoryFinancials");
const { calculateCapitalOverviewFinancials } = require("./finance/CapitalOverviewFinancials");

function close(actual, expected, label) {
  assert(Math.abs(Number(actual) - Number(expected)) < 0.000001, `${label}: expected ${expected}, got ${actual}`);
}

// Dahab/Jad fee in the same currency as the transfer uses the actual cost rate.
const dahab = transactionFinancials({
  amount: 100,
  currency: "USD",
  costRate: 1.40,
  finalRate: 1.50,
  feeMethod: "PAID",
  transferFee: 5,
  providerFeeCompany: "Dahab",
  providerFeeAmount: 0.40,
  providerFeeCurrency: "USD",
});
close(dahab.exchangeProfit, 10, "exchange profit");
close(dahab.customerFee, 5, "customer fee");
close(dahab.providerFeeRateCad, 1.40, "provider fee rate");
close(dahab.providerFeeCad, 0.56, "provider fee CAD");
close(dahab.grossProfitBeforeProviderFee, 15, "gross before provider fee");
close(dahab.totalProfit, 14.44, "net transfer profit");
close(dahab.totalCustomerDue, 155, "customer due unaffected by provider fee");
close(dahab.beneficiaryReceives, 100, "beneficiary amount unaffected by provider fee");
assert.equal(dahab.netTransferProfit, dahab.totalProfit);
assert.equal(dahab.providerFeeCompany, "Dahab");
assert.equal(dahab.providerFeeCurrency, "USD");
assert.equal(dahab.valid, true);

// Inventory and capital consume transactionFinancials.totalProfit, so the provider fee
// reaches overall net profit exactly once.
const inventoryProfit = calculateInventoryMonthProfit({
  transactions:[{amount:100,currency:"USD",costRate:1.40,finalRate:1.50,feeMethod:"PAID",transferFee:5,providerFeeAmount:0.40,providerFeeCurrency:"USD",transferDate:"2026-08-19"}],
  expenses:[]
},{month:"2026-08",transactionFinancials});
close(inventoryProfit.grossProfit,14.44,"inventory transfer profit after provider fee");
close(inventoryProfit.netProfit,14.44,"inventory net profit after provider fee");
const capital = calculateCapitalOverviewFinancials({capitalContributions:1000,accumulatedProfit:inventoryProfit.grossProfit});
close(capital.realizedNetProfit,14.44,"capital realized net profit");
close(capital.equityNetCapital,1014.44,"capital equity after provider fee");

// CAD fee is already in the reporting currency.
const jadCad = transactionFinancials({
  amount: 100,
  currency: "USD",
  costRate: 1.40,
  finalRate: 1.50,
  feeMethod: "PAID",
  transferFee: 5,
  providerFeeCompany: "Jad",
  providerFeeAmount: 2,
  providerFeeCurrency: "CAD",
});
close(jadCad.providerFeeRateCad, 1, "CAD provider rate");
close(jadCad.providerFeeCad, 2, "CAD provider fee");
close(jadCad.totalProfit, 13, "net profit after CAD provider fee");

// A different fee currency requires an explicit CAD conversion rate.
const euroFee = transactionFinancials({
  amount: 100,
  currency: "USD",
  costRate: 1.40,
  finalRate: 1.50,
  feeMethod: "SPREAD",
  providerFeeCompany: "Other",
  providerFeeAmount: 1,
  providerFeeCurrency: "EUR",
  providerFeeRateCad: 1.55,
});
close(euroFee.providerFeeCad, 1.55, "EUR provider fee CAD");
close(euroFee.totalProfit, 8.45, "spread profit after provider fee");

// Missing conversion for a different fee currency must fail validation rather than guess.
const missingRate = transactionFinancials({
  amount: 100,
  currency: "USD",
  costRate: 1.40,
  finalRate: 1.50,
  providerFeeAmount: 1,
  providerFeeCurrency: "EUR",
});
assert.equal(missingRate.valid, false);

// Provider fees are direct transfer costs. Reports subtract them inside totalProfit,
// while general expenses remain a separate reduction; this guards against double subtraction.
const server = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
const financeSource = fs.readFileSync(path.join(__dirname, "finance/TransactionFinancials.js"), "utf8");
assert(server.includes('summarizeTransactionProfits(transactions)'), "profit reports must use the canonical transfer-profit summary");
assert(server.includes('const netProfit = grossProfit-totalExpenses;'));
assert(financeSource.includes('bucket.providerFees = Number(bucket.providerFees || 0) + financials.providerFeeCad;'));
assert(financeSource.includes('bucket.grossProfit = Number(bucket.grossProfit || 0) + financials.totalProfit;'));
assert(!/totalExpenses\s*\+\s*providerFees|providerFees\s*\+\s*totalExpenses/.test(server), "provider fees must not be counted again as general expenses");
assert(server.includes('"providerFeeCompany","providerFeeAmount","providerFeeCurrency","providerFeeRateCad"'), "provider fee fields must remain editable");

console.log("v25.14.98 provider-fee net transfer profit: OK");
