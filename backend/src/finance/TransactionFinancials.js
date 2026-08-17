"use strict";

const {
  money,
  rate,
  moneyToNumber,
  rateToNumber,
  multiplyAmountByRate,
  divideMoneyByAmountToRate,
  roundedDivide,
  RATE_SCALE,
} = require("./Money");

function safeDecimal(value, fallback = "0") {
  const text = String(value ?? fallback).trim();
  return /^-?\d+(?:\.\d+)?$/.test(text) ? text : String(fallback);
}

function positiveMoney(value) {
  try { const parsed = money(safeDecimal(value)); return parsed > 0n ? parsed : 0n; }
  catch { return 0n; }
}

function positiveRate(value) {
  try { const parsed = rate(safeDecimal(value)); return parsed > 0n ? parsed : 0n; }
  catch { return 0n; }
}

function normalizeFeeMethod(transaction = {}) {
  const raw = String(transaction.feeMethod || "").trim().toUpperCase();
  if (raw === "PAID" || raw === "ADD") return "PAID";
  if (raw === "SPREAD" || raw === "DEDUCT") return "SPREAD";

  // Backwards compatibility: old rows were stored without feeMethod while a
  // positive transferFee meant that the sender paid a separate fee.
  return positiveMoney(transaction.transferFee) > 0n ? "PAID" : "SPREAD";
}

/** Returns the exact rate belonging to this transfer, in RATE_SCALE units. */
function authoritativeTransactionRateScaled(transaction = {}) {
  const amount = positiveMoney(transaction.amount ?? transaction.usdAmount);
  const finalRate = positiveRate(transaction.finalRate);
  if (finalRate) return finalRate;

  if (amount > 0n) {
    const feeMethod = normalizeFeeMethod(transaction);
    const paidFee = feeMethod === "PAID" ? positiveMoney(transaction.transferFee) : 0n;
    const due = positiveMoney(
      transaction.baseCustomerDue ?? transaction.convertedCad ?? transaction.formulaResultCad ??
      transaction.cadValue ?? transaction.valueCad
    );
    if (due > 0n) return roundedDivide(due * RATE_SCALE, amount);

    const totalDue = positiveMoney(transaction.totalCustomerDue);
    if (totalDue > 0n) {
      const baseDue = totalDue > paidFee ? totalDue - paidFee : 0n;
      if (baseDue > 0n) return roundedDivide(baseDue * RATE_SCALE, amount);
    }

    const costRate = positiveRate(transaction.costRate);
    let storedProfit = 0n;
    try { storedProfit = money(safeDecimal(transaction.exchangeProfit)); } catch { storedProfit = 0n; }
    if (costRate > 0n && storedProfit !== 0n) {
      const profitRate = roundedDivide(storedProfit * RATE_SCALE, amount);
      const reconstructed = costRate + profitRate;
      if (reconstructed > 0n) return reconstructed;
    }
  }

  for (const key of ["customerRate", "clientRate"]) {
    const legacyRate = positiveRate(transaction?.[key]);
    if (legacyRate) return legacyRate;
  }
  return 0n;
}

function authoritativeTransactionRate(transaction = {}) {
  return rateToNumber(authoritativeTransactionRateScaled(transaction));
}

function transactionFinancials(transaction = {}) {
  const amountScaled = positiveMoney(transaction.amount ?? transaction.usdAmount);
  const finalRateScaled = authoritativeTransactionRateScaled(transaction);
  const costRateScaled = positiveRate(transaction.costRate);
  const feeMethod = normalizeFeeMethod(transaction);
  const paidFeeScaled = feeMethod === "PAID" ? positiveMoney(transaction.transferFee) : 0n;

  const convertedCadScaled = finalRateScaled > 0n
    ? roundedDivide(amountScaled * finalRateScaled, RATE_SCALE)
    : 0n;
  const totalCustomerDueScaled = convertedCadScaled + paidFeeScaled;
  const exchangeProfitScaled = roundedDivide(
    amountScaled * (finalRateScaled - costRateScaled),
    RATE_SCALE
  );
  // SPREAD: the fee shown is the rate spread already embedded in the converted
  // amount. PAID: the sender pays a separate CAD fee above that amount.
  // Neither mode deducts anything from the beneficiary's original amount.
  const transferFeeScaled = feeMethod === "PAID" ? paidFeeScaled : exchangeProfitScaled;
  const totalProfitScaled = exchangeProfitScaled + paidFeeScaled;
  const beneficiaryReceivesScaled = amountScaled;

  const amount = moneyToNumber(amountScaled);
  const finalRate = rateToNumber(finalRateScaled);
  const costRate = rateToNumber(costRateScaled);
  const transferFee = moneyToNumber(transferFeeScaled);
  const paidFee = moneyToNumber(paidFeeScaled);
  const convertedCad = moneyToNumber(convertedCadScaled);
  const totalCustomerDue = moneyToNumber(totalCustomerDueScaled);
  const exchangeProfit = moneyToNumber(exchangeProfitScaled);
  const totalProfit = moneyToNumber(totalProfitScaled);
  const beneficiaryReceives = moneyToNumber(beneficiaryReceivesScaled);
  const valid = amountScaled > 0n && finalRateScaled > 0n && costRateScaled > 0n;

  return {
    amount, finalRate, costRate, transferFee, paidFee, feeMethod,
    convertedCad, totalCustomerDue, exchangeProfit, totalProfit, beneficiaryReceives, valid,
    scaled: {
      amount: amountScaled,
      finalRate: finalRateScaled,
      costRate: costRateScaled,
      transferFee: transferFeeScaled,
      paidFee: paidFeeScaled,
      convertedCad: convertedCadScaled,
      totalCustomerDue: totalCustomerDueScaled,
      exchangeProfit: exchangeProfitScaled,
      totalProfit: totalProfitScaled,
      beneficiaryReceives: beneficiaryReceivesScaled,
    },
  };
}

module.exports = {
  authoritativeTransactionRate,
  authoritativeTransactionRateScaled,
  normalizeFeeMethod,
  transactionFinancials,
};
