"use strict";

const {
  money, rate, roundedDivide, MONEY_SCALE, RATE_SCALE,
  moneyToNumber, rateToNumber
} = require("./Money");
const { transactionFinancials } = require("./TransactionFinancials");
const { occurredLocalDate } = require("./InventoryPeriod");

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

function planTreasuryEntryRateRepair(store, movementId) {
  const movement = (store?.treasuryMovements || []).find(row => row && String(row.id) === String(movementId));
  if (!movement) return { movementId: String(movementId), repairable: false, status: "MOVEMENT_NOT_FOUND" };
  const direction = movement.sourceType === "TRANSFER" ? "IN" : String(movement.direction || movement.movementType || "").toUpperCase();
  const currentCostRate = movement.costRate == null ? null : Number(movement.costRate);
  const base = { movementId: String(movement.id), currentCostRate, expectedCostRate: null, repairable: false };
  if (movement.sourceType !== "TRANSFER" || direction !== "IN") return {...base,status:"NOT_TRANSFER_IN"};
  if (Number.isFinite(currentCostRate) && currentCostRate > 0) return {...base,status:"ALREADY_REPAIRED"};
  const sourceTransactionId = String(movement.transactionId || String(movement.sourceKey || "").slice("TRANSFER:".length));
  if (!sourceTransactionId || String(movement.sourceKey || "") !== `TRANSFER:${sourceTransactionId}`) return {...base,status:"INVALID_TRANSFER_LINK"};
  const transaction = (store.transactions || []).find(row => row && String(row.id) === sourceTransactionId);
  if (!transaction) return {...base,transactionId:sourceTransactionId,status:"TRANSACTION_NOT_FOUND"};
  const expectedCostRate = transactionFinancials(transaction).costRate;
  if (!Number.isFinite(expectedCostRate) || expectedCostRate <= 0) return {...base,transactionId:sourceTransactionId,expectedCostRate,status:"TRANSACTION_COST_RATE_REQUIRED"};

  const verificationMovements = Array.from(store.treasuryMovements || []).map(row => ({...row}));
  const verificationMovement = verificationMovements.find(row => row && String(row.id) === String(movement.id));
  verificationMovement.costRate = expectedCostRate;
  let balances;
  try { balances = rebuildTreasury({treasuryMovements:verificationMovements}); }
  catch (error) { return {...base,transactionId:sourceTransactionId,expectedCostRate,status:"REBUILD_BLOCKED",blockingErrorCode:error.code||null}; }
  const expectedCurrencyBalance = balances.find(row => row.currency === String(movement.currency || "").toUpperCase()) || null;
  return {...base,transactionId:sourceTransactionId,expectedCostRate,repairable:true,status:"READY",expectedBalanceAfterRebuild:expectedCurrencyBalance};
}

function applyTreasuryEntryRateRepair(store, movementId, { confirmedExpectedCostRate } = {}) {
  const plan = planTreasuryEntryRateRepair(store, movementId);
  if (plan.status === "ALREADY_REPAIRED") return plan;
  if (!plan.repairable) return plan;
  if (Number(confirmedExpectedCostRate) !== plan.expectedCostRate) return {...plan,repairable:false,status:"EXPECTED_COST_RATE_MISMATCH"};
  const movement = (store.treasuryMovements || []).find(row => row && String(row.id) === String(movementId));
  movement.costRate = plan.expectedCostRate;
  // Verify the repaired ledger on a clone so rebuild-derived fields on all
  // other historical movements remain byte-for-byte untouched.
  rebuildTreasury({treasuryMovements:Array.from(store.treasuryMovements || []).map(row => ({...row}))});
  return {...plan,status:"APPLIED",applied:true};
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
      const isBaseCurrencyDelivery=row.baseCurrencyDelivery===true&&currency==="CAD";
      deliveryRate = safeRate(isBaseCurrencyDelivery?1:row.deliveryRate, "سعر الصرف وقت التسليم");
      if (deliveryRate <= 0n) throw new Error("سعر الصرف وقت التسليم يجب أن يكون أكبر من صفر");
      const preservesHistoricalNegative = row.allowNegative === true || Number(row.balanceAfter) < 0;
      if (!allowNegative && !preservesHistoricalNegative && quantity > state.balance) {
        const error = new Error(`لا يمكن تنفيذ التسليم الكاش: الرصيد المتاح ${moneyToNumber(state.balance).toFixed(4)} ${currency} والمطلوب ${moneyToNumber(quantity).toFixed(4)} ${currency}.`);
        error.code = "TREASURY_INSUFFICIENT_BALANCE";
        throw error;
      }
      const releasedCost = roundedDivide(quantity * averageBefore, RATE_SCALE);
      realized = isBaseCurrencyDelivery?0n:roundedDivide(quantity * (deliveryRate - averageBefore), RATE_SCALE);
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

function createGeneralCashDeliveryMovement(store,{currency,quantity,deliveryRate,occurredAt,note=""}={}, {id,now,userId}={}){
  if(!Array.isArray(store.treasuryMovements))store.treasuryMovements=[];
  const normalizedCurrency=String(currency||"").trim().toUpperCase();
  if(!/^[A-Z]{3}$/.test(normalizedCurrency)){
    const error=new Error("عملة التسليم مطلوبة");error.code="TREASURY_DELIVERY_CURRENCY_REQUIRED";throw error;
  }
  const amount=safeMoney(quantity,"كمية التسليم الكاش");
  if(amount<=0n){const error=new Error("كمية التسليم يجب أن تكون أكبر من صفر");error.code="TREASURY_DELIVERY_AMOUNT_REQUIRED";throw error;}
  const isBaseCurrencyDelivery=normalizedCurrency==="CAD";
  const rateValue=safeRate(isBaseCurrencyDelivery?1:deliveryRate,"سعر الصرف وقت التسليم");
  if(rateValue<=0n){const error=new Error("سعر التسليم يجب أن يكون أكبر من صفر");error.code="TREASURY_DELIVERY_RATE_REQUIRED";throw error;}
  const movementId=id();
  const timestamp=occurredAt||now();
  const movement={
    id:movementId,sourceKey:`CASH_DELIVERY:GENERAL:${movementId}`,sourceType:"CASH_DELIVERY",sourceLabel:"تسليم كاش فعلي",
    movementType:"OUT",direction:"OUT",currency:normalizedCurrency,quantity:moneyToNumber(amount),costRate:null,
    deliveryRate:rateToNumber(rateValue),baseCurrencyDelivery:isBaseCurrencyDelivery,occurredAt:timestamp,note:String(note||"").trim().slice(0,500),
    transactionId:null,isCancelled:false,createdAt:now(),createdBy:userId
  };
  // Validate the complete ledger before touching the durable state. This keeps
  // insufficient-balance and other validation failures mutation-free.
  rebuildTreasury({treasuryMovements:[...store.treasuryMovements.map(row=>({...row})),{...movement}]});
  store.treasuryMovements.push(movement);
  rebuildTreasury(store);
  return movement;
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

function treasuryRealizedForInventoryPeriod(store,{start="",nextStart="",timeZone="America/Toronto"}={}){
  return activeMovements(store).reduce((summary,row)=>{
    const direction=row.sourceType==="TRANSFER"?"IN":String(row.direction||row.movementType||"").toUpperCase();
    const localDate=occurredLocalDate(row.occurredAt||row.createdAt,timeZone);
    if(direction!=="OUT"||!localDate||localDate<start||localDate>=nextStart)return summary;
    summary.realizedProfit+=Number(row.realizedProfit||0);
    summary.realizedLoss+=Number(row.realizedLoss||0);
    summary.realizedFx+=Number(row.realizedFx||0);
    summary.outCount+=1;
    return summary;
  },{realizedFx:0,realizedProfit:0,realizedLoss:0,outCount:0});
}

function treasuryInventorySnapshot(store,period,{inventoryId="",finalizedAt=""}={}){
  const summary=treasuryRealizedForInventoryPeriod(store,period);
  return Object.freeze({
    inventoryId,
    periodStart:period.start,
    periodEnd:period.end,
    nextPeriodStart:period.nextStart,
    baseCurrency:"CAD",
    treasuryRealizedProfit:summary.realizedProfit,
    treasuryRealizedLoss:summary.realizedLoss,
    treasuryRealizedFx:summary.realizedFx,
    treasuryOutCount:summary.outCount,
    status:"FINALIZED",
    finalizedAt
  });
}

module.exports = { rebuildTreasury, diagnoseInvalidTreasuryInMovements, planTreasuryEntryRateRepair, applyTreasuryEntryRateRepair, upsertTransferMovement, cancelTransferMovement, upsertCashDeliveryMovement, createGeneralCashDeliveryMovement, cancelCashDeliveryMovement, treasuryProfitForRange, treasuryRealizedForInventoryPeriod, treasuryInventorySnapshot, activeMovements };
