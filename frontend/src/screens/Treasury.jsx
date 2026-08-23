import React,{useEffect,useState} from "react";
import api,{cachedGet,clearApiGetCache} from "../api";
import {money} from "../shared";
import {AppTable} from "../components/ui";
import {formatTreasuryInventoryPeriod,treasuryAverageCostRows,treasuryRealizedSummary} from "../treasurySummary";

export function Treasury(){
  const [data,setData]=useState({balances:[],movements:[]});
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);
  const [form,setForm]=useState({direction:"IN",currency:"USD",quantity:"",rate:"",reason:"",occurredAt:new Date().toISOString().slice(0,10)});
  const [delivery,setDelivery]=useState({currency:"USD",quantity:"",deliveryRate:"",occurredAt:new Date().toISOString().slice(0,16),note:""});
  async function load(){try{const treasuryResponse=await cachedGet("/treasury",{cacheTtl:0});setData(treasuryResponse.data||{balances:[],movements:[]});}catch(e){setError(e.response?.data?.message||"تعذر تحميل الخزنة");}}
  useEffect(()=>{void load();},[]);
  async function submit(event){event.preventDefault();setSaving(true);setError("");try{await api.post("/treasury/adjustments",{direction:form.direction,currency:form.currency,quantity:Number(form.quantity),costRate:form.direction==="IN"?Number(form.rate):null,deliveryRate:form.direction==="OUT"?Number(form.rate):null,reason:form.reason,occurredAt:form.occurredAt});clearApiGetCache();setForm(current=>({...current,quantity:"",rate:"",reason:""}));await load();}catch(e){setError(e.response?.data?.message||"تعذر حفظ التسوية");}finally{setSaving(false);}}
  async function deliverCash(event){event.preventDefault();setSaving(true);setError("");try{await api.post("/treasury/cash-deliveries",{currency:delivery.currency,quantity:Number(delivery.quantity),deliveryRate:Number(delivery.deliveryRate),occurredAt:delivery.occurredAt,note:delivery.note});clearApiGetCache();setDelivery(current=>({...current,quantity:"",deliveryRate:"",note:""}));await load();}catch(e){setError(e.response?.data?.message||"تعذر تنفيذ التسليم الكاش");}finally{setSaving(false);}}
  const columns=[
    {key:"occurredAt",label:"التاريخ والوقت",render:r=>String(r.occurredAt||r.createdAt||"").replace("T"," ").slice(0,19)},
    {key:"movementType",label:"نوع الحركة",render:r=>r.movementType==="ADJUSTMENT"?`تسوية (${r.direction==="IN"?"دخول":"خروج"})`:r.direction==="IN"?"دخول":"خروج"},
    {key:"currency",label:"العملة"},{key:"quantity",label:"الكمية",render:r=>money(r.quantity)},
    {key:"sourceLabel",label:"المصدر",render:r=>r.sourceLabel||r.sourceType||"-"},{key:"transactionId",label:"معرف الحوالة",render:r=>r.transactionId||"-"},
    {key:"costRate",label:"سعر التكلفة",render:r=>r.costRate==null?"-":Number(r.costRate).toFixed(6)},
    {key:"averageCostBefore",label:"المتوسط لحظة العملية",render:r=>Number(r.averageCostBefore||0).toFixed(6)},
    {key:"deliveryRate",label:"سعر التسليم",render:r=>r.deliveryRate==null?"-":Number(r.deliveryRate).toFixed(6)},
    {key:"realizedFx",label:"ربح/خسارة فرق السعر",render:r=><strong className={Number(r.realizedFx||0)<0?"value-negative":"value-positive"}>{money(r.realizedFx)}</strong>},
    {key:"balanceAfter",label:"الرصيد بعد العملية",render:r=>money(r.balanceAfter)},
    {key:"status",label:"الحالة",render:r=>r.isCancelled?"ملغاة/معكوسة":"فعالة"}
  ];
  const movementRows=data.movements||[];
  const deliveryBalance=(data.balances||[]).find(row=>row.currency===delivery.currency)||{balance:0,averageCost:0,totalCost:0};
  const deliveryQuantity=Number(delivery.quantity||0);
  const deliveryRate=Number(delivery.deliveryRate||0);
  const deliveryAverage=Number(delivery.currency==="CAD"?(deliveryBalance.averageRateCadPerUsd??deliveryBalance.averageCost):deliveryBalance.averageCost)||0;
  const cadDelivery=delivery.currency==="CAD"&&deliveryQuantity>0&&deliveryRate>0&&deliveryAverage>0;
  const deliveryUsd=cadDelivery?deliveryQuantity/deliveryRate:0;
  const costUsd=cadDelivery?deliveryQuantity/deliveryAverage:0;
  const realizedFxUsd=cadDelivery?deliveryUsd-costUsd:0;
  const deliveryPreview={
    balance:Number(deliveryBalance.balance||0),
    averageCost:deliveryAverage,
    expectedBalance:Number(deliveryBalance.balance||0)-deliveryQuantity,
    realizedFx:delivery.currency==="CAD"?realizedFxUsd*deliveryRate:deliveryQuantity*(deliveryRate-deliveryAverage),
    deliveryUsd,costUsd,realizedFxUsd
  };
  const averageCostRows=treasuryAverageCostRows(data.balances);
  const realizedSummary=treasuryRealizedSummary(data.currentInventoryPeriod);
  const inventoryPeriodLabel=formatTreasuryInventoryPeriod(data.currentInventoryPeriod);
  const finalizedPeriods=Array.isArray(data.finalizedInventoryPeriods)?data.finalizedInventoryPeriods:[];
  const realizedSign=realizedSummary.net>0?"+":"";
  const movementTypeLabel=row=>row.movementType==="ADJUSTMENT"?`تسوية (${row.direction==="IN"?"دخول":"خروج"})`:row.direction==="IN"?"دخول":"خروج";
  const movementStatus=row=>row.isCancelled?"ملغاة/معكوسة":row.movementType==="ADJUSTMENT"?"تسوية":"";
  const movementFields=row=>[
    ["التاريخ والوقت",String(row.occurredAt||row.createdAt||"").replace("T"," ").slice(0,19)||"-"],
    ["نوع الحركة",movementTypeLabel(row)],
    ["العملة",row.currency||"-"],
    ["الكمية",money(row.quantity)],
    ["المصدر",row.sourceLabel||row.sourceType||"-"],
    ["معرف الحوالة",row.transactionId||"-"],
    ["سعر التكلفة",row.costRate==null?"-":Number(row.costRate).toFixed(6)],
    ["المتوسط لحظة العملية",Number(row.averageCostBefore||0).toFixed(6)],
    ["سعر التسليم",row.deliveryRate==null?"-":Number(row.deliveryRate).toFixed(6)],
    ["ربح/خسارة فرق السعر",<strong className={Number(row.realizedFx||0)<0?"value-negative":"value-positive"}>{money(row.realizedFx)}</strong>],
    ...(row.balanceAfter==null?[]:[["الرصيد بعد العملية",money(row.balanceAfter)]]),
    ...(movementStatus(row)?[["الحالة",movementStatus(row)]]:[])
  ];
  return <div className="treasury-page">
    <div className="transactions-page-heading"><div><h2>الخزنة</h2><p>أرصدة العملات بالتكلفة المرجحة وسجل فرق السعر المحقق.</p></div></div>
    {error&&<div className="card customer-error">{error}</div>}
    <section className="treasury-financial-summary" aria-label="ملخص الخزنة المالي">
      <article className="card treasury-financial-summary__card">
        <h3>متوسط تكلفة الخزنة</h3>
        <div className="treasury-average-list">
          {averageCostRows.length?averageCostRows.map(row=><div className="treasury-average-item" key={row.currency}>
            <strong>{row.averageCost.toFixed(6)} CAD/USD</strong>
            <small>الرصيد الحالي: {money(row.balance)} {row.currency}</small>
          </div>):<div className="treasury-summary-empty">لا توجد أرصدة خزنة.</div>}
        </div>
      </article>
      <article className="card treasury-financial-summary__card treasury-realized-summary">
        <h3>ربح/خسارة فرق التسليم — الجرد الحالي</h3>
        <strong className={`treasury-realized-summary__net ${realizedSummary.net<0?"value-negative":"value-positive"}`}>{realizedSign}{money(realizedSummary.net)} CAD</strong>
        {inventoryPeriodLabel&&<div className="treasury-realized-summary__period">{inventoryPeriodLabel}</div>}
        <small>الربح: {money(realizedSummary.profit)} CAD <span aria-hidden="true">|</span> الخسارة: {money(realizedSummary.loss)} CAD</small>
      </article>
    </section>
    <section className="treasury-finalized-periods" aria-label="نتائج الجرد السابقة">
      <h3>نتائج الجرد السابقة</h3>
      <div className="treasury-finalized-periods__grid">
        {finalizedPeriods.length?finalizedPeriods.map(row=>{
          const net=Number(row.treasuryRealizedFx||0);
          const periodLabel=formatTreasuryInventoryPeriod({start:row.periodStart,end:row.periodEnd});
          return <article className="card treasury-finalized-card" key={row.inventoryId||row.month}>
            <header><strong>{row.month||"جرد مثبت"}</strong><span>{row.status==="FINALIZED"?"مثبت":row.status}</span></header>
            {row.treasurySnapshotAvailable?<>
              <small>{periodLabel}</small>
              <div><span>ربح التسليم</span><strong>{money(row.treasuryRealizedProfit)} CAD</strong></div>
              <div><span>خسارة التسليم</span><strong>{money(row.treasuryRealizedLoss)} CAD</strong></div>
              <div className="treasury-finalized-card__net"><span>صافي فرق التسليم</span><strong className={net<0?"value-negative":"value-positive"}>{net>0?"+":""}{money(net)} CAD</strong></div>
            </>:<small>تفاصيل Treasury غير متوفرة لهذا الجرد القديم.</small>}
          </article>;
        }):<div className="treasury-summary-empty">لا توجد نتائج جرد مثبتة حتى الآن.</div>}
      </div>
    </section>
    <section className="transaction-summary-grid">{data.balances.map(row=><div className="card transaction-summary-card" key={row.currency}><span>{row.currency}</span><strong>{money(row.balance)}</strong><small>{row.currency==="CAD"?`أساس التكلفة: ${money(row.totalUsdBasis)} USD · المتوسط: ${Number(row.averageRateCadPerUsd||0).toFixed(6)} CAD/USD`:`التكلفة: ${money(row.totalCost)} CAD · المتوسط: ${Number(row.averageCost||0).toFixed(6)} CAD/USD`}</small><small>ربح محقق: {money(row.realizedProfit)} CAD · خسارة: {money(row.realizedLoss)} CAD</small></div>)}</section>
    <form className="card form no-print" onSubmit={deliverCash}><h3>تسليم كاش فعلي</h3>
      <label className="treasury-delivery-currency"><span>نوع العملة</span><select value={delivery.currency} onChange={e=>setDelivery({...delivery,currency:e.target.value,deliveryRate:""})} required><option value="USD">USD — دولار أمريكي</option><option value="CAD">CAD — دولار كندي</option></select></label>
      <div className="treasury-delivery-availability"><span>الرصيد العام المتاح</span><strong>{money(deliveryPreview.balance)} {delivery.currency}</strong><small>متوسط التكلفة الحالي: {deliveryPreview.averageCost.toFixed(6)} CAD/USD</small></div>
      <input type="number" min=".0001" max={deliveryPreview.balance||undefined} step=".0001" value={delivery.quantity} onChange={e=>setDelivery({...delivery,quantity:e.target.value})} placeholder="الكمية المسلّمة" required/>
      <input type="number" min=".00000001" step=".00000001" value={delivery.deliveryRate} onChange={e=>setDelivery({...delivery,deliveryRate:e.target.value})} placeholder={delivery.currency==="CAD"?"سعر الشركة CAD لكل USD":"سعر التسليم مقابل CAD"} required/>
      <input type="datetime-local" value={delivery.occurredAt} onChange={e=>setDelivery({...delivery,occurredAt:e.target.value})} required/>
      <input value={delivery.note} maxLength="500" onChange={e=>setDelivery({...delivery,note:e.target.value})} placeholder="ملاحظة اختيارية"/>
      <div className="treasury-delivery-preview" aria-label="معاينة التسليم">
        <div><span>الرصيد الحالي</span><strong>{money(deliveryPreview.balance)} {delivery.currency}</strong></div>
        <div><span>الكمية المسلّمة</span><strong>{money(deliveryQuantity)} {delivery.currency}</strong></div>
        <div><span>الرصيد المتوقع</span><strong className={deliveryPreview.expectedBalance<0?"value-negative":""}>{money(deliveryPreview.expectedBalance)} {delivery.currency}</strong></div>
        <div><span>متوسط التكلفة</span><strong>{deliveryPreview.averageCost.toFixed(6)} CAD/USD</strong></div>
        <div><span>سعر التسليم</span><strong>{deliveryRate>0?deliveryRate.toFixed(6):"—"} CAD/USD</strong></div>
        {delivery.currency==="CAD"&&<>
          <div><span>الدولار المتوقع من الشركة</span><strong>{money(deliveryPreview.deliveryUsd)} USD</strong></div>
          <div><span>تكلفة الكاش حسب المتوسط</span><strong>{money(deliveryPreview.costUsd)} USD</strong></div>
          <div><span>فرق التسليم المتوقع</span><strong className={deliveryPreview.realizedFxUsd<0?"value-negative":"value-positive"}>{deliveryPreview.realizedFxUsd>0?"+":""}{money(deliveryPreview.realizedFxUsd)} USD</strong></div>
        </>}
        <div><span>فرق التسليم المتوقع</span><strong className={deliveryPreview.realizedFx<0?"value-negative":"value-positive"}>{deliveryPreview.realizedFx>0?"+":""}{money(deliveryPreview.realizedFx)} CAD</strong></div>
      </div>
      <button disabled={saving}>{saving?"جارٍ التنفيذ…":"تنفيذ التسليم الكاش"}</button>
    </form>
    <form className="card form no-print" onSubmit={submit}><h3>تسوية يدوية موثقة</h3>
      <select value={form.direction} onChange={e=>setForm({...form,direction:e.target.value})}><option value="IN">دخول</option><option value="OUT">خروج</option></select>
      <select value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}>{["USD","EUR","SYP","AED","GBP","CAD","TRY","SAR","JOD"].map(c=><option key={c}>{c}</option>)}</select>
      <input type="number" min=".0001" step=".0001" placeholder="الكمية" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})} required/>
      <input type="number" min=".00000001" step=".00000001" placeholder={form.direction==="IN"?"سعر التكلفة":"سعر الصرف وقت التسليم"} value={form.rate} onChange={e=>setForm({...form,rate:e.target.value})} required/>
      <input type="datetime-local" value={form.occurredAt} onChange={e=>setForm({...form,occurredAt:e.target.value})} required/>
      <input placeholder="سبب التسوية (إلزامي)" value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})} required/>
      <button disabled={saving}>{saving?"جارٍ الحفظ…":"حفظ التسوية"}</button>
    </form>
    <div className="card treasury-movements-section"><h3>سجل حركات الخزنة</h3>
      <div className="treasury-movements-desktop"><AppTable columns={columns} rows={movementRows} emptyText="لا توجد حركات خزنة."/></div>
      <div className="treasury-movement-cards">
        {movementRows.length?movementRows.map((row,index)=><article className="treasury-movement-card" key={row.id||row.sourceKey||index}>
          {movementFields(row).map(([label,value])=><div className="treasury-movement-card__row" key={label}>
            <span>{label}</span><div className="treasury-movement-card__value">{value}</div>
          </div>)}
        </article>):<div className="treasury-movement-empty">لا توجد حركات خزنة.</div>}
      </div>
    </div>
  </div>;
}
