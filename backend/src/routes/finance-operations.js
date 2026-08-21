"use strict";

function registerFinanceOperationsRoutes(app, {
  auth,
  requireIdempotencyKey,
  readStore,
  branchSafeRead,
  nativeRepositories,
  paginate,
  mutateDurable,
  id,
  now,
  assertBalancedEntry,
  audit,
  currencyConversion,
  safeNumber
}) {
  app.get("/api/expenses", auth, async (req,res)=>{const store=readStore();const rows=await branchSafeRead(req,"expenses",()=>nativeRepositories.expenses.listByCompany(req.user.companyId,{orderBy:"created_at DESC"}),()=>Array.from(store.expenses).reverse());res.json(paginate(req,rows));});
  app.post("/api/expenses", auth, requireIdempotencyKey, async (req,res)=>{const {title,amount,currency="CAD",exchangeRate=1,category="Other",date=new Date().toISOString().slice(0,10)}=req.body||{};const n=Number(amount),rate=Number(exchangeRate);const normalizedCurrency=String(currency||"CAD").toUpperCase();if(!title||!Number.isFinite(n)||n<=0||!Number.isFinite(rate)||rate<=0)return res.status(400).json({message:"Invalid expense"});const e=await mutateDurable(s=>{const x={id:id(),title,amount:+n.toFixed(2),currency:normalizedCurrency,exchangeRate:+rate.toFixed(6),cadAmount:+(n*rate).toFixed(2),category,date,createdAt:now(),createdBy:req.user.id};assertBalancedEntry([{account:"EXPENSE_CAD",debit:x.cadAmount},{account:"SOURCE_AMOUNT_CONVERTED",credit:+(n*rate).toFixed(2)}]);s.expenses.push(x);audit(s,req.user.id,"CREATE","EXPENSE",x.id,{currency:x.currency,exchangeRate:x.exchangeRate,cadAmount:x.cadAmount});return x;});res.status(201).json(e);});
  app.put("/api/expenses/:id", auth, requireIdempotencyKey, async (req,res)=>{
    const {title,amount,currency="CAD",exchangeRate=1,category="Other",date}=req.body||{};
    const n=Number(amount),rate=Number(exchangeRate),normalizedCurrency=String(currency||"CAD").toUpperCase();
    if(!title||!date||!Number.isFinite(n)||n<=0||!Number.isFinite(rate)||rate<=0)return res.status(400).json({message:"بيانات المصروف غير صحيحة"});
    const updated=await mutateDurable(s=>{
      const rows=Array.from(s.expenses||[]);
      const index=rows.findIndex(x=>String(x.id)===String(req.params.id));
      if(index<0)return null;
      const previous=rows[index];
      const next={...previous,title:String(title).trim(),amount:+n.toFixed(2),currency:normalizedCurrency,exchangeRate:+rate.toFixed(6),cadAmount:+(n*rate).toFixed(2),category,date,updatedAt:now(),updatedBy:req.user.id};
      assertBalancedEntry([{account:"EXPENSE_CAD",debit:next.cadAmount},{account:"SOURCE_AMOUNT_CONVERTED",credit:+(n*rate).toFixed(2)}]);
      rows[index]=next;s.expenses=rows;
      audit(s,req.user.id,"UPDATE","EXPENSE",next.id,{before:{title:previous.title,amount:previous.amount,currency:previous.currency},after:{title:next.title,amount:next.amount,currency:next.currency}});
      return next;
    });
    if(!updated)return res.status(404).json({message:"المصروف غير موجود"});
    res.json(updated);
  });
  app.delete("/api/expenses/:id", auth, requireIdempotencyKey, async (req,res)=>{
    const removed=await mutateDurable(s=>{
      const rows=Array.from(s.expenses||[]);const index=rows.findIndex(x=>String(x.id)===String(req.params.id));if(index<0)return null;
      const expense=rows[index];s.expenses=rows.filter((_,rowIndex)=>rowIndex!==index);
      audit(s,req.user.id,"DELETE","EXPENSE",expense.id,{title:expense.title,amount:expense.amount,currency:expense.currency});return expense;
    });
    if(!removed)return res.status(404).json({message:"المصروف غير موجود"});
    res.json({ok:true,expense:removed});
  });

  app.get("/api/capital", auth, async (req,res)=>{
    const store=readStore();
    const nativeRows=await branchSafeRead(req,"capital",()=>nativeRepositories.capitalMovements.listByCompany(req.user.companyId,{orderBy:"created_at DESC"}),()=>Array.from(store.capitalMovements||[]).reverse());
    const rows=nativeRows.map(item=>{
      const currency=String(item.currency||"CAD").toUpperCase();
      const conversion=currencyConversion(store,currency,"CAD");
      const exchangeRate=Number.isFinite(Number(item.exchangeRate))?Number(item.exchangeRate):(conversion?.factor||null);
      const cadAmount=Number.isFinite(Number(item.cadAmount))?Number(item.cadAmount):(exchangeRate?safeNumber(item.amount)*exchangeRate:(currency==="CAD"?safeNumber(item.amount):null));
      return {...item,currency,baseCurrency:"CAD",exchangeRate,cadAmount:Number.isFinite(cadAmount)?+cadAmount.toFixed(2):null};
    });
    res.json(rows);
  });
  app.post("/api/capital", auth, requireIdempotencyKey, async (req,res)=>{
    const {type="IN",amount,currency="CAD",description="",date=new Date().toISOString().slice(0,10)}=req.body||{};
    const n=Number(amount), normalizedCurrency=String(currency||"CAD").toUpperCase();
    if(!["IN","OUT"].includes(type)||!Number.isFinite(n)||n<=0)return res.status(400).json({message:"بيانات حركة رأس المال غير صحيحة"});
    const movement=await mutateDurable(store=>{
      const conversion=currencyConversion(store,normalizedCurrency,"CAD");
      if(!conversion)return {error:"لا يوجد سعر صرف لهذه العملة إلى CAD. يرجى تحديث أسعار الصرف أولًا."};
      const exchangeRate=conversion.factor;
      const item={id:id(),type,amount:+n.toFixed(2),currency:normalizedCurrency,exchangeRate:+exchangeRate.toFixed(6),baseCurrency:"CAD",cadAmount:+(n*exchangeRate).toFixed(2),conversionPath:conversion.path,rateUpdatedAt:conversion.updatedAt||null,description:String(description||""),date,createdAt:now(),createdBy:req.user.id};
      assertBalancedEntry([{account:"CAPITAL_CAD",debit:item.cadAmount},{account:"SOURCE_AMOUNT_CONVERTED",credit:+(n*exchangeRate).toFixed(2)}]);
      store.capitalMovements.push(item);audit(store,req.user.id,"CREATE","CAPITAL",item.id,{currency:item.currency,exchangeRate:item.exchangeRate,cadAmount:item.cadAmount});return item;
    });
    if(movement?.error)return res.status(400).json({message:movement.error});
    res.status(201).json(movement);
  });

  app.patch("/api/capital/:id", auth, requireIdempotencyKey, async (req,res)=>{
    const {type,amount,currency,description,date}=req.body||{};const n=Number(amount);
    if(!["IN","OUT"].includes(type)||!Number.isFinite(n)||n<=0)return res.status(400).json({message:"بيانات حركة رأس المال غير صحيحة"});
    const updated=await mutateDurable(store=>{
      const item=store.capitalMovements.find(entry=>entry.id===req.params.id);if(!item)return null;
      const normalizedCurrency=String(currency||"CAD").toUpperCase();const conversion=currencyConversion(store,normalizedCurrency,"CAD");
      if(!conversion)return {error:"لا يوجد سعر صرف لهذه العملة إلى CAD. يرجى تحديث أسعار الصرف أولًا."};
      item.type=type;item.amount=+n.toFixed(2);item.currency=normalizedCurrency;item.exchangeRate=+conversion.factor.toFixed(6);item.baseCurrency="CAD";item.cadAmount=+(n*conversion.factor).toFixed(2);
      assertBalancedEntry([{account:"CAPITAL_CAD",debit:item.cadAmount},{account:"SOURCE_AMOUNT_CONVERTED",credit:+(n*conversion.factor).toFixed(2)}]);
      item.conversionPath=conversion.path;item.rateUpdatedAt=conversion.updatedAt||null;item.description=String(description||"");item.date=date||new Date().toISOString().slice(0,10);item.updatedAt=now();item.updatedBy=req.user.id;
      audit(store,req.user.id,"UPDATE","CAPITAL",item.id,{type:item.type,amount:item.amount});return item;
    });
    if(!updated)return res.status(404).json({message:"حركة رأس المال غير موجودة"});
    if(updated.error)return res.status(400).json({message:updated.error});
    res.json(updated);
  });

  app.delete("/api/capital/:id", auth, requireIdempotencyKey, async (req,res)=>{
    const removed=await mutateDurable(store=>{const rows=Array.from(store.capitalMovements||[]);const item=rows.find(entry=>entry.id===req.params.id);if(!item)return null;store.capitalMovements=rows.filter(entry=>entry.id!==req.params.id);audit(store,req.user.id,"DELETE","CAPITAL",item.id,{type:item.type,amount:item.amount});return item;});
    if(!removed)return res.status(404).json({message:"حركة رأس المال غير موجودة"});
    res.json({message:"تم حذف حركة رأس المال",id:removed.id});
  });
}

module.exports={registerFinanceOperationsRoutes};
