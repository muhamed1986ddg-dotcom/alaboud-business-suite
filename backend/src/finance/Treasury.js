"use strict";

const {
  money, rate, roundedDivide, MONEY_SCALE, RATE_SCALE,
  moneyToNumber, rateToNumber
} = require("./Money");
const { transactionFinancials } = require("./TransactionFinancials");

function safeMoney(value, label) {
  try { return money(value); } catch { throw new TypeError(`${label} غير صالح`); }
}
function safeRate(value, label) {
  try { return rate(value); } catch { throw new TypeError(`${label} غير صالح`); }
}
function movementTime(row) {
  const value = row.occurredAt || row.createdAt || row.date || "";
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}
function activeMovements(store) {
  return (Array.isArray(store?.treasuryMovements) ? store.treasuryMovements : [])
    .filter(row => row && !row.isCancelled)
    .slice()
    .sort((a, b) => movementTime(a) - movementTime(b) || String(a.createdAt || "").localeCompare(String(b.createdAt || "")) || String(a.id).localeCompare(String(b.id)));
}

function treasuryMovementDiagnostic(row, direction) {
  return {
    movementId: String(row?.id || ""),
    sourceType: String(row?.sourceType || ""),
    sourceKey: String(row?.sourceKey || ""),
    direction,
    currency: String(row?.currency || "").trim().toUpperCase(),
    amount: Number(row?.quantity || 0),
    costRate: row?.costRate == null ? null : Number(row.costRate),
    createdAt: row?.createdAt || null
  };
}

function diagnoseInvalidTreasuryInMovements(store) {
  const transactions = Array.isArray(store?.transactions) ? store.transactions : [];
  const invalidTransfers = [];
  const invalidOther = [];
  for (const row of activeMovements(store)) {
    const direction = row.sourceType === "TRANSFER" ? "IN" : String(row.direction || row.movementType || "").toUpperCase();
    const currentCostRate = Number(row.costRate);
    if (direction !== "IN" || (Number.isFinite(currentCostRate) && currentCostRate > 0)) continue;
    const diagnostic = treasuryMovementDiagnostic(row, direction);
    if (row.sourceType === "TRANSFER" || String(row.sourceKey || "").startsWith("TRANSFER:")) {
      const transactionId = String(row.transactionId || String(row.sourceKey || "").slice("TRANSFER:".length));
      const transaction = transactions.find(item => item && String(item.id) === transactionId);
      invalidTransfers.push({
        ...diagnostic,
        transactionId,
        currentCostRate: diagnostic.costRate,
        expectedCostRate: transaction ? transactionFinancials(transaction).costRate : null,
        transactionFound: Boolean(transaction)
      });
    } else invalidOther.push(diagnostic);
  }
  return { total: invalidTransfers.length + invalidOther.length, invalidTransfers, invalidOther };
}

function rebuildTreasury(store, { allowNegative = false } = {}) {
  const balances = new Map();
  const rows = activeMovements(store);
  for (const row of rows) {
    const currency = String(row.currency || "").trim().toUpperCase();
    if (!currency) throw new Error("عملة حركة الخزنة مطلوبة");
    const quantity = safeMoney(row.quantity, "كمية حركة الخزنة");
    if (quantity <= 0n) throw new Error("كمية حركة الخزنة يجب أن تكون أكبر من صفر");
    const state = balances.get(currency) || { balance: 0n, totalCost: 0n, realizedProfit: 0n, realizedLoss: 0n };
    const averageBefore = state.balance > 0n ? roundedDivide(state.totalCost * RATE_SCALE, state.balance) : 0n;
    // A transfer creates cash in the treasury. Only an explicit cash-delivery
    // movement may take that cash out. This also repairs legacy transfer rows
    // that were incorrectly persisted as OUT without creating duplicates.
    const direction = row.sourceType === "TRANSFER" ? "IN" : String(row.direction || row.movementType || "").toUpperCase();
    let realized = 0n;
    let costRate = 0n;
    let deliveryRate = 0n;

    if (direction === "IN") {
      costRate = safeRate(row.costRate, "سعر تكلفة الدخول");
      if (costRate <= 0n) {
        const error = new Error("سعر تكلفة الدخول يجب أن يكون أكبر من صفر");
        error.code = "TREASURY_INVALID_ENTRY_RATE";
        error.treasuryDiagnostic = treasuryMovementDiagnostic(row, direction);
        throw error;
      }
      state.balance += quantity;
      state.totalCost += roundedDivide(quantity * costRate, RATE_SCALE);
    } else if (direction === "OUT") {
      deliveryRate = safeRate(row.deliveryRate, "سعر الصرف وقت التسليم");
      if (deliveryRate <= 0n) throw new Error("سعر الصرف وقت التسليم يجب أن يكون أكبر من صفر");
      const preservesHistoricalNegative = row.allowNegative === true || Number(row.balanceAfter) < 0;
      if (!allowNegative && !preservesHistoricalNegative && quantity > state.balance) {
        const error = new Error(`لا يمكن تنفيذ التسليم الكاش: الرصيد المتاح ${moneyToNumber(state.balance).toFixed(4)} ${currency} والمطلوب ${moneyToNumber(quantity).toFixed(4)} ${currency}.`);
        error.code = "TREASURY_INSUFFICIENT_BALANCE";
        throw error;
      }
      const releasedCost = roundedDivide(quantity * averageBefore, RATE_SCALE);
      realized = roundedDivide(quantity * (deliveryRate - averageBefore), RATE_SCALE);
      state.balance -= quantity;
      state.totalCost -= releasedCost;
      if (state.balance === 0n) state.totalCost = 0n;
      if (realized >= 0n) state.realizedProfit += realized;
      else state.realizedLoss += -realized;
    } else {
      throw new Error("اتجاه حركة الخزنة غير صحيح");
    }

    const averageAfter = state.balance > 0n ? roundedDivide(state.totalCost * RATE_SCALE, state.balance) : averageBefore;
    Object.assign(row, {
      currency, direction,
      costRate: direction === "IN" ? rateToNumber(costRate) : null,
      averageCostBefore: rateToNumber(averageBefore),
      averageCostAfter: rateToNumber(averageAfter),
      deliveryRate: direction === "OUT" ? rateToNumber(deliveryRate) : null,
      realizedFx: moneyToNumber(realized),
      realizedProfit: moneyToNumber(realized > 0n ? realized : 0n),
      realizedLoss: moneyToNumber(realized < 0n ? -realized : 0n),
      balanceAfter: moneyToNumber(state.balance),
      totalCostAfter: moneyToNumber(state.totalCost)
    });
    balances.set(currency, state);
  }

  return Array.from(balances.entries()).map(([currency, state]) => ({
    currency,
    balance: moneyToNumber(state.balance),
    totalCost: moneyToNumber(state.totalCost),
    averageCost: rateToNumber(state.balance > 0n ? roundedDivide(state.totalCost * RATE_SCALE, state.balance) : 0n),
    realizedProfit: moneyToNumber(state.realizedProfit),
    realizedLoss: moneyToNumber(state.realizedLoss),
    realizedFx: moneyToNumber(state.realizedProfit - state.realizedLoss)
  })).sort((a, b) => a.currency.localeCompare(b.currency));
}

function upsertTransferMovement(store, transaction, { id, now, userId, occurredAt, entryRate } = {}) {
  const canonicalCostRate = Number(entryRate);
  if (!Number.isFinite(canonicalCostRate) || canonicalCostRate <= 0) {
    const error = new Error("سعر تكلفة الحوالة يجب أن يكون أكبر من صفر");
    error.code = "TRANSACTION_COST_RATE_REQUIRED";
    error.statusCode = 400;
    throw error;
  }
  if (!Array.isArray(store.treasuryMovements)) store.treasuryMovements = [];
  const sourceKey = `TRANSFER:${transaction.id}`;
  const matches = store.treasuryMovements.filter(row => row && row.sourceKey === sourceKey);
  if (matches.length > 1) throw new Error("يوجد أكثر من حركة خزنة للحوالة نفسها");
  const existing = matches[0];
  const timestamp = occurredAt || transaction.transferDate || transaction.createdAt || now();
  const next = existing || { id: id(), sourceKey, sourceType: "TRANSFER", transactionId: transaction.id, createdAt: now(), createdBy: userId };
  Object.assign(next, {
    movementType: "IN", direction: "IN", currency: String(transaction.currency || "USD").toUpperCase(),
    quantity: moneyToNumber(safeMoney(transaction.beneficiaryReceives ?? transaction.amount, "مبلغ الحوالة")),
    costRate: canonicalCostRate,
    deliveryRate: null,
    occurredAt: timestamp, sourceLabel: transaction.number || transaction.id, isCancelled: false,
    cancelledAt: null, cancelledBy: null, cancellationReason: null,
    updatedAt: existing ? now() : undefined, updatedBy: existing ? userId : undefined
  });
  if (!existing) store.treasuryMovements.push(next);
  rebuildTreasury(store);
  return next;
}

function upsertCashDeliveryMovement(store, transaction, { id, now, userId, quantity, deliveryRate, occurredAt } = {}) {
  if (!Array.isArray(store.treasuryMovements)) store.treasuryMovements = [];
  const sourceKey = `CASH_DELIVERY:${transaction.id}`;
  const matches = store.treasuryMovements.filter(row => row && row.sourceKey === sourceKey);
  if (matches.length > 1) throw new Error("يوجد أكثر من حركة تسليم كاش للحوالة نفسها");
  const existing = matches[0];
  const next = existing || { id:id(),sourceKey,sourceType:"CASH_DELIVERY",transactionId:transaction.id,createdAt:now(),createdBy:userId };
  Object.assign(next,{
    movementType:"OUT",direction:"OUT",currency:String(transaction.currency||"USD").toUpperCase(),
    quantity:moneyToNumber(safeMoney(quantity ?? transaction.beneficiaryReceives ?? transaction.amount,"كمية التسليم الكاش")),
    costRate:null,deliveryRate:rateToNumber(safeRate(deliveryRate,"سعر الصرف وقت التسليم")),
    occurredAt:occurredAt||now(),sourceLabel:transaction.number||transaction.id,isCancelled:false,
    cancelledAt:null,cancelledBy:null,cancellationReason:null,updatedAt:existing?now():undefined,updatedBy:existing?userId:undefined
  });
  if(!existing)store.treasuryMovements.push(next);
  rebuildTreasury(store);
  return next;
}

function cancelCashDeliveryMovement(store, transactionId, { now, userId, reason = "إلغاء حوالة مرتبطة بتسليم كاش" } = {}) {
  const movement=(store.treasuryMovements||[]).find(row=>row&&row.sourceKey===`CASH_DELIVERY:${transactionId}`&&!row.isCancelled);
  if(!movement)return null;
  Object.assign(movement,{isCancelled:true,cancelledAt:now(),cancelledBy:userId,cancellationReason:reason});
  rebuildTreasury(store);
  return movement;
}

function cancelTransferMovement(store, transactionId, { now, userId, reason = "إلغاء الحوالة" } = {}) {
  const movement = (store.treasuryMovements || []).find(row => row && row.sourceKey === `TRANSFER:${transactionId}` && !row.isCancelled);
  if (!movement) return null;
  Object.assign(movement, { isCancelled: true, cancelledAt: now(), cancelledBy: userId, cancellationReason: reason });
  rebuildTreasury(store);
  return movement;
}

function treasuryProfitForRange(store, { from = "", to = "" } = {}) {
  const total = activeMovements(store).filter(row => {
    const date = String(row.occurredAt || row.createdAt || "").slice(0, 10);
    return row.direction === "OUT" && (!from || date >= from) && (!to || date <= to);
  }).reduce((sum, row) => sum + safeMoney(row.realizedFx || 0), 0n);
  return moneyToNumber(total);
}

module.exports = { rebuildTreasury, diagnoseInvalidTreasuryInMovements, upsertTransferMovement, cancelTransferMovement, upsertCashDeliveryMovement, cancelCashDeliveryMovement, treasuryProfitForRange, activeMovements };
