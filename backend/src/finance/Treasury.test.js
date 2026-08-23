"use strict";
const assert=require("assert");
const {rebuildTreasury,diagnoseInvalidTreasuryInMovements,planTreasuryEntryRateRepair,applyTreasuryEntryRateRepair,upsertTransferMovement,cancelTransferMovement,upsertCashDeliveryMovement,treasuryProfitForRange,treasuryRealizedForInventoryPeriod,treasuryInventorySnapshot}=require("./Treasury");
const {transactionFinancials}=require("./TransactionFinancials");
let sequence=0;
const helpers={id:()=>`m${++sequence}`,now:()=>`2026-01-10T00:00:${String(sequence).padStart(2,"0")}Z`,userId:"u1"};
const balance=(store,currency="USD")=>rebuildTreasury(store).find(row=>row.currency===currency)?.balance??0;
const incoming=(quantity,costRate=1,id=`in-${++sequence}`)=>({id,sourceKey:`ADJUSTMENT:${id}`,sourceType:"MANUAL_ADJUSTMENT",movementType:"ADJUSTMENT",direction:"IN",currency:"USD",quantity,costRate,occurredAt:"2026-01-01",createdAt:"2026-01-01"});
const legacyNegative=(quantity,id=`legacy-${++sequence}`)=>({id,sourceKey:`LEGACY:${id}`,sourceType:"LEGACY",movementType:"OUT",direction:"OUT",currency:"USD",quantity,deliveryRate:1,allowNegative:true,occurredAt:"2025-12-31",createdAt:"2025-12-31"});
const transfer=(id="t1",amount=700,costRate=140)=>({id,number:`TRX-${id}`,currency:"USD",amount,beneficiaryReceives:amount,costRate,transferDate:"2026-01-02"});
const transferOptions=(transaction,overrides={})=>({...helpers,entryRate:transactionFinancials(transaction).costRate,...overrides});

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
console.log("Treasury tests passed: A-N");
