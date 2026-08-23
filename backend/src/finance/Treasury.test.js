"use strict";
const assert=require("assert");
const {rebuildTreasury,upsertTransferMovement,cancelTransferMovement,upsertCashDeliveryMovement,treasuryProfitForRange}=require("./Treasury");
const {transactionFinancials}=require("./TransactionFinancials");
let sequence=0;
const helpers={id:()=>`m${++sequence}`,now:()=>`2026-01-10T00:00:${String(sequence).padStart(2,"0")}Z`,userId:"u1"};
const balance=(store,currency="USD")=>rebuildTreasury(store).find(row=>row.currency===currency)?.balance??0;
const incoming=(quantity,costRate=1,id=`in-${++sequence}`)=>({id,sourceKey:`ADJUSTMENT:${id}`,sourceType:"MANUAL_ADJUSTMENT",movementType:"ADJUSTMENT",direction:"IN",currency:"USD",quantity,costRate,occurredAt:"2026-01-01",createdAt:"2026-01-01"});
const legacyNegative=(quantity,id=`legacy-${++sequence}`)=>({id,sourceKey:`LEGACY:${id}`,sourceType:"LEGACY",movementType:"OUT",direction:"OUT",currency:"USD",quantity,deliveryRate:1,allowNegative:true,occurredAt:"2025-12-31",createdAt:"2025-12-31"});
const transfer=(id="t1",amount=700,costRate=140)=>({id,number:`TRX-${id}`,currency:"USD",amount,beneficiaryReceives:amount,costRate,transferDate:"2026-01-02"});

for(const [starting,expected] of [[250,950],[-250,450],[-1000,-300],[0,700]]){
  const store={treasuryMovements:starting>0?[incoming(starting)]:starting<0?[legacyNegative(-starting)]:[]};
  const movement=upsertTransferMovement(store,transfer(`start-${starting}`),helpers);
  assert.equal(movement.direction,"IN");assert.equal(movement.realizedFx,0);
  assert.equal(balance(store),expected,`${starting} + 700 must equal ${expected}`);
}

// Production regression: an existing USD 250 balance plus a newly registered
// USD 700 transfer must save as IN (950 total) without realized FX. Realized
// FX is created only by a later, explicit partial cash delivery.
const deliveryStore={treasuryMovements:[incoming(250,140)]};
const deliveredTransfer=transfer("delivery");
const registered=upsertTransferMovement(deliveryStore,deliveredTransfer,helpers);
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
const costRateMovement=upsertTransferMovement(costRateStore,costRateTransfer,helpers);
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
    ()=>upsertTransferMovement(invalidStore,{...transfer(`invalid-${missingCostRate}`,700),costRate:missingCostRate},helpers),
    error=>error.statusCode===400&&error.code==="TRANSACTION_COST_RATE_REQUIRED"&&/سعر تكلفة الحوالة/.test(error.message)
  );
  assert.deepEqual(invalidStore.treasuryMovements,before);
}

const editStore={treasuryMovements:[]};
upsertTransferMovement(editStore,transfer("edit",700),helpers);
upsertTransferMovement(editStore,transfer("edit",800),helpers);
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
