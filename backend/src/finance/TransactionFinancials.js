"use strict";

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function authoritativeTransactionRate(transaction = {}) {
  for (const key of ["finalRate", "customerRate", "clientRate"]) {
    const rate = Number(transaction?.[key]);
    if (Number.isFinite(rate) && rate > 0) return rate;
  }
  return 0;
}

function transactionFinancials(transaction = {}) {
  const amount = Math.max(0, safeNumber(transaction.amount ?? transaction.usdAmount));
  const finalRate = authoritativeTransactionRate(transaction);
  const costRate = Math.max(0, safeNumber(transaction.costRate));
  const transferFee = Math.max(0, safeNumber(transaction.transferFee));
  const feeMethod = String(transaction.feeMethod || "ADD").toUpperCase();
  const convertedCad = amount * finalRate;
  const totalCustomerDue = feeMethod === "ADD" ? convertedCad + transferFee : convertedCad;
  const exchangeProfit = amount * (finalRate - costRate);
  const totalProfit = exchangeProfit + transferFee;
  return {amount, finalRate, costRate, transferFee, feeMethod, convertedCad, totalCustomerDue, exchangeProfit, totalProfit};
}

module.exports = { authoritativeTransactionRate, transactionFinancials };
