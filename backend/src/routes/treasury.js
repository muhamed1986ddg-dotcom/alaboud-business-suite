"use strict";
const APPROVED_TREASURY_REPAIR_MOVEMENT_ID="5a9ff1cb-859f-4c0c-a669-f78ac2fc0c5f";

function registerTreasuryRoutes(app, { auth, requirePermission, requireIdempotencyKey, readStore, mutateDurable, id, now, audit, rebuildTreasury, currentInventoryPeriod, treasuryRealizedForInventoryPeriod, diagnoseInvalidTreasuryInMovements, planTreasuryEntryRateRepair, applyTreasuryEntryRateRepair, upsertCashDeliveryMovement, createGeneralCashDeliveryMovement }) {
  app.get("/api/treasury/diagnostics/invalid-in", auth, (_req,res)=>{
    res.json(diagnoseInvalidTreasuryInMovements(readStore()));
  });

  app.get("/api/admin/treasury/repairs/:movementId",auth,requirePermission("admin.only"),(req,res)=>{
    if(req.params.movementId!==APPROVED_TREASURY_REPAIR_MOVEMENT_ID)return res.status(403).json({code:"TREASURY_REPAIR_NOT_APPROVED"});
    const plan=planTreasuryEntryRateRepair(readStore(),req.params.movementId);
    res.status(plan.status==="MOVEMENT_NOT_FOUND"?404:200).json(plan);
  });

  app.post("/api/admin/treasury/repairs/:movementId",auth,requirePermission("admin.only"),requireIdempotencyKey,async(req,res)=>{
    if(req.params.movementId!==APPROVED_TREASURY_REPAIR_MOVEMENT_ID)return res.status(403).json({code:"TREASURY_REPAIR_NOT_APPROVED"});
    if(req.body?.confirm!==true)return res.status(400).json({code:"EXPLICIT_CONFIRMATION_REQUIRED",message:"EXPLICIT_CONFIRMATION_REQUIRED"});
    const confirmedExpectedCostRate=Number(req.body?.expectedCostRate);
    const result=await mutateDurable(store=>{
      const repair=applyTreasuryEntryRateRepair(store,req.params.movementId,{confirmedExpectedCostRate});
      if(repair.status==="APPLIED")audit(store,req.user.id,"REPAIR","TREASURY_MOVEMENT",repair.movementId,{transactionId:repair.transactionId,previousCostRate:repair.currentCostRate,costRate:repair.expectedCostRate});
      return repair;
    });
    const status=result.status==="MOVEMENT_NOT_FOUND"?404:result.status==="APPLIED"||result.status==="ALREADY_REPAIRED"?200:409;
    res.status(status).json(result);
  });
  app.get("/api/treasury", auth, (req,res)=>{
    try{
      const store=readStore();
      const snapshot={treasuryMovements:Array.from(store.treasuryMovements||[]).map(row=>({...row}))};
      const balances=rebuildTreasury(snapshot);
      const period=currentInventoryPeriod(store.notificationSettings||{});
      const realized=treasuryRealizedForInventoryPeriod(snapshot,period);
      const finalizedInventoryPeriods=Array.from(store.monthlyInventories||[])
        .filter(row=>row&&!row.isDeleted)
        .map(row=>({
          inventoryId:row.id,
          month:row.month,
          periodStart:row.periodStart||null,
          periodEnd:row.periodEnd||null,
          finalizedAt:row.finalizedAt||row.fixedAt||null,
          baseCurrency:row.baseCurrency||"CAD",
          treasuryRealizedProfit:Number(row.treasuryRealizedProfit||0),
          treasuryRealizedLoss:Number(row.treasuryRealizedLoss||0),
          treasuryRealizedFx:Number(row.treasuryRealizedFx||0),
          treasuryOutCount:Number(row.treasuryOutCount||0),
          status:row.status||"FINALIZED",
          treasurySnapshotAvailable:Boolean(row.periodStart&&row.periodEnd&&row.treasuryRealizedFx!==undefined)
        }))
        .sort((a,b)=>String(b.finalizedAt||b.month||"").localeCompare(String(a.finalizedAt||a.month||"")));
      const movements=snapshot.treasuryMovements.slice().sort((a,b)=>String(b.occurredAt||b.createdAt||"").localeCompare(String(a.occurredAt||a.createdAt||"")));
      res.json({baseCurrency:"CAD",allowNegative:false,balances,movements,currentInventoryPeriod:{...period,...realized},finalizedInventoryPeriods});
    }catch(error){res.status(400).json({message:error.message||"تعذر تحميل الخزنة"});}
  });

  app.post("/api/treasury/adjustments", auth, requireIdempotencyKey, async (req,res)=>{
    try{
      const {direction,quantity,currency,costRate,deliveryRate,reason,occurredAt}=req.body||{};
      const normalizedDirection=String(direction||"").toUpperCase();
      const amount=Number(quantity),rateValue=Number(normalizedDirection==="IN"?costRate:deliveryRate);
      if(!["IN","OUT"].includes(normalizedDirection)||!Number.isFinite(amount)||amount<=0||!Number.isFinite(rateValue)||rateValue<=0||!String(reason||"").trim()){
        return res.status(400).json({message:"بيانات التسوية غير مكتملة؛ السبب والسعر والكمية مطلوبة"});
      }
      const movement=await mutateDurable(store=>{
        const movementId=id();
        const item={id:movementId,sourceKey:`ADJUSTMENT:${movementId}`,sourceType:"MANUAL_ADJUSTMENT",sourceLabel:"تسوية يدوية",movementType:"ADJUSTMENT",direction:normalizedDirection,currency:String(currency||"").toUpperCase(),quantity:amount,costRate:normalizedDirection==="IN"?rateValue:null,deliveryRate:normalizedDirection==="OUT"?rateValue:null,reason:String(reason).trim(),occurredAt:occurredAt||now(),createdAt:now(),createdBy:req.user.id};
        store.treasuryMovements.push(item);
        rebuildTreasury(store);
        audit(store,req.user.id,"CREATE","TREASURY_ADJUSTMENT",item.id,{direction:item.direction,currency:item.currency,quantity:item.quantity,reason:item.reason});
        return item;
      });
      res.status(201).json(movement);
    }catch(error){res.status(400).json({message:error.message||"تعذر حفظ تسوية الخزنة",code:error.code||null});}
  });

  app.post("/api/treasury/cash-deliveries",auth,requireIdempotencyKey,async(req,res)=>{
    try{
      const currency=String(req.body?.currency||"").trim().toUpperCase();
      const quantity=Number(req.body?.quantity);
      const deliveryRate=currency==="CAD"?1:Number(req.body?.deliveryRate);
      if(!["USD","CAD"].includes(currency)||!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(deliveryRate)||deliveryRate<=0){
        return res.status(400).json({code:"TREASURY_CASH_DELIVERY_INVALID",message:"العملة والكمية وسعر التسليم قيم مطلوبة ويجب أن تكون أكبر من صفر"});
      }
      const movement=await mutateDurable(store=>{
        const item=createGeneralCashDeliveryMovement(store,{currency,quantity,deliveryRate,occurredAt:req.body?.occurredAt||now(),note:req.body?.note},{id,now,userId:req.user.id});
        audit(store,req.user.id,"CASH_DELIVERY","TREASURY_MOVEMENT",item.id,{currency:item.currency,quantity:item.quantity,deliveryRate:item.deliveryRate,realizedFx:item.realizedFx});
        return item;
      });
      res.status(201).json(movement);
    }catch(error){
      const status=error?.code==="TREASURY_INSUFFICIENT_BALANCE"?409:400;
      res.status(status).json({message:error.message||"تعذر تنفيذ التسليم الكاش",code:error.code||null});
    }
  });

  // Backward-compatible endpoint for historical transaction-linked deliveries.
  app.post("/api/transactions/:id/cash-delivery",auth,requireIdempotencyKey,async(req,res)=>{
    try{
      const requestedQuantity=req.body?.quantity;
      const deliveryRate=Number(req.body?.deliveryRate);
      const quantity=requestedQuantity===undefined||requestedQuantity===""?null:Number(requestedQuantity);
      if((quantity!==null&&(!Number.isFinite(quantity)||quantity<=0))||!Number.isFinite(deliveryRate)||deliveryRate<=0){
        return res.status(400).json({message:"كمية التسليم وسعر الصرف الفعلي غير صالحين"});
      }
      const movement=await mutateDurable(store=>{
        const transaction=(store.transactions||[]).find(item=>item&&item.id===req.params.id&&!item.isDeleted&&item.status!=="CANCELLED");
        if(!transaction)return null;
        const item=upsertCashDeliveryMovement(store,transaction,{id,now,userId:req.user.id,quantity:quantity??transaction.beneficiaryReceives??transaction.amount,deliveryRate,occurredAt:req.body?.occurredAt||now()});
        audit(store,req.user.id,"CASH_DELIVERY","TRANSACTION",transaction.id,{movementId:item.id,quantity:item.quantity,currency:item.currency,deliveryRate:item.deliveryRate});
        return item;
      });
      if(!movement)return res.status(404).json({message:"الحوالة غير موجودة"});
      res.status(201).json(movement);
    }catch(error){
      const status=error?.code==="TREASURY_INSUFFICIENT_BALANCE"?409:400;
      res.status(status).json({message:error.message||"تعذر تنفيذ التسليم الكاش",code:error.code||null});
    }
  });
}

module.exports={registerTreasuryRoutes};
