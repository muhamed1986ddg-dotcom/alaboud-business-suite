"use strict";

const { assertBalancedEntry } = require("./FinancialIntegrity");

function resolveProviderPartner(partners = [], partnerId = "") {
  if (!partnerId) return null;
  const partner = partners.find((item) => item && item.id === partnerId);
  if (!partner) throw new Error("الشركة المنفذة غير موجودة");
  return partner;
}

function providerFeeStoredFields(financials = {}, company = "") {
  return {
    providerFeeCompany: String(company || financials.providerFeeCompany || "").trim(),
    providerFeeAmount: financials.providerFeeAmount,
    providerFeeCurrency: financials.providerFeeCurrency,
    providerFeeRateCad: financials.providerFeeRateCad,
    providerFeeCad: financials.providerFeeCad,
    grossProfitBeforeProviderFee: financials.grossProfitBeforeProviderFee,
  };
}

function assertProviderFeeBalanced(financials = {}) {
  if (!(Number(financials.providerFeeCad) > 0)) return;
  assertBalancedEntry([
    { account: "PROVIDER_FEE_EXPENSE", debit: +Number(financials.providerFeeCad).toFixed(2) },
    { account: "PROVIDER_FEE_PAYABLE", credit: +Number(financials.providerFeeCad).toFixed(2) },
  ]);
}

module.exports = { resolveProviderPartner, providerFeeStoredFields, assertProviderFeeBalanced };
