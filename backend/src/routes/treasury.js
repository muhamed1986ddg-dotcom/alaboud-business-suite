"use strict";

function registerTreasuryRoutes(app, { auth, requireIdempotencyKey, readStore, mutateDurable, id, now, audit, rebuildTreasury }) {
  app.get("/api/treasury", auth, (req,res)=>{
    try{
      const store=readStore();
      const snapshot={treasuryMovements:Array.from(store.treasuryMovements||[]).map(row=>({...row}))};
      const balances=rebuildTreasury(snapshot);
      const movements=snapshot.treasuryMovements.slice().sort((a,b)=>String(b.occurredAt||b.createdAt||"").localeCompare(String(a.occurredAt||a.createdAt||"")));
      res.json({baseCurrency:"CAD",allowNegative:false,balances,movements});
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
}

module.exports={registerTreasuryRoutes};
