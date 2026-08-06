"use strict";

const { transactionFinancials } = require("./TransactionFinancials");

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number(fallback) || 0;
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
  return Math.max(recordTime(preferredDateKey ? record?.[preferredDateKey] : ""), recordTime(record?.createdAt || record?.updatedAt)) >= resetTime;
}

function customerReceipts(payments, customerId) {
  const rows = (Array.isArray(payments) ? payments : []).filter(payment => payment && !payment.isDeleted && payment.customerId === customerId);
  const receipts = rows.filter(payment => payment.recordType === "CUSTOMER_PAYMENT_RECEIPT");
  const receiptBatchIds = new Set(receipts.map(payment => payment.paymentBatchId).filter(Boolean));
  let total = receipts.reduce((sum, receipt) => sum + number(receipt.originalAmount, receipt.amount), 0);
  const legacyGroups = new Map();
  for (const payment of rows) {
    if (payment.recordType === "CUSTOMER_PAYMENT_RECEIPT") continue;
    if (payment.recordType === "PAYMENT_ALLOCATION" && payment.paymentBatchId && receiptBatchIds.has(payment.paymentBatchId)) continue;
    const key = payment.paymentBatchId || (payment.allocationMode === "CUSTOMER_AUTO" ? `${payment.customerId}:${payment.paymentDate || payment.date || payment.createdAt || ""}:${number(payment.originalAmount, payment.amount)}` : `single:${payment.id}`);
    if (!legacyGroups.has(key)) legacyGroups.set(key, 0);
    legacyGroups.set(key, legacyGroups.get(key) + number(payment.originalAmount, payment.amount));
  }
  for (const amount of legacyGroups.values()) total += amount;
  return total;
}

function customerSummary(store, customer, { overdueDays = 7 } = {}) {
  const threshold = Math.max(1, number(overdueDays, 7));
  const transactions = (Array.isArray(store?.transactions) ? store.transactions : []).filter(item => item && !item.isDeleted);
  const payments = (Array.isArray(store?.payments) ? store.payments : []).filter(item => item && !item.isDeleted);
  const txs = transactions.filter(transaction => transaction.customerId === customer.id && transaction.status !== "CANCELLED" && isAfterReset(transaction, customer, "transferDate"));
  const paymentByTransaction = new Map();
  for (const payment of payments) paymentByTransaction.set(payment.transactionId, number(paymentByTransaction.get(payment.transactionId)) + number(payment.amount));

  const reset = Boolean(customer.accountResetAt);
  const storedOpening = reset ? 0 : Math.max(number(customer.oldBalance), 0);
  const legacyPaid = reset ? 0 : Math.min(Math.max(number(customer.oldBalancePaid), 0), storedOpening);
  const openingOutstanding = Math.max(storedOpening - legacyPaid, 0);
  const openingInitial = reset ? 0 : Math.max(number(customer.openingBalanceInitial, storedOpening), openingOutstanding);
  const actualPayments = customerReceipts(payments.filter(payment => isAfterReset(payment, customer, "paymentDate")), customer.id);

  let transactionTotal = 0;
  let transactionPaid = 0;
  let oldestUnpaidDate = "";
  let overdueTransactions = 0;
  let lastTransactionDate = "";
  const today = new Date(); today.setHours(0, 0, 0, 0);

  for (const transaction of txs) {
    const due = transactionFinancials(transaction).totalCustomerDue;
    const paid = number(paymentByTransaction.get(transaction.id));
    const remaining = Math.max(due - paid, 0);
    transactionTotal += due;
    transactionPaid += paid;
    const dateText = String(transaction.transferDate || transaction.createdAt || "").slice(0, 10);
    if (dateText > lastTransactionDate) lastTransactionDate = dateText;
    if (remaining > 0 && dateText) {
      const date = new Date(`${dateText}T00:00:00`);
      if (!Number.isNaN(date.getTime())) {
        const age = Math.floor((today - date) / 86400000);
        if (age > threshold) overdueTransactions += 1;
        if (!oldestUnpaidDate || dateText < oldestUnpaidDate) oldestUnpaidDate = dateText;
      }
    }
  }

  const transactionOutstanding = txs.reduce((sum, transaction) => {
    const due = transactionFinancials(transaction).totalCustomerDue;
    return sum + Math.max(due - number(paymentByTransaction.get(transaction.id)), 0);
  }, 0);
  const outstanding = Math.max(transactionOutstanding + openingOutstanding, 0);
  const overdueAge = oldestUnpaidDate ? Math.max(0, Math.floor((today - new Date(`${oldestUnpaidDate}T00:00:00`)) / 86400000)) : 0;

  return {
    ...customer,
    name: String(customer?.name || "عميل بدون اسم"),
    oldBalance: +openingOutstanding.toFixed(2),
    openingBalanceInitial: +openingInitial.toFixed(2),
    oldBalancePaid: 0,
    oldBalanceRemaining: +openingOutstanding.toFixed(2),
    totalTransactions: +(openingInitial + transactionTotal).toFixed(2),
    totalPaid: +actualPayments.toFixed(2),
    finalBalance: +outstanding.toFixed(2),
    overdue: outstanding > 0 && overdueAge > threshold,
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
  const debtors = rows.filter(customer => number(customer.finalBalance) > 0);
  return {
    currency: "CAD",
    totalDebtCad: +debtors.reduce((sum, customer) => sum + number(customer.finalBalance), 0).toFixed(2),
    debtorsCount: debtors.length,
    customersCount: customers.length,
  };
}

module.exports = { customerSummary, customerDebtSummary, number, isAfterReset };
