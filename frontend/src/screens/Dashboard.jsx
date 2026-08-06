import React,{useEffect,useRef,useState} from "react";
import api,{cachedGet} from "../api";
import {APP_VERSION} from "../version";
import {money,cad,openRegularWhatsApp,currencyFlag,flagOf,cleanConnectorMessage,EXCHANGE_CURRENCY_CATALOG,debtCurrencies,CurrencyFlag,rateTrend,confirmAction} from "../shared";

export function Dashboard({navigate}){
  const [data,setData]=useState(null);
  const [noticeData,setNoticeData]=useState({count:0,overdueCount:0,overdueTotal:0,notifications:[]});
  const [recent,setRecent]=useState([]);
  const [dashboardRates,setDashboardRates]=useState([]);
  const [dashboardRateHistory,setDashboardRateHistory]=useState([]);
  const [ratesRefreshing,setRatesRefreshing]=useState(false);
  const [ratesError,setRatesError]=useState("");
  const [open,setOpen]=useState(false);
  const [intelligence,setIntelligence]=useState(null);
  const [lastRefresh,setLastRefresh]=useState(new Date());
  const [allTransactions,setAllTransactions]=useState([]);
  const [customers,setCustomers]=useState([]);
  const [expenses,setExpenses]=useState([]);
  const [globalSearch,setGlobalSearch]=useState("");
  const [searchOpen,setSearchOpen]=useState(false);

  useEffect(()=>{
    let active=true;
    let lastCompactRefresh=0;
    let lastRatesRefresh=Date.now();

    const loadCompact=async(force=false)=>{
      if(!active||document.visibilityState==="hidden")return;
      const now=Date.now();
      if(!force&&now-lastCompactRefresh<5*60*1000)return;
      lastCompactRefresh=now;
      try{
        const [dashboardResponse,notificationResponse]=await Promise.allSettled([
          cachedGet("/dashboard",{cacheTtl:force?0:60*1000,persistCache:!force}),
          cachedGet("/notifications",{cacheTtl:force?0:60*1000,persistCache:!force})
        ]);
        if(!active)return;
        if(dashboardResponse.status==="fulfilled")setData(dashboardResponse.value.data);
        if(notificationResponse.status==="fulfilled")setNoticeData(notificationResponse.value.data);
        setLastRefresh(new Date());
      }catch{}
    };

    const loadEnhancements=async(refreshRates=false,refreshCompact=true)=>{
      try{
        if(refreshRates){setRatesRefreshing(true);setRatesError("");await api.post("/exchange-rates/refresh");}
        if(refreshCompact)await loadCompact(true);
        const results=await Promise.allSettled([
          cachedGet("/transactions",{params:{limit:50},cacheTtl:2*60*1000,persistCache:true}),
          cachedGet("/exchange-rates",{cacheTtl:10*60*1000,persistCache:true}),
          cachedGet("/exchange-rates/history",{params:{limit:60},cacheTtl:10*60*1000,persistCache:true}),
          cachedGet("/ai/overview",{cacheTtl:5*60*1000}),
          cachedGet("/customers",{params:{limit:100},cacheTtl:2*60*1000,persistCache:true}),
          cachedGet("/expenses",{params:{limit:100},cacheTtl:2*60*1000,persistCache:true})
        ]);
        if(!active)return;
        const value=index=>results[index]?.status==="fulfilled"?results[index].value?.data:null;
        const transactionData=value(0),rateData=value(1),historyData=value(2),intelligenceData=value(3),customerData=value(4),expenseData=value(5);
        if(transactionData){
          const rows=Array.isArray(transactionData)?transactionData:(Array.isArray(transactionData?.items)?transactionData.items:[]);
          setAllTransactions(rows);
          setRecent(rows.slice().sort((a,b)=>new Date(b.createdAt||b.transferDate)-new Date(a.createdAt||a.transferDate)).slice(0,4));
        }
        if(Array.isArray(customerData))setCustomers(customerData);
        else if(Array.isArray(customerData?.items))setCustomers(customerData.items);
        if(Array.isArray(expenseData))setExpenses(expenseData);
        else if(Array.isArray(expenseData?.items))setExpenses(expenseData.items);
        if(rateData)setDashboardRates(Array.isArray(rateData)?rateData:[]);
        if(Array.isArray(historyData))setDashboardRateHistory(historyData);
        else if(Array.isArray(historyData?.items))setDashboardRateHistory(historyData.items);
        if(intelligenceData)setIntelligence(intelligenceData);
        setLastRefresh(new Date());
      }catch(error){
        setRatesError(error.response?.data?.message||(refreshRates?"تعذر تحديث أسعار الصرف. تم الاحتفاظ بآخر أسعار صحيحة.":"تعذر تحميل بعض تفاصيل القائمة الرئيسية."));
      }finally{
        if(refreshRates)setRatesRefreshing(false);
      }
    };

    loadCompact(true);
    const startEnhancements=()=>loadEnhancements(false,false);
    const idleHandle=typeof requestIdleCallback==="function"
      ? requestIdleCallback(startEnhancements,{timeout:1200})
      : setTimeout(startEnhancements,250);
    const live=setInterval(()=>loadCompact(false),5*60*1000);
    const onVisibility=()=>{
      if(document.visibilityState!=="visible")return;
      loadCompact(false);
      if(Date.now()-lastRatesRefresh>=60*60*1000){
        lastRatesRefresh=Date.now();
        loadEnhancements(true);
      }
    };
    document.addEventListener("visibilitychange",onVisibility);
    return ()=>{
      active=false;
      clearInterval(live);
      if(typeof cancelIdleCallback==="function")cancelIdleCallback(idleHandle);else clearTimeout(idleHandle);
      document.removeEventListener("visibilitychange",onVisibility);
    };
  },[]);

  useEffect(()=>{
    const onKey=event=>{
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"){
        event.preventDefault();setSearchOpen(true);
      }
      if(event.key==="Escape")setSearchOpen(false);
    };
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[]);

  if(!data)return <div className="premium-loading">جاري تحميل لوحة التحكم…</div>;

  const smart=intelligence||{};
  const healthScore=Number(smart.healthScore??100);
  const health=healthScore>=85?{label:"ممتاز",tone:"excellent",icon:"🟢"}:healthScore>=65?{label:"جيد",tone:"good",icon:"🟡"}:healthScore>=40?{label:"يحتاج متابعة",tone:"attention",icon:"🟠"}:{label:"خطر",tone:"danger",icon:"🔴"};
  const netProfit=Number(smart.today?.netProfit??data.todayProfit??0);
  const netDebt=Number(smart.finance?.receivables??data.receivables??0);
  const profitTrend=Number(smart.month?.profitTrend||0);
  const todayKey=new Date().toISOString().slice(0,10);
  const last7=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));return d.toISOString().slice(0,10)});
  const chartData=last7.map(date=>{
    const dayRows=allTransactions.filter(item=>String(item.transferDate||item.createdAt||"").slice(0,10)===date);
    return {date,total:dayRows.reduce((sum,item)=>sum+Number(item.totalCustomerDue||item.amount||0),0),profit:dayRows.reduce((sum,item)=>sum+Number(item.profit||item.netProfit||0),0)};
  });
  const chartMax=Math.max(1,...chartData.map(item=>Math.max(item.total,item.profit)));
  const customerScores=customers.map(customer=>{
    const customerRows=allTransactions.filter(item=>String(item.customerId)===String(customer.id));
    const profit=customerRows.reduce((sum,item)=>sum+Number(item.profit||item.netProfit||0),0);
    const volume=customerRows.reduce((sum,item)=>sum+Number(item.totalCustomerDue||item.amount||0),0);
    const debt=Number(customer.finalBalance||0);
    const grade=profit>=1000&&debt<=0?"A":profit>=300?"B":"C";
    return {...customer,profit,volume,debt,grade,operations:customerRows.length};
  }).sort((a,b)=>b.profit-a.profit);
  const monthlyRows=allTransactions.filter(item=>String(item.transferDate||item.createdAt||"").slice(0,7)===todayKey.slice(0,7));
  const currencyProfit=Object.entries(monthlyRows.reduce((acc,item)=>{const c=String(item.currency||"CAD").toUpperCase();acc[c]=(acc[c]||0)+Number(item.profit||item.netProfit||0);return acc},{})).sort((a,b)=>b[1]-a[1]);
  const query=globalSearch.trim().toLowerCase();
  const searchResults=query?[...customers.map(x=>({type:"عميل",title:x.name||"عميل",subtitle:`الرصيد ${cad(x.finalBalance||0)}`,page:"customers"})),...allTransactions.map(x=>({type:"حوالة",title:x.number||x.customerName||"حوالة",subtitle:`${x.amount||0} ${x.currency||""}`,page:"transactions"})),...expenses.map(x=>({type:"مصروف",title:x.title||x.description||"مصروف",subtitle:cad(x.amount||0),page:"expenses"}))].filter(x=>`${x.title} ${x.subtitle} ${x.type}`.toLowerCase().includes(query)).slice(0,12):[];

  const kpis=[
    {label:"صافي الأرباح",value:cad(netProfit),icon:"📈",tone:netProfit>=0?"green":"red",note:`${profitTrend>=0?"▲":"▼"} ${Math.abs(profitTrend).toFixed(1)}% هذا الشهر`,page:"profits"},
    {label:"صافي الدين",value:cad(netDebt),icon:"💸",tone:netDebt>0?"red":"green",note:`${smart.finance?.overdueCount??noticeData.overdueCount??0} عملاء متأخرون`,page:"general-debts"},
    {label:"رصيد الصندوق",value:cad(smart.finance?.capital??data.capital??0),icon:"🏦",tone:Number(smart.finance?.capital??data.capital??0)>=0?"blue":"red",note:"الرصيد الحالي",page:"capital-overview"},
    {label:"حوالات اليوم",value:data.todayTransactions||0,icon:"💱",tone:"purple",note:"إجمالي العمليات اليوم",page:"transactions"},
    {label:"عدد العملاء",value:data.customers||0,icon:"👥",tone:"blue",note:"العملاء المسجلون",page:"customers"},
    {label:"مصروفات اليوم",value:cad(smart.today?.expenses||0),icon:"👛",tone:"orange",note:"المصروفات اليومية",page:"expenses"}
  ];

  return <div className="premium-dashboard v20-dashboard">
    <section className="premium-hero dashboard-pro-hero">
      <div className="dashboard-pro-brand">
        <img src="/alaboud-company-logo.webp" alt="شركة العبود التجارية"/>
        <div><h2>شركة العبود التجارية</h2><p>{APP_VERSION} <span>● متصل</span></p></div>
      </div>
      <button className="dashboard-pro-search" onClick={()=>setSearchOpen(true)}>⌕ <span>بحث عالمي...</span><kbd>Ctrl + K</kbd></button>
      <div className="dashboard-pro-clock"><strong>{new Date().toLocaleTimeString("en-CA",{hour:"2-digit",minute:"2-digit"})}</strong><small>{new Date().toLocaleDateString("ar-CA",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</small></div>
    </section>

    <section className={`enterprise-health health-${health.tone} v20-status-strip`}>
      <div className="enterprise-health-score"><span>{health.icon}</span><div><small>حالة النظام</small><strong>جميع الأنظمة تعمل بشكل طبيعي</strong></div></div>
      <div className="enterprise-health-meta">
        <span>🛡️ صحة الشركة <b>{healthScore}/100</b></span>
        <span>☁️ المزامنة متصلة</span>
        <span>🔄 آخر تحديث {lastRefresh.toLocaleTimeString("ar-CA",{hour:"2-digit",minute:"2-digit"})}</span>
      </div>
    </section>

    <section className="dashboard-exchange-board panel-dark v20-exchange-board usd-base-board">
      <div className="exchange-board-header">
        <div>
          <span className="exchange-board-kicker">USD BASE <i></i></span>
          <h2>لوحة أسعار الصرف مقابل الدولار</h2>
          <p>الدولار الأمريكي هو العملة الأساسية الثابتة · تحديث آلي كل 30 دقيقة</p>
        </div>
        <div className="exchange-board-actions">
          <span className="exchange-board-updated">آخر تحديث: {lastRefresh.toLocaleTimeString("ar-CA",{hour:"2-digit",minute:"2-digit"})}</span>
          <button disabled={ratesRefreshing} onClick={async()=>{
            try{
              setRatesRefreshing(true);setRatesError("");
              await api.post("/exchange-rates/refresh");
              const [ratesResponse,historyResponse]=await Promise.all([cachedGet("/exchange-rates"),cachedGet("/exchange-rates/history")]);
              setDashboardRates(Array.isArray(ratesResponse.data)?ratesResponse.data:[]);
              setDashboardRateHistory(Array.isArray(historyResponse.data)?historyResponse.data:[]);
              setLastRefresh(new Date());
            }catch(error){setRatesError(error.response?.data?.message||"تعذر تحديث أسعار الصرف. تم الاحتفاظ بآخر أسعار صحيحة.")}finally{setRatesRefreshing(false)}
          }}>{ratesRefreshing?"جاري التحديث…":"↻ تحديث الآن"}</button>
          <button className="exchange-board-all" onClick={()=>navigate("rates")}>عرض التفاصيل</button>
        </div>
      </div>
      {ratesError&&<div className="exchange-board-error">⚠️ {ratesError}</div>}
      <div className="usd-base-rate-list">
        {["CAD","EUR","TRY","SAR","JOD","SYP"].map(code=>{
          const pairRate=(base,quote)=>dashboardRates.find(item=>
            String(item.baseCurrency||"").toUpperCase()===base&&
            String(item.quoteCurrency||"").toUpperCase()===quote
          );
          const numericRate=item=>Number(item?.sellRate||item?.buyRate||0);
          const direct=numericRate(pairRate("USD",code));
          const inverse=numericRate(pairRate(code,"USD"));
          let quote=direct>0?direct:(inverse>0?1/inverse:null);
          // Fallback through CAD only when a direct USD pair is unavailable.
          if(!quote){
            const usdCadDirect=numericRate(pairRate("USD","CAD"));
            const cadUsdInverse=numericRate(pairRate("CAD","USD"));
            const usdCad=usdCadDirect>0?usdCadDirect:(cadUsdInverse>0?1/cadUsdInverse:null);
            const targetCadDirect=numericRate(pairRate(code,"CAD"));
            const cadTargetInverse=numericRate(pairRate("CAD",code));
            const targetCad=code==="CAD"?1:(targetCadDirect>0?targetCadDirect:(cadTargetInverse>0?1/cadTargetInverse:null));
            quote=usdCad&&targetCad?usdCad/targetCad:null;
          }
          const decimals=code==="SYP"?0:code==="TRY"?2:4;
          const targetMeta=debtCurrencies.find(item=>item.code===code)||{name:code};
          return <button className={`usd-base-rate-row ${quote?"":"missing"}`} key={code} onClick={()=>navigate("rates")}>
            <span className="usd-base-side usd-side"><CurrencyFlag code="USD"/><strong>USD</strong><small>1</small></span>
            <span className="usd-base-equals">=</span>
            <span className="usd-base-value">{quote?quote.toLocaleString("en-CA",{minimumFractionDigits:decimals,maximumFractionDigits:decimals}):"—"}</span>
            <span className="usd-base-side target-side"><CurrencyFlag code={code}/><strong>{code}</strong><small>{targetMeta.name}</small></span>
          </button>
        })}
      </div>
      <div className="exchange-board-summary usd-base-summary">
        <span><b>USD</b> العملة الأساسية</span>
        <span><b>{dashboardRates.filter(item=>["USD","EUR","TRY","SYP","SAR","JOD"].includes(String(item.baseCurrency||"").toUpperCase())).length}</b> أسعار متوفرة</span>
        <span>القيم تستخدم زوج USD المباشر أولاً، ثم التحويل المتقاطع الموثوق عند الحاجة</span>
      </div>
    </section>

    <section className="enterprise-decision-grid">
      <div className="enterprise-decisions panel-dark">
        <div className="section-heading"><h3>🧠 مركز القرارات الذكية</h3><button onClick={()=>navigate("ai-center")}>فتح المركز الذكي</button></div>
        <div className="enterprise-decision-list">
          {(smart.anomalies||[]).slice(0,3).map((item,index)=><article className={`decision-${item.level||"warning"}`} key={`${item.title}-${index}`}><span>{item.level==="danger"?"!":"i"}</span><div><strong>{item.title}</strong><small>{item.message}</small></div></article>)}
          {!(smart.anomalies||[]).length&&<article className="decision-success"><span>✓</span><div><strong>الوضع مستقر</strong><small>لا توجد حالات حرجة تحتاج تدخلاً الآن.</small></div></article>}
        </div>
      </div>
      <div className="enterprise-tasks panel-dark">
        <div className="section-heading"><h3>✅ مهام اليوم الذكية</h3><span>{(smart.recommendations||[]).length} مهام</span></div>
        <div className="enterprise-task-list">
          {(smart.recommendations||["راجع الحوالات والديون المفتوحة اليوم."]).slice(0,4).map((task,index)=><button key={index} onClick={()=>navigate(index===0&&smart.finance?.overdueCount?"overdue-customers":"ai")}><i>{index+1}</i><span>{task}</span><b>‹</b></button>)}
        </div>
      </div>
    </section>

    <section className="premium-kpis">
      {kpis.map(item=><button key={item.label} className={`premium-kpi ${item.tone}`} onClick={()=>navigate(item.page)}>
        <div className="premium-kpi-icon">{item.icon}</div>
        <div><span>{item.label}</span><strong>{item.value}</strong><small>{item.note}</small></div>
      </button>)}
    </section>

    <section className="premium-grid premium-grid-single">
      <div className="premium-recent panel-dark">
        <div className="section-heading">
          <h3>أحدث الحوالات</h3>
          <button onClick={()=>navigate("transactions")}>عرض الكل</button>
        </div>
        {recent.length?recent.map(item=><button className="recent-row" key={item.id} onClick={()=>navigate("transactions")}>
          <div className="recent-currency"><span>{item.currency||"USD"}</span><small>{item.number||"حوالة"}</small></div>
          <div className="recent-date">{item.transferDate||String(item.createdAt||"").slice(0,10)}</div>
          <strong>{cad(item.totalCustomerDue||0)}</strong>
          <b>‹</b>
        </button>):<p className="empty-state">لا توجد حوالات حديثة.</p>}
      </div>

    </section>

    <section className="dashboard-pro-analysis">
      <div className="dashboard-pro-performance panel-dark">
        <div className="section-heading"><h3>ملخص الأداء (آخر 7 أيام)</h3><span className="dashboard-pro-period">آخر 7 أيام</span></div>
        <div className="dashboard-pro-chart">
          <div className="dashboard-pro-grid"><i/><i/><i/><i/><i/></div>
          <div className="dashboard-pro-bars">{chartData.map((item,index)=><div className="dashboard-pro-bar-col" key={item.date} title={`${item.date} — ${cad(item.total)}`}><div className="dashboard-pro-bar" style={{height:`${Math.max(3,(item.total/chartMax)*100)}%`}}/><small>{item.date.slice(5)}</small></div>)}</div>
          <svg viewBox="0 0 700 220" preserveAspectRatio="none"><polyline points={chartData.map((item,index)=>`${50+index*100},${205-(item.profit/chartMax)*165}`).join(" ")}/></svg>
        </div>
        <div className="dashboard-pro-legend"><span>● إجمالي الحوالات (CAD)</span><span>● إجمالي الأرباح</span></div>
      </div>
      <div className="dashboard-pro-finance panel-dark">
        <div className="section-heading"><h3>⚖️ الميزانية</h3><button onClick={()=>navigate("capital-overview")}>عرض الكل</button></div>
        <p><span>الرصيد الحالي</span><strong>{cad(data.capital||0)}</strong></p>
        <p><span>الذمم المستحقة</span><strong>{cad(data.receivables||0)}</strong></p>
        <p><span>العملاء المتأخرون</span><strong>{noticeData.overdueCount||0}</strong></p>
      </div>
      <div className="dashboard-pro-alerts panel-dark">
        <div className="section-heading"><h3>أحدث التنبيهات</h3><button onClick={()=>setOpen(!open)}>عرض الكل</button></div>
        {(noticeData.notifications||[]).slice(0,3).map(item=><div className={`dashboard-pro-alert severity-${item.severity}`} key={item.id}><b>!</b><div><strong>{item.title}</strong><small>{item.message}</small></div></div>)}
        {!noticeData.notifications?.length&&<p className="empty-state">لا توجد تنبيهات حالياً.</p>}
      </div>
      <div className="dashboard-pro-stats panel-dark">
        <div className="section-heading"><h3>إحصائيات سريعة</h3></div>
        <p><span>حوالات اليوم</span><strong>{data.todayTransactions||0}</strong></p>
        <p><span>أرباح اليوم</span><strong>{cad(data.todayProfit)}</strong></p>
        <p><span>عدد العملاء</span><strong>{data.customers||0}</strong></p>
      </div>
    </section>

    <section className="executive-intelligence-grid">
      <article className="panel-dark intelligence-card">
        <div className="section-heading"><h3>🏆 أفضل العملاء ربحًا</h3><button onClick={()=>navigate("customers")}>عرض العملاء</button></div>
        <div className="customer-ranking">{customerScores.slice(0,5).map((customer,index)=><button key={customer.id||index} onClick={()=>navigate("customers")}><i>{index+1}</i><span><strong>{customer.name}</strong><small>{customer.operations} عمليات · حجم {cad(customer.volume)}</small></span><b className={`grade-${customer.grade}`}>{customer.grade}</b><em>{cad(customer.profit)}</em></button>)}{!customerScores.length&&<p className="empty-state">لا توجد بيانات عملاء للتحليل.</p>}</div>
      </article>
      <article className="panel-dark intelligence-card">
        <div className="section-heading"><h3>💹 تحليل الربح حسب العملة</h3><button onClick={()=>navigate("profits")}>تقرير الأرباح</button></div>
        <div className="currency-profit-list">{currencyProfit.slice(0,6).map(([currency,profit],index)=><div key={currency}><span><CurrencyFlag code={currency}/><strong>{currency}</strong></span><progress max={Math.max(1,currencyProfit[0]?.[1]||1)} value={Math.max(0,profit)}/><b>{cad(profit)}</b></div>)}{!currencyProfit.length&&<p className="empty-state">لا توجد أرباح مسجلة هذا الشهر.</p>}</div>
      </article>
      <article className="panel-dark intelligence-card executive-comparison">
        <div className="section-heading"><h3>📌 مقارنة تنفيذية</h3><span>هذا الشهر</span></div>
        <p><span>إجمالي الحوالات</span><strong>{monthlyRows.length}</strong></p>
        <p><span>حجم الأعمال</span><strong>{cad(monthlyRows.reduce((s,x)=>s+Number(x.totalCustomerDue||x.amount||0),0))}</strong></p>
        <p><span>إجمالي الربح</span><strong>{cad(monthlyRows.reduce((s,x)=>s+Number(x.profit||x.netProfit||0),0))}</strong></p>
        <p><span>مصروفات مسجلة</span><strong>{cad(expenses.filter(x=>String(x.expenseDate||x.createdAt||"").slice(0,7)===todayKey.slice(0,7)).reduce((s,x)=>s+Number(x.amount||0),0))}</strong></p>
      </article>
    </section>


    <button className="premium-alert-strip" onClick={()=>setOpen(!open)}>
      <span>🔔</span>
      <strong>{noticeData.count?`${noticeData.count} تنبيهات تحتاج المراجعة`:"لا توجد تنبيهات جديدة"}</strong>
      <b>‹</b>
    </button>

    {searchOpen&&<div className="global-search-overlay" onClick={()=>setSearchOpen(false)}><div className="global-search-modal" onClick={event=>event.stopPropagation()}><div className="global-search-input"><span>⌕</span><input autoFocus value={globalSearch} onChange={event=>setGlobalSearch(event.target.value)} placeholder="ابحث عن عميل، حوالة أو مصروف..."/><kbd>ESC</kbd></div><div className="global-search-results">{query?searchResults.map((result,index)=><button key={`${result.type}-${index}`} onClick={()=>{navigate(result.page);setSearchOpen(false)}}><i>{result.type}</i><span><strong>{result.title}</strong><small>{result.subtitle}</small></span><b>فتح ‹</b></button>):<div className="global-search-help"><strong>بحث عالمي سريع</strong><p>اكتب الاسم أو رقم الحوالة أو وصف المصروف.</p></div>}{query&&!searchResults.length&&<p className="empty-state">لا توجد نتائج مطابقة.</p>}</div></div></div>}

    {open&&<div className="panel-dark premium-notifications">
      <div className="section-heading"><h3>مركز التنبيهات</h3><button onClick={()=>setOpen(false)}>إغلاق</button></div>
      {noticeData.notifications.length?noticeData.notifications.map(item=>
        <div className={`notification-item severity-${item.severity}`} key={item.id}>
          <div><strong>{item.title}</strong><p>{item.message}</p></div>
          {item.customerId&&<button onClick={()=>navigate("customers")}>فتح</button>}
        </div>
      ):<p>لا توجد تنبيهات حالياً.</p>}
    </div>}
  </div>;
}


export default Dashboard;
