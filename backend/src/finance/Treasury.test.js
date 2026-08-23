"use strict";
const assert = require("assert");
const { rebuildTreasury, upsertTransferMovement, upsertCashDeliveryMovement, cancelTransferMovement, cancelCashDeliveryMovement, treasuryProfitForRange } = require("./Treasury");
const { transactionFinancials } = require("./TransactionFinancials");
let sequence = 0;
const helpers = { id: () => `m${++sequence}`, now: () => `2026-01-01T00:00:0${sequence}Z`, userId: "u1" };
const store = { treasuryMovements: [
  { id:"in1", sourceKey:"ADJ:in1", movementType:"ADJUSTMENT", direction:"IN", currency:"USD", quantity:10000, costRate:140, occurredAt:"2026-01-01", createdAt:"2026-01-01", reason:"opening", createdBy:"u1" },
  { id:"out1", sourceKey:"ADJ:out1", movementType:"ADJUSTMENT", direction:"OUT", currency:"USD", quantity:4000, deliveryRate:142, occurredAt:"2026-01-02", createdAt:"2026-01-02", reason:"delivery", createdBy:"u1" },
  { id:"in2", sourceKey:"ADJ:in2", movementType:"ADJUSTMENT", direction:"IN", currency:"USD", quantity:5000, costRate:137, occurredAt:"2026-01-03", createdAt:"2026-01-03", reason:"purchase", createdBy:"u1" },
  { id:"out2", sourceKey:"ADJ:out2", movementType:"ADJUSTMENT", direction:"OUT", currency:"USD", quantity:3000, deliveryRate:135, occurredAt:"2026-01-04", createdAt:"2026-01-04", reason:"delivery", createdBy:"u1" }
] };
let balances = rebuildTreasury(store);
assert.equal(store.treasuryMovements[1].realizedFx, 8000);
assert.equal(store.treasuryMovements[1].balanceAfter, 6000);
assert.equal(store.treasuryMovements[1].averageCostAfter, 140);
assert.equal(store.treasuryMovements[2].balanceAfter, 11000);
assert.equal(store.treasuryMovements[2].totalCostAfter, 1525000);
assert(Math.abs(store.treasuryMovements[2].averageCostAfter - 138.63636364) < 0.00000001);
assert(Math.abs(store.treasuryMovements[3].realizedFx - (-10909.091)) < 0.001);
assert(Math.abs(balances[0].averageCost - 138.63636364) < 0.00000001);

const transferStore = { treasuryMovements: [{ id:"fund", sourceKey:"ADJ:fund", movementType:"ADJUSTMENT", direction:"IN", currency:"EUR", quantity:100, costRate:2, occurredAt:"2026-01-01", createdAt:"2026-01-01" }] };
const tx = { id:"t1", number:"TRX-1", currency:"EUR", amount:10, beneficiaryReceives:10, costRate:2, transferDate:"2026-01-02" };
upsertTransferMovement(transferStore, tx, helpers);
upsertTransferMovement(transferStore, {...tx, amount:20, beneficiaryReceives:20}, {...helpers, deliveryRate:3});
assert.equal(transferStore.treasuryMovements.filter(x=>x.sourceKey==="TRANSFER:t1").length, 1, "duplicate treasury movement");
assert.equal(transferStore.treasuryMovements.find(x=>x.sourceKey==="TRANSFER:t1").quantity, 20, "edit updates movement");
assert.equal(transferStore.treasuryMovements.find(x=>x.sourceKey==="TRANSFER:t1").direction, "IN");
assert.equal(rebuildTreasury(transferStore)[0].balance, 120);
assert.equal(treasuryProfitForRange(transferStore,{from:"2026-01-01",to:"2026-01-31"}), 0);
const originalTransferProfit=transactionFinancials({...tx,finalRate:2.8}).totalProfit;
assert.equal(transactionFinancials({...tx,finalRate:2.8,deliveryRate:99}).totalProfit,originalTransferProfit,"treasury delivery rate must not alter transfer profit");
const delivery=upsertCashDeliveryMovement(transferStore,tx,{...helpers,quantity:20,deliveryRate:2.5,occurredAt:"2026-01-03"});
assert.equal(delivery.direction,"OUT");
assert.equal(rebuildTreasury(transferStore)[0].balance,100);
assert.equal(treasuryProfitForRange(transferStore,{from:"2026-01-01",to:"2026-01-31"}),10);
assert.equal(originalTransferProfit+treasuryProfitForRange(transferStore,{from:"2026-01-01",to:"2026-01-31"}),18,"net profit includes treasury FX exactly once");
assert.throws(()=>upsertCashDeliveryMovement({treasuryMovements:[]},tx,{...helpers,quantity:20,deliveryRate:2.5}),error=>error.code==="TREASURY_INSUFFICIENT_BALANCE");
cancelTransferMovement(transferStore,"t1",helpers);
assert.equal(transferStore.treasuryMovements.find(x=>x.sourceKey==="TRANSFER:t1").isCancelled,true);
assert.equal(rebuildTreasury(transferStore)[0].balance,80);
assert.equal(transferStore.treasuryMovements.find(x=>x.sourceKey==="CASH_DELIVERY:t1").isCancelled,false);
cancelCashDeliveryMovement(transferStore,"t1",helpers);
assert.equal(rebuildTreasury(transferStore)[0].balance,100);
assert.throws(()=>rebuildTreasury({treasuryMovements:[{id:"x",direction:"OUT",currency:"USD",quantity:1,deliveryRate:1}]}),/الرصيد المتاح/);

const transitionStore={treasuryMovements:[{id:"opening",sourceKey:"ADJUSTMENT:opening",movementType:"ADJUSTMENT",direction:"IN",currency:"USD",quantity:100,costRate:2,occurredAt:"2026-01-01",createdAt:"2026-01-01"}]};
const changing={id:"changing",number:"TRX-changing",currency:"USD",amount:20,beneficiaryReceives:20,costRate:3,treasuryEffect:"IN",transferDate:"2026-01-02"};
let linked=upsertTransferMovement(transitionStore,changing,helpers);
assert.equal(linked.direction,"IN");
assert.equal(linked.realizedFx,0,"IN never realizes FX profit or loss");
assert.equal(rebuildTreasury(transitionStore)[0].balance,120);
assert.equal(rebuildTreasury(transitionStore)[0].totalCost,260);
changing.treasuryEffect="OUT";changing.deliveryRate=4;
linked=upsertTransferMovement(transitionStore,changing,{...helpers,deliveryRate:4});
assert.equal(linked.direction,"IN");
assert.equal(transitionStore.treasuryMovements.filter(row=>row.sourceKey==="TRANSFER:changing").length,1,"editing a transfer must not create a duplicate IN");
assert.equal(rebuildTreasury(transitionStore)[0].balance,120);
cancelTransferMovement(transitionStore,"changing",helpers);
assert.equal(rebuildTreasury(transitionStore)[0].balance,100,"cancelling a transfer reverses its IN effect");
changing.treasuryEffect="IN";
linked=upsertTransferMovement(transitionStore,changing,helpers);
assert.equal(linked.isCancelled,false,"reactivating a transfer reuses the same movement");
assert.equal(transitionStore.treasuryMovements.filter(row=>row.sourceKey==="TRANSFER:changing").length,1);
assert.equal(rebuildTreasury(transitionStore)[0].balance,120);
assert.throws(()=>upsertTransferMovement({treasuryMovements:[{sourceKey:"TRANSFER:dup"},{sourceKey:"TRANSFER:dup",isCancelled:true}]},{id:"dup",treasuryEffect:"IN",currency:"USD",amount:1,costRate:1},helpers),/أكثر من حركة/);
console.log("Treasury tests passed");
