"use strict";

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function money(value) {
  return +safeNumber(value).toFixed(2);
}

/**
 * Build a deterministic allocation plan for an edited customer-level payment.
 * `rows` must already represent outstanding transaction balances after excluding
 * the allocation rows that belong to the receipt being edited.
 */
function planGroupedCustomerPayment(rows, requestedAmount, oldBalanceRemaining = 0) {
  const requested = safeNumber(requestedAmount, NaN);
  if (!Number.isFinite(requested) || requested <= 0) {
    throw new Error("مبلغ الدفعة غير صحيح");
  }

  const normalizedRows = (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      transactionId: row?.transaction?.id || row?.transactionId || null,
      remaining: Math.max(safeNumber(row?.remaining), 0),
    }))
    .filter((row) => row.transactionId && row.remaining > 0.0001);

  const openingRemaining = Math.max(safeNumber(oldBalanceRemaining), 0);
  const transactionRemaining = normalizedRows.reduce((sum, row) => sum + row.remaining, 0);
  const grandRemaining = transactionRemaining + openingRemaining;
  if (requested > grandRemaining + 0.001) {
    throw new Error(`الدفعة أكبر من الرصيد المتبقي (${grandRemaining.toFixed(2)} CAD)`);
  }

  let left = requested;
  const allocations = [];
  for (const row of normalizedRows) {
    if (left <= 0.0001) break;
    const allocated = Math.min(left, row.remaining);
    const rounded = money(allocated);
    if (rounded > 0) allocations.push({ transactionId: row.transactionId, amount: rounded });
    left -= allocated;
  }

  let oldBalanceAllocation = 0;
  if (openingRemaining > 0 && left > 0.0001) {
    oldBalanceAllocation = Math.min(left, openingRemaining);
    left -= oldBalanceAllocation;
  }

  if (left > 0.001) throw new Error("تعذر توزيع مبلغ الدفعة بالكامل على الرصيد المستحق");

  return Object.freeze({
    requested: money(requested),
    grandRemaining: money(grandRemaining),
    transactionRemaining: money(transactionRemaining),
    allocations: allocations.map((item) => Object.freeze({ ...item })),
    oldBalanceAllocation: money(oldBalanceAllocation),
    oldBalanceAfter: money(Math.max(openingRemaining - oldBalanceAllocation, 0)),
  });
}

module.exports = { planGroupedCustomerPayment };
