// LazyScreens.jsx
// -----------------
// الشاشات الإدارية/التقارير الأقل استخدامًا يوميًا (الأرباح، أسعار الصرف،
// الديون، الشركاء، نظرة رأس المال، التقرير الشهري، الإعدادات، مركز الذكاء
// الاصطناعي، المصروفات/رأس المال). فُصلت في ملف منفصل ليُحمَّلها المتصفح
// فقط عند فتح إحدى هذه الشاشات (React.lazy)، بدل تحميلها كلها مع كل شاشة
// أساسية — هذا يقلّل حجم وزمن التحميل الأولي للتطبيق بشكل كبير، خصوصًا
// على الهاتف.
import React,{useEffect,useRef,useState}from"react";
import api,{cachedGet} from"./api";
import {APP_VERSION} from"./version";
import {money,cad,openRegularWhatsApp,currencyFlag,flagOf,cleanConnectorMessage,EXCHANGE_CURRENCY_CATALOG,debtCurrencies,CurrencyFlag,rateTrend} from"./shared";

function Profits(){
  const [data,setData]=useState(null);
  const [filters,setFilters]=useState({from:"",to:""});
  const load=()=>cachedGet("/profits",{params:filters}).then(r=>setData(r.data));
  useEffect(()=>{load();},[]);
  if(!data)return <p>جاري تحميل الأرباح...</p>;
  return <>
    <h2>الأرباح</h2>
    <div className="card form">
      <input type="date" value={filters.from} onChange={e=>setFilters({...filters,from:e.target.value})}/>
      <input type="date" value={filters.to} onChange={e=>setFilters({...filters,to:e.target.value})}/>
      <button type="button" onClick={load}>عرض التقرير</button>
    </div>
    <div className="stats">
      <div className="card metric-card metric-count"><span>عدد الحوالات</span><strong>{data.transactionCount}</strong></div>
      <div className="card metric-card metric-profit"><span>ربح فرق السعر</span><strong>{money(data.exchangeProfit)}</strong></div>
      <div className="card metric-card metric-fees"><span>أجور الحوالات</span><strong>{money(data.transferFees)}</strong></div>
      <div className="card metric-card metric-total"><span>إجمالي الربح</span><strong>{money(data.grossProfit)}</strong></div>
      <div className="card metric-card metric-expense"><span>المصروفات</span><strong>{money(data.expenses)}</strong></div>
      <div className={`card final metric-card metric-net ${Number(data.netProfit||0)<0?"value-negative":"value-positive"}`}><span>صافي الربح</span><strong>{money(data.netProfit)}</strong></div>
    </div>
    <div className="card tablewrap">
      <h3>الأرباح الشهرية</h3>
      <table>
        <thead><tr><th>الشهر</th><th>فرق السعر</th><th>أجور الحوالات</th><th>إجمالي الربح</th><th>المصروفات</th><th>صافي الربح</th></tr></thead>
        <tbody>{data.monthly.map(x=><tr key={x.month}>
          <td>{x.month}</td>
          <td>{money(x.exchangeProfit)}</td>
          <td>{money(x.transferFees)}</td>
          <td>{money(x.grossProfit)}</td>
          <td>{money(x.expenses)}</td>
          <td className={`table-total-value ${Number(x.netProfit||0)<0?"value-negative":"value-positive"}`}><b>{money(x.netProfit)}</b></td>
        </tr>)}</tbody>
      </table>
    </div>
  </>;
}

function ExchangeRates(){
  const [list,setList]=useState([]);
  const [history,setHistory]=useState([]);
  const [f,setF]=useState({baseCurrency:"CAD",quoteCurrency:"USD",buyRate:"",sellRate:"",notes:""});
  const [goldForm,setGoldForm]=useState({baseCurrency:"XAU24",quoteCurrency:"CAD",buyRate:"",sellRate:"",notes:"سعر غرام الذهب"});
  const [refreshing,setRefreshing]=useState(false);
  const [message,setMessage]=useState("");
  const [currencySearch,setCurrencySearch]=useState("");
  const [showCurrencyManager,setShowCurrencyManager]=useState(false);
  const [rateViewSearch,setRateViewSearch]=useState("");
  const [rateViewFilter,setRateViewFilter]=useState("ALL");
  const [rateFavorites,setRateFavorites]=useState(()=>{try{return JSON.parse(localStorage.getItem("alaboud_rate_favorites")||"[]")}catch{return []}});
  const [customCurrency,setCustomCurrency]=useState({code:"",name:"",flag:"🏳️"});
  const [enabledCurrencies,setEnabledCurrencies]=useState(()=>{
    try{
      const saved=JSON.parse(localStorage.getItem("alaboud_exchange_currencies")||"null");
      return Array.isArray(saved)&&saved.length?saved:EXCHANGE_CURRENCY_CATALOG.slice(0,9);
    }catch{return EXCHANGE_CURRENCY_CATALOG.slice(0,9)}
  });

  useEffect(()=>{localStorage.setItem("alaboud_exchange_currencies",JSON.stringify(enabledCurrencies))},[enabledCurrencies]);
  useEffect(()=>{localStorage.setItem("alaboud_rate_favorites",JSON.stringify(rateFavorites))},[rateFavorites]);

  const trendFor=(rate)=>rateTrend(rate,history);
  const isGoldRate=rate=>String(rate.baseCurrency||"").startsWith("XAU");
  const goldLabel=code=>({
    XAU24:"ذهب 24 قيراط",
    XAU22:"ذهب 22 قيراط",
    XAU21:"ذهب 21 قيراط",
    XAU18:"ذهب 18 قيراط"
  }[code]||code);

  const normalizeRatesPayload=(payload)=>{
    if(Array.isArray(payload))return payload;
    if(Array.isArray(payload?.rows))return payload.rows;
    if(Array.isArray(payload?.rates))return payload.rates;
    if(Array.isArray(payload?.data))return payload.data;
    return [];
  };
  const safeDateText=(value)=>{
    const date=new Date(value||Date.now());
    return Number.isNaN(date.getTime())?"—":date.toLocaleString("ar-CA");
  };
  const currencyInfo=Object.fromEntries([...EXCHANGE_CURRENCY_CATALOG,...enabledCurrencies].map(item=>[item.code,item]));
  const currencyLabel=(code)=>`${currencyInfo[code]?.flag||"🏳️"} ${currencyInfo[code]?.name||code} (${code})`;
  const currencyCodes=[...new Set(enabledCurrencies.map(item=>item.code))];
  const filteredCatalog=EXCHANGE_CURRENCY_CATALOG.filter(item=>{
    const q=currencySearch.trim().toLowerCase();
    return !q||`${item.code} ${item.name}`.toLowerCase().includes(q);
  });
  const toggleCurrency=item=>setEnabledCurrencies(current=>current.some(x=>x.code===item.code)?current.filter(x=>x.code!==item.code):[...current,item]);
  const addCustomCurrency=()=>{
    const code=customCurrency.code.trim().toUpperCase().replace(/[^A-Z]/g,"").slice(0,5);
    const name=customCurrency.name.trim();
    if(code.length<3||!name){setMessage("أدخل رمز عملة من 3 أحرف واسم العملة");return}
    if(enabledCurrencies.some(item=>item.code===code)){setMessage("هذه العملة مضافة مسبقًا");return}
    setEnabledCurrencies(current=>[...current,{code,name,flag:customCurrency.flag||"🏳️"}]);
    setCustomCurrency({code:"",name:"",flag:"🏳️"});
    setMessage(`تمت إضافة ${name} إلى قائمة العملات`);
  };

  const load=async()=>{
    setMessage("");
    try{
      const [ratesResponse,historyResponse]=await Promise.all([
        cachedGet("/exchange-rates"),
        cachedGet("/exchange-rates/history").catch(()=>({data:[]}))
      ]);
      setList(normalizeRatesPayload(ratesResponse.data));
      setHistory(normalizeRatesPayload(historyResponse.data));
    }catch(error){
      setList([]);setHistory([]);
      setMessage(error.response?.data?.message||"تعذر تحميل أسعار الصرف. حاول التحديث مرة أخرى.");
    }
  };

  useEffect(()=>{
    load();
    const refresh=async()=>{
      if(document.visibilityState!=="visible")return;
      try{await api.post("/exchange-rates/refresh")}catch{}
      await load();
    };
    const hourly=setInterval(refresh,60*60*1000);
    const onVisibility=()=>{if(document.visibilityState==="visible")load()};
    document.addEventListener("visibilitychange",onVisibility);
    return ()=>{
      clearInterval(hourly);
      document.removeEventListener("visibilitychange",onVisibility);
    };
  },[]);

  async function add(e){
    e.preventDefault();
    setMessage("");
    try{
      await api.post("/exchange-rates",f);
      setF(x=>({...x,buyRate:"",sellRate:"",notes:""}));
      setMessage("تم حفظ سعر العملة");
      await load();
    }catch(error){
      setMessage(error.response?.data?.message||"تعذر حفظ سعر العملة");
    }
  }

  async function addGold(e){
    e.preventDefault();
    setMessage("");
    try{
      await api.post("/exchange-rates",goldForm);
      setGoldForm(x=>({...x,buyRate:"",sellRate:""}));
      setMessage("تم حفظ سعر الذهب");
      await load();
    }catch(error){
      setMessage(error.response?.data?.message||"تعذر حفظ سعر الذهب");
    }
  }

  async function refresh(){
    setRefreshing(true);setMessage("");
    try{
      const {data}=await api.post("/exchange-rates/refresh");
      setMessage(data.message);
      await load();
    }catch(e){
      setMessage(e.response?.data?.message||"تعذر التحديث التلقائي");
    }finally{setRefreshing(false)}
  }

  const storedCurrencyRates=list.filter(rate=>!isGoldRate(rate));
  const hasSyrianPound=storedCurrencyRates.some(rate=>rate.baseCurrency==="SYP"||rate.quoteCurrency==="SYP");
  const currencyRates=hasSyrianPound?storedCurrencyRates:[
    ...storedCurrencyRates,
    {
      id:"syp-visible-placeholder",
      baseCurrency:"USD",
      quoteCurrency:"SYP",
      buyRate:0,
      sellRate:0,
      source:"MANUAL",
      createdAt:new Date().toISOString(),
      sypPlaceholder:true
    }
  ];
  const goldRates=list.filter(isGoldRate);

  return <>
    <h2>العملات وأسعار الصرف والذهب</h2>

    <div className="card rate-legend">
      <span className="legend-up">↑ ارتفاع</span>
      <span className="legend-down">↓ انخفاض</span>
      <span className="legend-same">→ ثابت</span>
      <span className="legend-new">● سعر جديد</span>
    </div>

    <div className="card auto-rate-bar">
      <div>
        <strong>التحديث التلقائي للعملات</strong>
        <p>العملات والليرة السورية وأسعار الذهب تتحدث تلقائيًا كل ساعة. يبقى آخر سعر محفوظ إذا تعذر أحد المصادر.</p>
      </div>
      <button type="button" onClick={refresh} disabled={refreshing}>
        {refreshing?"جاري التحديث...":"تحديث أسعار العملات الآن"}
      </button>
    </div>

    {message&&<div className="card rate-message">{message}</div>}

    <div className="card currency-manager-card">
      <div className="currency-manager-head">
        <div><h3>➕ إدارة العملات</h3><p>أضف العملات التي تريد استخدامها في لوحة الصرف، وابحث عنها بسرعة.</p></div>
        <button type="button" className="currency-manager-toggle" onClick={()=>setShowCurrencyManager(value=>!value)}>{showCurrencyManager?"إغلاق":"إضافة عملات"}</button>
      </div>
      <div className="enabled-currency-chips">{enabledCurrencies.map(item=><button type="button" key={item.code} onClick={()=>toggleCurrency(item)} title="اضغط للإزالة"><span>{item.flag}</span><b>{item.code}</b><small>{item.name}</small><i>×</i></button>)}</div>
      {showCurrencyManager&&<div className="currency-manager-body">
        <input className="currency-search-input" value={currencySearch} onChange={e=>setCurrencySearch(e.target.value)} placeholder="ابحث بالاسم أو الرمز..."/>
        <div className="currency-catalog-grid">{filteredCatalog.map(item=>{const active=enabledCurrencies.some(x=>x.code===item.code);return <button type="button" key={item.code} className={active?"active":""} onClick={()=>toggleCurrency(item)}><span>{item.flag}</span><div><b>{item.code}</b><small>{item.name}</small></div><strong>{active?"✓":"+"}</strong></button>})}</div>
        <div className="custom-currency-row">
          <input value={customCurrency.flag} onChange={e=>setCustomCurrency({...customCurrency,flag:e.target.value})} placeholder="العلم" maxLength="4"/>
          <input value={customCurrency.code} onChange={e=>setCustomCurrency({...customCurrency,code:e.target.value})} placeholder="الرمز مثل MXN" maxLength="5"/>
          <input value={customCurrency.name} onChange={e=>setCustomCurrency({...customCurrency,name:e.target.value})} placeholder="اسم العملة"/>
          <button type="button" onClick={addCustomCurrency}>إضافة عملة مخصصة</button>
        </div>
      </div>}
    </div>

    <div className="rates-entry-grid">
      <form className="card form" onSubmit={add}>
        <h3>💱 إضافة سعر عملة</h3>
        <select value={f.baseCurrency} onChange={e=>setF({...f,baseCurrency:e.target.value})}>
          {currencyCodes.map(x=><option key={x} value={x}>{currencyLabel(x)}</option>)}
        </select>
        <select value={f.quoteCurrency} onChange={e=>setF({...f,quoteCurrency:e.target.value})}>
          {currencyCodes.map(x=><option key={x} value={x}>{currencyLabel(x)}</option>)}
        </select>
        <input type="number" step=".000001" value={f.buyRate} onChange={e=>setF({...f,buyRate:e.target.value})} placeholder="سعر الشراء" required/>
        <input type="number" step=".000001" value={f.sellRate} onChange={e=>setF({...f,sellRate:e.target.value})} placeholder="سعر البيع" required/>
        <input value={f.notes} onChange={e=>setF({...f,notes:e.target.value})} placeholder="ملاحظات"/>
        <button>حفظ سعر العملة</button>
      </form>

      <form className="card form gold-rate-form" onSubmit={addGold}>
        <h3>🪙 إضافة سعر الذهب للغرام</h3>
        <select value={goldForm.baseCurrency} onChange={e=>setGoldForm({...goldForm,baseCurrency:e.target.value})}>
          <option value="XAU24">ذهب 24 قيراط</option>
          <option value="XAU22">ذهب 22 قيراط</option>
          <option value="XAU21">ذهب 21 قيراط</option>
          <option value="XAU18">ذهب 18 قيراط</option>
        </select>
        <select value={goldForm.quoteCurrency} onChange={e=>setGoldForm({...goldForm,quoteCurrency:e.target.value})}>
          <option value="CAD">CAD 🇨🇦</option>
          <option value="USD">USD 🇺🇸</option>
          <option value="SYP">SYP 🇸🇾</option>
        </select>
        <input type="number" step=".01" value={goldForm.buyRate} onChange={e=>setGoldForm({...goldForm,buyRate:e.target.value})} placeholder="سعر شراء الغرام" required/>
        <input type="number" step=".01" value={goldForm.sellRate} onChange={e=>setGoldForm({...goldForm,sellRate:e.target.value})} placeholder="سعر بيع الغرام" required/>
        <input value={goldForm.notes} onChange={e=>setGoldForm({...goldForm,notes:e.target.value})} placeholder="ملاحظات"/>
        <button>حفظ سعر الذهب</button>
      </form>
    </div>

    <section className="premium-rates-board">
      <div className="premium-rates-toolbar">
        <div className="premium-rates-title">
          <div><span>💱</span><h3>العملات وأسعار الصرف</h3></div>
          <small>آخر تحديث: {currencyRates.length?safeDateText(currencyRates[0]?.createdAt):"—"}</small>
        </div>
        <div className="premium-rates-search"><span>⌕</span><input value={rateViewSearch} onChange={e=>setRateViewSearch(e.target.value)} placeholder="ابحث عن عملة أو رمز العملة..."/></div>
        <div className="premium-rates-filters">
          {[
            ["ALL","▦","الكل"],
            ["FAVORITES","★","المفضلة"],
            ["USD","🇺🇸","USD"],
            ["CAD","🇨🇦","CAD"],
            ["OTHER","•••","أخرى"]
          ].map(([key,icon,label])=><button type="button" key={key} className={rateViewFilter===key?"active":""} onClick={()=>setRateViewFilter(key)}><span>{icon}</span>{label}</button>)}
        </div>
      </div>
      <div className="premium-rate-list">
        {currencyRates.filter(r=>{
          const q=rateViewSearch.trim().toLowerCase();
          const key=`${r.baseCurrency} ${r.quoteCurrency} ${currencyInfo[r.baseCurrency]?.name||""} ${currencyInfo[r.quoteCurrency]?.name||""}`.toLowerCase();
          const favorite=rateFavorites.includes(String(r.id));
          const matchesSearch=!q||key.includes(q);
          const matchesFilter=rateViewFilter==="ALL"||(rateViewFilter==="FAVORITES"&&favorite)||(rateViewFilter==="USD"&&(r.baseCurrency==="USD"||r.quoteCurrency==="USD"))||(rateViewFilter==="CAD"&&(r.baseCurrency==="CAD"||r.quoteCurrency==="CAD"))||(rateViewFilter==="OTHER"&&!([r.baseCurrency,r.quoteCurrency].includes("USD")||[r.baseCurrency,r.quoteCurrency].includes("CAD")));
          return matchesSearch&&matchesFilter;
        }).map(r=>{
          const trend=trendFor(r);
          const favorite=rateFavorites.includes(String(r.id));
          const value=r.sypPlaceholder?null:Number(r.sellRate||r.buyRate||0);
          return <article className={`premium-rate-card rate-${trend.type}`} key={r.id}>
            <button type="button" className={`premium-rate-favorite ${favorite?"active":""}`} onClick={()=>setRateFavorites(current=>favorite?current.filter(id=>id!==String(r.id)):[...current,String(r.id)])}>{favorite?"★":"☆"}</button>
            <div className="premium-rate-currency premium-rate-from"><CurrencyFlag code={r.baseCurrency}/><div><strong>{currencyInfo[r.baseCurrency]?.name||r.baseCurrency}</strong><small>{r.baseCurrency}</small></div></div>
            <div className="premium-rate-arrow">→</div>
            <div className="premium-rate-price"><small>سعر الصرف</small><strong>{value?value.toLocaleString("en-CA",{maximumFractionDigits:6}):"—"}</strong><span className={`trend-${r.sypPlaceholder?"new":trend.type}`}>{r.sypPlaceholder?"● بانتظار السعر":`${trend.symbol} ${trend.label}`}</span></div>
            <div className="premium-rate-currency premium-rate-to"><CurrencyFlag code={r.quoteCurrency}/><div><strong>{currencyInfo[r.quoteCurrency]?.name||r.quoteCurrency}</strong><small>{r.quoteCurrency}</small></div></div>
          </article>
        })}
        {!currencyRates.length&&<div className="premium-rate-empty">لا توجد أسعار عملات مسجلة.</div>}
      </div>
    </section>

    <div className="card tablewrap gold-rates-table">
      <h3>🪙 أسعار الذهب للغرام</h3>
      <table>
        <thead><tr><th>العيار</th><th>العملة</th><th>شراء الغرام</th><th>بيع الغرام</th><th>الحركة</th><th>آخر تحديث</th></tr></thead>
        <tbody>{goldRates.length?goldRates.map(r=>{
          const trend=trendFor(r);
          return <tr key={r.id} className={`rate-row gold-rate-row rate-${trend.type}`}>
            <td><span className="gold-karat-badge">🪙 {goldLabel(r.baseCurrency)}</span></td>
            <td><span className="currency-badge currency-with-flag"><CurrencyFlag code={r.quoteCurrency}/><span>{currencyInfo[r.quoteCurrency]?.name||r.quoteCurrency}</span><small>{r.quoteCurrency}</small></span></td>
            <td className="buy-rate">{money(r.buyRate)}</td>
            <td className="sell-rate"><strong>{money(r.sellRate)}</strong></td>
            <td><span className={`trend trend-${trend.type}`}>{trend.symbol} {trend.label}</span></td>
            <td>{safeDateText(r.createdAt)}</td>
          </tr>
        }):<tr><td colSpan="6">لا توجد أسعار ذهب مسجلة. أضف سعر الذهب من النموذج أعلاه.</td></tr>}</tbody>
      </table>
    </div>

    <div className="exchange-rates-summary">
      <div><span>عدد العملات</span><strong>{currencyRates.length}</strong><small>أزواج عملات مسجلة</small></div>
      <div><span>أفضل سعر اليوم</span><strong>{currencyRates.length?`${currencyRates[0].baseCurrency}/${currencyRates[0].quoteCurrency}`:"—"}</strong><small>آخر سعر محدث</small></div>
      <div><span>متوسط التغيير</span><strong className="positive">+0.28%</strong><small>مؤشر تقريبي</small></div>
      <div><span>الذهب</span><strong>GOLD/CAD</strong><small>سعر يدوي</small></div>
    </div>

    <div className="card tablewrap">
      <h3>سجل تغييرات الأسعار</h3>
      <table>
        <thead><tr><th>التاريخ</th><th>الزوج / العيار</th><th>شراء</th><th>بيع</th><th>المصدر</th><th>ملاحظات</th></tr></thead>
        <tbody>{history.map(r=><tr key={r.id}>
          <td>{safeDateText(r.createdAt)}</td>
          <td>{isGoldRate(r)?goldLabel(r.baseCurrency):`${r.baseCurrency}/${r.quoteCurrency}`}</td>
          <td>{Number(r.buyRate).toFixed(6).replace(/0+$/,"").replace(/\.$/,"")}</td>
          <td>{Number(r.sellRate).toFixed(6).replace(/0+$/,"").replace(/\.$/,"")}</td>
          <td>{r.source==="FRANKFURTER"?"تلقائي":r.source==="EXCHANGE_RATE_API"?"تلقائي SYP":r.source==="GOLD_API"?"تلقائي ذهب":"يدوي"}</td>
          <td>{r.notes||"-"}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </>;
}


function GeneralDebts(){
  const [data,setData]=useState({rows:[],totals:{receivable:0,payable:0,net:0},totalsByCurrency:{}});
  const [filter,setFilter]=useState("");
  const [message,setMessage]=useState("");
  const [payment,setPayment]=useState({debtId:"",amount:"",paymentDate:"",notes:""});
  const [form,setForm]=useState({
    type:"RECEIVABLE",
    partyName:"",
    amount:"",
    currency:"CAD",
    dueDate:"",
    description:"",
    reference:""
  });

  async function load(){
    try{
      const {data}=await cachedGet("/general-debts",{params:{type:filter}});
      setData({
        rows:Array.isArray(data?.rows)?data.rows:[],
        totals:data?.totals||{receivable:0,payable:0,net:0},
        summaryCurrency:data?.summaryCurrency||"CAD",
        totalsByCurrency:data?.totalsByCurrency||{},
        missingRates:Array.isArray(data?.missingRates)?data.missingRates:[],
        ratesUpdatedAt:data?.ratesUpdatedAt||null
      });
    }catch(error){
      setMessage(error.response?.data?.message||"تعذر تحميل الديون");
    }
  }

  useEffect(()=>{load();},[filter]);

  async function addDebt(event){
    event.preventDefault();
    setMessage("");
    try{
      await api.post("/general-debts",form);
      setForm({
        type:"RECEIVABLE",
        partyName:"",
        amount:"",
        currency:"CAD",
        dueDate:"",
        description:"",
        reference:""
      });
      setMessage("تم حفظ الدين بنجاح");
      await load();
    }catch(error){
      setMessage(error.response?.data?.message||"تعذر حفظ الدين");
    }
  }

  async function addPayment(event){
    event.preventDefault();
    if(!payment.debtId||!payment.amount)return;
    setMessage("");
    try{
      await api.post(`/general-debts/${payment.debtId}/payments`,payment);
      setPayment({debtId:"",amount:"",paymentDate:"",notes:""});
      setMessage("تم تسجيل الدفعة");
      await load();
    }catch(error){
      setMessage(error.response?.data?.message||"تعذر تسجيل الدفعة");
    }
  }

  const openDebts=data.rows.filter(item=>Number(item.remaining||0)>0&&item.source==="MANUAL");

  const currencyMeta=Object.fromEntries(debtCurrencies.map(item=>[item.code,item]));

  const statusLabel={
    OPEN:"مفتوح",
    PARTIAL:"مدفوع جزئيًا",
    PAID:"مدفوع",
    OVERDUE:"متأخر"
  };

  return <>
    <h2>الدَّين العام</h2>

    <div className="stats">
      <div className="card receivable-card">
        <span>دين لنا — {data.summaryCurrency||"CAD"} 🇨🇦</span>
        <strong>{money(data.totals.receivable)}</strong>
        <small>بعد تحويل جميع العملات</small>
      </div>
      <div className="card payable-card">
        <span>دين علينا — {data.summaryCurrency||"CAD"} 🇨🇦</span>
        <strong>{money(data.totals.payable)}</strong>
        <small>بعد تحويل جميع العملات</small>
      </div>
      <div className="card final">
        <span>صافي الديون النهائي — {data.summaryCurrency||"CAD"} 🇨🇦</span>
        <strong className={Number(data.totals.net)>=0?"positive-net":"negative-net"}>{money(data.totals.net)}</strong>
        <small>محسوب حسب آخر أسعار الصرف{data.ratesUpdatedAt?` — ${new Date(data.ratesUpdatedAt).toLocaleString("ar-CA")}`:""}</small>
      </div>
    </div>

    {data.missingRates?.length>0&&<div className="card debt-message">تعذر تحويل العملات التالية إلى {data.summaryCurrency||"CAD"}: {data.missingRates.join("، ")}. أضف أسعار صرفها ليكتمل صافي الديون النهائي.</div>}

    <div className="card debt-currency-summary">
      <div className="debt-currency-summary-head">
        <div>
          <h3>مجموع الديون في باقي العملات</h3>
          <p>يظهر مجموع دين لنا ودين علينا وصافي الدين لكل عملة بشكل مستقل.</p>
        </div>
      </div>
      <div className="debt-currency-totals">
        {debtCurrencies.map(currency=>{
          const total=data.totalsByCurrency?.[currency.code]||{receivable:0,payable:0,net:0};
          return <div className="debt-currency-total card" key={currency.code}>
            <div className="debt-currency-title">
              <span className="debt-currency-flag">{currency.flag}</span>
              <div><strong>{currency.code}</strong><small>{currency.name}</small></div>
            </div>
            <div className="debt-currency-row receivable"><span>دين لنا</span><b>{money(total.receivable)} {currency.symbol}</b></div>
            <div className="debt-currency-row payable"><span>دين علينا</span><b>{money(total.payable)} {currency.symbol}</b></div>
            <div className="debt-currency-row net"><span>الصافي</span><b>{money(total.net)} {currency.symbol}</b></div>
          </div>
        })}
      </div>
    </div>

    <div className="card debt-tabs">
      <button type="button" onClick={()=>setFilter("")}>الكل</button>
      <button type="button" onClick={()=>setFilter("RECEIVABLE")}>دين لنا</button>
      <button type="button" onClick={()=>setFilter("PAYABLE")}>دين علينا</button>
    </div>

    {message&&<div className="card debt-message">{message}</div>}

    <form className="card form" onSubmit={addDebt}>
      <select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>
        <option value="RECEIVABLE">دين لنا</option>
        <option value="PAYABLE">دين علينا</option>
      </select>

      <input
        value={form.partyName}
        onChange={e=>setForm({...form,partyName:e.target.value})}
        placeholder="اسم الشخص أو الجهة"
        required
      />

      <input
        type="number"
        min="0.01"
        step="0.01"
        value={form.amount}
        onChange={e=>setForm({...form,amount:e.target.value})}
        placeholder="مبلغ الدين"
        required
      />

      <select value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}>
        {debtCurrencies.map(item=>item.code).map(currency=>
          <option key={currency}>{currency}</option>
        )}
      </select>

      <input
        type="date"
        value={form.dueDate}
        onChange={e=>setForm({...form,dueDate:e.target.value})}
      />

      <input
        value={form.reference}
        onChange={e=>setForm({...form,reference:e.target.value})}
        placeholder="رقم مرجع أو فاتورة"
      />

      <input
        value={form.description}
        onChange={e=>setForm({...form,description:e.target.value})}
        placeholder="ملاحظات"
      />

      <button>حفظ الدين</button>
    </form>

    {openDebts.length>0&&
      <form className="card form" onSubmit={addPayment}>
        <select
          value={payment.debtId}
          onChange={e=>setPayment({...payment,debtId:e.target.value})}
          required
        >
          <option value="">اختر الدين لتسجيل دفعة</option>
          {openDebts.map(item=>
            <option key={item.id} value={item.id}>
              {item.type==="RECEIVABLE"?"لنا":"علينا"} — {item.partyName} — متبقي {money(item.remaining)} {item.currency}
            </option>
          )}
        </select>

        <input
          type="number"
          min="0.01"
          step="0.01"
          value={payment.amount}
          onChange={e=>setPayment({...payment,amount:e.target.value})}
          placeholder="مبلغ الدفعة"
          required
        />

        <input
          type="date"
          value={payment.paymentDate}
          onChange={e=>setPayment({...payment,paymentDate:e.target.value})}
        />

        <input
          value={payment.notes}
          onChange={e=>setPayment({...payment,notes:e.target.value})}
          placeholder="ملاحظات الدفعة"
        />

        <button>تسجيل الدفعة</button>
      </form>
    }

    <div className="card tablewrap">
      <table>
        <thead>
          <tr>
            <th>النوع</th>
            <th>المصدر</th>
            <th>الشخص/الجهة</th>
            <th>المبلغ</th>
            <th>المدفوع</th>
            <th>المتبقي</th>
            <th>العملة</th>
            <th>الاستحقاق</th>
            <th>الحالة</th>
            <th>المرجع</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.length?
            data.rows.map(item=>
              <tr key={item.id}>
                <td>
                  <span className={`debt-type ${item.type==="RECEIVABLE"?"receivable":"payable"}`}>
                    {item.type==="RECEIVABLE"?"دين لنا":"دين علينا"}
                  </span>
                </td>
                <td>{item.source==="PARTNER"||item.source==="PARTNER_EXTERNAL"?"شركة":item.source==="TRANSFER"?"حوالة":item.source==="CUSTOMER_OLD_BALANCE"?"حساب عميل قديم":"يدوي"}</td>
                <td>{item.partyName}</td>
                <td>{money(item.amount)}</td>
                <td>{money(item.paid)}</td>
                <td><strong>{money(item.remaining)}</strong></td>
                <td><span className="debt-table-currency">{currencyMeta[item.currency]?.flag||"💱"} {item.currency}</span></td>
                <td>{item.dueDate||"-"}</td>
                <td>{statusLabel[item.status]||item.status}</td>
                <td>{item.reference||"-"}</td>
              </tr>
            )
            :<tr><td colSpan="10">لا توجد ديون مسجلة.</td></tr>
          }
        </tbody>
      </table>
    </div>
  </>;
}


function PartnerProfile({id,back}){
  const [data,setData]=useState(null);
  const [error,setError]=useState("");
  const [transaction,setTransaction]=useState({
    type:"RECEIVABLE",amount:"",currency:"CAD",date:new Date().toISOString().slice(0,10),
    dueDate:"",reference:"",description:""
  });
  const [payment,setPayment]=useState({
    direction:"RECEIVED",amount:"",currency:"CAD",date:new Date().toISOString().slice(0,10),
    reference:"",notes:""
  });
  const [showStatement,setShowStatement]=useState(false);

  async function load(){
    try{
      const response=await cachedGet(`/partners/${id}`);
      setData(response.data);
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر تحميل المورد أو الشركة");
    }
  }

  useEffect(()=>{load();},[id]);

  async function addTransaction(event){
    event.preventDefault();
    await api.post(`/partners/${id}/transactions`,transaction);
    setTransaction(current=>({...current,amount:"",reference:"",description:""}));
    await load();
  }

  async function addPayment(event){
    event.preventDefault();
    await api.post(`/partners/${id}/payments`,payment);
    setPayment(current=>({...current,amount:"",reference:"",notes:""}));
    await load();
  }

  if(showStatement)return <PartnerStatement partnerId={id} back={()=>setShowStatement(false)}/>;
  if(error&&!data)return <div className="card customer-error"><button onClick={back}>رجوع</button><p>{error}</p></div>;
  if(!data)return <p>جاري التحميل...</p>;

  return <>
    <div className="card form no-print">
      <button onClick={back}>رجوع</button>
      <button onClick={()=>setShowStatement(true)}>كشف حساب</button>
    </div>

    <h2>{data.partner.name}</h2>
    <div className="stats">
      <div className="card receivable-card"><span>دين لنا</span><strong>{money(data.totals.receivable)}</strong></div>
      <div className="card payable-card"><span>دين علينا</span><strong>{money(data.totals.payable)}</strong></div>
      <div className="card final"><span>صافي الحساب</span><strong>{money(data.totals.net)}</strong></div>
    </div>

    <div className="card">
      <p><strong>المسؤول:</strong> {data.partner.contactName||"-"}</p>
      <p><strong>الهاتف:</strong> {data.partner.phone||"-"}</p>
      <p><strong>واتساب:</strong> {data.partner.whatsapp||"-"}</p>
      <p><strong>البريد:</strong> {data.partner.email||"-"}</p>
      <p><strong>الموقع:</strong> {[data.partner.city,data.partner.country].filter(Boolean).join("، ")||"-"}</p>
    </div>

    <form className="card form" onSubmit={addTransaction}>
      <select value={transaction.type} onChange={e=>setTransaction({...transaction,type:e.target.value})}>
        <option value="RECEIVABLE">دين لنا</option>
        <option value="PAYABLE">دين علينا</option>
      </select>
      <input type="number" min=".01" step=".01" value={transaction.amount} onChange={e=>setTransaction({...transaction,amount:e.target.value})} placeholder="المبلغ" required/>
      <select value={transaction.currency} onChange={e=>setTransaction({...transaction,currency:e.target.value})}>
        <option value="CAD">CAD 🇨🇦 — الدولار الكندي</option>
        <option value="USD">USD 🇺🇸 — الدولار الأمريكي</option>
        <option value="SYP">SYP 🇸🇾 — الليرة السورية</option>
      </select>
      <input type="date" value={transaction.date} onChange={e=>setTransaction({...transaction,date:e.target.value})}/>
      <input type="date" value={transaction.dueDate} onChange={e=>setTransaction({...transaction,dueDate:e.target.value})}/>
      <input value={transaction.reference} onChange={e=>setTransaction({...transaction,reference:e.target.value})} placeholder="المرجع"/>
      <input value={transaction.description} onChange={e=>setTransaction({...transaction,description:e.target.value})} placeholder="البيان"/>
      <button>حفظ العملية</button>
    </form>

    <form className="card form" onSubmit={addPayment}>
      <select value={payment.direction} onChange={e=>setPayment({...payment,direction:e.target.value})}>
        <option value="RECEIVED">استلمنا دفعة</option>
        <option value="PAID">دفعنا مبلغًا</option>
      </select>
      <input type="number" min=".01" step=".01" value={payment.amount} onChange={e=>setPayment({...payment,amount:e.target.value})} placeholder="مبلغ الدفعة" required/>
      <select value={payment.currency} onChange={e=>setPayment({...payment,currency:e.target.value})}>
        <option value="CAD">CAD 🇨🇦 — الدولار الكندي</option>
        <option value="USD">USD 🇺🇸 — الدولار الأمريكي</option>
        <option value="SYP">SYP 🇸🇾 — الليرة السورية</option>
      </select>
      <input type="date" value={payment.date} onChange={e=>setPayment({...payment,date:e.target.value})}/>
      <input value={payment.reference} onChange={e=>setPayment({...payment,reference:e.target.value})} placeholder="المرجع"/>
      <input value={payment.notes} onChange={e=>setPayment({...payment,notes:e.target.value})} placeholder="ملاحظات"/>
      <button>حفظ الدفعة</button>
    </form>
  </>;
}

function PartnerStatement({partnerId,back}){
  const [filters,setFilters]=useState({from:"",to:""});
  const [data,setData]=useState(null);
  const [error,setError]=useState("");

  async function load(){
    try{
      const response=await cachedGet(`/partners/${partnerId}/statement`,{params:filters});
      setData(response.data);
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر إنشاء كشف الحساب");
    }
  }

  useEffect(()=>{load();},[partnerId]);

  function sendWhatsApp(){
    if(!data)return;
    const phone=String(data.partner.whatsapp||data.partner.phone||"").replace(/\D/g,"");
    if(!phone){
      setError("لا يوجد رقم واتساب محفوظ");
      return;
    }
    const message=[
      `السلام عليكم ${data.partner.name}،`,
      `تم تجهيز كشف الحساب من شركة العبود للتجارة.`,
      `الرصيد النهائي: ${money(data.finalBalance)}`
    ].join("\n");
    openRegularWhatsApp(phone,message);
  }

  return <>
    <div className="card form no-print">
      <button onClick={back}>رجوع</button>
      <input type="date" value={filters.from} onChange={e=>setFilters({...filters,from:e.target.value})}/>
      <input type="date" value={filters.to} onChange={e=>setFilters({...filters,to:e.target.value})}/>
      <button onClick={load}>تحديث</button>
      <button onClick={()=>window.print()}>طباعة / PDF</button>
      <button onClick={sendWhatsApp}>واتساب</button>
    </div>
    {error&&<div className="card customer-error">{error}</div>}
    {data&&<section className="invoice-sheet">
      <div className="invoice-header">
        <div>
          <h1>{data.company.name}</h1>
          <p>{data.company.nameEn}</p>
          <h3>كشف حساب مورد / شركة</h3>
        </div>
        <div>
          <p><strong>الجهة:</strong> {data.partner.name}</p>
          <p><strong>الفترة:</strong> {data.from||"البداية"} إلى {data.to||"اليوم"}</p>
        </div>
      </div>
      <table>
        <thead><tr><th>التاريخ</th><th>النوع</th><th>مدين</th><th>دائن</th><th>الرصيد</th><th>المرجع</th></tr></thead>
        <tbody>{data.rows.length?data.rows.map(row=><tr key={row.id}>
          <td>{row.date}</td><td>{row.kind}</td><td>{money(row.debit)}</td><td>{money(row.credit)}</td><td>{money(row.balance)}</td><td>{row.reference||"-"}</td>
        </tr>):<tr><td colSpan="6">لا توجد عمليات.</td></tr>}</tbody>
      </table>
      <div className="card final"><span>الرصيد النهائي</span><strong>{money(data.finalBalance)}</strong></div>
    </section>}
  </>;
}

function Partners({open}){
  const [data,setData]=useState({rows:[],totals:{receivable:0,payable:0,net:0},totalsByCurrency:{}});
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [syncingId,setSyncingId]=useState("");
  const [syncingAll,setSyncingAll]=useState(false);
  const [syncCenter,setSyncCenter]=useState({stats:{enabled:0,due:0,totalToday:0,successes:0,failures:0,averageDurationMs:0},duePartnerIds:[],logs:[]});
  const autoSyncBusy=useRef(false);
  const [nowTick,setNowTick]=useState(Date.now());
  const [otpById,setOtpById]=useState({});
  const [editingId,setEditingId]=useState("");
  const todayIso=new Date().toISOString().slice(0,10);
  const monthStartIso=`${todayIso.slice(0,7)}-01`;
  const [feeFilter,setFeeFilter]=useState({partnerId:"",fromDate:monthStartIso,toDate:todayIso});
  const [feeReport,setFeeReport]=useState(null);
  const emptyPartnerForm={
    name:"",contactName:"",phone:"",whatsapp:"",email:"",country:"",city:"",address:"",notes:"",
    systemUrl:"",connectionType:"WEB",accountCurrency:"USD",integrationName:"",username:"",password:"",externalAccountId:"",connectorType:"GENERIC",pathPrefix:"/ssljd/merkez112/1/2",syncFromDate:"",syncEnabled:true,syncIntervalMinutes:5,syncMode:"BALANCE_ONLY"
  };
  const [form,setForm]=useState({
    name:"",contactName:"",phone:"",whatsapp:"",email:"",country:"",city:"",address:"",notes:"",
    systemUrl:"",connectionType:"WEB",accountCurrency:"USD",integrationName:"",username:"",password:"",externalAccountId:"",connectorType:"GENERIC",pathPrefix:"/ssljd/merkez112/1/2",syncFromDate:"",syncEnabled:true,syncIntervalMinutes:5,syncMode:"BALANCE_ONLY"
  });

  async function load(){
    try{
      const [response,centerResponse]=await Promise.all([cachedGet("/partners"),cachedGet("/partners/sync-center")]);
      setData(response.data);
      setSyncCenter(centerResponse.data);
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر تحميل الشركات");
    }
  }

  useEffect(()=>{load();},[]);

  function resetPartnerForm(){
    setEditingId("");
    setForm({...emptyPartnerForm});
  }

  function startEditPartner(partner){
    setError("");setMessage("");
    setEditingId(partner.id);
    setForm({
      name:partner.name||"",contactName:partner.contactName||"",phone:partner.phone||"",whatsapp:partner.whatsapp||"",email:partner.email||"",country:partner.country||"",city:partner.city||"",address:partner.address||"",notes:partner.notes||"",
      systemUrl:partner.systemUrl||"",connectionType:partner.connectionType||"WEB",accountCurrency:partner.accountCurrency||"USD",integrationName:partner.integrationName||"",username:partner.username||"",password:"",externalAccountId:partner.externalAccountId||"",connectorType:partner.connectorType==="KONTORUN"?"TAWASUL":partner.connectorType||"GENERIC",pathPrefix:partner.pathPrefix||"/ssljd/merkez112/1/2",syncFromDate:partner.syncFromDate||"",syncEnabled:partner.syncEnabled!==false,syncIntervalMinutes:Number(partner.syncIntervalMinutes)||5,syncMode:partner.syncMode||"BALANCE_ONLY"
    });
    window.scrollTo({top:0,behavior:"smooth"});
  }

  async function deletePartner(partner){
    const confirmed=window.confirm(`هل أنت متأكد من حذف شركة «${partner.name}»؟\nسيتم حذف الشركة وحركاتها ودفعاتها المرتبطة بها.`);
    if(!confirmed)return;
    setError("");setMessage("");
    try{
      await api.delete(`/partners/${partner.id}`);
      if(editingId===partner.id)resetPartnerForm();
      setMessage(`تم حذف شركة ${partner.name} بنجاح`);
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر حذف الشركة");
    }
  }

  async function add(event){
    event.preventDefault();
    setError("");setMessage("");
    try{
      if(editingId){
        await api.patch(`/partners/${editingId}`,form);
        setMessage("تم تعديل معلومات الشركة بنجاح");
      }else{
        await api.post("/partners",form);
        setMessage("تمت إضافة الشركة وظهرت في قسم الشركات");
      }
      resetPartnerForm();
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||(editingId?"تعذر تعديل الشركة":"تعذر إضافة الشركة"));
    }
  }

  async function testConnection(partner){
    setError("");setMessage("");
    try{
      const response=await api.post(`/partners/${partner.id}/test-connection`,{otp:otpById[partner.id]||"",trigger:"MANUAL"},{timeout:90000});
      setMessage(`${partner.name}: ${response.data.message}`);
      await load();
    }catch(requestError){
      setError(requestError.code==="ECONNABORTED"?"استغرق موقع الشركة أكثر من 90 ثانية؛ حاول مرة أخرى":cleanConnectorMessage(requestError.response?.data?.message||requestError.message||"تعذر اختبار الاتصال"));
    }
  }

  const syncFailureReason=(data={})=>{
    const code=String(data.warningCode||data.code||"").toUpperCase();
    const raw=cleanConnectorMessage(data.reason||data.message||"");
    if(code==="JAD_OTP_REQUIRED")return "مطلوب رمز Authenticator جديد";
    if(code==="JAD_LOGIN_REJECTED")return "رفض موقع جاد بيانات الدخول أو رمز Authenticator";
    if(code==="JAD_SESSION_REJECTED")return "انتهت جلسة جاد ويجب إدخال رمز Authenticator جديد";
    if(code==="JAD_OTP_FIELD_NOT_FOUND")return "تغيّرت صفحة رمز التحقق في موقع جاد";
    if(code==="JAD_CHROMIUM_LAUNCH_FAILED"||code==="JAD_BROWSER_UNAVAILABLE")return "تعذر تشغيل متصفح الربط على الخادم";
    if(code==="KONTORUN_OTP_REQUIRED")return "مطلوب رمز التحقق من تطبيق التوثيق";
    if(code==="KONTORUN_OTP_REJECTED")return "رمز التحقق غير صحيح أو منتهي";
    if(code==="KONTORUN_LOGIN_REJECTED")return "اسم المستخدم أو كلمة المرور غير صحيحة";
    if(code==="KONTORUN_SESSION_REJECTED")return "انتهت جلسة الشركة، أدخل رمز تحقق جديد";
    if(/timeout|مهلة/i.test(raw))return "انتهت مهلة الاتصال بموقع جاد";
    if(/network|fetch|ENOTFOUND|ECONN|اتصال/i.test(raw))return "تعذر الوصول إلى موقع جاد مؤقتًا";
    return raw||"تعذر تحديث البيانات مؤقتًا";
  };

  async function syncPartner(partner){
    setError("");setMessage("");setSyncingId(partner.id);
    try{
      const response=await api.post(`/partners/${partner.id}/sync`,{otp:otpById[partner.id]||"",trigger:"MANUAL"},{timeout:90000});
      setOtpById(current=>({...current,[partner.id]:""}));
      if(response.data?.stale){
        const reason=syncFailureReason(response.data);
        setMessage(`${partner.name}: ${reason}. يتم عرض آخر رصيد ناجح${response.data.lastSyncAt?` من ${new Date(response.data.lastSyncAt).toLocaleString("ar-CA")}`:""}.`);
      }else{
        const syncedCurrencies=Object.entries(response.data.result?.currencies||{}).map(([code,value])=>`${code}: لنا ${money(value?.receivable)} / علينا ${money(value?.payable)}`).join(" — ");
        setMessage(`${partner.name}: ${response.data.message}${syncedCurrencies?` — ${syncedCurrencies}`:` — الرصيد ${money(response.data.result.balance)} ${partner.accountCurrency||"USD"}`}`);
      }
      await load();
    }catch(requestError){
      const data=requestError.response?.data||{};
      if(data.stale&&data.partner){
        setMessage(`${partner.name}: ${syncFailureReason(data)}. يتم عرض آخر رصيد ناجح${data.lastSyncAt?` من ${new Date(data.lastSyncAt).toLocaleString("ar-CA")}`:""}.`);
        setOtpById(current=>({...current,[partner.id]:""}));
        await load();
      }else{
        setError(syncFailureReason(data));
        await load().catch(()=>{});
      }
    }
    finally{setSyncingId("");}
  }

  async function fetchJadFees(partner,selectedFilter=feeFilter){
    if(!selectedFilter.fromDate||!selectedFilter.toDate){setError("اختر تاريخ البداية والنهاية");return;}
    if(selectedFilter.fromDate>selectedFilter.toDate){setError("تاريخ البداية يجب أن يسبق تاريخ النهاية");return;}
    setError("");setMessage("");setSyncingId(partner.id);
    try{
      const response=await api.post(`/partners/${partner.id}/sync`,{fromDate:selectedFilter.fromDate,toDate:selectedFilter.toDate,otp:otpById[partner.id]||"",trigger:"FEE_REPORT"},{timeout:90000});
      const result=response.data?.result||{};
      setFeeReport({partnerId:partner.id,partnerName:partner.name,currency:partner.accountCurrency||"USD",fromDate:result.fromDate||selectedFilter.fromDate,toDate:result.toDate||selectedFilter.toDate,totalFees:Number(result.totalFees||0),rows:result.feeMovements||[]});
      setOtpById(current=>({...current,[partner.id]:""}));
      setMessage(`تم جلب إجمالي الأجور لشركة ${partner.name} حسب الفترة المطلوبة`);
      await load();
    }catch(requestError){setError(syncFailureReason(requestError.response?.data||{}));}
    finally{setSyncingId("");}
  }

  async function showJadDiagnostic(partner){
    setError("");setMessage("");
    try{
      const response=await cachedGet(`/partners/${partner.id}/jad-diagnostic`);
      const diagnostic=Array.isArray(response.data.diagnostic)?response.data.diagnostic:[];
      console.info("Jad diagnostic",{partner:partner.name,diagnostic,artifacts:response.data.artifacts});
      const hasSuccessfulSync=Boolean(response.data.lastSyncAt)&&String(response.data.status||"").toUpperCase()==="READY";
      if(hasSuccessfulSync){
        const syncedAt=new Date(response.data.lastSyncAt).toLocaleString("ar-CA");
        setMessage(`${partner.name}: متصل — آخر مزامنة ناجحة ${syncedAt}.`);
      }else{
        const lastStep=diagnostic.length?diagnostic[diagnostic.length-1]?.label:"لا توجد خطوات مسجلة";
        setMessage(`${partner.name}: سجل الربط متاح${lastStep&&lastStep!=="failure"?` — آخر خطوة: ${lastStep}`:""}. التفاصيل التقنية محفوظة في Console وRender Logs.`);
      }
    }catch(requestError){setError(cleanConnectorMessage(requestError.response?.data?.message||"لا يوجد سجل تشخيص متاح"));}
  }

  const relativeSyncTime=value=>{
    if(!value)return "لم تتم المزامنة بعد";
    const time=new Date(value).getTime();
    if(!Number.isFinite(time))return "وقت غير معروف";
    const seconds=Math.max(0,Math.floor((nowTick-time)/1000));
    if(seconds<60)return "الآن";
    const minutes=Math.floor(seconds/60);
    if(minutes===1)return "قبل دقيقة";
    if(minutes<60)return `قبل ${minutes} دقائق`;
    const hours=Math.floor(minutes/60);
    if(hours===1)return "قبل ساعة";
    if(hours<24)return `قبل ${hours} ساعات`;
    const days=Math.floor(hours/24);
    if(days===1)return "قبل يوم";
    return `قبل ${days} أيام`;
  };

  async function syncAllPartners(){
    const partners=(data.rows||[]).filter(partner=>["JAD","TAWASUL","KONTORUN","DAHAB","SURYANA"].includes(partner.connectorType));
    if(!partners.length){setError("لا توجد شركة مرتبطة للمزامنة");return;}
    setError("");setMessage("جاري مزامنة الأرصدة الآن...");setSyncingAll(true);
    let successCount=0;
    try{
      for(const partner of partners){
        setSyncingId(partner.id);
        try{
          const response=await api.post(`/partners/${partner.id}/sync`,{otp:otpById[partner.id]||"",trigger:"MANUAL"},{timeout:90000});
          if(response.data?.stale){
            console.warn("Partner sync stale",partner.name,response.data);
            setMessage(`${partner.name}: ${syncFailureReason(response.data)}. يتم عرض آخر رصيد ناجح.`);
          }else{
            successCount+=1;
            setOtpById(current=>({...current,[partner.id]:""}));
          }
        }catch(requestError){
          const responseData=requestError.response?.data||{};
          console.warn("Partner sync failed",partner.name,responseData);
          setMessage(`${partner.name}: ${syncFailureReason(responseData)}${responseData.stale?". يتم عرض آخر رصيد ناجح.":"."}`);
        }
      }
      await load();
      setNowTick(Date.now());
      if(successCount){setMessage(successCount===1?"تمت المزامنة الآن":"تمت مزامنة جميع الشركات الآن");}
      else if(!message){setMessage("تعذر التحديث الآن؛ راجع السبب الظاهر أعلاه، ويتم عرض آخر أرصدة ناجحة");}
    }finally{
      setSyncingId("");setSyncingAll(false);
    }
  }

  const statusLabel=status=>({READY:"متصل",CONFIGURED:"مُعدّ",MANUAL:"يدوي",NOT_CONFIGURED:"غير مكتمل",ERROR:"خطأ"}[status]||"يدوي");

  const partnerCurrencyEntries=partner=>{
    const balances=partner?.externalBalances&&typeof partner.externalBalances==="object"?partner.externalBalances:{};
    const entries=Object.entries(balances)
      .map(([code,value])=>{
        const receivable=Math.max(Number(value?.receivable)||0,0);
        const payable=Math.max(Number(value?.payable)||0,0);
        const balance=Number.isFinite(Number(value?.balance))?Number(value.balance):receivable-payable;
        return {code:String(code||"").toUpperCase(),receivable,payable,balance};
      })
      .filter(item=>item.code&&(Math.abs(item.receivable)>0.001||Math.abs(item.payable)>0.001||Math.abs(item.balance)>0.001));
    if(entries.length)return entries.sort((a,b)=>a.code.localeCompare(b.code));
    const code=String(partner?.accountCurrency||"USD").toUpperCase();
    const receivable=Math.max(Number(partner?.externalReceivable)||0,0);
    const payable=Math.max(Number(partner?.externalPayable)||0,0);
    const balance=Number.isFinite(Number(partner?.externalBalance))?Number(partner.externalBalance):receivable-payable;
    return [{code,receivable,payable,balance}];
  };

  const PartnerCurrencyBalances=({partner})=><div className="partner-currency-balances">
    {partnerCurrencyEntries(partner).map(item=><div className="partner-currency-balance" key={item.code}>
      <div className="partner-currency-code"><span>{flagOf(item.code)}</span><strong>{item.code}</strong></div>
      <div><span>دين لنا</span><b className="partner-receivable">{money(item.receivable)}</b></div>
      <div><span>دين علينا</span><b className="partner-payable">{money(item.payable)}</b></div>
      <div><span>الصافي</span><b className={item.balance<0?"partner-payable":"partner-receivable"}>{money(item.balance)}</b></div>
    </div>)}
  </div>;

  return <>
    <div className="page-title-row partner-title-row"><h2>🏢 الشركات والربط الخارجي</h2><button type="button" className="sync-now-button" disabled={syncingAll||Boolean(syncingId)} onClick={syncAllPartners}>{syncingAll?<><span className="sync-spinner"/> جاري المزامنة...</>:"🔄 مزامنة الآن"}</button></div>
    {error&&<div className="card customer-error">{error}</div>}
    {message&&<div className="card rate-message">{message}</div>}
    <div className="stats">
      <div className="card receivable-card"><span>إجمالي دين لنا — {data.summaryCurrency||"USD"}</span><strong>{money(data.totals.receivable)}</strong><small>بعد تحويل جميع العملات</small></div>
      <div className="card payable-card"><span>إجمالي دين علينا — {data.summaryCurrency||"USD"}</span><strong>{money(data.totals.payable)}</strong><small>بعد تحويل جميع العملات</small></div>
      <div className="card final"><span>الصافي — {data.summaryCurrency||"USD"}</span><strong>{money(data.totals.net)}</strong><small>حسب آخر سعر صرف</small></div>
      <div className="card"><span>عدد الشركات</span><strong>{data.rows.length}</strong></div>
    </div>
    {data.missingRates?.length>0&&<div className="card debt-message">لم تدخل العملات التالية في الإجمالي لعدم توفر سعر تحويل إلى {data.summaryCurrency||"USD"}: {data.missingRates.join("، ")}</div>}

    <section className="smart-sync-center">
      <div className="smart-sync-heading"><div><h3>🔄 مركز المزامنة الذكية</h3><p>يتحقق تلقائيًا من الشركات المستحقة للمزامنة ويحافظ على آخر رصيد ناجح عند فشل الاتصال.</p></div><span className="live-sync-badge">● مباشر</span></div>
      <div className="sync-metric-grid">
        <div className="sync-metric"><span>الشركات المفعلة</span><strong>{syncCenter.stats.enabled||0}</strong></div>
        <div className="sync-metric warning"><span>مستحقة الآن</span><strong>{syncCenter.stats.due||0}</strong></div>
        <div className="sync-metric success"><span>نجحت اليوم</span><strong>{syncCenter.stats.successes||0}</strong></div>
        <div className="sync-metric danger"><span>فشلت اليوم</span><strong>{syncCenter.stats.failures||0}</strong></div>
        <div className="sync-metric"><span>متوسط الاستجابة</span><strong>{syncCenter.stats.averageDurationMs?`${(syncCenter.stats.averageDurationMs/1000).toFixed(1)}ث`:"—"}</strong></div>
      </div>
      <div className="sync-log-list">
        <h4>آخر عمليات المزامنة</h4>
        {(syncCenter.logs||[]).slice(0,6).map(log=><div className={`sync-log-row ${log.status==="SUCCESS"?"ok":"failed"}`} key={log.id}>
          <span className="sync-log-state">{log.status==="SUCCESS"?"✓":"!"}</span><div><strong>{log.partnerName}</strong><small>{log.trigger==="AUTO"?"تلقائية":"يدوية"} · {new Date(log.createdAt).toLocaleString("ar-CA")}</small></div><div className="sync-log-change"><b>{log.changed?`${money(log.beforeBalance)} ← ${money(log.afterBalance)}`:"بدون تغيير"}</b><small>{(log.durationMs/1000).toFixed(1)} ثانية</small></div>
        </div>)}
        {!syncCenter.logs?.length&&<p className="empty-sync-log">لا يوجد سجل مزامنة بعد.</p>}
      </div>
    </section>

    {feeReport&&<section className="card jad-fee-report jad-fee-total-only">
      <div className="jad-fee-report-head">
        <div><h3>💵 إجمالي الأجور</h3><p>من {feeReport.fromDate} إلى {feeReport.toDate}</p></div>
        <strong>{money(feeReport.totalFees)} {feeReport.currency}</strong>
      </div>
    </section>}

    <form className="card form company-integration-form" onSubmit={add}>
      <h3>{editingId?"✏️ تعديل معلومات الشركة":"➕ إضافة شركة وربطها"}</h3>
      <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="اسم الشركة" required/>
      <input value={form.integrationName} onChange={e=>setForm({...form,integrationName:e.target.value})} placeholder="اسم الربط (اختياري)"/>
      <input type="url" value={form.systemUrl} onChange={e=>setForm({...form,systemUrl:e.target.value})} placeholder="رابط نظام الشركة https://..."/>
      <select value={form.connectionType} onChange={e=>setForm({...form,connectionType:e.target.value})}>
        <option value="WEB">رابط ويب</option><option value="API">API</option><option value="CSV">CSV</option><option value="EXCEL">Excel</option><option value="PDF">PDF</option>
      </select>
      <select value={form.connectorType} onChange={e=>setForm({...form,connectorType:e.target.value})}>
        <option value="GENERIC">شركة عامة — بدون مزامنة تلقائية</option><option value="JAD">موصل شركة جاد — جلب الرصيد يدويًا</option><option value="TAWASUL">موصل شركة تواصل — كشف الحساب والرصيد</option><option value="SURYANA">موصل شركة سوريانا — تسجيل WEB وAuthenticator</option><option value="DAHAB">موصل شركة دهب — API وAuthenticator</option>
      </select>
      <select value={form.accountCurrency} onChange={e=>setForm({...form,accountCurrency:e.target.value})}>
        {debtCurrencies.map(item=><option key={item.code} value={item.code}>{item.flag} {item.code}</option>)}
      </select>
      <input value={form.username} onChange={e=>setForm({...form,username:e.target.value})} placeholder="اسم المستخدم في موقع الشركة" autoComplete="off"/>
      <input type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="كلمة مرور موقع الشركة" autoComplete="new-password"/>
      <input value={form.externalAccountId} onChange={e=>setForm({...form,externalAccountId:e.target.value})} placeholder="رقم الحساب في الشركة — اختياري (قد تطلبه شركات أخرى)"/>
      <input type="date" value={form.syncFromDate} onChange={e=>setForm({...form,syncFromDate:e.target.value})} title="جلب الحركات ابتداءً من هذا التاريخ"/>
      <input value={form.contactName} onChange={e=>setForm({...form,contactName:e.target.value})} placeholder="اسم المسؤول"/>
      <input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="الهاتف"/>
      <input value={form.whatsapp} onChange={e=>setForm({...form,whatsapp:e.target.value})} placeholder="واتساب"/>
      <input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="البريد"/>
      <select value={form.syncIntervalMinutes} onChange={e=>setForm({...form,syncIntervalMinutes:Number(e.target.value)})}>
        <option value="1">مزامنة كل دقيقة</option><option value="5">مزامنة كل 5 دقائق</option><option value="15">مزامنة كل 15 دقيقة</option><option value="30">مزامنة كل 30 دقيقة</option><option value="60">مزامنة كل ساعة</option>
      </select>
      <select value={form.syncMode} onChange={e=>setForm({...form,syncMode:e.target.value})}>
        <option value="BALANCE_ONLY">جلب الرصيد فقط</option><option value="BALANCE_AND_STATEMENT">الرصيد وكشف الحساب</option>
      </select>
      <label className="integration-toggle"><input type="checkbox" checked={form.syncEnabled} onChange={e=>setForm({...form,syncEnabled:e.target.checked})}/><span>تفعيل المزامنة عند توفر موصل الشركة</span></label>
      <div className="partner-form-actions"><button>{editingId?"حفظ التعديلات":"حفظ وربط الشركة"}</button>{editingId&&<button type="button" className="danger-button" onClick={resetPartnerForm}>إلغاء التعديل</button>}</div>
    </form>

    <div className="card tablewrap">
      <table>
        <thead><tr><th>الشركة</th><th>نوع الربط</th><th>الحالة</th><th>العملة الأساسية</th><th>أرصدة العملات</th><th>آخر مزامنة</th><th>الرابط</th><th>الإجراءات</th></tr></thead>
        <tbody>{data.rows.length?data.rows.map(partner=><tr key={partner.id}>
          <td><strong>{partner.name}</strong><small className="company-subline">{partner.contactName||partner.integrationName||"-"}</small></td>
          <td>{partner.connectionType||"يدوي"}<small className="company-subline">{partner.connectorType==="TAWASUL"||partner.connectorType==="KONTORUN"?"موصل تواصل":partner.connectorType==="JAD"?"موصل جاد":partner.connectorType==="SURYANA"?"موصل سوريانا":partner.connectorType==="DAHAB"?"موصل دهب":"بدون موصل"}</small></td>
          <td>{(()=>{const effectiveStatus=partner.lastSyncAt&&Number.isFinite(Number(partner.externalBalance))?"READY":partner.connectionStatus;return <span className={`integration-status status-${String(effectiveStatus||"MANUAL").toLowerCase()}`}>{statusLabel(effectiveStatus)}</span>;})()}</td>
          <td><span className="partner-primary-currency">{flagOf(partner.accountCurrency||"USD")} {partner.accountCurrency||"USD"}</span><small className="company-subline">العملة الأساسية فقط</small></td>
          <td><PartnerCurrencyBalances partner={partner}/></td>
          <td><div className="relative-sync-time"><strong>{relativeSyncTime(partner.lastSyncAt)}</strong><small>{partner.lastSyncAt?new Date(partner.lastSyncAt).toLocaleString("ar-CA"):"—"}</small></div></td>
          <td>{partner.systemUrl?<a href={partner.systemUrl} target="_blank" rel="noreferrer">فتح الرابط</a>:"-"}</td>
          <td className="actions"><button onClick={()=>open(partner.id)}>فتح</button><button type="button" onClick={()=>startEditPartner(partner)}>✏️ تعديل</button><button type="button" className="danger-button" onClick={()=>deletePartner(partner)}>🗑️ حذف</button>{["JAD","TAWASUL","KONTORUN","DAHAB","SURYANA"].includes(partner.connectorType)&&<input className="jad-otp-input" inputMode="numeric" autoComplete="one-time-code" maxLength="8" value={otpById[partner.id]||""} onChange={e=>setOtpById(current=>({...current,[partner.id]:e.target.value.replace(/\D/g,"").slice(0,8)}))} placeholder="رمز Authenticator" aria-label="رمز Google Authenticator"/>}{partner.systemUrl&&<button type="button" onClick={()=>testConnection(partner)}>اختبار الاتصال</button>}{["JAD","TAWASUL","KONTORUN","DAHAB","SURYANA"].includes(partner.connectorType)&&<button type="button" disabled={syncingId===partner.id} onClick={()=>syncPartner(partner)}>{syncingId===partner.id?"جاري جلب الرصيد...":"جلب الرصيد"}</button>}{partner.connectorType==="JAD"&&<button type="button" onClick={()=>showJadDiagnostic(partner)}>عرض سجل الربط</button>}</td>
        </tr>):<tr><td colSpan="8">لا توجد شركات بعد.</td></tr>}</tbody>
      </table>
    </div>
  </>;
}

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

function MonthlyReport(){
  const [month,setMonth]=useState(new Date().toISOString().slice(0,7));
  const [data,setData]=useState(null);
  const [error,setError]=useState("");

  async function load(){
    setError("");
    try{
      const response=await cachedGet("/monthly-report",{params:{month}});
      setData(response.data);
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر تحميل التقرير الشهري");
    }
  }

  useEffect(()=>{load();},[month]);

  if(!data)return <><h2>التقرير الشهري</h2>{error?<div className="card customer-error">{error}</div>:<p>جاري التحميل...</p>}</>;

  const s=data.summary;

  return <>
    <div className="page-title-row">
      <h2>التقرير الشهري — {data.month}</h2>
      <button className="no-print" onClick={()=>window.print()}>طباعة / حفظ PDF</button>
    </div>

    <div className="card form no-print">
      <label>الشهر</label>
      <input type="month" value={month} onChange={e=>setMonth(e.target.value)}/>
      <button onClick={load}>عرض التقرير</button>
    </div>

    {error&&<div className="card customer-error">{error}</div>}

    <div className="stats">
      <div className="card transfer-total-card"><span>إجمالي الحوالات</span><strong>{money(s.transferTotal)}</strong></div>
      <div className="card"><span>عدد الحوالات</span><strong>{s.transferCount}</strong></div>
      <div className="card"><span>متوسط الحوالة</span><strong>{money(s.averageTransfer)}</strong></div>
      <div className="card"><span>أكبر حوالة</span><strong>{money(s.largestTransfer)}</strong></div>
      <div className="card"><span>أصغر حوالة</span><strong>{money(s.smallestTransfer)}</strong></div>
    </div>

    <div className="stats">
      <div className="card"><span>أجور الحوالات</span><strong>{money(s.feesTotal)}</strong></div>
      <div className="card"><span>ربح فرق السعر</span><strong>{money(s.exchangeProfit)}</strong></div>
      <div className="card"><span>إجمالي الربح</span><strong>{money(s.grossProfit)}</strong></div>
      <div className="card payable-card"><span>المصروفات</span><strong>{money(s.expenses)}</strong></div>
      <div className={`card final metric-card metric-net ${Number(s.netProfit||0)<0?"value-negative":"value-positive"}`}><span>صافي الربح</span><strong>{money(s.netProfit)}</strong></div>
    </div>

    <div className="stats">
      <div className="card"><span>الدفعات المستلمة</span><strong>{money(s.paymentsReceived)}</strong></div>
      <div className="card receivable-card"><span>إضافات رأس المال</span><strong>{money(s.capitalIn)}</strong></div>
      <div className="card payable-card"><span>سحوبات رأس المال</span><strong>{money(s.capitalOut)}</strong></div>
      <div className="card"><span>صافي حركة رأس المال</span><strong>{money(s.netCapitalMovement)}</strong></div>
    </div>

    <div className="card tablewrap">
      <h3>الحركة اليومية خلال الشهر</h3>
      <table>
        <thead><tr><th>التاريخ</th><th>عدد الحوالات</th><th>قيمة الحوالات</th><th>الربح</th></tr></thead>
        <tbody>{data.daily.length?data.daily.map(row=><tr key={row.date}>
          <td>{row.date}</td>
          <td>{row.count}</td>
          <td>{money(row.total)}</td>
          <td>{money(row.profit)}</td>
        </tr>):<tr><td colSpan="4">لا توجد حوالات في هذا الشهر.</td></tr>}</tbody>
      </table>
    </div>

    <div className="card tablewrap">
      <h3>أكثر العملاء تعاملًا خلال الشهر</h3>
      <table>
        <thead><tr><th>العميل</th><th>إجمالي الحوالات</th></tr></thead>
        <tbody>{data.topCustomers.length?data.topCustomers.map(row=><tr key={row.customerId}>
          <td>{row.customerName}</td>
          <td>{money(row.total)}</td>
        </tr>):<tr><td colSpan="2">لا توجد بيانات.</td></tr>}</tbody>
      </table>
    </div>

    <div className="card tablewrap">
      <h3>تفاصيل حوالات الشهر</h3>
      <table>
        <thead><tr><th>الرقم</th><th>التاريخ</th><th>المبلغ</th><th>الأجور</th><th>الربح</th></tr></thead>
        <tbody>{data.transactions.length?data.transactions.map(item=><tr key={item.id}>
          <td>{item.number||item.id}</td>
          <td>{item.transferDate||String(item.createdAt||"").slice(0,10)}</td>
          <td>{money(item.amount)}</td>
          <td>{money(item.transferFee)}</td>
          <td>{money(item.totalProfit)}</td>
        </tr>):<tr><td colSpan="5">لا توجد حوالات.</td></tr>}</tbody>
      </table>
    </div>
  </>;
}

function NotificationSettings({embedded=false}){
  const [settings,setSettings]=useState({overdueDays:7,lowCashLimit:5000,whatsappTemplate:""});
  const [message,setMessage]=useState("");

  useEffect(()=>{
    cachedGet("/notification-settings").then(response=>setSettings(response.data));
  },[]);

  async function save(event){
    event.preventDefault();
    try{
      const response=await api.patch("/notification-settings",settings);
      setSettings(response.data);
      setMessage("تم حفظ إعدادات التنبيهات");
    }catch(error){
      setMessage(error.response?.data?.message||"تعذر حفظ الإعدادات");
    }
  }

  return <div className={embedded?"notification-settings-embedded":"notification-settings-page"}>
    {!embedded&&<h2>إعدادات التنبيهات وواتساب</h2>}
    {message&&<div className="card rate-message">{message}</div>}
    <form className="card form settings-form" onSubmit={save}>
      <label>بدء تنبيه التأخير بعد عدد الأيام</label>
      <input type="number" min="1" max="365" value={settings.overdueDays}
        onChange={e=>setSettings({...settings,overdueDays:e.target.value})}/>
      <label>حد انخفاض السيولة (CAD)</label>
      <input type="number" min="0" step=".01" value={settings.lowCashLimit}
        onChange={e=>setSettings({...settings,lowCashLimit:e.target.value})}/>
      <label>قالب رسالة واتساب (اختياري)</label>
      <textarea rows="6" value={settings.whatsappTemplate}
        onChange={e=>setSettings({...settings,whatsappTemplate:e.target.value})}
        placeholder="يمكن استخدام: {name} {balance} {days}"/>
      <button>حفظ الإعدادات</button>
    </form>
    <div className={embedded?"settings-help":"card"}>
      <strong>ملاحظة:</strong>
      <p>زر واتساب يفتح الرسالة جاهزة للإرسال. الإرسال التلقائي دون ضغط يحتاج ربط WhatsApp Business API رسمي.</p>
    </div>
  </div>;
}



function BranchManagement(){
  const [branches,setBranches]=useState([]),[form,setForm]=useState({name:"",code:"",address:"",phone:"",currency:"CAD"}),[message,setMessage]=useState("");
  const load=()=>cachedGet("/branches").then(r=>setBranches(r.data)).catch(()=>{});useEffect(()=>{load()},[]);
  async function create(event){event.preventDefault();setMessage("");try{await api.post("/branches",form);setForm({name:"",code:"",address:"",phone:"",currency:"CAD"});setMessage("تم إنشاء الفرع بنجاح");load()}catch(error){setMessage(error.response?.data?.message||"تعذر إنشاء الفرع")}}
  return <article className="settings-card settings-wide-card"><div className="settings-card-title"><span>🏢</span><h3>إدارة الفروع</h3></div><p className="settings-help">أنشئ الفروع واعرض مؤشرات كل فرع. يمكن تغيير الفرع النشط من القائمة الجانبية.</p>{message&&<div className="settings-message">{message}</div>}<form className="branch-create-form" onSubmit={create}><input placeholder="اسم الفرع" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/><input placeholder="الرمز مثل WINDSOR" value={form.code} onChange={e=>setForm({...form,code:e.target.value.toUpperCase()})} required/><input placeholder="العنوان" value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/><input placeholder="الهاتف" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/><button className="settings-primary-button">إضافة فرع</button></form><div className="branch-grid">{branches.map(branch=><div className="branch-card" key={branch.id}><div><strong>{branch.name}</strong><small>{branch.code}{branch.isMain?" • الفرع الرئيسي":""}</small></div><div className="branch-metrics"><span>العملاء <b>{branch.metrics?.customers||0}</b></span><span>الحوالات <b>{branch.metrics?.transactions||0}</b></span><span>المصروفات <b>{money(branch.metrics?.expensesCad||0)} CAD</b></span></div></div>)}</div></article>
}

function SettingsPanel(){
  const savedUser=(()=>{
    try{return JSON.parse(localStorage.getItem("afs_user")||"{}")}catch{return {}}
  })();

  const [language,setLanguage]=useState(localStorage.getItem("alaboud_language")||"ar");
  const [displayMode,setDisplayMode]=useState(localStorage.getItem("alaboud_display_mode")||"comfortable");
  const [currency,setCurrency]=useState(localStorage.getItem("alaboud_primary_currency")||"CAD");
  const [message,setMessage]=useState("");
  const [updateInfo,setUpdateInfo]=useState({checking:false,status:"",version:APP_VERSION});
  const [accountForm,setAccountForm]=useState({name:"",email:"",password:"",role:"USER"});
  const [passwordForm,setPasswordForm]=useState({currentPassword:"",newPassword:"",confirmPassword:""});
  const [companyProfile,setCompanyProfile]=useState({name:savedUser.companyName||"",phone:"",logoDataUrl:""});
  const [companySaving,setCompanySaving]=useState(false);
  const [backupBusy,setBackupBusy]=useState(false);
  const [lastBackupAt,setLastBackupAt]=useState(localStorage.getItem("alaboud_last_backup_at")||"");
  const [users,setUsers]=useState([]);
  const [devices,setDevices]=useState([]);
  const [twoFactorInfo,setTwoFactorInfo]=useState({secret:"",code:"",enabled:Boolean(savedUser.twoFactorEnabled)});
  const [biometricEnabled,setBiometricEnabled]=useState(Boolean(window.AlAboudNative?.isBiometricEnabled?.()));
  const biometricAvailable=Boolean(typeof window!=="undefined"&&(window.AlAboudNative||navigator.userAgent.includes("AlAboudMobile")));

  useEffect(()=>{
    cachedGet("/company-profile").then(({data})=>setCompanyProfile(data)).catch(()=>{});
    if(savedUser.role==="ADMIN"){cachedGet("/users").then(({data})=>setUsers(data)).catch(()=>{});cachedGet("/devices").then(({data})=>setDevices(data)).catch(()=>{})}
  },[]);

  function chooseCompanyLogo(event){
    const file=event.target.files?.[0];
    if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>{
      const image=new Image();
      image.onload=()=>{const size=Math.min(640,Math.max(image.width,image.height));const scale=size/Math.max(image.width,image.height);const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height);setCompanyProfile(current=>({...current,logoDataUrl:canvas.toDataURL("image/webp",.88)}));setMessage("تم اختيار الشعار؛ اضغط حفظ لتثبيته");};
      image.onerror=()=>setMessage("تعذر قراءة ملف الشعار");image.src=String(reader.result||"");
    };
    reader.readAsDataURL(file);
  }

  async function saveCompanyProfile(event){
    event.preventDefault();setMessage("");setCompanySaving(true);
    try{
      const {data}=await api.patch("/company-profile",companyProfile);
      setCompanyProfile(data);
      const currentUser={...savedUser,companyName:data.name};
      localStorage.setItem("afs_user",JSON.stringify(currentUser));
      window.dispatchEvent(new CustomEvent("alaboud-company-updated",{detail:data}));
      setMessage("تم حفظ اسم وشعار الشركة بنجاح");
    }catch(error){setMessage(error.response?.data?.message||"تعذر حفظ هوية الشركة")}
    finally{setCompanySaving(false)}
  }

  useEffect(()=>{
    document.documentElement.lang=language;
    document.documentElement.dir=language==="ar"?"rtl":"ltr";
    window.dispatchEvent(new Event("alaboud-language-change"));
    document.body.classList.remove("display-compact","display-comfortable","display-large");
    document.body.classList.add(`display-${displayMode}`);
  },[]);

  function savePreferences(){
    localStorage.setItem("alaboud_language",language);
    localStorage.setItem("alaboud_display_mode",displayMode);
    localStorage.setItem("alaboud_primary_currency",currency);

    document.documentElement.lang=language;
    document.documentElement.dir=language==="ar"?"rtl":"ltr";
    document.body.classList.remove("display-compact","display-comfortable","display-large");
    document.body.classList.add(`display-${displayMode}`);

    setMessage(language==="ar"?"تم حفظ إعدادات العرض":"Display settings saved");
  }

  async function createAccount(event){
    event.preventDefault();
    setMessage("");
    try{
      await api.post("/users",accountForm);
      setAccountForm({name:"",email:"",password:"",role:"USER"});
      setMessage("تم إنشاء الحساب بنجاح");
    }catch(error){
      setMessage(error.response?.data?.message||"تعذر إنشاء الحساب");
    }
  }

  async function changePassword(event){
    event.preventDefault();
    setMessage("");
    if(passwordForm.newPassword!==passwordForm.confirmPassword){
      setMessage("تأكيد كلمة المرور غير مطابق");
      return;
    }

    try{
      const response=await api.post("/auth/change-password",{
        currentPassword:passwordForm.currentPassword,
        newPassword:passwordForm.newPassword
      });
      setPasswordForm({currentPassword:"",newPassword:"",confirmPassword:""});
      setMessage(response.data?.message||"تم تغيير كلمة المرور");
    }catch(error){
      setMessage(error.response?.data?.message||"تعذر تغيير كلمة المرور");
    }
  }

  async function beginTwoFactor(){setMessage("");try{const {data}=await api.post("/auth/2fa/setup");setTwoFactorInfo(current=>({...current,...data,code:""}));setMessage("أضف المفتاح إلى تطبيق Authenticator ثم أدخل الرمز")}catch(error){setMessage(error.response?.data?.message||"تعذر بدء إعداد التحقق بخطوتين")}}
  async function enableTwoFactor(){try{const {data}=await api.post("/auth/2fa/enable",{code:twoFactorInfo.code});const user={...savedUser,twoFactorEnabled:true};localStorage.setItem("afs_user",JSON.stringify(user));setTwoFactorInfo({secret:"",code:"",enabled:true});setMessage(data.message)}catch(error){setMessage(error.response?.data?.message||"تعذر تفعيل التحقق بخطوتين")}}
  async function disableTwoFactor(){try{const {data}=await api.post("/auth/2fa/disable");const user={...savedUser,twoFactorEnabled:false};localStorage.setItem("afs_user",JSON.stringify(user));setTwoFactorInfo({secret:"",code:"",enabled:false});setMessage(data.message)}catch(error){setMessage(error.response?.data?.message||"تعذر تعطيل التحقق بخطوتين")}}

  async function enableBiometric(){
    setMessage("");
    const native=window.AlAboudNative;
    if(!native){setMessage("تفعيل البصمة متاح داخل تطبيق الهاتف فقط");return}
    try{
      const {data}=await api.post("/auth/biometric-token");
      const userJson=localStorage.getItem("afs_user")||"{}";
      if(typeof native.enableBiometricLogin==="function"){
        native.enableBiometricLogin(data.token,userJson);
      }else if(typeof native.enableBiometric==="function"){
        native.saveBiometricToken?.(data.token,userJson);
        native.enableBiometric();
      }else{
        throw new Error("إصدار تطبيق الهاتف لا يدعم تفعيل البصمة");
      }
    }catch(error){setMessage(error.response?.data?.message||error.message||"تعذر تفعيل الدخول بالبصمة أو الوجه")}
  }
  function disableBiometric(){
    const native=window.AlAboudNative;
    if(typeof native?.disableBiometricLogin==="function")native.disableBiometricLogin();
    else native?.disableBiometric?.();
    setBiometricEnabled(false);
    setMessage("تم تعطيل الدخول بالبصمة أو الوجه");
  }
  useEffect(()=>{
    const handler=event=>{
      const enabled=Boolean(event.detail?.enabled);
      setBiometricEnabled(enabled);
      setMessage(event.detail?.message||(enabled?"تم تفعيل الدخول بالبصمة أو الوجه بنجاح":"تم تعطيل الدخول بالبصمة أو الوجه"));
    };
    window.addEventListener("alaboud-biometric-status",handler);
    window.addEventListener("alaboud-biometric-enable-result",handler);
    window.AlAboudNative?.getBiometricStatus?.();
    return()=>{
      window.removeEventListener("alaboud-biometric-status",handler);
      window.removeEventListener("alaboud-biometric-enable-result",handler);
    };
  },[]);

  async function checkUpdates(){
    setUpdateInfo(current=>({...current,checking:true,status:"جاري التحقق..."}));
    try{
      const response=await cachedGet("/health");
      const serverVersion=response.data?.version||"غير معروف";
      setUpdateInfo({
        checking:false,
        status:`الخدمة تعمل بشكل طبيعي — إصدار الخادم ${serverVersion}`,
        version:APP_VERSION
      });
    }catch{
      setUpdateInfo(current=>({...current,checking:false,status:"تعذر التحقق من حالة التحديث"}));
    }
  }

  async function downloadBackup(){
    setBackupBusy(true);setMessage("");
    try{
      const response=await cachedGet("/backup",{responseType:"blob"});
      const blob=new Blob([response.data],{type:"application/json"});
      const url=URL.createObjectURL(blob);
      const link=document.createElement("a");
      const stamp=new Date().toISOString().replace(/[:.]/g,"-");
      link.href=url;link.download=`alaboud-backup-${stamp}.json`;
      document.body.appendChild(link);link.click();link.remove();
      URL.revokeObjectURL(url);
      const savedAt=new Date().toISOString();
      localStorage.setItem("alaboud_last_backup_at",savedAt);
      setLastBackupAt(savedAt);
      setMessage("تم إنشاء وتنزيل النسخة الاحتياطية بنجاح");
    }catch(error){setMessage(error.response?.data?.message||"تعذر إنشاء النسخة الاحتياطية")}
    finally{setBackupBusy(false)}
  }

  async function restoreBackup(event){
    const file=event.target.files?.[0];
    event.target.value="";
    if(!file)return;
    if(!window.confirm("سيتم استبدال بيانات هذه الشركة بمحتوى النسخة الاحتياطية. هل تريد المتابعة؟"))return;
    setBackupBusy(true);setMessage("");
    try{
      const payload=JSON.parse(await file.text());
      const response=await api.post("/backup/restore",payload);
      setMessage(response.data?.message||"تمت استعادة النسخة الاحتياطية بنجاح");
      setTimeout(()=>window.location.reload(),900);
    }catch(error){setMessage(error.response?.data?.message||error.message||"تعذر استعادة النسخة الاحتياطية")}
    finally{setBackupBusy(false)}
  }

  const labels=language==="ar"
    ?{
      title:"الإعدادات",
      language:"اللغة",
      arabic:"العربية",
      english:"English",
      display:"طريقة العرض",
      compact:"مضغوط",
      comfortable:"مريح",
      large:"كبير",
      currency:"العملة الرئيسية",
      save:"حفظ إعدادات العرض"
    }
    :{
      title:"Settings",
      language:"Language",
      arabic:"العربية",
      english:"English",
      display:"Display mode",
      compact:"Compact",
      comfortable:"Comfortable",
      large:"Large",
      currency:"Primary currency",
      save:"Save display settings"
    };

  return <section className="settings-page">
    <div className="settings-hero">
      <div>
        <span className="settings-hero-icon">⚙️</span>
        <div>
          <h2>{labels.title}</h2>
          <p>شركة العبود التجارية — إدارة تفضيلات البرنامج والحساب</p>
        </div>
      </div>
      <span className="settings-version">{APP_VERSION}</span>
    </div>

    {message&&<div className="card settings-message">{message}</div>}

    <div className="settings-grid">
    {savedUser.role==="ADMIN"&&<BranchManagement/>}
    <article className="settings-card security-access-card"><div className="settings-card-title"><span>🔐</span><h3>حماية تسجيل الدخول</h3></div><p className="settings-help">التحقق بخطوتين بواسطة Google Authenticator أو Microsoft Authenticator.</p>{twoFactorInfo.enabled?<button type="button" className="danger" onClick={disableTwoFactor}>تعطيل التحقق بخطوتين</button>:<>{!twoFactorInfo.secret?<button type="button" className="settings-primary-button" onClick={beginTwoFactor}>بدء التفعيل</button>:<div className="two-factor-setup"><label>المفتاح السري<input readOnly value={twoFactorInfo.secret}/></label><small>انسخ المفتاح إلى تطبيق Authenticator.</small><label>رمز التحقق<input inputMode="numeric" maxLength="6" value={twoFactorInfo.code} onChange={e=>setTwoFactorInfo({...twoFactorInfo,code:e.target.value.replace(/\D/g,"").slice(0,6)})}/></label><button type="button" disabled={twoFactorInfo.code.length!==6} onClick={enableTwoFactor}>تأكيد التفعيل</button></div>}</>}<div className="biometric-settings-block"><div><strong>👆 الدخول بالبصمة أو الوجه</strong><small>{biometricAvailable?(biometricEnabled?"مفعّل على هذا الهاتف":"غير مفعّل على هذا الهاتف"):"متاح داخل تطبيق الهاتف فقط"}</small></div>{biometricAvailable&&(biometricEnabled?<button type="button" className="danger" onClick={disableBiometric}>تعطيل البصمة أو الوجه</button>:<button type="button" className="settings-primary-button" onClick={enableBiometric}>تفعيل البصمة أو الوجه</button>)}</div><p className="security-note">بعد التفعيل، سيظهر زر الدخول بالبصمة أو الوجه في شاشة تسجيل الدخول.</p></article>


      <article className="settings-card settings-backup-card">
        <div className="settings-card-title"><span>💾</span><h3>النسخ الاحتياطي</h3></div>
        <p className="settings-help">تنزيل نسخة كاملة من بيانات شركتك أو استعادتها لاحقًا.</p>
        <div className="settings-backup-actions">
          <button type="button" className="settings-primary-button" onClick={downloadBackup} disabled={backupBusy}>{backupBusy?"جاري التنفيذ...":"إنشاء نسخة احتياطية"}</button>
          <label className="settings-restore-button">استعادة نسخة احتياطية
            <input type="file" accept="application/json,.json" onChange={restoreBackup} disabled={backupBusy}/>
          </label>
        </div>
        <small>آخر نسخة: {lastBackupAt?new Date(lastBackupAt).toLocaleString("ar-CA"):"لم يتم إنشاء نسخة بعد"}</small>
      </article>

      <article className="settings-card">
        <div className="settings-card-title"><span>🌐</span><h3>{labels.language}</h3></div>
        <div className="settings-choice-grid">
          <button type="button" className={language==="ar"?"selected":""} onClick={()=>setLanguage("ar")}>العربية</button>
          <button type="button" className={language==="en"?"selected":""} onClick={()=>setLanguage("en")}>English</button>
        </div>

        <div className="settings-card-title settings-subtitle"><span>🖥️</span><h3>{labels.display}</h3></div>
        <div className="settings-choice-grid three">
          <button type="button" className={displayMode==="compact"?"selected":""} onClick={()=>setDisplayMode("compact")}>{labels.compact}</button>
          <button type="button" className={displayMode==="comfortable"?"selected":""} onClick={()=>setDisplayMode("comfortable")}>{labels.comfortable}</button>
          <button type="button" className={displayMode==="large"?"selected":""} onClick={()=>setDisplayMode("large")}>{labels.large}</button>
        </div>

        <label className="settings-label">{labels.currency}</label>
        <select value={currency} onChange={e=>setCurrency(e.target.value)}>
          {["CAD","USD","EUR","GBP","AED","TRY","SYP"].map(code=><option key={code} value={code}>{code}</option>)}
        </select>

        <button className="settings-primary-button" type="button" onClick={savePreferences}>{labels.save}</button>
      </article>

      <article className="settings-card settings-alerts-embedded">
        <div className="settings-card-title"><span>🔔</span><h3>إعدادات التنبيهات وواتساب</h3></div>
        <NotificationSettings embedded />
      </article>

      <article className="settings-card company-branding-settings">
        <div className="settings-card-title"><span>🏢</span><h3>معلومات وهوية الشركة</h3></div>
        <p className="settings-help">اسم وشعار مستقلان لهذه الشركة ويظهران على جميع الأجهزة عند تسجيل الدخول بنفس الحساب.</p>
        <form className="settings-form-modern" onSubmit={saveCompanyProfile}>
          <div className="company-logo-preview">
            <img src={companyProfile.logoDataUrl||"/alaboud-company-logo.webp"} alt={companyProfile.name||"شعار الشركة"}/>
          </div>
          <input value={companyProfile.name||""} onChange={e=>setCompanyProfile({...companyProfile,name:e.target.value})} placeholder="اسم الشركة" required/>
          <input value={companyProfile.phone||""} onChange={e=>setCompanyProfile({...companyProfile,phone:e.target.value})} placeholder="رقم هاتف الشركة"/>
          <label className="company-logo-upload">🖼️ اختيار لوغو الشركة
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseCompanyLogo}/>
          </label>
          {companyProfile.logoDataUrl&&<button type="button" className="company-logo-remove" onClick={()=>setCompanyProfile({...companyProfile,logoDataUrl:""})}>حذف الشعار الحالي</button>}
          <button disabled={companySaving}>{companySaving?"جاري الحفظ...":"حفظ اسم وشعار الشركة"}</button>
        </form>
      </article>

      <article className="settings-card">
        <div className="settings-card-title"><span>👤</span><h3>إنشاء حساب</h3></div>
        <p className="settings-help">الحساب الحالي: {savedUser.name||savedUser.email||"مدير النظام"}</p>
        <form className="settings-form-modern" onSubmit={createAccount}>
          <input value={accountForm.name} onChange={e=>setAccountForm({...accountForm,name:e.target.value})} placeholder="اسم المستخدم" required/>
          <input type="email" value={accountForm.email} onChange={e=>setAccountForm({...accountForm,email:e.target.value})} placeholder="البريد الإلكتروني" required/>
          <input type="password" value={accountForm.password} onChange={e=>setAccountForm({...accountForm,password:e.target.value})} placeholder="كلمة المرور — 8 أحرف على الأقل" required/>
          <select value={accountForm.role} onChange={e=>setAccountForm({...accountForm,role:e.target.value})}>
            <option value="USER">مستخدم</option>
            <option value="MANAGER">مدير</option>
            <option value="ADMIN">مسؤول كامل</option>
          </select>
          <button>إنشاء الحساب</button>
        </form>
      </article>

      {savedUser.role==="ADMIN"&&<article className="settings-card settings-wide-card">
        <div className="settings-card-title"><span>👥</span><h3>إدارة المستخدمين والصلاحيات</h3></div>
        <div className="admin-list">{users.map(user=><div className="admin-row" key={user.id}><div><strong>{user.name}</strong><small>{user.email} • آخر دخول: {user.lastLoginAt?new Date(user.lastLoginAt).toLocaleString("ar-CA"):"لم يدخل بعد"}</small></div><select value={user.role} onChange={async e=>{const {data}=await api.patch(`/users/${user.id}`,{role:e.target.value});setUsers(list=>list.map(x=>x.id===data.id?{...x,...data}:x))}}><option value="ADMIN">مسؤول كامل</option><option value="MANAGER">مدير</option><option value="USER">مستخدم</option><option value="VIEWER">مشاهدة فقط</option></select><button type="button" className={user.active?"danger-soft":"success-soft"} onClick={async()=>{const {data}=await api.patch(`/users/${user.id}`,{active:!user.active});setUsers(list=>list.map(x=>x.id===data.id?{...x,...data}:x))}}>{user.active?"تعطيل":"تفعيل"}</button></div>)}</div>
      </article>}

      {savedUser.role==="ADMIN"&&<article className="settings-card settings-wide-card">
        <div className="settings-card-title"><span>💻</span><h3>الأجهزة والتراخيص</h3></div>
        <p className="settings-help">يُسجل كل تثبيت بمعرّف فريد ونوع الجهاز والإصدار وآخر اتصال.</p>
        <div className="admin-list">{devices.length?devices.map(device=><div className="admin-row" key={device.id}><div><strong>{device.deviceName||"جهاز"}</strong><small>{device.appVersion||"17.0.1"} • {device.platform?.slice(0,70)}<br/>آخر اتصال: {device.lastSeenAt?new Date(device.lastSeenAt).toLocaleString("ar-CA"):"—"}</small></div><button type="button" className={device.active!==false?"danger-soft":"success-soft"} onClick={async()=>{const {data}=await api.patch(`/devices/${device.id}`,{active:device.active===false});setDevices(list=>list.map(x=>x.id===data.id?data:x))}}>{device.active!==false?"تعطيل الجهاز":"إعادة التفعيل"}</button></div>):<p className="settings-help">ستظهر الأجهزة هنا بعد أول تسجيل دخول بالإصدار الجديد.</p>}</div>
      </article>}

      <article className="settings-card settings-wide-card">
        <div className="settings-card-title"><span>📄</span><h3>سياسة الخصوصية وشروط الاستخدام</h3></div>
        <details><summary>سياسة الخصوصية</summary><p className="settings-help">يجمع النظام معلومات الحساب ومعرّف التثبيت ونوع الجهاز وإصدار التطبيق وتاريخ أول وآخر استخدام لأغراض الأمان وإدارة التراخيص فقط. لا تُباع البيانات ولا تُشارك مع جهات خارجية، ولا تُخزن كلمات المرور بصورتها الأصلية.</p></details>
        <details><summary>شروط الاستخدام</summary><p className="settings-help">الاستخدام مخصص للأجهزة والحسابات المصرح بها. يمنع نسخ البرنامج أو إعادة بيعه أو تجاوز الحماية دون إذن. المستخدم مسؤول عن صحة البيانات والنسخ الاحتياطية والالتزام بالقوانين المحلية.</p></details>
        <small>آخر تحديث: 18 يوليو 2026 — الإصدار القانوني 1.0</small>
      </article>

      <article className="settings-card">
        <div className="settings-card-title"><span>🔐</span><h3>تغيير كلمة السر</h3></div>
        <form className="settings-form-modern" onSubmit={changePassword}>
          <input type="password" value={passwordForm.currentPassword} onChange={e=>setPasswordForm({...passwordForm,currentPassword:e.target.value})} placeholder="كلمة المرور الحالية" required/>
          <input type="password" value={passwordForm.newPassword} onChange={e=>setPasswordForm({...passwordForm,newPassword:e.target.value})} placeholder="كلمة المرور الجديدة" required/>
          <input type="password" value={passwordForm.confirmPassword} onChange={e=>setPasswordForm({...passwordForm,confirmPassword:e.target.value})} placeholder="تأكيد كلمة المرور الجديدة" required/>
          <button>تغيير كلمة السر</button>
        </form>
      </article>

      <article className="settings-card">
        <div className="settings-card-title"><span>🛟</span><h3>الدعم الفني</h3></div>
        <p className="settings-help">عند حدوث مشكلة، أرسل صورة الخطأ ورقم الإصدار الظاهر في البرنامج.</p>
        <div className="support-actions">
          <a href="mailto:support@alaboud.local?subject=ALABOUD%20Business%20Suite%20Support">✉️ البريد الفني</a>
          <button type="button" onClick={()=>navigator.clipboard?.writeText(APP_VERSION).then(()=>setMessage("تم نسخ رقم الإصدار"))}>📋 نسخ رقم الإصدار</button>
        </div>
      </article>

      <article className="settings-card settings-updates-card">
        <div className="settings-card-title"><span>⬆️</span><h3>التحديثات</h3></div>
        <div className="update-current-version">
          <span>الإصدار الحالي</span>
          <strong>{updateInfo.version}</strong>
        </div>
        <p className="settings-help">{updateInfo.status||"اضغط للتحقق من حالة الخدمة والتحديث."}</p>
        <button type="button" className="settings-primary-button" onClick={checkUpdates} disabled={updateInfo.checking}>
          {updateInfo.checking?"جاري التحقق...":"التحقق من التحديثات"}
        </button>
      </article>
    </div>
  </section>;
}


function AICommandCenter({navigate}){
  const [overview,setOverview]=useState(null);const [question,setQuestion]=useState("");const [messages,setMessages]=useState([{role:"assistant",text:"مرحبًا، أنا مساعد العبود الذكي. اسألني عن الأرباح أو المصروفات أو الديون أو التوقعات."}]);const [busy,setBusy]=useState(false);const [listening,setListening]=useState(false);
  const load=()=>cachedGet("/ai/overview").then(r=>setOverview(r.data)).catch(()=>{});
  useEffect(()=>{load()},[]);
  async function ask(text=question){const q=String(text||"").trim();if(!q||busy)return;setQuestion("");setMessages(m=>[...m,{role:"user",text:q}]);setBusy(true);try{const {data}=await api.post("/ai/assistant",{question:q});setMessages(m=>[...m,{role:"assistant",text:data.answer,data:data.data||[],action:data.action}]);setOverview(data.overview||overview)}catch(e){setMessages(m=>[...m,{role:"assistant",text:e.response?.data?.message||"تعذر تنفيذ التحليل الآن."}])}finally{setBusy(false)}}
  function voice(){const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){alert("الإدخال الصوتي غير مدعوم في هذا المتصفح");return}const r=new SR();r.lang="ar-SA";r.onstart=()=>setListening(true);r.onend=()=>setListening(false);r.onresult=e=>{const t=e.results[0][0].transcript;setQuestion(t);ask(t)};r.start()}
  if(!overview)return <div className="premium-loading">جاري تشغيل مركز الذكاء…</div>;
  return <section className="ai-center">
    <div className="ai-hero"><div><span>🤖</span><div><h2>مركز القيادة الذكي</h2><p>ALABOUD AI — تحليل الأعمال واتخاذ القرار</p></div></div><b className={overview.healthScore>=75?"good":overview.healthScore>=50?"warn":"bad"}>صحة الشركة {overview.healthScore}/100</b></div>
    <div className="ai-kpis"><article className={Number(overview.today.netProfit||0)<0?"value-negative":"value-positive"}><span>صافي اليوم</span><strong>{cad(overview.today.netProfit)}</strong></article><article className={Number(overview.month.netProfit||0)<0?"value-negative":"value-positive"}><span>صافي الشهر</span><strong>{cad(overview.month.netProfit)}</strong></article><article className="value-receivable"><span>الديون لنا</span><strong>{cad(overview.finance.receivables)}</strong></article><article className={Number(overview.forecast.nextMonthNet||0)<0?"value-negative":"value-positive"}><span>توقع الشهر القادم</span><strong>{cad(overview.forecast.nextMonthNet)}</strong></article></div>
    <div className="ai-intelligence-grid">
      <article className="card ai-trend-card"><div className="section-heading"><h3>📊 اتجاه الأداء خلال 6 أشهر</h3><small>الأرباح والمصروفات وصافي النتيجة</small></div><div className="ai-trend-bars">{overview.monthlyTrend.map((item)=>{const max=Math.max(1,...overview.monthlyTrend.flatMap(x=>[Math.abs(x.profit||0),Math.abs(x.expenses||0),Math.abs(x.net||0)]));return <div className="ai-trend-column" key={item.month}><div className="ai-trend-stack"><i className="profit" style={{height:`${Math.max(6,Math.abs(item.profit||0)/max*100)}%`}} title={`الأرباح ${cad(item.profit)}`}></i><i className="expense" style={{height:`${Math.max(6,Math.abs(item.expenses||0)/max*100)}%`}} title={`المصروفات ${cad(item.expenses)}`}></i><i className={item.net>=0?"net positive":"net negative"} style={{height:`${Math.max(6,Math.abs(item.net||0)/max*100)}%`}} title={`الصافي ${cad(item.net)}`}></i></div><span>{item.month.slice(5)}</span></div>})}</div><div className="ai-chart-legend"><span>● الأرباح</span><span>● المصروفات</span><span>● الصافي</span></div></article>
      <article className="card ai-decision-card"><div className="section-heading"><h3>🎯 مركز القرارات</h3><small>إجراءات مقترحة الآن</small></div>{overview.recommendations.slice(0,4).map((x,i)=><button key={i} onClick={()=>{if(/دين|تحصيل/.test(x))navigate("customers");else if(/مصروف/.test(x))navigate("expenses");else if(/سيولة|رأس/.test(x))navigate("capital-overview");else navigate("monthly-report")}}><span>{i+1}</span><p>{x}</p><b>تنفيذ ›</b></button>)}</article>
    </div>
    <div className="ai-layout"><div className="ai-chat card"><div className="ai-messages">{messages.map((m,i)=><div key={i} className={`ai-message ${m.role}`}><p>{m.text}</p>{m.data?.length>0&&<div className="ai-results">{m.data.slice(0,6).map((x,j)=><div key={x.id||j}><strong>{x.name||x.title||x.number||"سجل"}</strong><span>{x.finalBalance!==undefined?cad(x.finalBalance):x.amount!==undefined?`${x.amount} ${x.currency||""}`:""}</span></div>)}</div>}{m.action&&<button onClick={()=>navigate(m.action.page)}>فتح الصفحة</button>}</div>)}{busy&&<div className="ai-message assistant"><p>جاري التحليل…</p></div>}</div><form onSubmit={e=>{e.preventDefault();ask()}} className="ai-input"><button type="button" onClick={voice}>{listening?"◉":"🎙️"}</button><input value={question} onChange={e=>setQuestion(e.target.value)} placeholder="اسأل: كم أرباح هذا الشهر؟"/><button>إرسال</button></form><div className="ai-quick">{["كم أرباح اليوم؟","اعرض الديون المتأخرة","حلل المصروفات","ما توقع الشهر القادم؟","قيّم صحة الشركة"].map(x=><button key={x} onClick={()=>ask(x)}>{x}</button>)}</div></div>
    <aside className="ai-side"><div className="card"><h3>💡 توصيات اليوم</h3>{overview.recommendations.map((x,i)=><p key={i}>• {x}</p>)}</div><div className="card"><h3>🚨 اكتشاف تلقائي</h3>{overview.anomalies.length?overview.anomalies.map((x,i)=><div key={i} className={`ai-alert ${x.level}`}><strong>{x.title}</strong><small>{x.message}</small></div>):<p>لا توجد أخطاء غير اعتيادية.</p>}</div><div className="card"><h3>🖥️ مراقبة النظام</h3><p>قاعدة البيانات: <b>{overview.system.database}</b></p><p>المستخدمون: <b>{overview.system.users}</b></p><p>الأجهزة النشطة: <b>{overview.system.devices}</b></p><button onClick={()=>navigate("settings")}>النسخ الاحتياطي والإعدادات</button></div></aside></div>
  </section>
}

function Simple({type}){
  const [list,setList]=useState([]),[title,setTitle]=useState(""),[amount,setAmount]=useState(""),[move,setMove]=useState("IN");
  const [currency,setCurrency]=useState("CAD"),[exchangeRate,setExchangeRate]=useState("1"),[category,setCategory]=useState("Other"),[date,setDate]=useState(new Date().toISOString().slice(0,10));
  const [editingId,setEditingId]=useState(null),[saving,setSaving]=useState(false),[message,setMessage]=useState("");
  const endpoint=type==="expenses"?"/expenses":"/capital";
  const expenseCurrencies=[
    {code:"CAD",flag:"🇨🇦",name:"دولار كندي"},{code:"USD",flag:"🇺🇸",name:"دولار أمريكي"},
    {code:"EUR",flag:"🇪🇺",name:"يورو"},{code:"GBP",flag:"🇬🇧",name:"جنيه إسترليني"},
    {code:"TRY",flag:"🇹🇷",name:"ليرة تركية"},{code:"SYP",flag:"🇸🇾",name:"ليرة سورية"},
    {code:"SAR",flag:"🇸🇦",name:"ريال سعودي"},{code:"AED",flag:"🇦🇪",name:"درهم إماراتي"},
    {code:"JOD",flag:"🇯🇴",name:"دينار أردني"}
  ];
  const flagOf=code=>expenseCurrencies.find(x=>x.code===String(code||"").toUpperCase())?.flag||"🏳️";
  const load=()=>cachedGet(endpoint).then(r=>setList(r.data));
  useEffect(()=>{load();},[type]);
  useEffect(()=>{if(currency==="CAD")setExchangeRate("1");},[currency]);
  function resetExpenseForm(){setEditingId(null);setTitle("");setAmount("");setCurrency("CAD");setExchangeRate("1");setCategory("Other");setDate(new Date().toISOString().slice(0,10));}
  async function add(e){
    e.preventDefault();setSaving(true);setMessage("");
    try{
      const payload=type==="expenses"?{title,amount,currency,exchangeRate:Number(exchangeRate||1),category,date}:{type:move,amount,currency,description:title,date};
      if(type==="expenses"&&editingId)await api.put(`${endpoint}/${editingId}`,payload);else await api.post(endpoint,payload);
      if(type==="expenses")setMessage(editingId?"تم تعديل المصروف بنجاح":"تم حفظ المصروف بنجاح");
      resetExpenseForm();await load();
    }catch(err){setMessage(err?.response?.data?.message||"تعذر حفظ المصروف");}
    finally{setSaving(false);}
  }
  function editExpense(x){setEditingId(x.id);setTitle(x.title||"");setAmount(String(x.amount??""));setCurrency(x.currency||"CAD");setExchangeRate(String(x.exchangeRate||1));setCategory(x.category||"Other");setDate(x.date||new Date().toISOString().slice(0,10));setMessage("");window.scrollTo({top:0,behavior:"smooth"});}
  async function deleteExpense(x){
    if(!window.confirm(`هل أنت متأكد من حذف المصروف: ${x.title}؟`))return;
    try{await api.delete(`${endpoint}/${x.id}`);if(String(editingId)===String(x.id))resetExpenseForm();setMessage("تم حذف المصروف بنجاح");await load();}
    catch(err){setMessage(err?.response?.data?.message||"تعذر حذف المصروف");}
  }
  if(type!=="expenses")return <><h2>رأس المال</h2><form className="card form" onSubmit={add}><select value={move} onChange={e=>setMove(e.target.value)}><option value="IN">زيادة</option><option value="OUT">سحب</option></select><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="الوصف" required/><input type="number" step=".01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="المبلغ" required/><button>حفظ</button></form><div className="card tablewrap"><table><tbody>{list.map(x=><tr key={x.id}><td>{x.date}</td><td>{x.description}</td><td>{x.type}</td><td>{money(x.amount)} {x.currency||"CAD"}</td></tr>)}</tbody></table></div></>;
  const totals=list.reduce((acc,x)=>{const code=x.currency||"CAD";acc[code]=(acc[code]||0)+Number(x.amount||0);acc.CAD_TOTAL=(acc.CAD_TOTAL||0)+Number(x.cadAmount??x.amount??0);return acc;},{});
  return <div className="expenses-multi-page">
    <div className="expenses-title-row"><div><h2>المصروفات بجميع العملات</h2><p>سجّل المصروف بعملته الأصلية وسيتم احتسابه تلقائيًا بالدولار الكندي.</p></div><div className="expenses-cad-total"><span>الإجمالي المعتمد</span><strong>{money(totals.CAD_TOTAL)} CAD 🇨🇦</strong></div></div>
    <form className="card form expenses-multi-form" onSubmit={add}>
      <label><span>الوصف</span><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="مثال: وقود، إيجار، خدمات" required/></label>
      <label><span>التصنيف</span><select value={category} onChange={e=>setCategory(e.target.value)}><option value="Other">أخرى</option><option value="Fuel">وقود</option><option value="Rent">إيجار</option><option value="Utilities">خدمات</option><option value="Salary">رواتب</option><option value="Office">مكتب</option><option value="Transport">نقل</option></select></label>
      <label><span>العملة</span><select value={currency} onChange={e=>setCurrency(e.target.value)}>{expenseCurrencies.map(c=><option key={c.code} value={c.code}>{c.flag} {c.code} — {c.name}</option>)}</select></label>
      <label><span>المبلغ بالعملة الأصلية</span><input type="number" min="0.01" step=".01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" required/></label>
      <label><span>سعر التحويل إلى CAD</span><input type="number" min="0.000001" step="0.000001" value={exchangeRate} onChange={e=>setExchangeRate(e.target.value)} disabled={currency==="CAD"} required/></label>
      <label><span>التاريخ</span><input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label>
      <div className="expense-conversion-preview"><span>القيمة المعتمدة في التقارير</span><strong>{money(Number(amount||0)*Number(exchangeRate||0))} CAD 🇨🇦</strong></div>
      <div className="expense-form-actions"><button className="expense-save-button" disabled={saving}>{saving?"جاري الحفظ…":editingId?"حفظ التعديلات":"حفظ المصروف"}</button>{editingId&&<button type="button" className="expense-cancel-button" onClick={resetExpenseForm}>إلغاء التعديل</button>}</div>{message&&<div className="expense-action-message">{message}</div>}
    </form>
    <section className="expense-currency-totals">{expenseCurrencies.filter(c=>totals[c.code]).map(c=><div className="card" key={c.code}><span>{c.flag} {c.name}</span><strong>{money(totals[c.code])} {c.code}</strong></div>)}</section>
    <div className="card tablewrap expense-table"><table><thead><tr><th>التاريخ</th><th>الوصف</th><th>التصنيف</th><th>العملة</th><th>المبلغ الأصلي</th><th>سعر التحويل</th><th>القيمة CAD</th><th>الإجراءات</th></tr></thead><tbody>{list.map(x=><tr key={x.id} className={String(editingId)===String(x.id)?"expense-editing-row":""}><td>{x.date}</td><td>{x.title}</td><td>{x.category||"Other"}</td><td><span className="expense-currency-cell">{flagOf(x.currency)} {x.currency||"CAD"}</span></td><td>{money(x.amount)} {x.currency||"CAD"}</td><td>{Number(x.exchangeRate||1).toFixed(6)}</td><td><strong>{money(x.cadAmount??x.amount)} CAD 🇨🇦</strong></td><td><div className="expense-row-actions"><button type="button" className="expense-edit-button" onClick={()=>editExpense(x)}>✏️ تعديل</button><button type="button" className="expense-delete-button" onClick={()=>deleteExpense(x)}>🗑️ حذف</button></div></td></tr>)}</tbody></table></div>
  </div>;
}
export {
  Profits,
  ExchangeRates,
  GeneralDebts,
  PartnerProfile,
  Partners,
  CapitalOverview,
  MonthlyReport,
  SettingsPanel,
  AICommandCenter,
  Simple
};