import React,{useEffect,useMemo,useState}from"react";
import api,{cachedGet}from"../api";
import{EXCHANGE_CURRENCY_CATALOG,CurrencyFlag,rateTrend}from"../shared";

const DEFAULT_CODES=["CAD","EUR","GBP","TRY","SYP","SAR","AED","JOD","LBP","EGP","IQD","KWD","QAR","BHD","OMR","CHF","AUD","NZD","CNY","JPY","INR","SEK","NOK"];

function RateModal({title,onClose,children,wide=false}){
  useEffect(()=>{const onKey=e=>{if(e.key==="Escape")onClose()};document.addEventListener("keydown",onKey);return()=>document.removeEventListener("keydown",onKey)},[onClose]);
  return <div className="rate-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <section className={`rate-modal ${wide?"rate-modal-wide":""}`} role="dialog" aria-modal="true">
      <header><h3>{title}</h3><button type="button" onClick={onClose} aria-label="إغلاق">×</button></header>
      <div className="rate-modal-content">{children}</div>
    </section>
  </div>;
}

function ExchangeRates(){
  const [list,setList]=useState([]);
  const [history,setHistory]=useState([]);
  const [refreshing,setRefreshing]=useState(false);
  const [message,setMessage]=useState("");
  const [search,setSearch]=useState("");
  const [filter,setFilter]=useState("ALL");
  const [modal,setModal]=useState(null);
  const [selected,setSelected]=useState(null);
  const [favorites,setFavorites]=useState(()=>{try{return JSON.parse(localStorage.getItem("alaboud_rate_favorites")||"[]")}catch{return[]}});
  const [enabledCodes,setEnabledCodes]=useState(()=>{try{const x=JSON.parse(localStorage.getItem("alaboud_global_rate_codes")||"null");return Array.isArray(x)&&x.length?x:DEFAULT_CODES}catch{return DEFAULT_CODES}});

  useEffect(()=>localStorage.setItem("alaboud_rate_favorites",JSON.stringify(favorites)),[favorites]);
  useEffect(()=>localStorage.setItem("alaboud_global_rate_codes",JSON.stringify(enabledCodes)),[enabledCodes]);

  const info=useMemo(()=>Object.fromEntries(EXCHANGE_CURRENCY_CATALOG.map(x=>[x.code,x])),[]);
  const safeDate=value=>{const d=new Date(value||0);return Number.isNaN(d.getTime())?"—":d.toLocaleString("ar-CA")};
  const normalize=x=>Array.isArray(x)?x:Array.isArray(x?.rows)?x.rows:Array.isArray(x?.data)?x.data:[];

  async function load(){
    try{
      const [rates,hist]=await Promise.all([cachedGet("/exchange-rates"),cachedGet("/exchange-rates/history?limit=100").catch(()=>({data:[]}))]);
      setList(normalize(rates.data));setHistory(normalize(hist.data));
    }catch(e){setMessage(e.response?.data?.message||"تعذر تحميل أسعار الصرف")}
  }
  useEffect(()=>{load();const timer=setInterval(()=>{if(document.visibilityState==="visible")refresh(false)},60*60*1000);return()=>clearInterval(timer)},[]);

  async function refresh(show=true){
    setRefreshing(true);if(show)setMessage("");
    try{const{data}=await api.post("/exchange-rates/refresh");if(show)setMessage(data.message||"تم تحديث الأسعار العالمية");await load()}
    catch(e){if(show)setMessage(e.response?.data?.message||"تعذر تحديث الأسعار العالمية")}
    finally{setRefreshing(false)}
  }

  const rates=list.filter(r=>r.baseCurrency==="USD"&&r.quoteCurrency!=="USD"&&enabledCodes.includes(r.quoteCurrency));
  const goldRates=list.filter(r=>String(r.baseCurrency||"").startsWith("XAU"));
  const latestAt=rates.reduce((x,r)=>String(r.createdAt||"")>String(x||"")?r.createdAt:x,"");
  const filtered=rates.filter(r=>{
    const q=search.trim().toLowerCase();const fav=favorites.includes(String(r.id));
    const text=`${r.quoteCurrency} ${info[r.quoteCurrency]?.name||""}`.toLowerCase();
    return(!q||text.includes(q))&&(filter==="ALL"||(filter==="FAVORITES"&&fav)||(filter==="MAJOR"&&["CAD","EUR","GBP","TRY","SAR","AED","JOD"].includes(r.quoteCurrency))||(filter==="OTHER"&&!["CAD","EUR","GBP","TRY","SAR","AED","JOD"].includes(r.quoteCurrency)));
  });
  const trendFor=r=>rateTrend(r,history);
  const toggleCode=code=>setEnabledCodes(cur=>cur.includes(code)?cur.filter(x=>x!==code):[...cur,code]);
  const openDetails=r=>{setSelected(r);setModal("details")};

  return <section className="exchange-page exchange-auto-only">
    <div className="exchange-page-head">
      <div><h2>العملات وأسعار الصرف</h2><p>أسعار مرجعية عالمية تلقائية، والدولار الأمريكي هو العملة الأساسية.</p></div>
      <span className="exchange-usd-base">🇺🇸 العملة الأساسية: USD</span>
    </div>

    <div className="exchange-summary-cards">
      <article><span>العملات المعروضة</span><strong>{rates.length}</strong><small>مقابل الدولار الأمريكي</small></article>
      <article><span>آخر تحديث عالمي</span><strong>{latestAt?safeDate(latestAt).split("،")[0]:"—"}</strong><small>{latestAt?safeDate(latestAt):"لم يتم التحديث"}</small></article>
      <article><span>المصدر</span><strong>Global USD Feed</strong><small>نشرة مرجعية عالمية تلقائية</small></article>
      <article><span>التحديث التلقائي</span><strong>كل ساعة</strong><small>يُحفظ آخر سعر ناجح عند تعذر المصدر</small></article>
    </div>

    <div className="exchange-action-bar">
      <button className="primary" type="button" onClick={()=>refresh(true)} disabled={refreshing}>{refreshing?"جاري التحديث...":"↻ تحديث الأسعار الآن"}</button>
      <button type="button" onClick={()=>setModal("currencies")}>⚙ إدارة العملات</button>
      <button type="button" onClick={()=>setModal("history")}>▤ سجل التحديثات</button>
      <button type="button" onClick={()=>setModal("settings")}>⏱ إعدادات التحديث</button>
    </div>
    {message&&<div className="exchange-inline-message">{message}</div>}

    <section className="exchange-table-card">
      <div className="exchange-table-toolbar">
        <div><h3>أسعار العملات العالمية</h3><small>كل القيم توضح ما يعادل 1 دولار أمريكي</small></div>
        <div className="exchange-search"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ابحث بالعملة أو الرمز..."/></div>
        <div className="exchange-filter-buttons">{[["ALL","الكل"],["FAVORITES","المفضلة"],["MAJOR","الرئيسية"],["OTHER","أخرى"]].map(([k,l])=><button type="button" className={filter===k?"active":""} onClick={()=>setFilter(k)} key={k}>{l}</button>)}</div>
      </div>
      <div className="exchange-responsive-table">
        <table><thead><tr><th>العملة</th><th>الرمز</th><th>مقابل 1 USD</th><th>الحركة</th><th>آخر تحديث</th><th>الإجراء</th></tr></thead>
        <tbody>{filtered.map(r=>{const trend=trendFor(r),fav=favorites.includes(String(r.id));return <tr key={r.id}>
          <td><div className="exchange-currency-cell"><CurrencyFlag code={r.quoteCurrency}/><div><b>{info[r.quoteCurrency]?.name||r.quoteCurrency}</b><small>الدولار الأمريكي ← {r.quoteCurrency}</small></div></div></td>
          <td><span className="exchange-code">{r.quoteCurrency}</span></td>
          <td><strong className="exchange-value">{Number(r.sellRate||r.buyRate||0).toLocaleString("en-CA",{maximumFractionDigits:6})}</strong></td>
          <td><span className={`trend trend-${trend.type}`}>{trend.symbol} {trend.label}</span></td>
          <td>{safeDate(r.createdAt)}</td>
          <td><div className="exchange-row-actions"><button type="button" onClick={()=>setFavorites(cur=>fav?cur.filter(x=>x!==String(r.id)):[...cur,String(r.id)])}>{fav?"★":"☆"}</button><button type="button" onClick={()=>openDetails(r)}>عرض</button></div></td>
        </tr>})}{!filtered.length&&<tr><td colSpan="6" className="exchange-empty">لا توجد أسعار مطابقة. اضغط تحديث الأسعار الآن.</td></tr>}</tbody></table>
      </div>
    </section>

    {!!goldRates.length&&<section className="exchange-table-card exchange-gold-compact"><div className="exchange-table-toolbar"><div><h3>أسعار الذهب التلقائية</h3><small>محسوبة تلقائيًا للغرام بالدولار الكندي</small></div></div><div className="exchange-gold-grid">{goldRates.map(r=><article key={r.id}><span>{r.baseCurrency.replace("XAU","")} قيراط</span><strong>{Number(r.sellRate||0).toFixed(2)} CAD</strong><small>{safeDate(r.createdAt)}</small></article>)}</div></section>}

    {modal==="currencies"&&<RateModal title="إدارة العملات المعروضة" onClose={()=>setModal(null)} wide><p className="rate-modal-note">اختر العملات التي تريد إظهارها. الأسعار نفسها تُجلب تلقائيًا ولا يمكن تعديلها يدويًا.</p><div className="rate-currency-picker">{EXCHANGE_CURRENCY_CATALOG.filter(x=>x.code!=="USD").map(x=><button type="button" className={enabledCodes.includes(x.code)?"active":""} key={x.code} onClick={()=>toggleCode(x.code)}><span>{x.flag}</span><div><b>{x.code}</b><small>{x.name}</small></div><strong>{enabledCodes.includes(x.code)?"✓":"+"}</strong></button>)}</div></RateModal>}
    {modal==="history"&&<RateModal title="سجل تحديثات الأسعار" onClose={()=>setModal(null)} wide><div className="rate-modal-table"><table><thead><tr><th>التاريخ</th><th>الزوج</th><th>السعر</th><th>المصدر</th></tr></thead><tbody>{history.filter(x=>x.baseCurrency==="USD").map(x=><tr key={x.id}><td>{safeDate(x.createdAt)}</td><td>USD/{x.quoteCurrency}</td><td>{Number(x.sellRate||x.buyRate||0).toLocaleString("en-CA",{maximumFractionDigits:6})}</td><td>{x.source||"GLOBAL_USD_FEED"}</td></tr>)}</tbody></table></div></RateModal>}
    {modal==="settings"&&<RateModal title="إعدادات التحديث التلقائي" onClose={()=>setModal(null)}><div className="rate-settings-list"><div><b>العملة الأساسية</b><span>USD — الدولار الأمريكي</span></div><div><b>مدة التحديث</b><span>كل ساعة</span></div><div><b>طريقة الحفظ</b><span>آخر سعر عالمي ناجح فقط</span></div><div><b>التعديل اليدوي</b><span className="disabled-label">معطل</span></div><div><b>عند تعذر المصدر</b><span>الاحتفاظ بآخر سعر محفوظ</span></div></div></RateModal>}
    {modal==="details"&&selected&&<RateModal title={`تفاصيل ${info[selected.quoteCurrency]?.name||selected.quoteCurrency}`} onClose={()=>setModal(null)}><div className="rate-detail-card"><CurrencyFlag code={selected.quoteCurrency}/><h3>1 USD = {Number(selected.sellRate||selected.buyRate||0).toLocaleString("en-CA",{maximumFractionDigits:6})} {selected.quoteCurrency}</h3><p>المصدر: {selected.source||"GLOBAL_USD_FEED"}</p><p>آخر تحديث: {safeDate(selected.createdAt)}</p><p>هذا سعر مرجعي عالمي، وليس سعر شراء أو بيع مصرفي.</p></div></RateModal>}
  </section>;
}
export{ExchangeRates};
