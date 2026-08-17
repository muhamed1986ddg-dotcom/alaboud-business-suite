import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { transactionFinancials } = require("./TransactionFinancials.js");

test("spread mode derives the fee from the exchange-rate difference", () => {
  const result = transactionFinancials({
    amount: "100",
    costRate: "1.40",
    finalRate: "1.50",
    // A stored manual value must not affect SPREAD mode.
    transferFee: "999",
    feeMethod: "SPREAD"
  });

  assert.deepEqual(
    {
      convertedCad: result.convertedCad,
      totalCustomerDue: result.totalCustomerDue,
      transferFee: result.transferFee,
      exchangeProfit: result.exchangeProfit,
      totalProfit: result.totalProfit,
      beneficiaryReceives: result.beneficiaryReceives,
      feeMethod: result.feeMethod
    },
    {
      convertedCad: 150,
      totalCustomerDue: 150,
      transferFee: 10,
      exchangeProfit: 10,
      totalProfit: 10,
      beneficiaryReceives: 100,
      feeMethod: "SPREAD"
    }
  );
});

test("paid-fee mode adds a separate CAD fee without reducing the beneficiary amount", () => {
  const result = transactionFinancials({
    amount: "100",
    costRate: "1.40",
    finalRate: "1.50",
    transferFee: "5",
    feeMethod: "PAID"
  });

  assert.deepEqual(
    {
      convertedCad: result.convertedCad,
      totalCustomerDue: result.totalCustomerDue,
      transferFee: result.transferFee,
      paidFee: result.paidFee,
      exchangeProfit: result.exchangeProfit,
      totalProfit: result.totalProfit,
      beneficiaryReceives: result.beneficiaryReceives,
      feeMethod: result.feeMethod
    },
    {
      convertedCad: 150,
      totalCustomerDue: 155,
      transferFee: 5,
      paidFee: 5,
      exchangeProfit: 10,
      totalProfit: 15,
      beneficiaryReceives: 100,
      feeMethod: "PAID"
    }
  );
});

test("legacy ADD maps to PAID while legacy DEDUCT maps safely to SPREAD", () => {
  const paid = transactionFinancials({amount:100,costRate:1.40,finalRate:1.50,transferFee:5,feeMethod:"ADD"});
  const noDeduction = transactionFinancials({amount:100,costRate:1.40,finalRate:1.50,transferFee:5,feeMethod:"DEDUCT"});

  assert.equal(paid.feeMethod,"PAID");
  assert.equal(paid.totalCustomerDue,155);
  assert.equal(noDeduction.feeMethod,"SPREAD");
  assert.equal(noDeduction.totalCustomerDue,150);
  assert.equal(noDeduction.beneficiaryReceives,100);
});

test("a rate below cost is reported as a loss without changing the beneficiary amount", () => {
  const result = transactionFinancials({
    amount: "100",
    costRate: "1.50",
    finalRate: "1.40"
  });

  assert.equal(result.transferFee, -10);
  assert.equal(result.totalProfit, -10);
  assert.equal(result.totalCustomerDue, 140);
  assert.equal(result.beneficiaryReceives, 100);
});
