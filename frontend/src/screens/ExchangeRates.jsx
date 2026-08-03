import React,{useEffect,useRef,useState}from"react";
import api,{cachedGet} from"../api";
import {APP_VERSION} from"../version";
import {money,cad,openRegularWhatsApp,currencyFlag,flagOf,cleanConnectorMessage,EXCHANGE_CURRENCY_CATALOG,debtCurrencies,CurrencyFlag,rateTrend} from"../shared";

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


export { ExchangeRates };
