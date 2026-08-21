"use strict";

const {
  money,
  rate,
  moneyToNumber,
  rateToNumber,
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

function normalizeCurrency(value, fallback = "CAD") {
  const normalized = String(value || fallback).trim().toUpperCase();
  return /^[A-Z0-9]{3,8}$/.test(normalized) ? normalized : String(fallback).toUpperCase();
}

function providerFeeFinancials(transaction = {}, costRateScaled = 0n) {
  const transactionCurrency = normalizeCurrency(transaction.currency || "USD", "USD");
  const providerFeeCompany = String(
    transaction.providerFeeCompany || transaction.companyFeeCompany || transaction.partnerName || ""
  ).trim().slice(0, 120);
  const providerFeeAmountScaled = positiveMoney(
    transaction.providerFeeAmount ?? transaction.companyFeeAmount ?? 0
  );
  const providerFeeCurrency = normalizeCurrency(
    transaction.providerFeeCurrency || transaction.companyFeeCurrency || transactionCurrency,
    transactionCurrency
  );

  let providerFeeRateScaled = 0n;
  if (providerFeeAmountScaled > 0n) {
    if (providerFeeCurrency === "CAD") providerFeeRateScaled = rate("1");
    else if (providerFeeCurrency === transactionCurrency && costRateScaled > 0n) providerFeeRateScaled = costRateScaled;
    else providerFeeRateScaled = positiveRate(
      transaction.providerFeeRateCad ?? transaction.companyFeeRateCad ?? transaction.providerFeeRate ?? 0
    );
  }

  let providerFeeCadScaled = 0n;
  if (providerFeeAmountScaled > 0n && providerFeeRateScaled > 0n) {
    providerFeeCadScaled = roundedDivide(providerFeeAmountScaled * providerFeeRateScaled, RATE_SCALE);
  } else if (providerFeeAmountScaled > 0n) {
    // Compatibility fallback for imported rows that already contain the CAD
    // value but not the original fee conversion rate.
    providerFeeCadScaled = positiveMoney(transaction.providerFeeCad ?? transaction.companyFeeCad ?? 0);
  }

  return {
    providerFeeCompany,
    providerFeeCurrency,
    providerFeeAmountScaled,
    providerFeeRateScaled,
    providerFeeCadScaled,
  };
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
  const provider = providerFeeFinancials(transaction, costRateScaled);

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

  // v25.14.98: execution-company fees (Dahab/Jad/etc.) are a direct cost of
  // the transfer. They never increase customer receivables and they are not a
  // second general expense. Only the profit after this deduction flows into
  // dashboards, monthly inventory, capital and profit reports.
  const grossProfitBeforeProviderFeeScaled = exchangeProfitScaled + paidFeeScaled;
  const totalProfitScaled = grossProfitBeforeProviderFeeScaled - provider.providerFeeCadScaled;
  const beneficiaryReceivesScaled = amountScaled;

  const amount = moneyToNumber(amountScaled);
  const finalRate = rateToNumber(finalRateScaled);
  const costRate = rateToNumber(costRateScaled);
  const transferFee = moneyToNumber(transferFeeScaled);
  const paidFee = moneyToNumber(paidFeeScaled);
  const convertedCad = moneyToNumber(convertedCadScaled);
  const totalCustomerDue = moneyToNumber(totalCustomerDueScaled);
  const exchangeProfit = moneyToNumber(exchangeProfitScaled);
  const grossProfitBeforeProviderFee = moneyToNumber(grossProfitBeforeProviderFeeScaled);
  const providerFeeAmount = moneyToNumber(provider.providerFeeAmountScaled);
  const providerFeeRateCad = rateToNumber(provider.providerFeeRateScaled);
  const providerFeeCad = moneyToNumber(provider.providerFeeCadScaled);
  const totalProfit = moneyToNumber(totalProfitScaled);
  const beneficiaryReceives = moneyToNumber(beneficiaryReceivesScaled);
  const providerFeeRateValid = provider.providerFeeAmountScaled === 0n || provider.providerFeeCadScaled > 0n;
  const valid = amountScaled > 0n && finalRateScaled > 0n && costRateScaled > 0n && providerFeeRateValid;

  return {
    amount,
    finalRate,
    costRate,
    transferFee,
    paidFee,
    customerFee: paidFee,
    feeMethod,
    convertedCad,
    totalCustomerDue,
    exchangeProfit,
    grossProfitBeforeProviderFee,
    providerFeeCompany: provider.providerFeeCompany,
    providerFeeAmount,
    providerFeeCurrency: provider.providerFeeCurrency,
    providerFeeRateCad,
    providerFeeCad,
    totalProfit,
    netTransferProfit: totalProfit,
    beneficiaryReceives,
    valid,
    scaled: {
      amount: amountScaled,
      finalRate: finalRateScaled,
      costRate: costRateScaled,
      transferFee: transferFeeScaled,
      paidFee: paidFeeScaled,
      convertedCad: convertedCadScaled,
      totalCustomerDue: totalCustomerDueScaled,
      exchangeProfit: exchangeProfitScaled,
      grossProfitBeforeProviderFee: grossProfitBeforeProviderFeeScaled,
      providerFeeAmount: provider.providerFeeAmountScaled,
      providerFeeRateCad: provider.providerFeeRateScaled,
      providerFeeCad: provider.providerFeeCadScaled,
      totalProfit: totalProfitScaled,
      beneficiaryReceives: beneficiaryReceivesScaled,
    },
  };
}

function addTransactionProfitToBucket(bucket, transaction) {
  const financials = transactionFinancials(transaction);
  bucket.exchangeProfit = Number(bucket.exchangeProfit || 0) + financials.exchangeProfit;
  bucket.transferFees = Number(bucket.transferFees || 0) + financials.transferFee;
  bucket.customerFees = Number(bucket.customerFees || 0) + financials.paidFee;
  bucket.providerFees = Number(bucket.providerFees || 0) + financials.providerFeeCad;
  bucket.grossProfitBeforeProviderFees = Number(bucket.grossProfitBeforeProviderFees || 0) + financials.grossProfitBeforeProviderFee;
  bucket.grossProfit = Number(bucket.grossProfit || 0) + financials.totalProfit;
  return bucket;
}

function summarizeTransactionProfits(transactions = []) {
  return transactions.reduce((summary, transaction) => addTransactionProfitToBucket(summary, transaction), {
    exchangeProfit: 0, transferFees: 0, customerFees: 0, providerFees: 0, grossProfitBeforeProviderFees: 0, grossProfit: 0,
  });
}

function transactionFinancialView(financials = {}) {
  return {
    transferFee: financials.transferFee, paidFee: financials.paidFee, customerFee: financials.customerFee,
    feeMethod: financials.feeMethod, beneficiaryReceives: financials.beneficiaryReceives,
    exchangeProfit: financials.exchangeProfit, grossProfitBeforeProviderFee: financials.grossProfitBeforeProviderFee,
    providerFeeCompany: financials.providerFeeCompany, providerFeeAmount: financials.providerFeeAmount,
    providerFeeCurrency: financials.providerFeeCurrency, providerFeeRateCad: financials.providerFeeRateCad,
    providerFeeCad: financials.providerFeeCad, totalProfit: financials.totalProfit,
    netTransferProfit: financials.netTransferProfit, totalCustomerDue: financials.totalCustomerDue,
  };
}

module.exports = {
  authoritativeTransactionRate,
  authoritativeTransactionRateScaled,
  normalizeFeeMethod,
  transactionFinancials,
  transactionFinancialView,
  addTransactionProfitToBucket,
  summarizeTransactionProfits,
};
