"use strict";

const { transactionFinancials } = require("./TransactionFinancials");
const { money, moneyToNumber } = require("./Money");

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number(fallback) || 0;
}

function moneySafe(value, fallback = 0) {
  try { return money(value ?? fallback); }
  catch { return money(fallback); }
}

function recordTime(value) {
  const text = String(value || "").trim();
  if (!text) return 0;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00` : text;
  const parsed = new Date(normalized).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function isAfterReset(record, customer, preferredDateKey = "") {
  const resetTime = recordTime(customer?.accountResetAt);
  if (!resetTime) return true;
  // Payments created on the same calendar day as a reset carry paymentDate as
  // YYYY-MM-DD (midnight), while the real creation timestamp is stored in `date`.
  // Always consider every available activity timestamp so a payment made after
  // the reset is not incorrectly filtered out as pre-reset activity.
  return Math.max(
    recordTime(preferredDateKey ? record?.[preferredDateKey] : ""),
    recordTime(record?.createdAt),
    recordTime(record?.updatedAt),
    recordTime(record?.date)
  ) >= resetTime;
}

function receiptsScaled(rows) {
  const receipts = rows.filter(payment => payment.recordType === "CUSTOMER_PAYMENT_RECEIPT");
  const receiptBatchIds = new Set(receipts.map(payment => payment.paymentBatchId).filter(Boolean));
  let total = receipts.reduce((sum, receipt) => sum + moneySafe(receipt.originalAmount ?? receipt.amount), 0n);
  const legacyGroups = new Map();
  for (const payment of rows) {
    if (payment.recordType === "CUSTOMER_PAYMENT_RECEIPT") continue;
    if (payment.recordType === "PAYMENT_ALLOCATION" && payment.paymentBatchId && receiptBatchIds.has(payment.paymentBatchId)) continue;
    const grouped = Boolean(payment.paymentBatchId || payment.allocationMode === "CUSTOMER_AUTO" || payment.recordType === "PAYMENT_ALLOCATION");
    if (!grouped) {
      total += moneySafe(payment.originalAmount ?? payment.amount);
      continue;
    }
    const key = payment.paymentBatchId || `${payment.customerId}:${payment.paymentDate || payment.date || payment.createdAt || ""}:${payment.originalAmount ?? "legacy"}`;
    if (!legacyGroups.has(key)) legacyGroups.set(key, {allocated:0n,original:0n});
    const group=legacyGroups.get(key);
    group.allocated += moneySafe(payment.amount);
    const original=moneySafe(payment.originalAmount);
    if(original>group.original)group.original=original;
  }
  for (const group of legacyGroups.values()) total += group.original>0n?group.original:group.allocated;
  return total;
}

function customerReceiptsScaled(payments, customerId) {
  const rows = (Array.isArray(payments) ? payments : []).filter(payment => payment && !payment.isDeleted && payment.customerId === customerId);
  return receiptsScaled(rows);
}

function customerReceiptsTotalScaled(payments) {
  const rows=(Array.isArray(payments)?payments:[]).filter(payment=>payment&&!payment.isDeleted);
  return receiptsScaled(rows);
}

function customerReceipts(payments, customerId) {
  return moneyToNumber(customerReceiptsScaled(payments, customerId));
}

function customerReceiptsTotal(payments) {
  return moneyToNumber(customerReceiptsTotalScaled(payments));
}

function customerSummary(store, customer, { overdueDays = 7 } = {}) {
  const threshold = Math.max(1, number(overdueDays, 7));
  const transactions = (Array.isArray(store?.transactions) ? store.transactions : []).filter(item => item && !item.isDeleted);
  const payments = (Array.isArray(store?.payments) ? store.payments : []).filter(item => item && !item.isDeleted);
  const txs = transactions.filter(transaction => transaction.customerId === customer.id && transaction.status !== "CANCELLED" && isAfterReset(transaction, customer, "transferDate"));
  const paymentByTransaction = new Map();
  for (const payment of payments) {
    const current = paymentByTransaction.get(payment.transactionId) || 0n;
    paymentByTransaction.set(payment.transactionId, current + moneySafe(payment.amount));
  }

  const resetTime = recordTime(customer.accountResetAt);
  const openingUpdatedTime = recordTime(customer.openingBalanceUpdatedAt);
  const activeOpeningBalance = !resetTime || openingUpdatedTime >= resetTime;
  const storedOpening = activeOpeningBalance ? (moneySafe(customer.oldBalance) > 0n ? moneySafe(customer.oldBalance) : 0n) : 0n;
  const rawLegacyPaid = activeOpeningBalance ? moneySafe(customer.oldBalancePaid) : 0n;
  const legacyPaid = rawLegacyPaid > storedOpening ? storedOpening : (rawLegacyPaid > 0n ? rawLegacyPaid : 0n);
  const openingOutstanding = storedOpening > legacyPaid ? storedOpening - legacyPaid : 0n;
  const oldBalanceType = String(customer.oldBalanceType || "RECEIVABLE").toUpperCase() === "PAYABLE" ? "PAYABLE" : "RECEIVABLE";
  const signedOpeningOutstanding = oldBalanceType === "PAYABLE" ? -openingOutstanding : openingOutstanding;
  const rawOpeningInitial = activeOpeningBalance ? moneySafe(customer.openingBalanceInitial ?? customer.oldBalance) : 0n;
  const openingInitial = rawOpeningInitial > openingOutstanding ? rawOpeningInitial : openingOutstanding;
  const actualPayments = customerReceiptsScaled(payments.filter(payment => isAfterReset(payment, customer, "paymentDate")), customer.id);

  let transactionTotal = 0n;
  let transactionPaid = 0n;
  let transactionOutstanding = 0n;
  let oldestUnpaidDate = "";
  let overdueTransactions = 0;
  let lastTransactionDate = "";
  const today = new Date(); today.setHours(0, 0, 0, 0);

  for (const transaction of txs) {
    const financials = transactionFinancials(transaction);
    const due = financials.scaled.totalCustomerDue;
    const paid = paymentByTransaction.get(transaction.id) || 0n;
    const remaining = due > paid ? due - paid : 0n;
    transactionTotal += due;
    transactionPaid += paid;
    transactionOutstanding += remaining;
    const dateText = String(transaction.transferDate || transaction.createdAt || "").slice(0, 10);
    if (dateText > lastTransactionDate) lastTransactionDate = dateText;
    if (remaining > 0n && dateText) {
      const date = new Date(`${dateText}T00:00:00`);
      if (!Number.isNaN(date.getTime())) {
        const age = Math.floor((today - date) / 86400000);
        if (age > threshold) overdueTransactions += 1;
        if (!oldestUnpaidDate || dateText < oldestUnpaidDate) oldestUnpaidDate = dateText;
      }
    }
  }

  const outstanding = transactionOutstanding + signedOpeningOutstanding;
  const overdueAge = oldestUnpaidDate ? Math.max(0, Math.floor((today - new Date(`${oldestUnpaidDate}T00:00:00`)) / 86400000)) : 0;

  return {
    ...customer,
    name: String(customer?.name || "عميل بدون اسم"),
    oldBalance: moneyToNumber(openingOutstanding),
    openingBalanceInitial: moneyToNumber(openingInitial),
    oldBalancePaid: 0,
    oldBalanceRemaining: moneyToNumber(openingOutstanding),
    oldBalanceType,
    oldBalanceLabel: oldBalanceType === "PAYABLE" ? "له" : "عليه",
    totalTransactions: moneyToNumber(transactionTotal + (oldBalanceType === "RECEIVABLE" ? openingInitial : 0n)),
    totalPaid: moneyToNumber(actualPayments),
    finalBalance: moneyToNumber(outstanding),
    overdue: outstanding > 0n && overdueAge > threshold,
    overdueThreshold: threshold,
    overdueDays: overdueAge,
    overdueTransactions,
    oldestUnpaidDate: oldestUnpaidDate || null,
    lastTransactionDate: lastTransactionDate || null,
  };
}

function customerDebtSummary(store, options = {}) {
  const customers = (Array.isArray(store?.customers) ? store.customers : []).filter(customer => customer && !customer.isDeleted);
  const rows = customers.map(customer => customerSummary(store, customer, options));
  const debtors = rows.filter(customer => moneySafe(customer.finalBalance) > 0n);
  const totalDebtScaled = debtors.reduce((sum, customer) => sum + moneySafe(customer.finalBalance), 0n);
  return {
    currency: "CAD",
    totalDebtCad: moneyToNumber(totalDebtScaled),
    debtorsCount: debtors.length,
    customersCount: customers.length,
  };
}

// Gross customer balances must be classified by direction instead of being
// netted inside the receivables bucket. A positive final balance means the
// customer owes the company (receivable); a negative final balance means the
// company owes the customer (payable). Net is preserved exactly.
function customerBalanceTotals(store, options = {}) {
  const customers = (Array.isArray(store?.customers) ? store.customers : []).filter(customer => customer && !customer.isDeleted);
  let receivable = 0n;
  let payable = 0n;
  for (const customer of customers) {
    const balance = moneySafe(customerSummary(store, customer, options).finalBalance);
    if (balance > 0n) receivable += balance;
    else if (balance < 0n) payable += -balance;
  }
  return Object.freeze({
    currency: "CAD",
    receivable: moneyToNumber(receivable),
    payable: moneyToNumber(payable),
    net: moneyToNumber(receivable - payable),
  });
}

module.exports = {
  customerSummary,
  customerDebtSummary,
  customerBalanceTotals,
  customerReceipts,
  customerReceiptsScaled,
  customerReceiptsTotal,
  customerReceiptsTotalScaled,
  number,
  isAfterReset,
};
