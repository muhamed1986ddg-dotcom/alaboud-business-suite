"use strict";

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/**
 * Returns the rate that belongs to this exact transfer.
 * Priority deliberately avoids customer-level averages/derived legacy fields:
 * 1) finalRate saved on the transfer
 * 2) rate reconstructed from the transfer's own CAD due/value
 * 3) rate reconstructed from the transfer's stored exchange profit + cost rate
 * 4) legacy customerRate/clientRate only as a final compatibility fallback
 */
function authoritativeTransactionRate(transaction = {}) {
  const amount = positiveNumber(transaction.amount ?? transaction.usdAmount);

  const finalRate = positiveNumber(transaction.finalRate);
  if (finalRate) return finalRate;

  if (amount) {
    const fee = Math.max(0, safeNumber(transaction.transferFee));
    const feeMethod = String(transaction.feeMethod || "ADD").toUpperCase();
    const due = positiveNumber(
      transaction.baseCustomerDue ??
      transaction.convertedCad ??
      transaction.formulaResultCad ??
      transaction.cadValue ??
      transaction.valueCad
    );
    if (due) return due / amount;

    const totalDue = positiveNumber(transaction.totalCustomerDue);
    if (totalDue) {
      const baseDue = feeMethod === "ADD" ? Math.max(totalDue - fee, 0) : totalDue;
      if (baseDue > 0) return baseDue / amount;
    }

    const costRate = positiveNumber(transaction.costRate);
    const storedExchangeProfit = Number(transaction.exchangeProfit);
    if (costRate && Number.isFinite(storedExchangeProfit)) {
      const reconstructed = costRate + storedExchangeProfit / amount;
      if (Number.isFinite(reconstructed) && reconstructed > 0) return reconstructed;
    }
  }

  for (const key of ["customerRate", "clientRate"]) {
    const rate = positiveNumber(transaction?.[key]);
    if (rate) return rate;
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
  const valid = amount > 0 && finalRate > 0 && costRate > 0;
  return {amount, finalRate, costRate, transferFee, feeMethod, convertedCad, totalCustomerDue, exchangeProfit, totalProfit, valid};
}

module.exports = { authoritativeTransactionRate, transactionFinancials };
