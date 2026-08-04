import React,{useEffect,useMemo,useState}from"react";
import api,{cachedGet}from"../api";
import{EXCHANGE_CURRENCY_CATALOG,CurrencyFlag,rateTrend}from"../shared";
import{AppButton,AppCard,AppModal,AppStatCard,AppTable}from"../components/ui";

const DEFAULT_CODES=["CAD","EUR","GBP","TRY","SYP","SAR","AED","JOD","LBP","EGP","IQD","KWD","QAR","BHD","OMR","CHF","AUD","NZD","CNY","JPY","INR","SEK","NOK"];

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
      <AppStatCard label="العملات المعروضة" value={rates.length} hint="مقابل الدولار الأمريكي"/>
      <AppStatCard label="آخر تحديث عالمي" value={latestAt?safeDate(latestAt).split("،")[0]:"—"} hint={latestAt?safeDate(latestAt):"لم يتم التحديث"} tone="info"/>
      <AppStatCard label="المصدر" value="Global USD Feed" hint="نشرة مرجعية عالمية تلقائية"/>
      <AppStatCard label="التحديث التلقائي" value="كل ساعة" hint="يُحفظ آخر سعر ناجح عند تعذر المصدر" tone="success"/>
    </div>

    <div className="exchange-action-bar">
      <AppButton variant="primary" type="button" onClick={()=>refresh(true)} busy={refreshing} busyText="جاري التحديث...">↻ تحديث الأسعار الآن</AppButton>
      <AppButton type="button" onClick={()=>setModal("currencies")}>⚙ إدارة العملات</AppButton>
      <AppButton type="button" onClick={()=>setModal("history")}>▤ سجل التحديثات</AppButton>
      <AppButton type="button" onClick={()=>setModal("settings")}>⏱ إعدادات التحديث</AppButton>
    </div>
    {message&&<div className="exchange-inline-message">{message}</div>}

    <AppCard className="exchange-table-card" title="أسعار العملات العالمية" subtitle="كل القيم توضح ما يعادل 1 دولار أمريكي" actions={<div className="exchange-filter-buttons">{[["ALL","الكل"],["FAVORITES","المفضلة"],["MAJOR","الرئيسية"],["OTHER","أخرى"]].map(([k,l])=><AppButton type="button" className={filter===k?"active":""} onClick={()=>setFilter(k)} key={k}>{l}</AppButton>)}</div>}>
      <div className="exchange-search"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ابحث بالعملة أو الرمز..."/></div>
      <AppTable
        className="exchange-responsive-table"
        rows={filtered}
        emptyText="لا توجد أسعار مطابقة. اضغط تحديث الأسعار الآن."
        columns={[
          {key:"currency",label:"العملة",render:r=><div className="exchange-currency-cell"><CurrencyFlag code={r.quoteCurrency}/><div><b>{info[r.quoteCurrency]?.name||r.quoteCurrency}</b><small>الدولار الأمريكي ← {r.quoteCurrency}</small></div></div>},
          {key:"code",label:"الرمز",render:r=><span className="exchange-code">{r.quoteCurrency}</span>},
          {key:"value",label:"مقابل 1 USD",render:r=><strong className="exchange-value">{Number(r.sellRate||r.buyRate||0).toLocaleString("en-CA",{maximumFractionDigits:6})}</strong>},
          {key:"trend",label:"الحركة",render:r=>{const trend=trendFor(r);return <span className={`trend trend-${trend.type}`}>{trend.symbol} {trend.label}</span>}},
          {key:"updated",label:"آخر تحديث",render:r=>safeDate(r.createdAt)},
          {key:"actions",label:"الإجراء",render:r=>{const fav=favorites.includes(String(r.id));return <div className="exchange-row-actions"><AppButton type="button" onClick={()=>setFavorites(cur=>fav?cur.filter(x=>x!==String(r.id)):[...cur,String(r.id)])}>{fav?"★":"☆"}</AppButton><AppButton variant="info" type="button" onClick={()=>openDetails(r)}>عرض</AppButton></div>}}
        ]}
      />
    </AppCard>

    {!!goldRates.length&&<section className="exchange-table-card exchange-gold-compact"><div className="exchange-table-toolbar"><div><h3>أسعار الذهب التلقائية</h3><small>محسوبة تلقائيًا للغرام بالدولار الكندي</small></div></div><div className="exchange-gold-grid">{goldRates.map(r=><article key={r.id}><span>{r.baseCurrency.replace("XAU","")} قيراط</span><strong>{Number(r.sellRate||0).toFixed(2)} CAD</strong><small>{safeDate(r.createdAt)}</small></article>)}</div></section>}

    {modal==="currencies"&&<AppModal open title="إدارة العملات المعروضة" onClose={()=>setModal(null)} size="xl"><p className="rate-modal-note">اختر العملات التي تريد إظهارها. الأسعار نفسها تُجلب تلقائيًا ولا يمكن تعديلها يدويًا.</p><div className="rate-currency-picker">{EXCHANGE_CURRENCY_CATALOG.filter(x=>x.code!=="USD").map(x=><button type="button" className={enabledCodes.includes(x.code)?"active":""} key={x.code} onClick={()=>toggleCode(x.code)}><span>{x.flag}</span><div><b>{x.code}</b><small>{x.name}</small></div><strong>{enabledCodes.includes(x.code)?"✓":"+"}</strong></button>)}</div></AppModal>}
    {modal==="history"&&<AppModal open title="سجل تحديثات الأسعار" onClose={()=>setModal(null)} size="xl"><AppTable className="rate-modal-table" rows={history.filter(x=>x.baseCurrency==="USD")} emptyText="لا يوجد سجل تحديثات" columns={[{key:"date",label:"التاريخ",render:x=>safeDate(x.createdAt)},{key:"pair",label:"الزوج",render:x=>`USD/${x.quoteCurrency}`},{key:"rate",label:"السعر",render:x=>Number(x.sellRate||x.buyRate||0).toLocaleString("en-CA",{maximumFractionDigits:6})},{key:"source",label:"المصدر",render:x=>x.source||"GLOBAL_USD_FEED"}]}/></AppModal>}
    {modal==="settings"&&<AppModal open title="إعدادات التحديث التلقائي" onClose={()=>setModal(null)}><div className="rate-settings-list"><div><b>العملة الأساسية</b><span>USD — الدولار الأمريكي</span></div><div><b>مدة التحديث</b><span>كل ساعة</span></div><div><b>طريقة الحفظ</b><span>آخر سعر عالمي ناجح فقط</span></div><div><b>التعديل اليدوي</b><span className="disabled-label">معطل</span></div><div><b>عند تعذر المصدر</b><span>الاحتفاظ بآخر سعر محفوظ</span></div></div></AppModal>}
    {modal==="details"&&selected&&<AppModal open title={`تفاصيل ${info[selected.quoteCurrency]?.name||selected.quoteCurrency}`} onClose={()=>setModal(null)}><div className="rate-detail-card"><CurrencyFlag code={selected.quoteCurrency}/><h3>1 USD = {Number(selected.sellRate||selected.buyRate||0).toLocaleString("en-CA",{maximumFractionDigits:6})} {selected.quoteCurrency}</h3><p>المصدر: {selected.source||"GLOBAL_USD_FEED"}</p><p>آخر تحديث: {safeDate(selected.createdAt)}</p><p>هذا سعر مرجعي عالمي، وليس سعر شراء أو بيع مصرفي.</p></div></AppModal>}
  </section>;
}
export{ExchangeRates};
