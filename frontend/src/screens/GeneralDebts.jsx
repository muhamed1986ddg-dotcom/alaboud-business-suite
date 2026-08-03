import React,{useEffect,useMemo,useState}from"react";
import api,{cachedGet} from"../api";
import {money,debtCurrencies} from"../shared";

function GeneralDebts(){
  const [data,setData]=useState({rows:[],payments:[],totals:{receivable:0,payable:0,net:0},totalsByCurrency:{}});
  const [mode,setMode]=useState("ALL");
  const [search,setSearch]=useState("");
  const [message,setMessage]=useState("");
  const [refreshingRates,setRefreshingRates]=useState(false);
  const [showAddModal,setShowAddModal]=useState(false);
  const [visibleCount,setVisibleCount]=useState(50);
  const [payment,setPayment]=useState({debtId:"",amount:"",paymentDate:"",method:"CASH",notes:""});
  const [settlementDebt,setSettlementDebt]=useState(null);
  const [settlementMode,setSettlementMode]=useState("PARTIAL");
  const [form,setForm]=useState({type:"RECEIVABLE",partyName:"",amount:"",currency:"CAD",dueDate:"",description:"",reference:""});

  async function load(){
    try{
      const {data}=await cachedGet("/general-debts");
      setData({
        rows:Array.isArray(data?.rows)?data.rows:[],
        payments:Array.isArray(data?.payments)?data.payments:[],
        totals:data?.totals||{receivable:0,payable:0,net:0},
        summaryCurrency:data?.summaryCurrency||"CAD",
        totalsByCurrency:data?.totalsByCurrency||{},
        missingRates:Array.isArray(data?.missingRates)?data.missingRates:[],
        ratesUpdatedAt:data?.ratesUpdatedAt||null
      });
    }catch(error){setMessage(error.response?.data?.message||"تعذر تحميل الديون");}
  }

  useEffect(()=>{load();},[]);
  useEffect(()=>{setVisibleCount(50);},[mode,search]);

  async function refreshRatesAndRecalculate(){
    setRefreshingRates(true);setMessage("");
    try{await api.post("/exchange-rates/refresh");await load();setMessage("تم تحديث أسعار الصرف وإعادة احتساب صافي الديون بالدولار الكندي");}
    catch(error){setMessage(error.response?.data?.message||"تعذر تحديث أسعار الصرف. تم الإبقاء على آخر أسعار محفوظة.");}
    finally{setRefreshingRates(false);}
  }

  async function addDebt(event){
    event.preventDefault();setMessage("");
    try{
      await api.post("/general-debts",form);
      setForm({type:"RECEIVABLE",partyName:"",amount:"",currency:"CAD",dueDate:"",description:"",reference:""});
      setShowAddModal(false);setMessage("تم حفظ الدين بنجاح");await load();
    }catch(error){setMessage(error.response?.data?.message||"تعذر حفظ الدين");}
  }

  async function addPayment(event){
    event.preventDefault();if(!payment.debtId||!payment.amount)return;setMessage("");
    try{
      await api.post(`/general-debts/${payment.debtId}/payments`,payment);
      setPayment({debtId:"",amount:"",paymentDate:"",method:"CASH",notes:""});setMessage("تم تسجيل الدفعة");await load();
    }catch(error){setMessage(error.response?.data?.message||"تعذر تسجيل الدفعة");}
  }

  function openSettlement(item){
    setSettlementDebt(item);
    setSettlementMode("FULL");
    setPayment({debtId:item.id,amount:String(item.remaining||""),paymentDate:new Date().toISOString().slice(0,10),method:"CASH",notes:item.type==="PAYABLE"?"تسديد الدين علينا":"تحصيل الدين لنا"});
  }

  function changeSettlementMode(mode){
    setSettlementMode(mode);
    if(settlementDebt&&mode==="FULL")setPayment(current=>({...current,amount:String(settlementDebt.remaining||"")}));
  }

  const openDebts=data.rows.filter(item=>Number(item.remaining||0)>0&&item.source==="MANUAL");
  const currencyMeta=Object.fromEntries(debtCurrencies.map(item=>[item.code,item]));
  const statusLabel={OPEN:"مفتوح",PARTIAL:"مدفوع جزئيًا",PAID:"مدفوع",OVERDUE:"متأخر"};
  const nowDate=new Date().toISOString().slice(0,10);

  const filteredRows=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return data.rows.filter(item=>{
      if(mode==="RECEIVABLE"&&item.type!=="RECEIVABLE")return false;
      if(mode==="PAYABLE"&&item.type!=="PAYABLE")return false;
      if(mode==="OVERDUE"&&!(item.status==="OVERDUE"||(Number(item.remaining||0)>0&&item.dueDate&&item.dueDate<nowDate)))return false;
      if(mode==="PAID"&&!(item.status==="PAID"||Number(item.remaining||0)<=0.001))return false;
      if(!q)return true;
      return [item.partyName,item.reference,item.description,item.currency,item.status].some(v=>String(v||"").toLowerCase().includes(q));
    });
  },[data.rows,mode,search,nowDate]);

  const visibleRows=filteredRows.slice(0,visibleCount);
  const openCount=data.rows.filter(x=>Number(x.remaining||0)>0.001).length;
  const overdueCount=data.rows.filter(x=>x.status==="OVERDUE"||(Number(x.remaining||0)>0&&x.dueDate&&x.dueDate<nowDate)).length;
  const paidCount=data.rows.filter(x=>x.status==="PAID"||Number(x.remaining||0)<=0.001).length;

  return <>
    <div className="page-title-row debts-page-heading">
      <div><h2>الدَّين العام</h2><p className="muted">لوحة موحدة للديون، مع الحفاظ على صافي جميع العملات بالدولار الكندي.</p></div>
      <button type="button" className="primary" onClick={refreshRatesAndRecalculate} disabled={refreshingRates}>{refreshingRates?"جارٍ تحديث الأسعار...":"🔄 تحديث الأسعار وإعادة الاحتساب"}</button>
    </div>

    <div className="stats">
      <div className="card receivable-card"><span>دين لنا — {data.summaryCurrency||"CAD"} 🇨🇦</span><strong>{money(data.totals.receivable)}</strong><small>بعد تحويل جميع العملات</small></div>
      <div className="card payable-card"><span>دين علينا — {data.summaryCurrency||"CAD"} 🇨🇦</span><strong>{money(data.totals.payable)}</strong><small>بعد تحويل جميع العملات</small></div>
      <div className="card final"><span>صافي الديون النهائي — {data.summaryCurrency||"CAD"} 🇨🇦</span><strong className={Number(data.totals.net)>=0?"positive-net":"negative-net"}>{money(data.totals.net)}</strong><small>محسوب حسب أحدث سعر متاح{data.ratesUpdatedAt?` — آخر تحديث: ${new Date(data.ratesUpdatedAt).toLocaleString("ar-CA")}`:" — لم يُسجل وقت تحديث"}</small></div>
    </div>

    {data.missingRates?.length>0&&<div className="card debt-message">تعذر تحويل العملات التالية إلى {data.summaryCurrency||"CAD"}: {data.missingRates.join("، ")}.</div>}

    <div className="card debt-currency-summary">
      <div className="debt-currency-summary-head"><div><h3>مجموع الديون في باقي العملات</h3><p>يظهر دين لنا ودين علينا والصافي لكل عملة بشكل مستقل.</p></div></div>
      <div className="debt-currency-totals">{debtCurrencies.map(currency=>{
        const total=data.totalsByCurrency?.[currency.code]||{receivable:0,payable:0,net:0};
        return <div className="debt-currency-total card" key={currency.code}>
          <div className="debt-currency-title"><span className="debt-currency-flag">{currency.flag}</span><div><strong>{currency.code}</strong><small>{currency.name}</small></div></div>
          <div className="debt-currency-row receivable"><span>دين لنا</span><b>{money(total.receivable)} {currency.symbol}</b></div>
          <div className="debt-currency-row payable"><span>دين علينا</span><b>{money(total.payable)} {currency.symbol}</b></div>
          <div className="debt-currency-row net"><span>الصافي</span><b>{money(total.net)} {currency.symbol}</b></div>
        </div>})}</div>
    </div>

    <div className="debt-summary-mini">
      <div className="card"><span>الديون المفتوحة</span><strong>{openCount}</strong></div>
      <div className="card"><span>الديون المتأخرة</span><strong>{overdueCount}</strong></div>
      <div className="card"><span>الديون المسددة</span><strong>{paidCount}</strong></div>
      <div className="card"><span>إجمالي السجلات</span><strong>{data.rows.length}</strong></div>
    </div>

    <div className="card debt-mode-tabs no-print">
      <button type="button" className="primary debt-add-open" onClick={()=>setShowAddModal(true)}>➕ إضافة دين</button>
      {[['ALL','📋 جميع الديون'],['RECEIVABLE','🟢 الدين لنا'],['PAYABLE','🔴 الدين علينا'],['OVERDUE','⏳ المتأخرة'],['PAID','✅ المسددة'],['PAYMENTS','💳 الدفعات']].map(([key,label])=><button key={key} type="button" className={mode===key?"active":""} onClick={()=>setMode(key)}>{label}</button>)}
    </div>

    {message&&<div className="card debt-message">{message}</div>}

    {mode==="PAYMENTS"?<>
      {openDebts.length>0&&<form className="card form debt-payment-form" onSubmit={addPayment}>
        <select value={payment.debtId} onChange={e=>setPayment({...payment,debtId:e.target.value})} required><option value="">اختر الدين لتسجيل دفعة</option>{openDebts.map(item=><option key={item.id} value={item.id}>{item.type==="RECEIVABLE"?"لنا":"علينا"} — {item.partyName} — متبقي {money(item.remaining)} {item.currency}</option>)}</select>
        <input type="number" min="0.01" step="0.01" value={payment.amount} onChange={e=>setPayment({...payment,amount:e.target.value})} placeholder="مبلغ الدفعة" required/>
        <input type="date" value={payment.paymentDate} onChange={e=>setPayment({...payment,paymentDate:e.target.value})}/>
        <select value={payment.method||"CASH"} onChange={e=>setPayment({...payment,method:e.target.value})}><option value="CASH">نقدي</option><option value="BANK">بنك</option><option value="TRANSFER">تحويل</option><option value="CARD">بطاقة</option></select>
        <input value={payment.notes} onChange={e=>setPayment({...payment,notes:e.target.value})} placeholder="ملاحظات الدفعة"/>
        <button>تسجيل الدفعة</button>
      </form>}
      <div className="card tablewrap"><table><thead><tr><th>التاريخ</th><th>الجهة</th><th>نوع الدين</th><th>اتجاه الدفعة</th><th>المبلغ</th><th>الطريقة</th><th>العملة</th><th>ملاحظات</th></tr></thead><tbody>{data.payments.length?data.payments.map(item=><tr key={item.id}><td>{item.paymentDate||String(item.createdAt||"").slice(0,10)}</td><td>{item.partyName||"-"}</td><td>{item.debtType==="RECEIVABLE"?"دين لنا":"دين علينا"}</td><td>{item.direction==="OUTGOING"?"دفعنا":"استلمنا"}</td><td>{money(item.amount)}</td><td>{item.method||"CASH"}</td><td>{item.currency||"CAD"}</td><td>{item.notes||"-"}</td></tr>):<tr><td colSpan="8">لا توجد دفعات ديون مسجلة.</td></tr>}</tbody></table></div>
    </>:<>
      <div className="card debt-search-row"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="بحث باسم الجهة أو المرجع أو العملة..."/><span>النتائج: {filteredRows.length}</span></div>
      <div className="card tablewrap"><table><thead><tr><th>النوع</th><th>المصدر</th><th>الشخص/الجهة</th><th>المبلغ</th><th>المدفوع</th><th>المتبقي</th><th>العملة</th><th>الاستحقاق</th><th>الحالة</th><th>المرجع</th><th>الإجراء</th></tr></thead><tbody>{visibleRows.length?visibleRows.map(item=><tr key={item.id}><td><span className={`debt-type ${item.type==="RECEIVABLE"?"receivable":"payable"}`}>{item.type==="RECEIVABLE"?"دين لنا":"دين علينا"}</span></td><td>{item.source==="PARTNER"||item.source==="PARTNER_EXTERNAL"?"شركة":item.source==="TRANSFER"?"حوالة":item.source==="CUSTOMER_OLD_BALANCE"?"حساب عميل قديم":"يدوي"}</td><td>{item.partyName}</td><td>{money(item.amount)}</td><td>{money(item.paid)}</td><td><strong>{money(item.remaining)}</strong></td><td><span className="debt-table-currency">{currencyMeta[item.currency]?.flag||"💱"} {item.currency}</span></td><td>{item.dueDate||"-"}</td><td>{statusLabel[item.status]||item.status}</td><td>{item.reference||"-"}</td><td>{Number(item.remaining||0)>0.001&&item.source==="MANUAL"?<button type="button" className={item.type==="PAYABLE"?"payable-settle-button":"receivable-settle-button"} onClick={()=>openSettlement(item)}>{item.type==="PAYABLE"?"🏦 تسديد الدين علينا":"💵 تسجيل دفعة من العميل"}</button>:<span>—</span>}</td></tr>):<tr><td colSpan="11">لا توجد ديون مطابقة.</td></tr>}</tbody></table></div>
      {visibleCount<filteredRows.length&&<div className="load-more-row"><button type="button" onClick={()=>setVisibleCount(v=>v+50)}>تحميل 50 سجلًا إضافيًا</button></div>}
    </>}

    {settlementDebt&&<div className="transaction-modal-backdrop no-print" role="dialog" aria-modal="true">
      <div className="transaction-modal-panel debt-modal-panel">
        <div className="transaction-modal-header"><h3>{settlementDebt.type==="PAYABLE"?"تسديد الدين علينا":"تسجيل دفعة من العميل"}</h3><button type="button" onClick={()=>setSettlementDebt(null)}>✕</button></div>
        <form className="card form debt-add-form" onSubmit={async event=>{await addPayment(event);setSettlementDebt(null)}}>
          <div className="debt-settlement-summary"><strong>{settlementDebt.partyName}</strong><span>المتبقي: {money(settlementDebt.remaining)} {settlementDebt.currency}</span></div>
          <div className="debt-settlement-modes"><button type="button" className={settlementMode==="FULL"?"active":""} onClick={()=>changeSettlementMode("FULL")}>تسديد كامل</button><button type="button" className={settlementMode==="PARTIAL"?"active":""} onClick={()=>changeSettlementMode("PARTIAL")}>تسديد جزئي</button></div>
          <input type="number" min="0.01" max={settlementDebt.remaining} step="0.01" value={payment.amount} onChange={e=>{setSettlementMode("PARTIAL");setPayment({...payment,amount:e.target.value})}} placeholder="مبلغ الدفعة" required/>
          <input type="date" value={payment.paymentDate} onChange={e=>setPayment({...payment,paymentDate:e.target.value})}/>
          <select value={payment.method||"CASH"} onChange={e=>setPayment({...payment,method:e.target.value})}><option value="CASH">نقدي</option><option value="BANK">بنك</option><option value="TRANSFER">تحويل</option><option value="CARD">بطاقة</option></select>
          <input value={payment.notes} onChange={e=>setPayment({...payment,notes:e.target.value})} placeholder="ملاحظات السداد"/>
          <div className="transaction-modal-actions"><button type="button" onClick={()=>setSettlementDebt(null)}>إلغاء</button><button className="primary">{settlementDebt.type==="PAYABLE"?"تأكيد الدفع":"تأكيد الاستلام"}</button></div>
        </form>
      </div>
    </div>}

    {showAddModal&&<div className="transaction-modal-backdrop no-print" role="dialog" aria-modal="true">
      <div className="transaction-modal-panel debt-modal-panel">
        <div className="transaction-modal-header"><h3>إضافة دين جديد</h3><button type="button" onClick={()=>setShowAddModal(false)}>✕</button></div>
        <form className="card form debt-add-form" onSubmit={addDebt}>
          <select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}><option value="RECEIVABLE">دين لنا</option><option value="PAYABLE">دين علينا</option></select>
          <input value={form.partyName} onChange={e=>setForm({...form,partyName:e.target.value})} placeholder="اسم الشخص أو الجهة" required/>
          <input type="number" min="0.01" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="مبلغ الدين" required/>
          <select value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}>{debtCurrencies.map(item=><option key={item.code}>{item.code}</option>)}</select>
          <input type="date" value={form.dueDate} onChange={e=>setForm({...form,dueDate:e.target.value})}/>
          <input value={form.reference} onChange={e=>setForm({...form,reference:e.target.value})} placeholder="رقم مرجع أو فاتورة"/>
          <input value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="ملاحظات"/>
          <div className="transaction-modal-actions"><button type="button" onClick={()=>setShowAddModal(false)}>إلغاء</button><button className="primary">حفظ الدين</button></div>
        </form>
      </div>
    </div>}
  </>;
}

export { GeneralDebts };
