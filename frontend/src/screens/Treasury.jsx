import React,{useEffect,useState} from "react";
import api,{cachedGet,clearApiGetCache} from "../api";
import {money} from "../shared";
import {AppTable} from "../components/ui";

export function Treasury(){
  const [data,setData]=useState({balances:[],movements:[]});
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);
  const [transactions,setTransactions]=useState([]);
  const [form,setForm]=useState({direction:"IN",currency:"USD",quantity:"",rate:"",reason:"",occurredAt:new Date().toISOString().slice(0,10)});
  const [delivery,setDelivery]=useState({transactionId:"",quantity:"",deliveryRate:"",occurredAt:new Date().toISOString().slice(0,16)});
  async function load(){try{const [treasuryResponse,transactionResponse]=await Promise.all([cachedGet("/treasury",{cacheTtl:0}),cachedGet("/transactions",{params:{limit:200},cacheTtl:0})]);setData(treasuryResponse.data||{balances:[],movements:[]});setTransactions(Array.isArray(transactionResponse.data)?transactionResponse.data:[]);}catch(e){setError(e.response?.data?.message||"تعذر تحميل الخزنة");}}
  useEffect(()=>{void load();},[]);
  async function submit(event){event.preventDefault();setSaving(true);setError("");try{await api.post("/treasury/adjustments",{direction:form.direction,currency:form.currency,quantity:Number(form.quantity),costRate:form.direction==="IN"?Number(form.rate):null,deliveryRate:form.direction==="OUT"?Number(form.rate):null,reason:form.reason,occurredAt:form.occurredAt});clearApiGetCache();setForm(current=>({...current,quantity:"",rate:"",reason:""}));await load();}catch(e){setError(e.response?.data?.message||"تعذر حفظ التسوية");}finally{setSaving(false);}}
  async function deliverCash(event){event.preventDefault();setSaving(true);setError("");try{await api.post(`/transactions/${delivery.transactionId}/cash-delivery`,{quantity:delivery.quantity===""?undefined:Number(delivery.quantity),deliveryRate:Number(delivery.deliveryRate),occurredAt:delivery.occurredAt});clearApiGetCache();setDelivery(current=>({...current,transactionId:"",quantity:"",deliveryRate:""}));await load();}catch(e){setError(e.response?.data?.message||"تعذر تنفيذ التسليم الكاش");}finally{setSaving(false);}}
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
    <section className="transaction-summary-grid">{data.balances.map(row=><div className="card transaction-summary-card" key={row.currency}><span>{row.currency}</span><strong>{money(row.balance)}</strong><small>التكلفة: {money(row.totalCost)} CAD · المتوسط: {Number(row.averageCost||0).toFixed(6)}</small><small>ربح محقق: {money(row.realizedProfit)} · خسارة: {money(row.realizedLoss)}</small></div>)}</section>
    <form className="card form no-print" onSubmit={deliverCash}><h3>تسليم كاش فعلي</h3>
      <select value={delivery.transactionId} onChange={e=>setDelivery({...delivery,transactionId:e.target.value})} required><option value="">اختر الحوالة</option>{transactions.map(row=><option key={row.id} value={row.id}>{row.number||row.id} — {money(row.amount)} {row.currency}</option>)}</select>
      <input type="number" min=".0001" step=".0001" value={delivery.quantity} onChange={e=>setDelivery({...delivery,quantity:e.target.value})} placeholder="الكمية (اتركها فارغة لتسليم كامل الحوالة)"/>
      <input type="number" min=".00000001" step=".00000001" value={delivery.deliveryRate} onChange={e=>setDelivery({...delivery,deliveryRate:e.target.value})} placeholder="سعر الصرف الفعلي وقت التسليم" required/>
      <input type="datetime-local" value={delivery.occurredAt} onChange={e=>setDelivery({...delivery,occurredAt:e.target.value})} required/>
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
