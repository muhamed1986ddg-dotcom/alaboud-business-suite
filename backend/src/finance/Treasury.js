"use strict";

const crypto = require("crypto");

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

const CAD_CASH_USD_BASIS = "CAD_CASH_USD_BASIS";

function calculateTreasuryDeliveryFinancials({ currency, quantity, averageRate, deliveryRate }) {
  const normalizedCurrency = String(currency || "").trim().toUpperCase();
  const amount = safeMoney(quantity, "كمية التسليم الكاش");
  const average = safeRate(averageRate, "متوسط تكلفة الخزنة");
  const delivery = safeRate(deliveryRate, "سعر الصرف وقت التسليم");
  if (amount <= 0n || average <= 0n || delivery <= 0n) {
    const error = new Error("الكمية والمتوسط وسعر التسليم يجب أن تكون أكبر من صفر");
    error.code = "TREASURY_DELIVERY_FINANCIALS_INVALID";
    throw error;
  }
  if (normalizedCurrency === "CAD") {
    const costUsd = roundedDivide(amount * RATE_SCALE, average);
    const deliveryUsd = roundedDivide(amount * RATE_SCALE, delivery);
    const realizedFxUsd = deliveryUsd - costUsd;
    const realizedFxCad = roundedDivide(realizedFxUsd * delivery, RATE_SCALE);
    return { costBasis: costUsd, costUsd, deliveryUsd, realizedFxUsd, realizedFxCad };
  }
  const costCad = roundedDivide(amount * average, RATE_SCALE);
  const deliveryCad = roundedDivide(amount * delivery, RATE_SCALE);
  const realizedFxCad = deliveryCad - costCad;
  return { costBasis: costCad, costCad, deliveryCad, realizedFxUsd: null, realizedFxCad };
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
  const result = {
    movementId: String(row?.id || ""),
    sourceType: String(row?.sourceType || ""),
    sourceKey: String(row?.sourceKey || ""),
    direction,
    currency: String(row?.currency || "").trim().toUpperCase(),
    amount: Number(row?.quantity || 0),
    costRate: row?.costRate == null ? null : Number(row.costRate),
    createdAt: row?.createdAt || null
  };
  return result;
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

function cadBackfillFingerprint(proposals) {
  const canonical = proposals.map(row => [row.transactionId,row.quantity,row.costRate,row.usdBasis]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
  return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function planCadTreasuryBackfill(store) {
  const transactions = Array.isArray(store?.transactions) ? store.transactions : [];
  const movements = Array.from(store?.treasuryMovements || []);
  const proposals = [];
  const invalid = [];
  const alreadyPresentRows = [];
  const legacyUsdTransfers = [];
  let examined = 0;
  for (const transaction of transactions) {
    if (!transaction || transaction.isDeleted || transaction.status === "CANCELLED") continue;
    examined += 1;
    const transactionId = String(transaction.id || "");
    const transferKey = `TRANSFER:${transactionId}`;
    const backfillKey = `TRANSFER_BACKFILL:${transactionId}`;
    const linked = movements.find(row=>row&&(row.sourceKey===transferKey||row.sourceKey===backfillKey));
    if (linked) {
      alreadyPresentRows.push({transactionId,movementId:String(linked.id||""),sourceKey:String(linked.sourceKey),currency:String(linked.currency||"").toUpperCase()});
      if (linked.sourceKey===transferKey&&String(linked.currency||"").toUpperCase()==="USD") {
        const financials=transactionFinancials(transaction);
        legacyUsdTransfers.push({movementId:String(linked.id||""),transactionId,legacyUsdQuantity:Number(linked.quantity||0),expectedCad:Number(financials.convertedCad||0),expectedUsdBasis:Number(financials.costRate)>0?Number(financials.convertedCad||0)/Number(financials.costRate):null});
      }
      continue;
    }
    const financials = transactionFinancials(transaction);
    const convertedCad = Number(financials.convertedCad);
    const costRate = Number(financials.costRate);
    if (!transactionId || !Number.isFinite(convertedCad) || convertedCad <= 0 || !Number.isFinite(costRate) || costRate <= 0) {
      invalid.push({transactionId,convertedCad:Number.isFinite(convertedCad)?convertedCad:null,costRate:Number.isFinite(costRate)?costRate:null,reason:"INVALID_TRANSACTION_FINANCIALS"});
      continue;
    }
    const usdBasis = convertedCad / costRate;
    if (!Number.isFinite(usdBasis) || usdBasis <= 0) {
      invalid.push({transactionId,convertedCad,costRate,reason:"INVALID_USD_BASIS"});
      continue;
    }
    proposals.push({transactionId,sourceKey:backfillKey,quantity:convertedCad,costRate,usdBasis,originalTransactionDate:transaction.transferDate||transaction.createdAt||null});
  }
  const cadToAdd = proposals.reduce((sum,row)=>sum+row.quantity,0);
  const usdBasisToAdd = proposals.reduce((sum,row)=>sum+row.usdBasis,0);
  let currentCadBalance=0,currentCadUsdBasis=0,rebuildError=null;
  try {
    const balances=rebuildTreasury({treasuryMovements:movements.map(row=>({...row}))});
    const cad=balances.find(row=>row.currency==="CAD");
    currentCadBalance=Number(cad?.balance||0);currentCadUsdBasis=Number(cad?.totalUsdBasis||0);
  } catch(error) { rebuildError=error.code||error.message||"TREASURY_REBUILD_FAILED"; }
  const expectedBalance=currentCadBalance+cadToAdd;
  const expectedBasis=currentCadUsdBasis+usdBasisToAdd;
  const result = {
    examined,eligible:proposals.length,alreadyPresent:alreadyPresentRows.length,invalid:invalid.length,
    cadToAdd:+cadToAdd.toFixed(3),usdBasisToAdd:+usdBasisToAdd.toFixed(3),
    expectedCadBalance:+expectedBalance.toFixed(3),expectedTotalUsdBasis:+expectedBasis.toFixed(3),
    expectedAverageRate:expectedBasis>0?+(expectedBalance/expectedBasis).toFixed(8):0,
    fingerprint:cadBackfillFingerprint(proposals),repairable:!rebuildError,
    rebuildError,legacyUsdConversionRequired:legacyUsdTransfers.length>0,
    legacyUsdTransferCount:legacyUsdTransfers.length,
    legacyUsdQuantity:legacyUsdTransfers.reduce((sum,row)=>sum+row.legacyUsdQuantity,0),
    proposals:proposals.slice(0,100),invalidTransactions:invalid.slice(0,100),
    alreadyPresentRows:alreadyPresentRows.slice(0,100),legacyUsdTransfers:legacyUsdTransfers.slice(0,100)
  };
  Object.defineProperty(result,"_proposals",{value:proposals,enumerable:false});
  return result;
}

function applyCadTreasuryBackfill(store,{fingerprint,id,now,userId}={}) {
  const plan=planCadTreasuryBackfill(store);
  if(plan.eligible===0 && (store.treasuryMovements||[]).some(row=>String(row?.sourceKey||"").startsWith("TRANSFER_BACKFILL:"))) return {...plan,status:"ALREADY_APPLIED",applied:0};
  if(!plan.repairable){const error=new Error("TREASURY_BACKFILL_REBUILD_BLOCKED");error.code="TREASURY_BACKFILL_REBUILD_BLOCKED";throw error;}
  if(!fingerprint||fingerprint!==plan.fingerprint){const error=new Error("TREASURY_BACKFILL_FINGERPRINT_MISMATCH");error.code="TREASURY_BACKFILL_FINGERPRINT_MISMATCH";throw error;}
  const backfilledAt=now();
  const additions=plan._proposals.map(row=>({
    id:id(),sourceKey:row.sourceKey,sourceType:"TRANSFER_BACKFILL",sourceLabel:"رصيد افتتاحي من حوالة تاريخية",transactionId:row.transactionId,
    movementType:"IN",direction:"IN",currency:"CAD",quantity:row.quantity,costRate:row.costRate,usdBasis:row.usdBasis,
    accountingModel:CAD_CASH_USD_BASIS,originalTransactionDate:row.originalTransactionDate,backfilledAt,occurredAt:backfilledAt,
    deliveryRate:null,realizedFx:0,realizedProfit:0,realizedLoss:0,isCancelled:false,createdAt:backfilledAt,createdBy:userId
  }));
  rebuildTreasury({treasuryMovements:[...Array.from(store.treasuryMovements||[]).map(row=>({...row})),...additions.map(row=>({...row}))]});
  if(!Array.isArray(store.treasuryMovements))store.treasuryMovements=[];
  store.treasuryMovements.push(...additions);
  rebuildTreasury(store);
  return {...plan,status:"APPLIED",applied:additions.length,movementIds:additions.map(row=>row.id)};
}

function legacyUsdConversionFingerprint(rows) {
  const canonical=rows.map(row=>[row.movementId,row.transactionId,row.currentQuantityUsd,row.expectedCad,row.expectedUsdBasis,row.expectedCostRate]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
  return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function legacyUsdConversionSummary(plan) {
  return {
    expectedCount:plan.repairableCount,
    legacyUsdTotalBefore:plan.legacyUsdTotalBefore,
    convertedCadTotal:plan.convertedCadTotal,
    convertedUsdBasisTotal:plan.convertedUsdBasisTotal
  };
}

function planLegacyUsdToCadConversion(store) {
  const movements=Array.from(store?.treasuryMovements||[]);
  const transactions=Array.isArray(store?.transactions)?store.transactions:[];
  const transactionById=new Map(transactions.map(row=>[String(row?.id||""),row]));
  const candidates=[];
  const nonRepairable=[];
  for(const movement of movements){
    if(!movement||movement.isCancelled||movement.sourceType!=="TRANSFER"||String(movement.currency||"").toUpperCase()!=="USD")continue;
    const transactionId=String(movement.transactionId||String(movement.sourceKey||"").slice("TRANSFER:".length));
    if(!transactionId||movement.sourceKey!==`TRANSFER:${transactionId}`)continue;
    const base={movementId:String(movement.id||""),transactionId,currentCurrency:"USD",currentQuantityUsd:Number(movement.quantity||0),originalOccurredAt:movement.occurredAt||null};
    const transaction=transactionById.get(transactionId);
    if(!transaction||transaction.isDeleted||transaction.status==="CANCELLED"){
      nonRepairable.push({...base,repairable:false,reason:"TRANSACTION_NOT_FOUND_OR_INACTIVE"});continue;
    }
    const duplicate=movements.find(row=>row&&row!==movement&&!row.isCancelled&&String(row.transactionId||"")===transactionId&&String(row.currency||"").toUpperCase()==="CAD");
    if(duplicate){
      nonRepairable.push({...base,repairable:false,reason:"DUPLICATE_CAD_REPRESENTATION",duplicateMovementId:String(duplicate.id||""),duplicateSourceKey:String(duplicate.sourceKey||"")});continue;
    }
    const financials=transactionFinancials(transaction);
    const expectedCad=Number(financials.convertedCad),expectedCostRate=Number(financials.costRate);
    const expectedUsdBasis=expectedCostRate>0?expectedCad/expectedCostRate:0;
    if(!Number.isFinite(expectedCad)||expectedCad<=0||!Number.isFinite(expectedCostRate)||expectedCostRate<=0||!Number.isFinite(expectedUsdBasis)||expectedUsdBasis<=0){
      nonRepairable.push({...base,expectedCad:Number.isFinite(expectedCad)?expectedCad:null,expectedCostRate:Number.isFinite(expectedCostRate)?expectedCostRate:null,expectedUsdBasis:Number.isFinite(expectedUsdBasis)?expectedUsdBasis:null,repairable:false,reason:"INVALID_TRANSACTION_FINANCIALS"});continue;
    }
    candidates.push({...base,expectedCad,expectedUsdBasis,expectedCostRate,repairable:true});
  }
  const legacyUsdTotalBefore=candidates.reduce((sum,row)=>sum+row.currentQuantityUsd,0);
  const convertedCadTotal=candidates.reduce((sum,row)=>sum+row.expectedCad,0);
  const convertedUsdBasisTotal=candidates.reduce((sum,row)=>sum+row.expectedUsdBasis,0);
  let expectedCadBalanceAfterConversion=null,expectedUsdLegacyBalanceAfterConversion=0,expectedUsdBalanceAfterConversion=null,rebuildError=null;
  if(nonRepairable.length===0){
    const verification=movements.map(row=>({...row}));
    for(const candidate of candidates){
      const row=verification.find(item=>String(item?.id||"")===candidate.movementId);
      Object.assign(row,{currency:"CAD",quantity:candidate.expectedCad,costRate:candidate.expectedCostRate,usdBasis:candidate.expectedUsdBasis,accountingModel:CAD_CASH_USD_BASIS,realizedFx:0,realizedProfit:0,realizedLoss:0});
    }
    try{
      const balances=rebuildTreasury({treasuryMovements:verification});
      expectedCadBalanceAfterConversion=Number(balances.find(row=>row.currency==="CAD")?.balance||0);
      expectedUsdBalanceAfterConversion=Number(balances.find(row=>row.currency==="USD")?.balance||0);
    }catch(error){rebuildError=error.code||error.message||"TREASURY_REBUILD_FAILED";}
  }
  const fingerprint=legacyUsdConversionFingerprint(candidates);
  const plan={
    candidateCount:candidates.length,repairableCount:candidates.length,nonRepairableCount:nonRepairable.length,
    duplicateCadRepresentations:nonRepairable.filter(row=>row.reason==="DUPLICATE_CAD_REPRESENTATION").length,
    legacyUsdTotalBefore:+legacyUsdTotalBefore.toFixed(3),convertedCadTotal:+convertedCadTotal.toFixed(3),convertedUsdBasisTotal:+convertedUsdBasisTotal.toFixed(3),
    expectedCadBalanceAfterConversion,expectedUsdLegacyBalanceAfterConversion,expectedUsdBalanceAfterConversion,
    fingerprint,repairable:nonRepairable.length===0&&!rebuildError,rebuildError,
    movements:candidates.slice(0,100),nonRepairable:nonRepairable.slice(0,100)
  };
  plan.summary=legacyUsdConversionSummary(plan);
  Object.defineProperty(plan,"_candidates",{value:candidates,enumerable:false});
  return plan;
}

function applyLegacyUsdToCadConversion(store,{fingerprint,expectedCount,summary,now,userId}={}){
  const plan=planLegacyUsdToCadConversion(store);
  if(plan.candidateCount===0&&(store.treasuryMovements||[]).some(row=>row?.legacyConversion===true&&row?.conversionVersion==="v25.14.107"))return {...plan,status:"ALREADY_APPLIED",applied:0};
  if(!plan.repairable){const error=new Error("TREASURY_LEGACY_CONVERSION_NOT_REPAIRABLE");error.code="TREASURY_LEGACY_CONVERSION_NOT_REPAIRABLE";error.plan=plan;throw error;}
  const suppliedSummary=summary&&typeof summary==="object"?summary:{};
  const summaryMatches=JSON.stringify({expectedCount:Number(expectedCount),legacyUsdTotalBefore:Number(suppliedSummary.legacyUsdTotalBefore),convertedCadTotal:Number(suppliedSummary.convertedCadTotal),convertedUsdBasisTotal:Number(suppliedSummary.convertedUsdBasisTotal)})===JSON.stringify(plan.summary);
  if(fingerprint!==plan.fingerprint||Number(expectedCount)!==plan.repairableCount||!summaryMatches){const error=new Error("TREASURY_LEGACY_CONVERSION_FINGERPRINT_MISMATCH");error.code="TREASURY_LEGACY_CONVERSION_FINGERPRINT_MISMATCH";throw error;}
  const convertedAt=now();
  const verification=Array.from(store.treasuryMovements||[]).map(row=>({...row}));
  for(const candidate of plan._candidates){
    const row=verification.find(item=>String(item?.id||"")===candidate.movementId);
    Object.assign(row,{currency:"CAD",quantity:candidate.expectedCad,costRate:candidate.expectedCostRate,usdBasis:candidate.expectedUsdBasis,accountingModel:CAD_CASH_USD_BASIS,legacyConversion:true,legacyCurrency:"USD",legacyQuantity:candidate.currentQuantityUsd,convertedAt,conversionVersion:"v25.14.107",realizedFx:0,realizedProfit:0,realizedLoss:0});
  }
  rebuildTreasury({treasuryMovements:verification});
  const originals=[];
  try{
    for(const candidate of plan._candidates){
      const row=(store.treasuryMovements||[]).find(item=>String(item?.id||"")===candidate.movementId);
      originals.push({row,value:{...row}});
      Object.assign(row,verification.find(item=>String(item?.id||"")===candidate.movementId));
      row.convertedBy=userId;
    }
    rebuildTreasury(store);
  }catch(error){
    for(const original of originals){for(const key of Object.keys(original.row))delete original.row[key];Object.assign(original.row,original.value);}
    throw error;
  }
  return {...plan,status:"APPLIED",applied:plan._candidates.length,movementIds:plan._candidates.map(row=>row.movementId)};
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
    const isCadAsset = currency === "CAD";
    const averageBefore = state.balance > 0n
      ? (isCadAsset ? roundedDivide(state.balance * RATE_SCALE, state.totalCost) : roundedDivide(state.totalCost * RATE_SCALE, state.balance))
      : 0n;
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
      const usdBasis = isCadAsset
        ? (row.usdBasis == null ? roundedDivide(quantity * RATE_SCALE, costRate) : safeMoney(row.usdBasis, "أساس USD للحركة"))
        : roundedDivide(quantity * costRate, RATE_SCALE);
      if (usdBasis <= 0n) throw new Error("أساس تكلفة حركة الخزنة يجب أن يكون أكبر من صفر");
      state.totalCost += usdBasis;
    } else if (direction === "OUT") {
      deliveryRate = safeRate(row.deliveryRate, "سعر الصرف وقت التسليم");
      if (deliveryRate <= 0n) throw new Error("سعر الصرف وقت التسليم يجب أن يكون أكبر من صفر");
      const preservesHistoricalNegative = row.allowNegative === true || Number(row.balanceAfter) < 0;
      if (!allowNegative && !preservesHistoricalNegative && quantity > state.balance) {
        const error = new Error(`لا يمكن تنفيذ التسليم الكاش: الرصيد المتاح ${moneyToNumber(state.balance).toFixed(4)} ${currency} والمطلوب ${moneyToNumber(quantity).toFixed(4)} ${currency}.`);
        error.code = "TREASURY_INSUFFICIENT_BALANCE";
        throw error;
      }
      const historicalCadAtPar = isCadAsset && row.baseCurrencyDelivery === true;
      const financials = averageBefore <= 0n && !isCadAsset
        ? { costBasis: 0n, realizedFxUsd: null, realizedFxCad: roundedDivide(quantity * deliveryRate, RATE_SCALE) }
        : historicalCadAtPar
        ? { costBasis: roundedDivide(quantity * RATE_SCALE, averageBefore), realizedFxUsd: 0n, realizedFxCad: 0n }
        : calculateTreasuryDeliveryFinancials({currency,quantity:moneyToNumber(quantity),averageRate:rateToNumber(averageBefore),deliveryRate:rateToNumber(deliveryRate)});
      const releasedCost = financials.costBasis;
      realized = financials.realizedFxCad;
      state.balance -= quantity;
      state.totalCost -= releasedCost;
      if (state.balance === 0n) state.totalCost = 0n;
      if (realized >= 0n) state.realizedProfit += realized;
      else state.realizedLoss += -realized;
    } else {
      throw new Error("اتجاه حركة الخزنة غير صحيح");
    }

    const averageAfter = state.balance > 0n
      ? (isCadAsset ? roundedDivide(state.balance * RATE_SCALE, state.totalCost) : roundedDivide(state.totalCost * RATE_SCALE, state.balance))
      : averageBefore;
    const deliveryFinancials = direction === "OUT" && averageBefore > 0n
      ? (isCadAsset && row.baseCurrencyDelivery === true
        ? {costUsd:roundedDivide(quantity * RATE_SCALE,averageBefore),deliveryUsd:roundedDivide(quantity * RATE_SCALE,averageBefore),realizedFxUsd:0n,realizedFxCad:0n}
        : calculateTreasuryDeliveryFinancials({currency,quantity:moneyToNumber(quantity),averageRate:rateToNumber(averageBefore),deliveryRate:rateToNumber(deliveryRate)}))
      : null;
    Object.assign(row, {
      currency, direction,
      costRate: direction === "IN" ? rateToNumber(costRate) : null,
      averageCostBefore: rateToNumber(averageBefore),
      averageCostAfter: rateToNumber(averageAfter),
      deliveryRate: direction === "OUT" ? rateToNumber(deliveryRate) : null,
      realizedFx: moneyToNumber(realized),
      realizedProfit: moneyToNumber(realized > 0n ? realized : 0n),
      realizedLoss: moneyToNumber(realized < 0n ? -realized : 0n),
      realizedFxCad: moneyToNumber(realized),
      realizedFxUsd: deliveryFinancials?.realizedFxUsd == null ? null : moneyToNumber(deliveryFinancials.realizedFxUsd),
      deliveryUsd: deliveryFinancials?.deliveryUsd == null ? null : moneyToNumber(deliveryFinancials.deliveryUsd),
      costUsd: deliveryFinancials?.costUsd == null ? null : moneyToNumber(deliveryFinancials.costUsd),
      balanceAfter: moneyToNumber(state.balance),
      totalCostAfter: moneyToNumber(state.totalCost),
      totalUsdBasisAfter: isCadAsset ? moneyToNumber(state.totalCost) : null
    });
    balances.set(currency, state);
  }

  return Array.from(balances.entries()).map(([currency, state]) => ({
    currency,
    balance: moneyToNumber(state.balance),
    totalCost: moneyToNumber(state.totalCost),
    averageCost: rateToNumber(state.balance > 0n ? (currency === "CAD" ? roundedDivide(state.balance * RATE_SCALE, state.totalCost) : roundedDivide(state.totalCost * RATE_SCALE, state.balance)) : 0n),
    averageRateCadPerUsd: currency === "CAD" ? rateToNumber(state.balance > 0n ? roundedDivide(state.balance * RATE_SCALE, state.totalCost) : 0n) : null,
    totalUsdBasis: currency === "CAD" ? moneyToNumber(state.totalCost) : null,
    realizedProfit: moneyToNumber(state.realizedProfit),
    realizedLoss: moneyToNumber(state.realizedLoss),
    realizedFx: moneyToNumber(state.realizedProfit - state.realizedLoss)
  })).sort((a, b) => a.currency.localeCompare(b.currency));
}

function upsertTransferMovement(store, transaction, { id, now, userId, occurredAt, entryRate, cadAmountReceived, assetCurrency } = {}) {
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
  const preserveLegacyModel = Boolean((existing && existing.accountingModel !== CAD_CASH_USD_BASIS) || assetCurrency === "USD");
  const cadAmount = safeMoney(cadAmountReceived, "مبلغ CAD المقبوض من الحوالة");
  if (!preserveLegacyModel && cadAmount <= 0n) {
    const error = new Error("مبلغ CAD المقبوض من الحوالة يجب أن يكون أكبر من صفر");
    error.code = "TRANSACTION_CAD_AMOUNT_REQUIRED";
    error.statusCode = 400;
    throw error;
  }
  Object.assign(next, {
    movementType: "IN", direction: "IN", currency: preserveLegacyModel ? String(existing?.currency || transaction.currency || "USD").toUpperCase() : "CAD",
    quantity: preserveLegacyModel ? moneyToNumber(safeMoney(transaction.beneficiaryReceives ?? transaction.amount, "مبلغ الحوالة")) : moneyToNumber(cadAmount),
    costRate: canonicalCostRate,
    usdBasis: preserveLegacyModel ? existing?.usdBasis : moneyToNumber(roundedDivide(cadAmount * RATE_SCALE, safeRate(canonicalCostRate, "سعر تكلفة الحوالة"))),
    accountingModel: preserveLegacyModel ? existing?.accountingModel : CAD_CASH_USD_BASIS,
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
  const rateValue=safeRate(deliveryRate,"سعر الصرف وقت التسليم");
  if(rateValue<=0n){const error=new Error("سعر التسليم يجب أن يكون أكبر من صفر");error.code="TREASURY_DELIVERY_RATE_REQUIRED";throw error;}
  const movementId=id();
  const timestamp=occurredAt||now();
  const movement={
    id:movementId,sourceKey:`CASH_DELIVERY:GENERAL:${movementId}`,sourceType:"CASH_DELIVERY",sourceLabel:"تسليم كاش فعلي",
    movementType:"OUT",direction:"OUT",currency:normalizedCurrency,quantity:moneyToNumber(amount),costRate:null,
    deliveryRate:rateToNumber(rateValue),accountingModel:normalizedCurrency==="CAD"?CAD_CASH_USD_BASIS:null,occurredAt:timestamp,note:String(note||"").trim().slice(0,500),
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

module.exports = { rebuildTreasury, calculateTreasuryDeliveryFinancials, diagnoseInvalidTreasuryInMovements, planTreasuryEntryRateRepair, applyTreasuryEntryRateRepair, planCadTreasuryBackfill, applyCadTreasuryBackfill, planLegacyUsdToCadConversion, applyLegacyUsdToCadConversion, upsertTransferMovement, cancelTransferMovement, upsertCashDeliveryMovement, createGeneralCashDeliveryMovement, cancelCashDeliveryMovement, treasuryProfitForRange, treasuryRealizedForInventoryPeriod, treasuryInventorySnapshot, activeMovements };
