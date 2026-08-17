import React,{useEffect,useRef,useState}from"react";
import api,{clearApiGetCache} from"../api";
import {money,debtCurrencies,confirmAction} from"../shared";
import {AppModal,AppButton,AppTable} from "../components/ui";

function CapitalOverview({navigate}){
  const requestSequence=useRef(0);
  const [month,setMonth]=useState(new Date().toISOString().slice(0,7));
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [inventory,setInventory]=useState(null);
  const [movements,setMovements]=useState([]);
  const [exchangeRates,setExchangeRates]=useState([]);
  const [goals,setGoals]=useState(()=>{
    try{return JSON.parse(localStorage.getItem("alaboud-budget-goals")||"")||{profit:25000,expenses:10000,capital:50000};}
    catch{return {profit:25000,expenses:10000,capital:50000};}
  });
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [editing,setEditing]=useState(null);
  const [financialDetails,setFinancialDetails]=useState(null);
  const [budgetModal,setBudgetModal]=useState(null);
  const [movementFilter,setMovementFilter]=useState("ALL");
  const [movementSearch,setMovementSearch]=useState("");
  const [showCapitalInTotal,setShowCapitalInTotal]=useState(false);
  const [form,setForm]=useState({
    type:"IN",
    amount:"",
    currency:"CAD",
    description:"",
    date:new Date().toISOString().slice(0,10)
  });

  async function load({announce=false}={}){
    const requestId=++requestSequence.current;
    const refreshToken=Date.now();
    if(announce){clearApiGetCache();setMessage("");}
    setLoading(true);setError("");
    try{
      // الميزانية لا يجب أن تبقى فارغة بسبب فشل طلب ثانوي مثل الأسعار أو الجرد.
      // حمّل المؤشرات الأساسية أولًا وبشكل مباشر، ثم حدّث البيانات المساعدة كلٌ على حدة.
      const overviewResponse=await api.get("/capital-overview",{params:{month,_refresh:refreshToken}});
      if(requestId!==requestSequence.current)return;
      setData(overviewResponse.data);
      const [movementsResult,ratesResult,inventoryResult]=await Promise.allSettled([
        api.get("/capital",{params:{_refresh:refreshToken}}),
        api.get("/exchange-rates",{params:{_refresh:refreshToken}}),
        api.get("/monthly-inventory",{params:{_refresh:refreshToken}})
      ]);
      if(requestId!==requestSequence.current)return;
      if(movementsResult.status==="fulfilled")setMovements(Array.isArray(movementsResult.value.data)?movementsResult.value.data:[]);
      if(ratesResult.status==="fulfilled")setExchangeRates(Array.isArray(ratesResult.value.data)?ratesResult.value.data:[]);
      if(inventoryResult.status==="fulfilled")setInventory(inventoryResult.value.data);
      if(announce)setMessage("تم تحديث الميزانية من أحدث أرصدة العملاء والشركات");
    }catch(requestError){
      if(requestId===requestSequence.current)setError(requestError.response?.data?.message||"تعذر تحميل الميزانية. اضغط إعادة المحاولة.");
    }finally{
      if(requestId===requestSequence.current)setLoading(false);
    }
  }

  useEffect(()=>{
    void load();
    return()=>{requestSequence.current+=1;};
  },[month]);

  useEffect(()=>{
    if(!budgetModal&&!editing)return;
    const previous=document.body.style.overflow;
    document.body.style.overflow="hidden";
    const closeOnEscape=event=>{if(event.key==="Escape"){setBudgetModal(null);setEditing(null);}};
    window.addEventListener("keydown",closeOnEscape);
    return()=>{document.body.style.overflow=previous;window.removeEventListener("keydown",closeOnEscape);};
  },[budgetModal,editing]);

  async function addCapital(event){
    event.preventDefault();
    setError("");setMessage("");
    try{
      await api.post("/capital",form);
      setForm({
        type:"IN",
        amount:"",
        currency:"CAD",
        description:"",
        date:new Date().toISOString().slice(0,10)
      });
      setMessage("تمت إضافة حركة رأس المال بنجاح");
      void load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر إضافة رأس المال");
    }
  }

  async function saveEdit(event){
    event.preventDefault();
    setError("");setMessage("");
    try{
      await api.patch(`/capital/${editing.id}`,editing);
      setEditing(null);
      setMessage("تم تعديل حركة رأس المال بنجاح");
      void load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر تعديل رأس المال");
    }
  }

  async function deleteCapital(item){
    if(!await confirmAction({title:"تأكيد حذف حركة رأس المال",message:`هل تريد حذف حركة رأس المال بقيمة ${money(item.amount)} ${item.currency||"CAD"}؟`,confirmText:"حذف الحركة"}))return;
    setError("");setMessage("");
    try{
      await api.delete(`/capital/${item.id}`);
      setMessage("تم حذف حركة رأس المال");
      if(editing?.id===item.id)setEditing(null);
      void load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر حذف رأس المال");
    }
  }

  function cadRateFor(currency){
    const from=String(currency||"CAD").toUpperCase();
    if(from==="CAD")return 1;
    const latest=new Map();
    [...exchangeRates].sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||""))).forEach(rate=>{
      const base=String(rate.baseCurrency||"").toUpperCase();
      const quote=String(rate.quoteCurrency||"").toUpperCase();
      const key=`${base}_${quote}`;
      if(base&&quote&&!latest.has(key))latest.set(key,rate);
    });
    const graph=new Map();
    const add=(a,b,f)=>{if(!Number.isFinite(f)||f<=0)return;(graph.get(a)||graph.set(a,[]).get(a)).push({to:b,factor:f});};
    latest.forEach(rate=>{const base=String(rate.baseCurrency||"").toUpperCase(),quote=String(rate.quoteCurrency||"").toUpperCase(),factor=Number(rate.sellRate||rate.buyRate);if(factor>0){add(base,quote,factor);add(quote,base,1/factor);}});
    const queue=[{currency:from,factor:1}],seen=new Set([from]);
    while(queue.length){const current=queue.shift();for(const edge of graph.get(current.currency)||[]){if(seen.has(edge.to))continue;const factor=current.factor*edge.factor;if(edge.to==="CAD")return factor;seen.add(edge.to);queue.push({currency:edge.to,factor});}}
    return null;
  }
  const formCadRate=cadRateFor(form.currency);
  const formCadAmount=formCadRate&&Number(form.amount)>0?Number(form.amount)*formCadRate:null;

  if(!data)return <div className="budget-recovery-state"><div className="page-title-row"><div><h2>⚖️ الميزانية</h2><p>تحميل المؤشرات المالية وصافي رأس المال.</p></div></div><div className={`card ${error?"customer-error":"budget-loading-card"}`}><strong>{error||"جاري تحميل الميزانية..."}</strong><small>{loading?"يتم الاتصال بالخادم الآن":"يمكن إعادة المحاولة بدون مغادرة الصفحة"}</small>{!loading&&<AppButton type="button" onClick={()=>load({announce:true})}>↻ إعادة المحاولة</AppButton>}</div></div>;

  const selectedMonthMovements=movements.filter(item=>String(item.date||item.createdAt||"").slice(0,7)===month);
  const monthlyNet=Number(data.monthlyNet ?? (Number(data.monthlyProfit||0)-Number(data.monthlyExpenses||0)));
  const totalAddedCapital=movements.filter(item=>item.type==="IN"&&!item.isDeleted&&!item.deletedAt).reduce((sum,item)=>sum+Number(item.cadAmount ?? (String(item.currency||"CAD").toUpperCase()==="CAD"?item.amount:0) ?? 0),0);
  const filteredMovements=movements.filter(item=>{
    const matchesType=movementFilter==="ALL"||item.type===movementFilter;
    const text=`${item.description||""} ${item.currency||""} ${item.amount||""} ${item.date||item.createdAt||""}`.toLowerCase();
    return matchesType&&text.includes(movementSearch.trim().toLowerCase());
  });
  const legacyCurrencySummary=Object.values(selectedMonthMovements.reduce((acc,item)=>{
    const currency=item.currency||"CAD";
    acc[currency]??={currency,in:0,out:0};
    acc[currency][item.type==="IN"?"in":"out"]+=Number(item.amount||0);
    return acc;
  },{}));
  const currencySummary=Array.isArray(data.capitalByCurrency)&&data.capitalByCurrency.length
    ?data.capitalByCurrency.map(item=>({
      currency:item.currency||"CAD",
      in:Number(item.added||0),
      out:Number(item.withdrawn||0),
      currentCapital:Number(item.currentCapital||0),
      operatingOut:Number(item.operatingOut||0),
      operatingReturned:Number(item.operatingReturned||0),
      operatingStuck:Number(item.operatingStuck||0),
      turnoverRate:Number(item.turnoverRate||0)
    }))
    :legacyCurrencySummary.map(item=>({...item,currentCapital:item.in-item.out,operatingOut:0,operatingReturned:0,operatingStuck:0,turnoverRate:0}));

  const capitalContributions=Number(data.capitalContributions ?? data.capitalBalance ?? 0);
  const capitalWithdrawals=Number(data.capitalWithdrawals||0);
  const accumulatedProfit=Number(data.accumulatedProfit||0);
  const accumulatedExpenses=Number(data.accumulatedExpenses||0);
  const realizedNetProfit=Number(data.realizedNetProfit ?? (accumulatedProfit-accumulatedExpenses));
  const profitDistributions=Number(data.profitDistributions||0);
  const debtForUs=Number(data.totalReceivables ?? (Number(data.receivables||0)+Number(data.generalReceivable||0)));
  const debtOnUs=Number(data.totalPayables ?? data.generalPayable ?? 0);
  const netDebt=Number(data.netDebt ?? (debtForUs-debtOnUs));
  const equityNetCapital=Number(data.equityNetCapital ?? (capitalContributions-capitalWithdrawals+realizedNetProfit-profitDistributions));
  const netCapital=Number(data.comprehensiveNetCapital ?? data.netCapital ?? (equityNetCapital+netDebt));
  const estimatedCapital=Number(data.estimatedCapital ?? data.totalCapital ?? netCapital);
  const netWorth=estimatedCapital;
  const closedInventory=(Array.isArray(inventory?.rows)?inventory.rows:[]).find(item=>item?.month===month&&!item.isDeleted);
  const saveGoals=next=>{setGoals(next);localStorage.setItem("alaboud-budget-goals",JSON.stringify(next));};
  const progress=(value,target)=>Math.max(0,Math.min(100,target>0?(Number(value||0)/Number(target))*100:0));

  return <>
    <div className="page-title-row budget-title-row">
      <div>
        <h2>⚖️ الميزانية</h2>
        <p>صافي رأس المال الشامل يضم رأس المال والأرباح وصافي ديون العملاء والشركات</p>
      </div>
      <div className="budget-title-actions no-print">
        <input type="month" value={month} onChange={e=>setMonth(e.target.value)}/>
        <AppButton type="button" busy={loading} busyText="جاري التحديث..." onClick={()=>load({announce:true})}>↻ تحديث</AppButton>
        <button onClick={()=>window.print()}>🖨️ طباعة التقرير</button>
      </div>
    </div>

    {error&&<div className="card customer-error">{error}</div>}
    {message&&<div className="card rate-message">{message}</div>}

    <section className="budget-action-bar no-print" aria-label="وظائف الميزانية">
      <button type="button" onClick={()=>setBudgetModal("movement")}>➕ إضافة حركة رأس مال</button>
      <button type="button" onClick={()=>setBudgetModal("history")}>📋 سجل الحركات</button>
      <button type="button" onClick={()=>setBudgetModal("goals")}>🎯 أهداف التخطيط</button>
      <button type="button" onClick={()=>setBudgetModal("report")}>📊 تقرير الميزانية</button>
    </section>

    <section className="financial-summary-grid" aria-label="ملخص الميزانية">
      <button type="button" className="card financial-summary-card assets-card" onClick={()=>setFinancialDetails("assets")}>
        <span className="financial-card-icon">💰</span>
        <div><small>حقوق الملكية</small><h3>رأس المال 💰</h3></div>
        <strong>{money(capitalContributions-capitalWithdrawals)} CAD</strong>
        <p>المضاف − المسحوبات</p>
        <em>اضغط لعرض التفاصيل</em>
      </button>
      <button type="button" className={`card financial-summary-card profit-card ${realizedNetProfit<0?"is-negative":""}`} onClick={()=>setFinancialDetails("profit")}>
        <span className="financial-card-icon">📈</span>
        <div><small>تراكمي — الحوالات غير الملغاة</small><h3>صافي الربح المسجل</h3></div>
        <strong>{money(realizedNetProfit)} CAD</strong>
        <p>أرباح الحوالات المسجلة − المصروفات</p>
        <em>اضغط لعرض التفاصيل</em>
      </button>
      <button type="button" className={`card financial-summary-card net-capital-card ${netCapital<0?"is-negative":""}`} onClick={()=>setFinancialDetails("net")}>
        <span className="financial-card-icon">💎</span>
        <div><small>يشمل صافي الذمم</small><h3>صافي رأس المال الشامل</h3></div>
        <strong>{money(netCapital)} CAD</strong>
        <p>حقوق الملكية + الدين لنا − الدين علينا</p>
        <em>اضغط لعرض الحساب الكامل</em>
      </button>
    </section>

    <section className="card financial-equation-card">
      <div className="section-heading"><h3>🧮 معادلة صافي رأس المال الشامل</h3><small>جميع القيم محوّلة إلى الدولار الكندي CAD</small></div>
      <div className="financial-equation-row">
        <span><small>رأس المال المضاف</small><b>{money(capitalContributions)}</b></span>
        <i>−</i>
        <span><small>المسحوبات</small><b>{money(capitalWithdrawals)}</b></span>
        <i>+</i>
        <span><small>صافي الربح المسجل</small><b>{money(realizedNetProfit)}</b></span>
        <i>−</i>
        <span><small>توزيعات الأرباح</small><b>{money(profitDistributions)}</b></span>
        <i>+</i>
        <span><small>الدين لنا</small><b>{money(debtForUs)}</b></span>
        <i>−</i>
        <span><small>الدين علينا</small><b>{money(debtOnUs)}</b></span>
        <i>=</i>
        <span className={netCapital>=0?"equation-result positive":"equation-result negative"}><small>صافي رأس المال الشامل</small><b>{money(netCapital)} CAD</b></span>
      </div>
    </section>

    {financialDetails&&<div className="financial-details-overlay" onClick={()=>setFinancialDetails(null)}>
      <section className="card financial-details-modal" role="dialog" aria-modal="true" aria-label="تفاصيل الميزانية" onClick={event=>event.stopPropagation()}>
        <div className="financial-details-head">
          <div>
            <small>تفاصيل مالية دقيقة — CAD</small>
            <h3>{financialDetails==="assets"?"💰 تفاصيل رأس المال":financialDetails==="profit"?"📈 تفاصيل صافي الربح المسجل":"💎 تفاصيل صافي رأس المال الشامل"}</h3>
          </div>
          <button type="button" onClick={()=>setFinancialDetails(null)} aria-label="إغلاق">×</button>
        </div>
        {(financialDetails==="assets"||financialDetails==="net")&&<div className="financial-detail-group assets-detail-group">
          <h4>رأس المال</h4>
          <p><span>رأس المال المضاف</span><b>+ {money(capitalContributions)} CAD</b></p>
          <p><span>المسحوبات</span><b>− {money(capitalWithdrawals)} CAD</b></p>
          <p className="detail-total"><span>رأس المال الحالي</span><strong>{money(capitalContributions-capitalWithdrawals)} CAD</strong></p>
        </div>}
        {(financialDetails==="profit"||financialDetails==="net")&&<div className="financial-detail-group liabilities-detail-group">
          <h4>الأرباح والمصروفات</h4>
          <p><span>أرباح الحوالات غير الملغاة</span><b>+ {money(accumulatedProfit)} CAD</b></p>
          <p><span>المصروفات</span><b>− {money(accumulatedExpenses)} CAD</b></p>
          <p className="detail-total"><span>صافي الربح المسجل</span><strong>{money(realizedNetProfit)} CAD</strong></p>
        </div>}
        {financialDetails==="net"&&<div className="financial-detail-group assets-detail-group">
          <h4>ديون العملاء والشركات</h4>
          <p><span>إجمالي الدين لنا</span><b>+ {money(debtForUs)} CAD</b></p>
          <p><span>إجمالي الدين علينا</span><b>− {money(debtOnUs)} CAD</b></p>
          <p className="detail-total"><span>صافي الذمم</span><strong>{money(netDebt)} CAD</strong></p>
        </div>}
        {financialDetails==="net"&&<div className={`financial-final-result ${netCapital>=0?"positive":"negative"}`}>
          <span>{money(capitalContributions)} − {money(capitalWithdrawals)} + {money(realizedNetProfit)} − {money(profitDistributions)} + {money(debtForUs)} − {money(debtOnUs)}</span>
          <strong>صافي رأس المال الشامل: {money(netCapital)} CAD</strong>
        </div>}
      </section>
    </div>}

    <section className="card accounting-period-note">
      <strong>فصل الفترات المحاسبية</strong>
      <span>صافي رأس المال الشامل تراكمي ويضم صافي الذمم، ونتيجة الأعمال أدناه تخص شهر {month} فقط، والجرد لا يصبح نهائيًا قبل إدخال كاش الخزنة وتثبيته.</span>
    </section>

    <section className="budget-accounting-grid">
      <article className="card monthly-accounting-card">
        <div className="section-heading"><h3>📅 نتيجة الشهر</h3><small>{month}</small></div>
        <div className="accounting-lines"><span>أرباح الحوالات المسجلة <b>+ {money(data.monthlyProfit)} CAD</b></span><span>مصروفات الشهر <b>− {money(data.monthlyExpenses)} CAD</b></span><strong className={monthlyNet>=0?"positive-value":"negative-value"}>صافي الشهر = {money(monthlyNet)} CAD</strong></div>
      </article>
      <article className="card net-worth-card">
        <div className="section-heading"><h3>🤝 الذمم الشاملة</h3><small>محسوبة مرة واحدة بعد منع الروابط المكررة</small></div>
        <div className="accounting-lines"><span>إجمالي الذمم لنا <b>+ {money(debtForUs)} CAD</b></span><span>إجمالي الذمم علينا <b>− {money(debtOnUs)} CAD</b></span><strong className={netDebt>=0?"positive-value":"negative-value"}>صافي الذمم = {money(netDebt)} CAD</strong></div>
      </article>
      <article className={`card final-inventory-card ${closedInventory?"is-closed":"is-pending"}`}>
        <div className="section-heading"><h3>📦 الجرد النهائي</h3><small>{closedInventory?`مثبت ${closedInventory.inventoryDate||closedInventory.fixedAt?.slice?.(0,10)||""}`:"غير مثبت"}</small></div>
        {closedInventory?<div className="accounting-lines"><span>كاش الخزنة <b>+ {money(closedInventory.vaultCash)} CAD</b></span><span>إجمالي الأصول <b>{money(closedInventory.totalAssets)} CAD</b></span><span>إجمالي الالتزامات <b>− {money(closedInventory.totalLiabilities)} CAD</b></span><strong>قيمة الجرد = {money(closedInventory.finalValue)} CAD</strong><em className={Math.abs(Number(closedInventory.inventoryDifference||0))<0.005?"positive-value":"negative-value"}>فرق المطابقة = {Number(closedInventory.inventoryDifference||0)>=0?"+":""}{money(closedInventory.inventoryDifference)} CAD</em></div>:<div className="inventory-not-fixed"><p>لا يمكن حساب قيمة الجرد النهائية بافتراض أن كاش الخزنة صفر. أدخل الكاش الفعلي من صفحة الجرد ثم ثبّت الجرد.</p><button type="button" onClick={()=>navigate?.("reports-profits")}>فتح الجرد الشهري</button></div>}
      </article>
    </section>

    <details className="card non-accounting-notice no-print">
      <summary>التحليلات التقديرية غير المحاسبية</summary>
      <p>تم إيقاف توقع نهاية الشهر، درجة صحة الشركة، المقارنة مع شهر غير مكتمل والتنبيهات الآلية من هذه الصفحة؛ لأنها ليست قيودًا دفترية ولا تدخل في رأس المال أو الجرد.</p>
    </details>

    {currencySummary.length>0&&<section className="card budget-currency-summary">
      <div className="section-heading"><h3>💰 رأس المال حسب العملة</h3><small>الشهر المحدد — الدوران من الأموال التي خرجت للتشغيل ثم عادت فعليًا</small></div>
      <div className="budget-currency-grid">{currencySummary.map(item=><div className="capital-currency-detail-card" key={item.currency}>
        <strong className="capital-currency-code">{item.currency}</strong>
        <span className="positive-value">🟢 المضاف: + {money(item.in)}</span>
        <span className="negative-value">🔴 المسحوب: - {money(item.out)}</span>
        <span>💰 رأس المال الحالي: <b>{money(item.currentCapital)}</b></span>
        <span>➡️ خرج للتشغيل: <b>{money(item.operatingOut)}</b></span>
        <span>⬅️ عاد من التشغيل: <b>{money(item.operatingReturned)}</b></span>
        <span className={item.operatingStuck>0?"negative-value":"positive-value"}>⏳ عالق ولم يعد: <b>{money(item.operatingStuck)}</b></span>
        <span className="capital-turnover-line">🔄 دوران رأس المال: <b>{Number(item.turnoverRate||0).toFixed(2)} مرة</b></span>
      </div>)}</div>
      <p className="capital-turnover-note">لا تدخل إضافات أو سحوبات رأس المال (+/−) في حساب الدوران. الدفعات الجزئية تعيد جزءًا مماثلًا من أصل رأس المال فقط، بدون احتساب الربح أو الرسوم كعودة لرأس المال.</p>
    </section>}

    <AppModal
      open={Boolean(budgetModal)}
      title={budgetModal==="movement"?"➕ إضافة رأس مال أو سحب":budgetModal==="history"?"📋 سجل رأس المال":budgetModal==="goals"?"🎯 أهداف التخطيط — غير محاسبية":"📊 تقرير الميزانية"}
      size="xl"
      onClose={()=>setBudgetModal(null)}
    >

        {budgetModal==="movement"&&<form className="form capital-manage-form" onSubmit={async event=>{await addCapital(event);setBudgetModal(null);}}>
          <select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}><option value="IN">إضافة رأس مال</option><option value="OUT">سحب من رأس المال</option></select>
          <input type="number" min=".01" step=".01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="المبلغ" required/>
          <select value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}>{debtCurrencies.map(item=>item.code).map(currency=><option key={currency}>{currency}</option>)}</select>
          <label className="capital-today-field"><span>📅 تاريخ الحركة</span><input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></label>
          <input value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="الوصف أو سبب الإضافة / السحب"/>
          <div className={`capital-conversion-preview ${form.currency!=="CAD"&&!formCadRate?"conversion-missing":""}`}><span>القيمة المعتمدة في الميزانية</span><strong>{formCadAmount!=null?`${money(formCadAmount)} CAD`:(form.currency==="CAD"?"0.00 CAD":"سعر الصرف غير متوفر")}</strong>{form.currency!=="CAD"&&formCadRate&&<small>1 {form.currency} = {Number(formCadRate).toFixed(6)} CAD</small>}</div>
          <div className="budget-modal-actions"><button disabled={form.currency!=="CAD"&&!formCadRate}>{form.type==="IN"?"إضافة رأس المال":"تسجيل السحب"}</button><button type="button" className="secondary-button" onClick={()=>setBudgetModal(null)}>إلغاء</button></div>
        </form>}

        {budgetModal==="history"&&<div className="tablewrap capital-movements-table">
          <div className="capital-table-toolbar">
            <div><h3>جميع الحركات</h3><small>{filteredMovements.length} حركة</small></div>
            <div className="capital-history-tools">
              <button type="button" className="capital-total-button" onClick={()=>setShowCapitalInTotal(value=>!value)}>💰 مجموع الإضافات</button>
              <div className="capital-table-filters"><input value={movementSearch} onChange={e=>setMovementSearch(e.target.value)} placeholder="ابحث في السجل..."/><select value={movementFilter} onChange={e=>setMovementFilter(e.target.value)}><option value="ALL">جميع الحركات</option><option value="IN">الإضافات فقط</option><option value="OUT">السحوبات فقط</option></select></div>
            </div>
          </div>
          {showCapitalInTotal&&<div className="capital-grand-total-card"><span>إجمالي رأس المال المضاف</span><strong>{money(totalAddedCapital)} CAD</strong><small>مجموع جميع حركات الإضافة المسجلة بعد تحويلها إلى الدولار الكندي</small></div>}
          <div className="capital-mobile-cards">
            {filteredMovements.length?filteredMovements.map(item=><article className="transaction-mobile-card capital-mobile-card" key={`capital-mobile-${item.id}`}>
              <header className="transaction-mobile-card__head capital-mobile-card__head">
                <div><strong>{item.type==="IN"?"إضافة رأس مال":"سحب من رأس المال"}</strong><small>{item.date||String(item.createdAt||"").slice(0,10)||"-"}</small></div>
                <span className={`capital-type-badge ${item.type==="IN"?"capital-in":"capital-out"}`}>{item.type==="IN"?"إضافة":"سحب"}</span>
              </header>
              <div className="transaction-mobile-card__grid capital-mobile-card__grid">
                <div><span>التاريخ</span><strong>{item.date||String(item.createdAt||"").slice(0,10)||"-"}</strong></div>
                <div><span>النوع</span><strong>{item.type==="IN"?"إضافة رأس مال":"سحب من رأس المال"}</strong></div>
                <div><span>المبلغ الأصلي</span><strong>{money(item.amount)} {item.currency||"CAD"}</strong></div>
                <div><span>العملة</span><strong>{item.currency||"CAD"}</strong></div>
                <div><span>سعر التحويل</span><strong>{Number(item.exchangeRate||1).toFixed(6)}</strong></div>
                <div className="transaction-mobile-card__total"><span>القيمة CAD</span><strong>{item.cadAmount!=null?money(item.cadAmount):"—"} CAD</strong></div>
                <div><span>الوصف</span><strong>{item.description||"-"}</strong></div>
              </div>
              <footer className="transaction-mobile-card__actions capital-mobile-card__actions">
                <button type="button" onClick={()=>{setBudgetModal(null);setEditing({...item});}}>✏️ تعديل</button>
                <button type="button" className="danger-button" onClick={()=>deleteCapital(item)}>🗑️ حذف</button>
              </footer>
            </article>):<div className="transaction-mobile-empty capital-mobile-empty">لا توجد حركات رأس مال مسجلة.</div>}
          </div>
          <AppTable className="capital-history-table capital-desktop-history"><thead><tr><th>التاريخ</th><th>النوع</th><th>المبلغ الأصلي</th><th>العملة</th><th>سعر التحويل</th><th>القيمة CAD</th><th>الوصف</th><th>الإجراءات</th></tr></thead><tbody>{filteredMovements.length?filteredMovements.map(item=><tr key={item.id}><td data-label="التاريخ">{item.date||String(item.createdAt||"").slice(0,10)}</td><td data-label="النوع"><span className={`capital-type-badge ${item.type==="IN"?"capital-in":"capital-out"}`}>{item.type==="IN"?"إضافة":"سحب"}</span></td><td data-label="المبلغ الأصلي"><strong>{money(item.amount)}</strong></td><td data-label="العملة">{item.currency||"CAD"}</td><td data-label="سعر التحويل">{Number(item.exchangeRate||1).toFixed(6)}</td><td data-label="القيمة CAD"><strong>{item.cadAmount!=null?money(item.cadAmount):"—"} CAD</strong></td><td data-label="الوصف">{item.description||"-"}</td><td data-label="الإجراءات" className="actions"><button type="button" onClick={()=>{setBudgetModal(null);setEditing({...item});}}>تعديل</button><button type="button" className="danger-button" onClick={()=>deleteCapital(item)}>حذف</button></td></tr>):<tr><td colSpan="8" className="capital-history-empty">لا توجد حركات رأس مال مسجلة.</td></tr>}</tbody></AppTable>
        </div>}

        {budgetModal==="goals"&&<div className="budget-goals-modal">
          <label><span>هدف الأرباح</span><input type="number" value={goals.profit} onChange={e=>saveGoals({...goals,profit:Number(e.target.value)})}/></label><div className="goal-track"><span style={{width:`${progress(data.monthlyProfit,goals.profit)}%`}}></span></div><small>{progress(data.monthlyProfit,goals.profit).toFixed(0)}% من الهدف</small>
          <label><span>الحد الأعلى للمصروفات</span><input type="number" value={goals.expenses} onChange={e=>saveGoals({...goals,expenses:Number(e.target.value)})}/></label><div className="goal-track expense-goal"><span style={{width:`${progress(data.monthlyExpenses,goals.expenses)}%`}}></span></div><small>{progress(data.monthlyExpenses,goals.expenses).toFixed(0)}% مستخدم</small>
          <label><span>هدف صافي رأس المال</span><input type="number" value={goals.capital} onChange={e=>saveGoals({...goals,capital:Number(e.target.value)})}/></label><div className="goal-track capital-goal"><span style={{width:`${progress(netWorth,goals.capital)}%`}}></span></div><small>{progress(netWorth,goals.capital).toFixed(0)}% من الهدف</small>
        </div>}

        {budgetModal==="report"&&<div className="budget-report-modal">
          <div className="budget-report-grid"><div><span>إجمالي الحوالات في الشهر</span><strong>{money(data.monthlyTransferValue)} CAD</strong></div><div><span>أرباح الشهر المسجلة</span><strong>{money(data.monthlyProfit)} CAD</strong></div><div><span>مصروفات الشهر</span><strong>{money(data.monthlyExpenses)} CAD</strong></div><div><span>صافي الشهر</span><strong>{money(monthlyNet)} CAD</strong></div></div>
          <div className="capital-formula"><h3>حدود التقرير</h3><p>هذه الأرقام تخص شهر <strong>{data.month}</strong> فقط. الجرد النهائي وفرق المطابقة يعرضان بعد إدخال كاش الخزنة وتثبيت الجرد.</p></div>
          {currencySummary.length>0&&<div className="budget-currency-grid">{currencySummary.map(item=><div key={item.currency}><strong>{item.currency}</strong><span className="positive-value">المضاف + {money(item.in)}</span><span className="negative-value">المسحوب - {money(item.out)}</span><span>الدوران 🔄 {Number(item.turnoverRate||0).toFixed(2)} مرة</span></div>)}</div>}
          <button type="button" onClick={()=>window.print()}>🖨️ طباعة التقرير</button>
        </div>}
    </AppModal>

    <AppModal open={Boolean(editing)} title="✏️ تعديل حركة رأس المال" onClose={()=>setEditing(null)}>
      {editing&&<form className="form capital-edit-form" onSubmit={saveEdit}>
      <select value={editing.type} onChange={e=>setEditing({...editing,type:e.target.value})}><option value="IN">إضافة رأس مال</option><option value="OUT">سحب من رأس المال</option></select>
      <input type="number" min=".01" step=".01" value={editing.amount} onChange={e=>setEditing({...editing,amount:e.target.value})} required/>
      <select value={editing.currency||"CAD"} onChange={e=>setEditing({...editing,currency:e.target.value})}>{debtCurrencies.map(item=>item.code).map(currency=><option key={currency}>{currency}</option>)}</select>
      <input type="date" value={editing.date||""} onChange={e=>setEditing({...editing,date:e.target.value})}/><input value={editing.description||""} onChange={e=>setEditing({...editing,description:e.target.value})} placeholder="الوصف"/>
      <div className="budget-modal-actions"><button>حفظ التعديل</button><button type="button" className="secondary-button" onClick={()=>setEditing(null)}>إلغاء</button></div>
      </form>}
    </AppModal>
  </>;
}

export { CapitalOverview };
