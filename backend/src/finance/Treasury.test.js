"use strict";
const assert=require("assert");
const {rebuildTreasury,diagnoseInvalidTreasuryInMovements,planTreasuryEntryRateRepair,applyTreasuryEntryRateRepair,planCadTreasuryBackfill,applyCadTreasuryBackfill,planLegacyUsdToCadConversion,applyLegacyUsdToCadConversion,upsertTransferMovement,cancelTransferMovement,upsertCashDeliveryMovement,createGeneralCashDeliveryMovement,createInventoryCarryForwardMovement,treasuryProfitForRange,treasuryRealizedForInventoryPeriod,treasuryInventorySnapshot}=require("./Treasury");
const {transactionFinancials}=require("./TransactionFinancials");
let sequence=0;
const helpers={id:()=>`m${++sequence}`,now:()=>`2026-01-10T00:00:${String(sequence).padStart(2,"0")}Z`,userId:"u1"};
const balance=(store,currency="USD")=>rebuildTreasury(store).find(row=>row.currency===currency)?.balance??0;
const incoming=(quantity,costRate=1,id=`in-${++sequence}`)=>({id,sourceKey:`ADJUSTMENT:${id}`,sourceType:"MANUAL_ADJUSTMENT",movementType:"ADJUSTMENT",direction:"IN",currency:"USD",quantity,costRate,occurredAt:"2026-01-01",createdAt:"2026-01-01"});
const legacyNegative=(quantity,id=`legacy-${++sequence}`)=>({id,sourceKey:`LEGACY:${id}`,sourceType:"LEGACY",movementType:"OUT",direction:"OUT",currency:"USD",quantity,deliveryRate:1,allowNegative:true,occurredAt:"2025-12-31",createdAt:"2025-12-31"});
const transfer=(id="t1",amount=700,costRate=140)=>({id,number:`TRX-${id}`,currency:"USD",amount,beneficiaryReceives:amount,costRate,transferDate:"2026-01-02"});
const transferOptions=(transaction,overrides={})=>({...helpers,entryRate:transactionFinancials(transaction).costRate,assetCurrency:"USD",...overrides});

for(const [starting,expected] of [[250,950],[-250,450],[-1000,-300],[0,700]]){
  const store={treasuryMovements:starting>0?[incoming(starting)]:starting<0?[legacyNegative(-starting)]:[]};
  const row=transfer(`start-${starting}`);
  const movement=upsertTransferMovement(store,row,transferOptions(row));
  assert.equal(movement.direction,"IN");assert.equal(movement.realizedFx,0);
  assert.equal(balance(store),expected,`${starting} + 700 must equal ${expected}`);
}

// Production regression: an existing USD 250 balance plus a newly registered
// USD 700 transfer must save as IN (950 total) without realized FX. Realized
// FX is created only by a later, explicit partial cash delivery.
const deliveryStore={treasuryMovements:[incoming(250,140)]};
const deliveredTransfer=transfer("delivery");
const registered=upsertTransferMovement(deliveryStore,deliveredTransfer,transferOptions(deliveredTransfer));
assert.equal(balance(deliveryStore),950);
assert.equal(registered.direction,"IN");assert.equal(registered.deliveryRate,null);assert.equal(registered.realizedFx,0);
const originalProfit=transactionFinancials({...deliveredTransfer,finalRate:145}).totalProfit;
const delivery=upsertCashDeliveryMovement(deliveryStore,deliveredTransfer,{...helpers,quantity:300,deliveryRate:142,occurredAt:"2026-01-03"});
assert.equal(delivery.direction,"OUT");assert.equal(balance(deliveryStore),650);
assert.equal(delivery.averageCostBefore,140);assert.equal(delivery.averageCostAfter,140);assert.equal(delivery.realizedFx,600);
assert.equal(transactionFinancials({...deliveredTransfer,finalRate:145,deliveryRate:999}).totalProfit,originalProfit);
assert.equal(treasuryProfitForRange(deliveryStore,{from:"2026-01-01",to:"2026-01-31"}),600);
assert.throws(()=>upsertCashDeliveryMovement({treasuryMovements:[incoming(250)]},transfer("too-large"),{...helpers,quantity:700,deliveryRate:2}),error=>error.code==="TREASURY_INSUFFICIENT_BALANCE"&&/التسليم الكاش/.test(error.message));

// v25.14.107 regression: Treasury IN uses the canonical transaction cost rate.
const costRateStore={treasuryMovements:[incoming(250,1.40,"cost-rate-opening")]};
const costRateTransfer=transfer("cost-rate",700,1.40);
const costBefore=rebuildTreasury(costRateStore)[0].totalCost;
const costRateMovement=upsertTransferMovement(costRateStore,costRateTransfer,transferOptions(costRateTransfer));
const costRateBalance=rebuildTreasury(costRateStore)[0];
assert.equal(costRateMovement.costRate,transactionFinancials(costRateTransfer).costRate);
assert.equal(costRateMovement.costRate,1.40);
assert.equal(costRateMovement.realizedFx,0);
assert.equal(costRateBalance.balance,950);
assert.equal(costRateBalance.totalCost-costBefore,980);

for(const missingCostRate of [undefined,0]){
  const invalidStore={treasuryMovements:[incoming(250,1.40,`invalid-opening-${missingCostRate}`)]};
  const before=invalidStore.treasuryMovements.map(row=>({...row}));
  assert.throws(
    ()=>upsertTransferMovement(invalidStore,{...transfer(`invalid-${missingCostRate}`,700),costRate:missingCostRate},{...helpers,entryRate:missingCostRate}),
    error=>error.statusCode===400&&error.code==="TRANSACTION_COST_RATE_REQUIRED"&&/سعر تكلفة الحوالة/.test(error.message)
  );
  assert.deepEqual(invalidStore.treasuryMovements,before);
}

const diagnosticStore={
  treasuryMovements:[
    {id:"legacy-transfer-in",sourceKey:"TRANSFER:legacy-transaction",sourceType:"TRANSFER",direction:"IN",currency:"USD",quantity:700,costRate:0,createdAt:"2025-01-01"},
    {id:"legacy-manual-in",sourceKey:"ADJUSTMENT:legacy-manual-in",sourceType:"MANUAL_ADJUSTMENT",direction:"IN",currency:"EUR",quantity:50,createdAt:"2025-01-02"},
    incoming(25,1.40,"valid-in")
  ],
  transactions:[{id:"legacy-transaction",amount:700,currency:"USD",costRate:1.40,finalRate:1.43}]
};
const diagnosticReport=diagnoseInvalidTreasuryInMovements(diagnosticStore);
assert.equal(diagnosticReport.total,2);
assert.deepEqual(diagnosticReport.invalidTransfers.map(row=>({movementId:row.movementId,transactionId:row.transactionId,currentCostRate:row.currentCostRate,expectedCostRate:row.expectedCostRate})),[
  {movementId:"legacy-transfer-in",transactionId:"legacy-transaction",currentCostRate:0,expectedCostRate:1.40}
]);
assert.deepEqual(diagnosticReport.invalidOther.map(row=>row.movementId),["legacy-manual-in"]);
assert.equal(diagnosticStore.treasuryMovements[0].costRate,0);

const productionMovementId="5a9ff1cb-859f-4c0c-a669-f78ac2fc0c5f";
const productionTransactionId="0eef944c-a766-448d-970c-3c8e98b4c256";
const untouchedMovement=incoming(250,1.40,"repair-untouched");
const untouchedBefore={...untouchedMovement};
const repairMovements=[
  untouchedMovement,
  {id:productionMovementId,sourceType:"TRANSFER",sourceKey:`TRANSFER:${productionTransactionId}`,transactionId:productionTransactionId,direction:"IN",currency:"USD",quantity:450,costRate:null,createdAt:"2026-01-02",occurredAt:"2026-01-02"}
];
// tenantView exposes Array-like collections through proxies. Such proxies
// cannot be passed to structuredClone, but Array.from produces a safe snapshot.
const repairStore={treasuryMovements:new Proxy(repairMovements,{}),transactions:new Proxy([{id:productionTransactionId,amount:450,currency:"USD",costRate:1.3763,finalRate:1.41}],{})};
assert.throws(()=>structuredClone(repairStore.treasuryMovements),error=>error?.name==="DataCloneError");
const repairBefore=JSON.stringify(repairStore);
const dryRun=planTreasuryEntryRateRepair(repairStore,productionMovementId);
assert.equal(dryRun.repairable,true);assert.equal(dryRun.currentCostRate,null);assert.equal(dryRun.expectedCostRate,1.3763);
assert.equal(dryRun.expectedBalanceAfterRebuild.balance,700);assert.equal(JSON.stringify(repairStore),repairBefore);
const applied=applyTreasuryEntryRateRepair(repairStore,productionMovementId,{confirmedExpectedCostRate:dryRun.expectedCostRate});
assert.equal(applied.status,"APPLIED");assert.equal(repairStore.treasuryMovements[1].costRate,1.3763);
assert.deepEqual(repairStore.treasuryMovements[0],untouchedBefore);
assert.equal(diagnoseInvalidTreasuryInMovements(repairStore).total,0);
assert.equal(applyTreasuryEntryRateRepair(repairStore,productionMovementId,{confirmedExpectedCostRate:dryRun.expectedCostRate}).status,"ALREADY_REPAIRED");

const period={start:"2026-08-20",nextStart:"2026-09-20",timeZone:"America/Toronto"};
const periodMovement=(id,direction,occurredAt,realizedFx,realizedProfit,realizedLoss)=>({id,sourceKey:`PERIOD:${id}`,sourceType:"CASH_DELIVERY",direction,movementType:direction,currency:"USD",quantity:1,occurredAt,createdAt:occurredAt,realizedFx,realizedProfit,realizedLoss});
const periodStore={treasuryMovements:[
  periodMovement("before","OUT","2026-08-19",100,100,0),
  periodMovement("at-start","OUT","2026-08-20",10,10,0),
  periodMovement("profit","OUT","2026-08-25",25,25,0),
  periodMovement("loss","OUT","2026-09-01",-8,0,8),
  periodMovement("last-day","OUT","2026-09-19",3,3,0),
  periodMovement("next-cycle","OUT","2026-09-20",50,50,0),
  periodMovement("in-period","IN","2026-08-26",999,999,0)
]};
assert.deepEqual(treasuryRealizedForInventoryPeriod(periodStore,period),{realizedFx:30,realizedProfit:38,realizedLoss:8,outCount:4});
assert.deepEqual(treasuryRealizedForInventoryPeriod(periodStore,{...period,start:"2026-09-20",nextStart:"2026-10-20"}),{realizedFx:50,realizedProfit:50,realizedLoss:0,outCount:1});
const fixedSnapshot=treasuryInventorySnapshot(periodStore,{...period,end:"2026-09-19"},{inventoryId:"inventory-aug",finalizedAt:"2026-09-20T12:00:00Z"});
assert.deepEqual(fixedSnapshot,{inventoryId:"inventory-aug",periodStart:"2026-08-20",periodEnd:"2026-09-19",nextPeriodStart:"2026-09-20",baseCurrency:"CAD",treasuryRealizedProfit:38,treasuryRealizedLoss:8,treasuryRealizedFx:30,treasuryOutCount:4,status:"FINALIZED",finalizedAt:"2026-09-20T12:00:00Z"});
periodStore.treasuryMovements.push(periodMovement("later","OUT","2026-09-21",900,900,0));
assert.equal(fixedSnapshot.treasuryRealizedFx,30);
const averageBefore=rebuildTreasury({treasuryMovements:[incoming(250,1.40,"period-average")]})[0].averageCost;
treasuryRealizedForInventoryPeriod(periodStore,period);
const averageAfter=rebuildTreasury({treasuryMovements:[incoming(250,1.40,"period-average-after")]})[0].averageCost;
assert.equal(averageBefore,averageAfter);

const generalDeliveryStore={treasuryMovements:[incoming(6769,1.376141,"general-opening")]};
const transactionState=JSON.stringify([{id:"legacy-transfer",amount:2692,costRate:1.2}]);
const generalDelivery=createGeneralCashDeliveryMovement(generalDeliveryStore,{currency:"USD",quantity:2692,deliveryRate:1.4,occurredAt:"2026-08-25T12:00:00Z",note:"delivery"},helpers);
const generalBalance=rebuildTreasury(generalDeliveryStore)[0];
assert.equal(generalDelivery.transactionId,null);
assert.equal(generalDelivery.sourceType,"CASH_DELIVERY");
assert.match(generalDelivery.sourceKey,/^CASH_DELIVERY:GENERAL:/);
assert.equal(generalBalance.balance,4077);
assert(Math.abs(generalDelivery.realizedFx-(2692*(1.4-1.376141)))<0.001);
assert(Math.abs(generalBalance.averageCost-1.376141)<1e-6);
assert.equal(JSON.stringify([{id:"legacy-transfer",amount:2692,costRate:1.2}]),transactionState);

for(const invalid of [{quantity:0,deliveryRate:1.4},{quantity:-1,deliveryRate:1.4},{quantity:1,deliveryRate:0},{quantity:1,deliveryRate:-1}]){
  const invalidStore={treasuryMovements:[incoming(10,1.4,`invalid-general-${invalid.quantity}-${invalid.deliveryRate}`)]};
  const beforeInvalid=JSON.stringify(invalidStore);
  assert.throws(()=>createGeneralCashDeliveryMovement(invalidStore,{currency:"USD",...invalid},helpers));
  assert.equal(JSON.stringify(invalidStore),beforeInvalid);
}
const insufficientStore={treasuryMovements:[incoming(10,1.4,"insufficient-general")]};
const insufficientBefore=JSON.stringify(insufficientStore);
assert.throws(()=>createGeneralCashDeliveryMovement(insufficientStore,{currency:"USD",quantity:11,deliveryRate:1.5},helpers),error=>error.code==="TREASURY_INSUFFICIENT_BALANCE");
assert.equal(JSON.stringify(insufficientStore),insufficientBefore);

for(const rateValue of [1.5,1.3,1.4]){
  const caseStore={treasuryMovements:[incoming(10,1.4,`rate-case-${rateValue}`)]};
  const row=createGeneralCashDeliveryMovement(caseStore,{currency:"USD",quantity:10,deliveryRate:rateValue},helpers);
  assert.equal(rebuildTreasury(caseStore)[0].balance,0);
  assert.equal(Math.sign(row.realizedFx),Math.sign(rateValue-1.4));
}
const cadOpening={...incoming(5000,1,"cad-opening"),currency:"CAD"};
const multiCurrencyStore={treasuryMovements:[incoming(6769,1.376141,"usd-multi-opening"),cadOpening]};
const cadDelivery=createGeneralCashDeliveryMovement(multiCurrencyStore,{currency:"CAD",quantity:1200,deliveryRate:1,occurredAt:"2026-08-26T12:00:00Z"},helpers);
const multiBalances=rebuildTreasury(multiCurrencyStore);
assert.equal(multiBalances.find(row=>row.currency==="CAD").balance,3800);
assert.equal(multiBalances.find(row=>row.currency==="USD").balance,6769);
assert.equal(cadDelivery.deliveryRate,1);
assert.equal(cadDelivery.realizedFx,0);
assert.equal(cadDelivery.currency,"CAD");
assert.equal(treasuryRealizedForInventoryPeriod(multiCurrencyStore,period).outCount,1);
assert.equal(treasuryProfitForRange(multiCurrencyStore,{from:"2026-08-20",to:"2026-09-19"}),0);

for(const [availableCurrency,requestedCurrency] of [["CAD","USD"],["USD","CAD"]]){
  const isolatedOpening={...incoming(100,availableCurrency==="CAD"?1:1.4,`isolated-${availableCurrency}`),currency:availableCurrency};
  const isolatedStore={treasuryMovements:[isolatedOpening]};
  const isolatedBefore=JSON.stringify(isolatedStore);
  assert.throws(()=>createGeneralCashDeliveryMovement(isolatedStore,{currency:requestedCurrency,quantity:1,deliveryRate:1.5},helpers),error=>error.code==="TREASURY_INSUFFICIENT_BALANCE");
  assert.equal(JSON.stringify(isolatedStore),isolatedBefore);
}

const editStore={treasuryMovements:[]};
const firstEdit=transfer("edit",700),secondEdit=transfer("edit",800);
upsertTransferMovement(editStore,firstEdit,transferOptions(firstEdit));
upsertTransferMovement(editStore,secondEdit,transferOptions(secondEdit));
assert.equal(editStore.treasuryMovements.filter(row=>row.sourceKey==="TRANSFER:edit").length,1);
assert.equal(balance(editStore),800);
cancelTransferMovement(editStore,"edit",helpers);
assert.equal(balance(editStore),0);assert.equal(editStore.treasuryMovements[0].isCancelled,true);

const negativeStore={treasuryMovements:[legacyNegative(1000)]};
assert.equal(balance(negativeStore),-1000);assert.equal(balance(negativeStore),-1000);
const legacyWrongTransfer={id:"legacy-wrong",sourceKey:"TRANSFER:legacy-wrong",sourceType:"TRANSFER",movementType:"OUT",direction:"OUT",currency:"USD",quantity:700,costRate:140,deliveryRate:140,occurredAt:"2026-01-02",createdAt:"2026-01-02"};
negativeStore.treasuryMovements.push(legacyWrongTransfer);
assert.equal(balance(negativeStore),-300);assert.equal(legacyWrongTransfer.direction,"IN");assert.equal(balance(negativeStore),-300);

const weightedSecondIn={...incoming(5000,137,"weighted-in-2"),occurredAt:"2026-01-03",createdAt:"2026-01-03"};
const weighted={treasuryMovements:[incoming(10000,140,"weighted-in-1"),{id:"weighted-out-1",sourceKey:"CASH_DELIVERY:w1",sourceType:"CASH_DELIVERY",movementType:"OUT",direction:"OUT",currency:"USD",quantity:4000,deliveryRate:142,occurredAt:"2026-01-02",createdAt:"2026-01-02"},weightedSecondIn,{id:"weighted-out-2",sourceKey:"CASH_DELIVERY:w2",sourceType:"CASH_DELIVERY",movementType:"OUT",direction:"OUT",currency:"USD",quantity:3000,deliveryRate:135,occurredAt:"2026-01-04",createdAt:"2026-01-04"}]};
const weightedBalances=rebuildTreasury(weighted);
assert.equal(weighted.treasuryMovements[1].realizedFx,8000);assert.equal(weighted.treasuryMovements[2].totalCostAfter,1525000);
assert(Math.abs(weighted.treasuryMovements[2].averageCostAfter-138.63636364)<1e-8);
assert(Math.abs(weighted.treasuryMovements[3].realizedFx-(-10909.091))<0.001);
assert(Math.abs(weightedBalances[0].averageCost-138.63636364)<1e-8);

// CAD cash model: transfers add CAD with a USD basis, and CAD deliveries use
// division because rates are expressed as CAD per USD.
const cadTransferStore={treasuryMovements:[]};
const cadTransferOne={...transfer("cad-basis-1",5000,1.36),finalRate:1.36};
const cadTransferTwo={...transfer("cad-basis-2",5000,1.38),finalRate:1.38,transferDate:"2026-01-03"};
const cadInOne=upsertTransferMovement(cadTransferStore,cadTransferOne,{...helpers,entryRate:1.36,cadAmountReceived:6800});
const cadInTwo=upsertTransferMovement(cadTransferStore,cadTransferTwo,{...helpers,entryRate:1.38,cadAmountReceived:6900});
const cadWeightedBalance=rebuildTreasury(cadTransferStore).find(row=>row.currency==="CAD");
assert.equal(cadInOne.currency,"CAD");assert.equal(cadInOne.usdBasis,5000);
assert.equal(cadInTwo.usdBasis,5000);
assert.equal(cadWeightedBalance.balance,13700);
assert.equal(cadWeightedBalance.totalUsdBasis,10000);
assert.equal(cadWeightedBalance.averageRateCadPerUsd,1.37);

const cadCase=(averageRate,deliveryRate)=>{
  const opening={id:`cad-${averageRate}-${deliveryRate}`,sourceKey:`CAD:${averageRate}:${deliveryRate}`,sourceType:"MANUAL_ADJUSTMENT",direction:"IN",movementType:"IN",currency:"CAD",quantity:9600,costRate:averageRate,usdBasis:9600/averageRate,accountingModel:"CAD_CASH_USD_BASIS",occurredAt:"2026-08-23T10:00:00Z",createdAt:"2026-08-23T10:00:00Z"};
  const store={treasuryMovements:[opening]};
  const row=createGeneralCashDeliveryMovement(store,{currency:"CAD",quantity:9600,deliveryRate,occurredAt:"2026-08-23T16:00:00Z"},helpers);
  return {row,balance:rebuildTreasury(store).find(item=>item.currency==="CAD")};
};
const cadProfit=cadCase(1.40,1.38);
assert(Math.abs(cadProfit.row.deliveryUsd-6956.521739)<0.001);
assert(Math.abs(cadProfit.row.costUsd-6857.142857)<0.001);
assert(cadProfit.row.realizedFxUsd>99.37&&cadProfit.row.realizedFxUsd<99.39);
assert(cadProfit.row.realizedFxCad>0);assert.equal(cadProfit.balance.balance,0);
const cadLoss=cadCase(1.36,1.38);
assert(cadLoss.row.realizedFxUsd<0);assert(cadLoss.row.realizedFxCad<0);
const cadEven=cadCase(1.38,1.38);
assert.equal(cadEven.row.realizedFxUsd,0);assert.equal(cadEven.row.realizedFxCad,0);

const cadPartialStore={treasuryMovements:[{id:"cad-partial-in",sourceKey:"CAD:PARTIAL",sourceType:"MANUAL_ADJUSTMENT",direction:"IN",currency:"CAD",quantity:12000,costRate:1.4,usdBasis:12000/1.4,accountingModel:"CAD_CASH_USD_BASIS",occurredAt:"2026-08-22",createdAt:"2026-08-22"}]};
createGeneralCashDeliveryMovement(cadPartialStore,{currency:"CAD",quantity:9600,deliveryRate:1.38,occurredAt:"2026-08-23"},helpers);
const cadPartialBalance=rebuildTreasury(cadPartialStore).find(row=>row.currency==="CAD");
assert.equal(cadPartialBalance.balance,2400);
assert(Math.abs(cadPartialBalance.averageRateCadPerUsd-1.4)<1e-6);

const backfillTransactions=[
  {id:"backfill-1",amount:1000,costRate:1.36,finalRate:1.36,status:"COMPLETED",transferDate:"2026-01-01",totalProfit:111},
  {id:"backfill-2",amount:1000,costRate:1.38,finalRate:1.38,status:"COMPLETED",transferDate:"2026-01-02",totalProfit:222},
  {id:"backfill-3",amount:500,costRate:1.40,finalRate:1.40,status:"PENDING",transferDate:"2026-01-03",totalProfit:333},
  {id:"backfill-present",amount:700,costRate:1.37,finalRate:1.39,status:"COMPLETED",transferDate:"2026-01-04"},
  {id:"backfill-invalid",amount:100,costRate:0,finalRate:1.40,status:"COMPLETED",transferDate:"2026-01-05"},
  {id:"backfill-cancelled",amount:100,costRate:1.35,finalRate:1.40,status:"CANCELLED",transferDate:"2026-01-06"}
];
const legacyLinked={id:"legacy-linked-usd",sourceKey:"TRANSFER:backfill-present",sourceType:"TRANSFER",transactionId:"backfill-present",direction:"IN",currency:"USD",quantity:700,costRate:1.37,occurredAt:"2026-01-04",createdAt:"2026-01-04"};
const backfillStore={transactions:backfillTransactions.map(row=>({...row})),treasuryMovements:[legacyLinked]};
const transactionsBeforeBackfill=JSON.stringify(backfillStore.transactions);
const storeBeforeDryRun=JSON.stringify(backfillStore);
const backfillPlan=planCadTreasuryBackfill(backfillStore);
assert.equal(JSON.stringify(backfillStore),storeBeforeDryRun);
assert.equal(backfillPlan.examined,5);assert.equal(backfillPlan.eligible,3);assert.equal(backfillPlan.alreadyPresent,1);assert.equal(backfillPlan.invalid,1);
assert.equal(backfillPlan.legacyUsdConversionRequired,true);assert.equal(backfillPlan.legacyUsdTransferCount,1);assert.equal(backfillPlan.legacyUsdQuantity,700);
assert.equal(backfillPlan.cadToAdd,3440);assert.equal(backfillPlan.usdBasisToAdd,2500);assert.equal(backfillPlan.expectedAverageRate,1.376);
const appliedBackfill=applyCadTreasuryBackfill(backfillStore,{fingerprint:backfillPlan.fingerprint,...helpers});
assert.equal(appliedBackfill.status,"APPLIED");assert.equal(appliedBackfill.applied,3);
assert.equal(JSON.stringify(backfillStore.transactions),transactionsBeforeBackfill);
const backfillCadBalance=rebuildTreasury(backfillStore).find(row=>row.currency==="CAD");
assert.equal(backfillCadBalance.balance,3440);assert.equal(backfillCadBalance.totalUsdBasis,2500);assert.equal(backfillCadBalance.averageRateCadPerUsd,1.376);
const backfillRows=backfillStore.treasuryMovements.filter(row=>row.sourceType==="TRANSFER_BACKFILL");
assert.equal(backfillRows.length,3);assert(backfillRows.every(row=>row.realizedFx===0&&row.realizedProfit===0&&row.realizedLoss===0));
assert.equal(backfillStore.treasuryMovements.filter(row=>row.sourceKey==="TRANSFER:backfill-present").length,1);
const secondBackfill=applyCadTreasuryBackfill(backfillStore,{fingerprint:backfillPlan.fingerprint,...helpers});
assert.equal(secondBackfill.status,"ALREADY_APPLIED");assert.equal(secondBackfill.applied,0);assert.equal(backfillStore.treasuryMovements.filter(row=>row.sourceType==="TRANSFER_BACKFILL").length,3);

const conversionTransaction={id:"legacy-convert",amount:700,costRate:1.4,finalRate:1.43,status:"COMPLETED",transferDate:"2026-02-10",totalProfit:21};
const legacyMovement={id:"legacy-convert-movement",sourceKey:"TRANSFER:legacy-convert",sourceType:"TRANSFER",transactionId:"legacy-convert",direction:"IN",movementType:"IN",currency:"USD",quantity:700,costRate:1.4,occurredAt:"2026-02-10",createdAt:"2026-02-10",createdBy:"old-user"};
const manualUsd=incoming(50,1.4,"manual-usd-preserved");
const conversionStore={transactions:[conversionTransaction],treasuryMovements:[manualUsd,legacyMovement]};
const conversionDryBefore=JSON.stringify(conversionStore);
const conversionPlan=planLegacyUsdToCadConversion(conversionStore);
assert.equal(JSON.stringify(conversionStore),conversionDryBefore);
assert.equal(conversionPlan.repairable,true);assert.equal(conversionPlan.repairableCount,1);assert.equal(conversionPlan.legacyUsdTotalBefore,700);
assert.equal(conversionPlan.convertedCadTotal,1001);assert.equal(conversionPlan.convertedUsdBasisTotal,715);
assert.equal(conversionPlan.expectedUsdBalanceAfterConversion,50);assert.equal(conversionPlan.expectedUsdLegacyBalanceAfterConversion,0);
const transactionBeforeConversion=JSON.stringify(conversionTransaction);
const conversionApplied=applyLegacyUsdToCadConversion(conversionStore,{fingerprint:conversionPlan.fingerprint,expectedCount:1,summary:conversionPlan.summary,...helpers});
assert.equal(conversionApplied.status,"APPLIED");assert.equal(conversionApplied.applied,1);
assert.equal(JSON.stringify(conversionTransaction),transactionBeforeConversion);
assert.equal(legacyMovement.id,"legacy-convert-movement");assert.equal(legacyMovement.sourceKey,"TRANSFER:legacy-convert");assert.equal(legacyMovement.occurredAt,"2026-02-10");
assert.equal(legacyMovement.currency,"CAD");assert.equal(legacyMovement.quantity,1001);assert.equal(legacyMovement.costRate,1.4);assert.equal(legacyMovement.usdBasis,715);
assert.equal(legacyMovement.accountingModel,"CAD_CASH_USD_BASIS");assert.equal(legacyMovement.legacyCurrency,"USD");assert.equal(legacyMovement.legacyQuantity,700);
assert.equal(legacyMovement.realizedFx,0);assert.equal(legacyMovement.realizedProfit,0);assert.equal(legacyMovement.realizedLoss,0);
assert.equal(manualUsd.currency,"USD");assert.equal(manualUsd.quantity,50);
assert.equal(planCadTreasuryBackfill(conversionStore).legacyUsdTransferCount,0);
assert.equal(planCadTreasuryBackfill(conversionStore).alreadyPresent,1);
assert.equal(applyLegacyUsdToCadConversion(conversionStore,{fingerprint:conversionPlan.fingerprint,expectedCount:1,summary:conversionPlan.summary,...helpers}).status,"ALREADY_APPLIED");

const mismatchStore={transactions:[{...conversionTransaction,id:"mismatch"}],treasuryMovements:[{...legacyMovement,id:"mismatch-movement",transactionId:"mismatch",sourceKey:"TRANSFER:mismatch",currency:"USD",quantity:700,legacyConversion:false,conversionVersion:null}]};
const mismatchPlan=planLegacyUsdToCadConversion(mismatchStore);
assert.throws(()=>applyLegacyUsdToCadConversion(mismatchStore,{fingerprint:"wrong",expectedCount:1,summary:mismatchPlan.summary,...helpers}),error=>error.code==="TREASURY_LEGACY_CONVERSION_FINGERPRINT_MISMATCH");
assert.equal(mismatchStore.treasuryMovements[0].currency,"USD");

const duplicateStore={transactions:[{...conversionTransaction,id:"duplicate"}],treasuryMovements:[
  {...legacyMovement,id:"duplicate-usd",transactionId:"duplicate",sourceKey:"TRANSFER:duplicate",currency:"USD",quantity:700,legacyConversion:false,conversionVersion:null},
  {id:"duplicate-cad",sourceKey:"TRANSFER_BACKFILL:duplicate",sourceType:"TRANSFER_BACKFILL",transactionId:"duplicate",direction:"IN",currency:"CAD",quantity:1001,costRate:1.4,usdBasis:715,occurredAt:"2026-02-11",createdAt:"2026-02-11"}
]};
const duplicatePlan=planLegacyUsdToCadConversion(duplicateStore);
assert.equal(duplicatePlan.repairable,false);assert.equal(duplicatePlan.duplicateCadRepresentations,1);assert.equal(duplicatePlan.nonRepairable[0].reason,"DUPLICATE_CAD_REPRESENTATION");

const rollbackStore={transactions:[{...conversionTransaction,id:"rollback"}],treasuryMovements:[
  {...legacyMovement,id:"rollback-transfer",transactionId:"rollback",sourceKey:"TRANSFER:rollback",currency:"USD",quantity:700,legacyConversion:false,conversionVersion:null},
  {id:"blocking-out",sourceKey:"CASH_DELIVERY:blocking",sourceType:"CASH_DELIVERY",direction:"OUT",currency:"EUR",quantity:10,deliveryRate:1.5,occurredAt:"2026-01-01",createdAt:"2026-01-01"}
]};
const rollbackBefore=JSON.stringify(rollbackStore);
const rollbackPlan=planLegacyUsdToCadConversion(rollbackStore);
assert.equal(rollbackPlan.repairable,false);assert(rollbackPlan.rebuildError);
assert.throws(()=>applyLegacyUsdToCadConversion(rollbackStore,{fingerprint:rollbackPlan.fingerprint,expectedCount:1,summary:rollbackPlan.summary,...helpers}),error=>error.code==="TREASURY_LEGACY_CONVERSION_NOT_REPAIRABLE");
assert.equal(JSON.stringify(rollbackStore),rollbackBefore);

const finalizedInventory={id:"inventory-july",month:"2026-07",periodStart:"2026-07-01",periodEnd:"2026-07-31",status:"FINALIZED",finalInventory:9999,treasuryRealizedFx:45};
const carryStore={treasuryMovements:[],monthlyInventories:[finalizedInventory]};
const finalizedBefore=JSON.stringify(finalizedInventory);
const carryMovement=createInventoryCarryForwardMovement(carryStore,{currency:"CAD",quantity:5000,averageRate:1.37,inventoryId:"inventory-july",inventoryDate:"2026-07-31",note:"opening cash"},helpers);
const carryBalance=rebuildTreasury(carryStore).find(row=>row.currency==="CAD");
assert.equal(carryMovement.sourceType,"INVENTORY_CARRY_FORWARD");assert.equal(carryMovement.sourceKey,"INVENTORY_CARRY_FORWARD:inventory-july:CAD");
assert.equal(carryMovement.transactionId,null);assert(Math.abs(carryMovement.usdBasis-(5000/1.37))<0.001);
assert.equal(carryBalance.balance,5000);assert(Math.abs(carryBalance.averageRateCadPerUsd-1.37)<0.000001);
assert.equal(carryMovement.realizedFx,0);assert.equal(carryMovement.realizedProfit,0);assert.equal(carryMovement.realizedLoss,0);
assert.equal(treasuryProfitForRange(carryStore,{from:"2026-01-01",to:"2026-12-31"}),0);
assert.deepEqual(treasuryRealizedForInventoryPeriod(carryStore,{start:"2026-08-01",nextStart:"2026-09-01",timeZone:"America/Toronto"}),{realizedFx:0,realizedProfit:0,realizedLoss:0,outCount:0});
assert.equal(JSON.stringify(finalizedInventory),finalizedBefore);
const carryBeforeDuplicate=JSON.stringify(carryStore);
assert.throws(()=>createInventoryCarryForwardMovement(carryStore,{currency:"CAD",quantity:5000,averageRate:1.37,inventoryId:"inventory-july",inventoryDate:"2026-07-31"},helpers),error=>error.code==="TREASURY_CARRY_FORWARD_DUPLICATE");
assert.equal(JSON.stringify(carryStore),carryBeforeDuplicate);

const mergedCarryStore={treasuryMovements:[{id:"existing-cad",sourceKey:"OPENING:CAD",sourceType:"MANUAL_ADJUSTMENT",direction:"IN",currency:"CAD",quantity:2740,costRate:1.37,usdBasis:2000,accountingModel:"CAD_CASH_USD_BASIS",occurredAt:"2026-08-01",createdAt:"2026-08-01"}],monthlyInventories:[{...finalizedInventory,id:"inventory-aug"}]};
createInventoryCarryForwardMovement(mergedCarryStore,{currency:"CAD",quantity:6900,averageRate:1.38,inventoryId:"inventory-aug",inventoryDate:"2026-08-31"},helpers);
const mergedCarryBalance=rebuildTreasury(mergedCarryStore).find(row=>row.currency==="CAD");
assert.equal(mergedCarryBalance.balance,9640);assert.equal(mergedCarryBalance.totalUsdBasis,7000);assert.equal(mergedCarryBalance.averageRateCadPerUsd,1.37714286);

const usdCarryStore={treasuryMovements:[],monthlyInventories:[]};
createInventoryCarryForwardMovement(usdCarryStore,{currency:"USD",quantity:1000,averageRate:1.4,inventoryDate:"2026-06-30"},helpers);
const usdCarryBalance=rebuildTreasury(usdCarryStore).find(row=>row.currency==="USD");
assert.equal(usdCarryBalance.balance,1000);assert.equal(usdCarryBalance.totalCost,1400);assert.equal(usdCarryBalance.averageCost,1.4);
console.log("Treasury tests passed: A-P");
