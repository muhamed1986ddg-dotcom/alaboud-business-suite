import React,{useEffect,useRef,useState}from"react";
import api,{cachedGet} from"../api";
import {APP_VERSION} from"../version";
import {money,cad,openRegularWhatsApp,currencyFlag,flagOf,cleanConnectorMessage,EXCHANGE_CURRENCY_CATALOG,debtCurrencies,CurrencyFlag,rateTrend} from"../shared";

function CapitalOverview(){
  const [month,setMonth]=useState(new Date().toISOString().slice(0,7));
  const [data,setData]=useState(null);
  const [previousData,setPreviousData]=useState(null);
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
  const [movementFilter,setMovementFilter]=useState("ALL");
  const [movementSearch,setMovementSearch]=useState("");
  const [form,setForm]=useState({
    type:"IN",
    amount:"",
    currency:"CAD",
    description:"",
    date:new Date().toISOString().slice(0,10)
  });

  async function load(){
    setError("");
    try{
      const selectedDate=new Date(`${month}-01T00:00:00`);
      selectedDate.setMonth(selectedDate.getMonth()-1);
      const previousMonth=selectedDate.toISOString().slice(0,7);
      const [overviewResponse,previousResponse,movementsResponse,ratesResponse]=await Promise.all([
        cachedGet("/capital-overview",{params:{month}}),
        cachedGet("/capital-overview",{params:{month:previousMonth}}),
        cachedGet("/capital"),
        cachedGet("/exchange-rates")
      ]);
      setData(overviewResponse.data);
      setPreviousData(previousResponse.data);
      setMovements(Array.isArray(movementsResponse.data)?movementsResponse.data:[]);
      setExchangeRates(Array.isArray(ratesResponse.data)?ratesResponse.data:[]);
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر تحميل رأس المال");
    }
  }

  useEffect(()=>{load();},[month]);

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
      await load();
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
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر تعديل رأس المال");
    }
  }

  async function deleteCapital(item){
    if(!window.confirm(`هل تريد حذف حركة رأس المال بقيمة ${money(item.amount)} ${item.currency||"CAD"}؟`))return;
    setError("");setMessage("");
    try{
      await api.delete(`/capital/${item.id}`);
      setMessage("تم حذف حركة رأس المال");
      if(editing?.id===item.id)setEditing(null);
      await load();
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

  if(!data)return <><h2>رأس المال الكلي</h2>{error?<div className="card customer-error">{error}</div>:<p>جاري التحميل...</p>}</>;

  const efficiency=data.turnoverRate>=3?"ممتاز":data.turnoverRate>=2?"جيد جداً":data.turnoverRate>=1?"جيد":"منخفض";
  const selectedMonthMovements=movements.filter(item=>String(item.date||item.createdAt||"").slice(0,7)===month);
  const capitalIn=selectedMonthMovements.filter(item=>item.type==="IN").reduce((sum,item)=>sum+Number((item.cadAmount ?? item.amount ?? 0)),0);
  const capitalOut=selectedMonthMovements.filter(item=>item.type==="OUT").reduce((sum,item)=>sum+Number((item.cadAmount ?? item.amount ?? 0)),0);
  const netCapitalMovement=capitalIn-capitalOut;
  const totalFlow=capitalIn+capitalOut;
  const inShare=totalFlow?Math.round((capitalIn/totalFlow)*100):0;
  const outShare=totalFlow?100-inShare:0;
  const monthlyNet=Number(data.monthlyProfit||0)-Number(data.monthlyExpenses||0);
  const liquidityStatus=Number(data.capitalBalance||0)>0?"مستقرة":"تحتاج متابعة";
  const filteredMovements=movements.filter(item=>{
    const matchesType=movementFilter==="ALL"||item.type===movementFilter;
    const text=`${item.description||""} ${item.currency||""} ${item.amount||""} ${item.date||item.createdAt||""}`.toLowerCase();
    return matchesType&&text.includes(movementSearch.trim().toLowerCase());
  });
  const currencySummary=Object.values(selectedMonthMovements.reduce((acc,item)=>{
    const currency=item.currency||"CAD";
    acc[currency]??={currency,in:0,out:0};
    acc[currency][item.type==="IN"?"in":"out"]+=Number(item.amount||0);
    return acc;
  },{}));

  const today=new Date();
  const selectedDate=new Date(`${month}-01T00:00:00`);
  const isCurrentMonth=today.getFullYear()===selectedDate.getFullYear()&&today.getMonth()===selectedDate.getMonth();
  const daysInMonth=new Date(selectedDate.getFullYear(),selectedDate.getMonth()+1,0).getDate();
  const elapsedDays=isCurrentMonth?Math.max(1,today.getDate()):daysInMonth;
  const projectedProfit=(Number(data.monthlyProfit||0)/elapsedDays)*daysInMonth;
  const projectedExpenses=(Number(data.monthlyExpenses||0)/elapsedDays)*daysInMonth;
  const projectedNet=projectedProfit-projectedExpenses;
  const debtForUs=Number(data.totalReceivables ?? (Number(data.receivables||0)+Number(data.generalReceivable||0)));
  const debtOnUs=Number(data.totalPayables ?? data.generalPayable ?? 0);
  const netDebt=Number(data.netDebt ?? (debtForUs-debtOnUs));
  const totalMoney=Number(data.totalMoney ?? (Number(data.capitalBalance||0)+Number(data.accumulatedProfit||0)+debtForUs));
  const totalLiabilities=Number(data.totalLiabilities ?? (Number(data.accumulatedExpenses||0)+debtOnUs));
  const netCapital=Number(data.netCapital ?? (totalMoney-totalLiabilities));
  const estimatedCapital=Number(data.estimatedCapital ?? data.totalCapital ?? netCapital);
  const netWorth=estimatedCapital;
  const profitChange=previousData&&Number(previousData.monthlyProfit||0)!==0?((Number(data.monthlyProfit||0)-Number(previousData.monthlyProfit||0))/Math.abs(Number(previousData.monthlyProfit||0)))*100:null;
  const expenseChange=previousData&&Number(previousData.monthlyExpenses||0)!==0?((Number(data.monthlyExpenses||0)-Number(previousData.monthlyExpenses||0))/Math.abs(Number(previousData.monthlyExpenses||0)))*100:null;
  const netPrevious=Number(previousData?.monthlyProfit||0)-Number(previousData?.monthlyExpenses||0);
  const netChange=netPrevious!==0?((monthlyNet-netPrevious)/Math.abs(netPrevious))*100:null;
  const liquidityRatio=Number(data.generalPayable||0)>0?(Number(data.receivables||0)+Number(data.generalReceivable||0))/Number(data.generalPayable||0):3;
  const profitMargin=Number(data.monthlyTransferValue||0)>0?monthlyNet/Number(data.monthlyTransferValue||0):0;
  const healthScore=Math.max(0,Math.min(100,Math.round(
    (monthlyNet>=0?30:8)+
    Math.min(25,Math.max(0,liquidityRatio*10))+
    Math.min(20,Math.max(0,Number(data.turnoverRate||0)*6))+
    Math.min(15,Math.max(0,profitMargin*400))+
    (netCapitalMovement>=0?10:3)
  )));
  const healthLabel=healthScore>=85?"ممتاز":healthScore>=70?"جيد جداً":healthScore>=55?"جيد":healthScore>=40?"يحتاج متابعة":"حرج";
  const alerts=[];
  if(monthlyNet<0)alerts.push({level:"danger",text:"صافي الشهر سالب؛ المصروفات تجاوزت الأرباح."});
  if(expenseChange!=null&&expenseChange>15)alerts.push({level:"warning",text:`المصروفات ارتفعت ${expenseChange.toFixed(1)}% عن الشهر السابق.`});
  if(Number(data.generalPayable||0)>Number(data.generalReceivable||0)+Number(data.receivables||0))alerts.push({level:"danger",text:"الديون علينا أعلى من إجمالي المبالغ المستحقة لنا."});
  if(Number(data.turnoverRate||0)<1)alerts.push({level:"warning",text:"معدل دوران رأس المال منخفض عن مرة واحدة."});
  if(projectedNet>monthlyNet&&isCurrentMonth)alerts.push({level:"info",text:`التوقع الحالي لصافي نهاية الشهر ${money(projectedNet)} CAD.`});
  if(!alerts.length)alerts.push({level:"success",text:"المؤشرات المالية مستقرة ولا توجد تنبيهات حرجة."});
  const saveGoals=next=>{setGoals(next);localStorage.setItem("alaboud-budget-goals",JSON.stringify(next));};
  const progress=(value,target)=>Math.max(0,Math.min(100,target>0?(Number(value||0)/Number(target))*100:0));

  return <>
    <div className="page-title-row budget-title-row">
      <div>
        <h2>⚖️ الميزانية</h2>
        <p>نظرة مالية متكاملة على رأس المال والسيولة والأرباح</p>
      </div>
      <div className="budget-title-actions no-print">
        <input type="month" value={month} onChange={e=>setMonth(e.target.value)}/>
        <button onClick={load}>↻ تحديث</button>
        <button onClick={()=>window.print()}>🖨️ طباعة التقرير</button>
      </div>
    </div>

    {error&&<div className="card customer-error">{error}</div>}
    {message&&<div className="card rate-message">{message}</div>}

    <section className="financial-summary-grid" aria-label="ملخص الميزانية">
      <button type="button" className="card financial-summary-card assets-card" onClick={()=>setFinancialDetails("assets")}>
        <span className="financial-card-icon">💰</span>
        <div><small>إجمالي الأصول</small><h3>المال الكلي</h3></div>
        <strong>{money(totalMoney)} CAD</strong>
        <p>رأس المال + الأرباح + الدين لنا</p>
        <em>اضغط لعرض التفاصيل</em>
      </button>
      <button type="button" className="card financial-summary-card liabilities-card" onClick={()=>setFinancialDetails("liabilities")}>
        <span className="financial-card-icon">📉</span>
        <div><small>إجمالي الخصومات</small><h3>إجمالي الالتزامات</h3></div>
        <strong>{money(totalLiabilities)} CAD</strong>
        <p>الدين علينا + المصروفات</p>
        <em>اضغط لعرض التفاصيل</em>
      </button>
      <button type="button" className={`card financial-summary-card net-capital-card ${netCapital<0?"is-negative":""}`} onClick={()=>setFinancialDetails("net")}>
        <span className="financial-card-icon">💎</span>
        <div><small>المجموع النهائي</small><h3>صافي رأس المال</h3></div>
        <strong>{money(netCapital)} CAD</strong>
        <p>المال الكلي − إجمالي الالتزامات</p>
        <em>اضغط لعرض الحساب الكامل</em>
      </button>
    </section>

    <section className="card financial-equation-card">
      <div className="section-heading"><h3>🧮 معادلة صافي رأس المال</h3><small>جميع القيم محوّلة إلى الدولار الكندي CAD</small></div>
      <div className="financial-equation-row">
        <span><small>المال الكلي</small><b>{money(totalMoney)}</b></span>
        <i>−</i>
        <span><small>إجمالي الالتزامات</small><b>{money(totalLiabilities)}</b></span>
        <i>=</i>
        <span className={netCapital>=0?"equation-result positive":"equation-result negative"}><small>صافي رأس المال</small><b>{money(netCapital)} CAD</b></span>
      </div>
    </section>

    {financialDetails&&<div className="financial-details-overlay" onClick={()=>setFinancialDetails(null)}>
      <section className="card financial-details-modal" role="dialog" aria-modal="true" aria-label="تفاصيل الميزانية" onClick={event=>event.stopPropagation()}>
        <div className="financial-details-head">
          <div>
            <small>تفاصيل مالية دقيقة — CAD</small>
            <h3>{financialDetails==="assets"?"💰 تفاصيل المال الكلي":financialDetails==="liabilities"?"📉 تفاصيل إجمالي الالتزامات":"💎 تفاصيل صافي رأس المال"}</h3>
          </div>
          <button type="button" onClick={()=>setFinancialDetails(null)} aria-label="إغلاق">×</button>
        </div>
        {(financialDetails==="assets"||financialDetails==="net")&&<div className="financial-detail-group assets-detail-group">
          <h4>الأصول</h4>
          <p><span>رأس المال المضاف</span><b>+ {money(data.capitalBalance)} CAD</b></p>
          <p><span>الأرباح المتراكمة</span><b>+ {money(data.accumulatedProfit||0)} CAD</b></p>
          <p><span>الدين لنا</span><b>+ {money(debtForUs)} CAD</b></p>
          <p className="detail-total"><span>المال الكلي</span><strong>{money(totalMoney)} CAD</strong></p>
        </div>}
        {(financialDetails==="liabilities"||financialDetails==="net")&&<div className="financial-detail-group liabilities-detail-group">
          <h4>الالتزامات</h4>
          <p><span>الدين علينا</span><b>− {money(debtOnUs)} CAD</b></p>
          <p><span>المصروفات المتراكمة</span><b>− {money(data.accumulatedExpenses||0)} CAD</b></p>
          <p className="detail-total"><span>إجمالي الالتزامات</span><strong>{money(totalLiabilities)} CAD</strong></p>
        </div>}
        {financialDetails==="net"&&<div className={`financial-final-result ${netCapital>=0?"positive":"negative"}`}>
          <span>المال الكلي {money(totalMoney)} − الالتزامات {money(totalLiabilities)}</span>
          <strong>صافي رأس المال: {money(netCapital)} CAD</strong>
        </div>}
      </section>
    </div>}

    <section className="budget-command-grid">
      <article className="card company-health-card">
        <div className="section-heading"><h3>🏥 صحة الشركة</h3><small>{healthLabel}</small></div>
        <div className="health-score-ring" style={{"--score":`${healthScore*3.6}deg`}}><strong>{healthScore}</strong><span>/100</span></div>
        <p>مؤشر مركب من السيولة والربحية والدوران وحركة رأس المال.</p>
      </article>
      <article className="card net-worth-card">
        <div className="section-heading"><h3>💎 صافي الثروة</h3><small>بعد خصم جميع الالتزامات</small></div>
        <strong className={netWorth>=0?"positive-value":"negative-value"}>{money(netWorth)} CAD</strong>
        <div className="net-worth-breakdown"><span>المال الكلي {money(totalMoney)}</span><span>إجمالي الالتزامات {money(totalLiabilities)}</span><span>صافي رأس المال {money(netCapital)}</span></div>
      </article>
      <article className="card forecast-card">
        <div className="section-heading"><h3>🔮 توقع نهاية الشهر</h3><small>{isCurrentMonth?`${elapsedDays}/${daysInMonth} يوم` : "شهر مكتمل"}</small></div>
        <strong className={projectedNet>=0?"positive-value":"negative-value"}>{money(projectedNet)} CAD</strong>
        <div className="forecast-pairs"><span>أرباح متوقعة <b>{money(projectedProfit)}</b></span><span>مصروفات متوقعة <b>{money(projectedExpenses)}</b></span></div>
      </article>
    </section>

    <section className="budget-comparison-grid">
      <article className="card comparison-card"><span>الأرباح مقارنة بالشهر السابق</span><strong className={(profitChange??0)>=0?"positive-value":"negative-value"}>{profitChange==null?"—":`${profitChange>=0?"+":""}${profitChange.toFixed(1)}%`}</strong><small>{money(data.monthlyProfit)} مقابل {money(previousData?.monthlyProfit)}</small></article>
      <article className="card comparison-card"><span>المصروفات مقارنة بالشهر السابق</span><strong className={(expenseChange??0)<=0?"positive-value":"negative-value"}>{expenseChange==null?"—":`${expenseChange>=0?"+":""}${expenseChange.toFixed(1)}%`}</strong><small>{money(data.monthlyExpenses)} مقابل {money(previousData?.monthlyExpenses)}</small></article>
      <article className="card comparison-card"><span>صافي الربح مقارنة بالشهر السابق</span><strong className={(netChange??0)>=0?"positive-value":"negative-value"}>{netChange==null?"—":`${netChange>=0?"+":""}${netChange.toFixed(1)}%`}</strong><small>{money(monthlyNet)} مقابل {money(netPrevious)}</small></article>
    </section>

    <section className="budget-pro-grid">
      <article className="card budget-goals-card no-print">
        <div className="section-heading"><h3>🎯 الأهداف المالية</h3><small>تُحفظ على الجهاز</small></div>
        <label><span>هدف الأرباح</span><input type="number" value={goals.profit} onChange={e=>saveGoals({...goals,profit:Number(e.target.value)})}/></label>
        <div className="goal-track"><span style={{width:`${progress(data.monthlyProfit,goals.profit)}%`}}></span></div>
        <small>{progress(data.monthlyProfit,goals.profit).toFixed(0)}% من الهدف</small>
        <label><span>الحد الأعلى للمصروفات</span><input type="number" value={goals.expenses} onChange={e=>saveGoals({...goals,expenses:Number(e.target.value)})}/></label>
        <div className="goal-track expense-goal"><span style={{width:`${progress(data.monthlyExpenses,goals.expenses)}%`}}></span></div>
        <small>{progress(data.monthlyExpenses,goals.expenses).toFixed(0)}% مستخدم</small>
        <label><span>هدف صافي رأس المال</span><input type="number" value={goals.capital} onChange={e=>saveGoals({...goals,capital:Number(e.target.value)})}/></label>
        <div className="goal-track capital-goal"><span style={{width:`${progress(netWorth,goals.capital)}%`}}></span></div>
        <small>{progress(netWorth,goals.capital).toFixed(0)}% من الهدف</small>
      </article>
      <article className="card budget-alerts-card">
        <div className="section-heading"><h3>🔔 التنبيهات الذكية</h3><small>{alerts.length} ملاحظة</small></div>
        <div className="smart-alert-list">{alerts.map((alert,index)=><div key={index} className={`smart-alert ${alert.level}`}>{alert.text}</div>)}</div>
      </article>
      <article className="card executive-summary-card">
        <div className="section-heading"><h3>🤖 ملخص المدير</h3><small>تحليل فوري</small></div>
        <p>{monthlyNet>=0?"الشركة تحقق صافيًا إيجابيًا خلال الشهر المحدد.":"يجب مراجعة المصروفات لأن صافي الشهر سلبي."}</p>
        <p>{profitChange==null?"لا توجد بيانات كافية للمقارنة الشهرية.":profitChange>=0?`الأرباح ارتفعت ${profitChange.toFixed(1)}% عن الشهر السابق.`:`الأرباح انخفضت ${Math.abs(profitChange).toFixed(1)}% عن الشهر السابق.`}</p>
        <p>{liquidityRatio>=1.5?"تغطية الالتزامات جيدة وفق المبالغ المستحقة.":"تغطية الالتزامات تحتاج متابعة وتحصيل أسرع."}</p>
        <p>كفاءة دوران رأس المال مصنفة: <strong>{efficiency}</strong>.</p>
      </article>
    </section>

    <section className="budget-intelligence-grid">
      <article className="card budget-flow-card">
        <div className="section-heading"><h3>📊 تدفق رأس المال</h3><small>{month}</small></div>
        <div className="budget-flow-track"><span style={{width:`${inShare}%`}}></span><b style={{width:`${outShare}%`}}></b></div>
        <div className="budget-flow-legend"><span>إضافات {inShare}%</span><span>سحوبات {outShare}%</span></div>
      </article>
      <article className="card budget-health-card">
        <div className="section-heading"><h3>💡 المؤشر المالي</h3><small>{liquidityStatus}</small></div>
        <strong className={monthlyNet>=0?"positive-value":"negative-value"}>{money(monthlyNet)} CAD</strong>
        <p>صافي أرباح الشهر بعد خصم المصروفات</p>
      </article>
      <article className="card budget-turnover-card">
        <div className="section-heading"><h3>⚡ كفاءة رأس المال</h3><small>{efficiency}</small></div>
        <strong>{Number(data.turnoverRate).toFixed(2)}×</strong>
        <div className="budget-score"><span style={{width:`${Math.min(100,Number(data.turnoverRate||0)*25)}%`}}></span></div>
      </article>
    </section>

    {currencySummary.length>0&&<section className="card budget-currency-summary">
      <div className="section-heading"><h3>💱 حركة رأس المال حسب العملة</h3><small>الشهر المحدد</small></div>
      <div className="budget-currency-grid">{currencySummary.map(item=><div key={item.currency}>
        <strong>{item.currency}</strong><span className="positive-value">+ {money(item.in)}</span><span className="negative-value">- {money(item.out)}</span>
      </div>)}</div>
    </section>}

    <form className="card form capital-manage-form no-print" onSubmit={addCapital}>
      <h3>➕ إضافة رأس مال أو سحب</h3>
      <select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>
        <option value="IN">إضافة رأس مال</option>
        <option value="OUT">سحب من رأس المال</option>
      </select>
      <input
        type="number"
        min=".01"
        step=".01"
        value={form.amount}
        onChange={e=>setForm({...form,amount:e.target.value})}
        placeholder="المبلغ"
        required
      />
      <select value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}>
        {debtCurrencies.map(item=>item.code).map(currency=><option key={currency}>{currency}</option>)}
      </select>
      <label className="capital-today-field">
        <span>📅 تاريخ اليوم</span>
        <input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/>
      </label>
      <input value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="الوصف أو سبب الإضافة / السحب"/>
      <div className={`capital-conversion-preview ${form.currency!=="CAD"&&!formCadRate?"conversion-missing":""}`}>
        <span>القيمة المعتمدة في الميزانية</span>
        <strong>{formCadAmount!=null?`${money(formCadAmount)} CAD`:(form.currency==="CAD"?"0.00 CAD":"سعر الصرف غير متوفر")}</strong>
        {form.currency!=="CAD"&&formCadRate&&<small>1 {form.currency} = {Number(formCadRate).toFixed(6)} CAD</small>}
      </div>
      <button disabled={form.currency!=="CAD"&&!formCadRate}>{form.type==="IN"?"إضافة رأس المال":"تسجيل السحب"}</button>
    </form>

    {editing&&<form className="card form edit-panel capital-edit-form no-print" onSubmit={saveEdit}>
      <h3>✏️ تعديل حركة رأس المال</h3>
      <select value={editing.type} onChange={e=>setEditing({...editing,type:e.target.value})}>
        <option value="IN">إضافة رأس مال</option>
        <option value="OUT">سحب من رأس المال</option>
      </select>
      <input type="number" min=".01" step=".01" value={editing.amount} onChange={e=>setEditing({...editing,amount:e.target.value})} required/>
      <select value={editing.currency||"CAD"} onChange={e=>setEditing({...editing,currency:e.target.value})}>
        {debtCurrencies.map(item=>item.code).map(currency=><option key={currency}>{currency}</option>)}
      </select>
      <input type="date" value={editing.date||""} onChange={e=>setEditing({...editing,date:e.target.value})}/>
      <input value={editing.description||""} onChange={e=>setEditing({...editing,description:e.target.value})} placeholder="الوصف"/>
      <button>حفظ التعديل</button>
      <button type="button" onClick={()=>setEditing(null)}>إلغاء</button>
    </form>}

    <div className="card tablewrap capital-movements-table">
      <div className="capital-table-toolbar">
        <div><h3>📋 سجل رأس المال</h3><small>{filteredMovements.length} حركة</small></div>
        <div className="capital-table-filters no-print">
          <input value={movementSearch} onChange={e=>setMovementSearch(e.target.value)} placeholder="ابحث في السجل..."/>
          <select value={movementFilter} onChange={e=>setMovementFilter(e.target.value)}><option value="ALL">جميع الحركات</option><option value="IN">الإضافات فقط</option><option value="OUT">السحوبات فقط</option></select>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>التاريخ</th>
            <th>النوع</th>
            <th>المبلغ الأصلي</th>
            <th>العملة</th>
            <th>سعر التحويل</th>
            <th>القيمة CAD</th>
            <th>الوصف</th>
            <th className="no-print">الإجراءات</th>
          </tr>
        </thead>
        <tbody>{filteredMovements.length?filteredMovements.map(item=><tr key={item.id}>
          <td>{item.date||String(item.createdAt||"").slice(0,10)}</td>
          <td><span className={`capital-type-badge ${item.type==="IN"?"capital-in":"capital-out"}`}>
            {item.type==="IN"?"إضافة":"سحب"}
          </span></td>
          <td><strong>{money(item.amount)}</strong></td>
          <td>{item.currency||"CAD"}</td>
          <td>{Number(item.exchangeRate||1).toFixed(6)}</td>
          <td><strong>{item.cadAmount!=null?money(item.cadAmount):"—"} CAD</strong></td>
          <td>{item.description||"-"}</td>
          <td className="actions no-print">
            <button type="button" onClick={()=>setEditing({...item})}>تعديل</button>
            <button type="button" className="danger-button" onClick={()=>deleteCapital(item)}>حذف</button>
          </td>
        </tr>):<tr><td colSpan="8">لا توجد حركات رأس مال مسجلة.</td></tr>}</tbody>
      </table>
    </div>

    <div className="stats">
      <div className="card transfer-total-card">
        <span>إجمالي الحوالات في الشهر</span>
        <strong>{money(data.monthlyTransferValue)}</strong>
      </div>
      <div className="card turnover-card">
        <span>معدل دوران رأس المال</span>
        <strong>{Number(data.turnoverRate).toFixed(2)} مرة</strong>
        <small>{efficiency}</small>
      </div>
      <div className="card"><span>أرباح الشهر</span><strong>{money(data.monthlyProfit)}</strong></div>
      <div className="card"><span>مصروفات الشهر</span><strong>{money(data.monthlyExpenses)}</strong></div>
    </div>

    <div className="card capital-formula">
      <h3>حركة دوران رأس المال</h3>
      <p><strong>إجمالي قيمة الحوالات الشهرية ÷ رأس المال المستخدم</strong></p>
      <p>النتيجة الحالية: <strong>{Number(data.turnoverRate).toFixed(2)} مرة</strong> خلال شهر {data.month}.</p>
    </div>
  </>;
}

export { CapitalOverview };
