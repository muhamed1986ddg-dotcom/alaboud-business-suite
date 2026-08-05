import React,{useEffect,useRef,useState}from"react";
import api,{cachedGet} from"../api";
import {APP_VERSION} from"../version";
import {money,cad,openRegularWhatsApp,currencyFlag,flagOf,cleanConnectorMessage,EXCHANGE_CURRENCY_CATALOG,debtCurrencies,CurrencyFlag,rateTrend,confirmAction} from"../shared";
import {AppTable} from "../components/ui";

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
  const [editingTransactionId,setEditingTransactionId]=useState("");
  const [editingPaymentId,setEditingPaymentId]=useState("");
  const [notice,setNotice]=useState("");
  const [saving,setSaving]=useState(false);

  async function load(){
    try{
      const response=await cachedGet(`/partners/${id}`);
      setData(response.data);
      const baseCurrency=response.data?.partner?.accountCurrency||"CAD";
      setTransaction(current=>current.amount?current:{...current,currency:baseCurrency});
      setPayment(current=>current.amount?current:{...current,currency:baseCurrency});
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر تحميل المورد أو الشركة");
    }
  }

  useEffect(()=>{load();},[id]);

  async function addTransaction(event){
    event.preventDefault();setError("");setNotice("");setSaving(true);
    try{
      if(editingTransactionId)await api.patch(`/partners/${id}/transactions/${editingTransactionId}`,transaction);
      else await api.post(`/partners/${id}/transactions`,transaction);
      setNotice(editingTransactionId?"تم تعديل حركة الشركة":"تمت إضافة الحركة إلى حساب الشركة");
      setEditingTransactionId("");
      setTransaction(current=>({...current,type:"RECEIVABLE",amount:"",reference:"",description:"",dueDate:""}));
      await load();
    }catch(requestError){setError(requestError.response?.data?.message||"تعذر حفظ حركة الشركة");}
    finally{setSaving(false);}
  }

  async function addPayment(event){
    event.preventDefault();setError("");setNotice("");setSaving(true);
    try{
      if(editingPaymentId)await api.patch(`/partners/${id}/payments/${editingPaymentId}`,payment);
      else await api.post(`/partners/${id}/payments`,payment);
      setNotice(editingPaymentId?"تم تعديل الدفعة":"تم تسجيل الدفعة");
      setEditingPaymentId("");
      setPayment(current=>({...current,direction:"RECEIVED",amount:"",reference:"",notes:""}));
      await load();
    }catch(requestError){setError(requestError.response?.data?.message||"تعذر حفظ دفعة الشركة");}
    finally{setSaving(false);}
  }

  function editTransaction(item){
    setEditingTransactionId(item.id);setEditingPaymentId("");setError("");setNotice("");
    setTransaction({type:item.type||"RECEIVABLE",amount:String(item.amount||""),currency:item.currency||data.partner.accountCurrency||"CAD",date:String(item.date||new Date().toISOString()).slice(0,10),dueDate:item.dueDate||"",reference:item.reference||"",description:item.description||""});
    window.scrollTo({top:0,behavior:"smooth"});
  }
  function editPayment(item){
    setEditingPaymentId(item.id);setEditingTransactionId("");setError("");setNotice("");
    setPayment({direction:item.direction||"RECEIVED",amount:String(item.amount||""),currency:item.currency||data.partner.accountCurrency||"CAD",date:String(item.date||new Date().toISOString()).slice(0,10),reference:item.reference||"",notes:item.notes||""});
    window.scrollTo({top:0,behavior:"smooth"});
  }
  async function deleteTransaction(item){
    if(!(await confirmAction({title:"حذف حركة الشركة",message:`حذف الحركة بقيمة ${money(item.amount)} ${item.currency||""}؟`,confirmText:"حذف"})))return;
    try{await api.delete(`/partners/${id}/transactions/${item.id}`);setNotice("تم حذف الحركة");await load();}catch(requestError){setError(requestError.response?.data?.message||"تعذر حذف الحركة");}
  }
  async function deletePayment(item){
    if(!(await confirmAction({title:"حذف دفعة الشركة",message:`حذف الدفعة بقيمة ${money(item.amount)} ${item.currency||""}؟`,confirmText:"حذف"})))return;
    try{await api.delete(`/partners/${id}/payments/${item.id}`);setNotice("تم حذف الدفعة");await load();}catch(requestError){setError(requestError.response?.data?.message||"تعذر حذف الدفعة");}
  }

  if(showStatement)return <PartnerStatement partnerId={id} back={()=>setShowStatement(false)}/>;
  if(error&&!data)return <div className="card customer-error"><button onClick={back}>رجوع</button><p>{error}</p></div>;
  if(!data)return <p>جاري التحميل...</p>;

  return <>
    <div className="card form no-print">
      <button onClick={back}>رجوع</button>
      <button onClick={()=>setShowStatement(true)}>كشف حساب</button>
    </div>

    {error&&<div className="card customer-error">{error}</div>}
    {notice&&<div className="card rate-message">{notice}</div>}
    <h2>{data.partner.name} <span className={`company-mode-badge ${data.partner.companyMode==="MANUAL"?"manual":"connected"}`}>{data.partner.companyMode==="MANUAL"?"شركة يدوية":"شركة مرتبطة"}</span></h2>
    <div className="stats">
      <div className="card receivable-card"><span>دين لنا</span><strong>{money(data.totals.receivable)}</strong></div>
      <div className="card payable-card"><span>دين علينا</span><strong>{money(data.totals.payable)}</strong></div>
      <div className="card final"><span>الرصيد النهائي — CAD</span><strong>{money(data.totals.net)}</strong></div>
    </div>

    <div className="card">
      <p><strong>المسؤول:</strong> {data.partner.contactName||"-"}</p>
      <p><strong>الهاتف:</strong> {data.partner.phone||"-"}</p>
      <p><strong>واتساب:</strong> {data.partner.whatsapp||"-"}</p>
      <p><strong>البريد:</strong> {data.partner.email||"-"}</p>
      <p><strong>الموقع:</strong> {[data.partner.city,data.partner.country].filter(Boolean).join("، ")||"-"}</p>
    </div>

    <form className="card form" onSubmit={addTransaction}>
      <h3>{editingTransactionId?"تعديل حركة الشركة":"إضافة حركة إلى حساب الشركة"}</h3>
      <select value={transaction.type} onChange={e=>setTransaction({...transaction,type:e.target.value})}>
        <option value="RECEIVABLE">دين لنا</option>
        <option value="PAYABLE">دين علينا</option>
      </select>
      <input type="number" min=".01" step=".01" value={transaction.amount} onChange={e=>setTransaction({...transaction,amount:e.target.value})} placeholder="المبلغ" required/>
      <select value={transaction.currency} onChange={e=>setTransaction({...transaction,currency:e.target.value})}>
        {debtCurrencies.map(item=><option key={item.code} value={item.code}>{item.flag} {item.code}</option>)}
      </select>
      <input type="date" value={transaction.date} onChange={e=>setTransaction({...transaction,date:e.target.value})}/>
      <input type="date" value={transaction.dueDate} onChange={e=>setTransaction({...transaction,dueDate:e.target.value})}/>
      <input value={transaction.reference} onChange={e=>setTransaction({...transaction,reference:e.target.value})} placeholder="المرجع"/>
      <input value={transaction.description} onChange={e=>setTransaction({...transaction,description:e.target.value})} placeholder="البيان"/>
      <button disabled={saving}>{saving?"جارٍ الحفظ...":editingTransactionId?"حفظ التعديل":"حفظ العملية"}</button>
      {editingTransactionId&&<button type="button" className="danger-button" onClick={()=>{setEditingTransactionId("");setTransaction(current=>({...current,amount:"",reference:"",description:"",dueDate:""}));}}>إلغاء التعديل</button>}
    </form>

    <form className="card form" onSubmit={addPayment}>
      <h3>{editingPaymentId?"تعديل دفعة":"تسجيل دفعة"}</h3>
      <select value={payment.direction} onChange={e=>setPayment({...payment,direction:e.target.value})}>
        <option value="RECEIVED">استلمنا دفعة</option>
        <option value="PAID">دفعنا مبلغًا</option>
      </select>
      <input type="number" min=".01" step=".01" value={payment.amount} onChange={e=>setPayment({...payment,amount:e.target.value})} placeholder="مبلغ الدفعة" required/>
      <select value={payment.currency} onChange={e=>setPayment({...payment,currency:e.target.value})}>
        {debtCurrencies.map(item=><option key={item.code} value={item.code}>{item.flag} {item.code}</option>)}
      </select>
      <input type="date" value={payment.date} onChange={e=>setPayment({...payment,date:e.target.value})}/>
      <input value={payment.reference} onChange={e=>setPayment({...payment,reference:e.target.value})} placeholder="المرجع"/>
      <input value={payment.notes} onChange={e=>setPayment({...payment,notes:e.target.value})} placeholder="ملاحظات"/>
      <button disabled={saving}>{saving?"جارٍ الحفظ...":editingPaymentId?"حفظ التعديل":"حفظ الدفعة"}</button>
      {editingPaymentId&&<button type="button" className="danger-button" onClick={()=>{setEditingPaymentId("");setPayment(current=>({...current,amount:"",reference:"",notes:""}));}}>إلغاء التعديل</button>}
    </form>

    <section className="card manual-company-ledger">
      <h3>دفتر حساب الشركة</h3>
      <AppTable>
        <thead><tr><th>التاريخ</th><th>النوع</th><th>المبلغ الأصلي</th><th>القيمة CAD</th><th>البيان</th><th>الإجراءات</th></tr></thead>
        <tbody>
          {[...(data.transactions||[]).map(item=>({...item,_kind:"TRANSACTION"})),...(data.payments||[]).map(item=>({...item,_kind:"PAYMENT"}))]
            .sort((a,b)=>String(b.date||b.createdAt).localeCompare(String(a.date||a.createdAt)))
            .map(item=><tr key={`${item._kind}-${item.id}`}>
              <td>{String(item.date||item.createdAt||"").slice(0,10)}</td>
              <td>{item._kind==="TRANSACTION"?(item.type==="RECEIVABLE"?"دين لنا":"دين علينا"):(item.direction==="RECEIVED"?"دفعة مستلمة":"دفعة مدفوعة")}</td>
              <td>{money(item.amount)} {item.currency||""}</td>
              <td>{money(item.cadAmount??item.amount)} CAD</td>
              <td>{item.description||item.notes||item.reference||(item.isOpeningBalance?"الرصيد الافتتاحي":"-")}</td>
              <td className="actions"><button type="button" onClick={()=>item._kind==="TRANSACTION"?editTransaction(item):editPayment(item)}>تعديل</button><button type="button" className="danger-button" onClick={()=>item._kind==="TRANSACTION"?deleteTransaction(item):deletePayment(item)}>حذف</button></td>
            </tr>)}
          {!(data.transactions||[]).length&&!(data.payments||[]).length&&<tr><td colSpan="6">لا توجد حركات مسجلة.</td></tr>}
        </tbody>
      </AppTable>
    </section>
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
      <AppTable>
        <thead><tr><th>التاريخ</th><th>النوع</th><th>مدين</th><th>دائن</th><th>الرصيد</th><th>المرجع</th></tr></thead>
        <tbody>{data.rows.length?data.rows.map(row=><tr key={row.id}>
          <td>{row.date}</td><td>{row.kind}</td><td>{money(row.debit)}</td><td>{money(row.credit)}</td><td>{money(row.balance)}</td><td>{row.reference||"-"}</td>
        </tr>):<tr><td colSpan="6">لا توجد عمليات.</td></tr>}</tbody>
      </AppTable>
      <div className="card final"><span>الرصيد النهائي</span><strong>{money(data.finalBalance)}</strong></div>
    </section>}
  </>;
}

function Partners({open,view="companies"}){
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
  const [showConnectionForm,setShowConnectionForm]=useState(false);
  const [showFullSyncLog,setShowFullSyncLog]=useState(false);
  const todayIso=new Date().toISOString().slice(0,10);
  const monthStartIso=`${todayIso.slice(0,7)}-01`;
  const [feeFilter,setFeeFilter]=useState({partnerId:"",fromDate:monthStartIso,toDate:todayIso});
  const [feeReport,setFeeReport]=useState(null);
  const emptyPartnerForm={
    name:"",contactName:"",phone:"",whatsapp:"",email:"",country:"",city:"",address:"",notes:"",
    companyMode:"CONNECTED",openingBalance:"",openingBalanceDirection:"RECEIVABLE",systemUrl:"",connectionType:"WEB",accountCurrency:"USD",integrationName:"",username:"",password:"",externalAccountId:"",connectorType:"GENERIC",pathPrefix:"/ssljd/merkez112/1/2",syncFromDate:"",syncEnabled:true,syncIntervalMinutes:5,syncMode:"BALANCE_ONLY"
  };
  const [form,setForm]=useState({
    name:"",contactName:"",phone:"",whatsapp:"",email:"",country:"",city:"",address:"",notes:"",
    companyMode:"CONNECTED",openingBalance:"",openingBalanceDirection:"RECEIVABLE",systemUrl:"",connectionType:"WEB",accountCurrency:"USD",integrationName:"",username:"",password:"",externalAccountId:"",connectorType:"GENERIC",pathPrefix:"/ssljd/merkez112/1/2",syncFromDate:"",syncEnabled:true,syncIntervalMinutes:5,syncMode:"BALANCE_ONLY"
  });

  const needsSyncCenter=view==="sync"||view==="logs"||view==="unified";

  async function load(){
    try{
      const response=await cachedGet("/partners");
      setData(response.data);
      if(needsSyncCenter){
        const centerResponse=await cachedGet("/partners/sync-center");
        setSyncCenter(centerResponse.data);
      }
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر تحميل الشركات");
    }
  }

  useEffect(()=>{load();},[view]);

  function resetPartnerForm(){
    setEditingId("");
    setForm({...emptyPartnerForm});
  }

  function startEditPartner(partner){
    setError("");setMessage("");
    setEditingId(partner.id);
    setForm({
      name:partner.name||"",contactName:partner.contactName||"",phone:partner.phone||"",whatsapp:partner.whatsapp||"",email:partner.email||"",country:partner.country||"",city:partner.city||"",address:partner.address||"",notes:partner.notes||"",
      companyMode:partner.companyMode||((partner.systemUrl||partner.connectorType!=="GENERIC")?"CONNECTED":"MANUAL"),openingBalance:"",openingBalanceDirection:"RECEIVABLE",systemUrl:partner.systemUrl||"",connectionType:partner.connectionType||"WEB",accountCurrency:partner.accountCurrency||"USD",integrationName:partner.integrationName||"",username:partner.username||"",password:"",externalAccountId:partner.externalAccountId||"",connectorType:partner.connectorType==="KONTORUN"?"TAWASUL":partner.connectorType||"GENERIC",pathPrefix:partner.pathPrefix||"/ssljd/merkez112/1/2",syncFromDate:partner.syncFromDate||"",syncEnabled:partner.syncEnabled!==false,syncIntervalMinutes:Number(partner.syncIntervalMinutes)||5,syncMode:partner.syncMode||"BALANCE_ONLY"
    });
    window.scrollTo({top:0,behavior:"smooth"});
  }

  async function deletePartner(partner){
    const confirmed=await confirmAction({title:"تأكيد حذف الشركة",message:`هل أنت متأكد من حذف شركة «${partner.name}»؟\nسيتم حذف الشركة وحركاتها ودفعاتها المرتبطة بها.`,confirmText:"حذف الشركة"});
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

  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const syncProgressLabel=progress=>({QUEUED:"تم إدراج الطلب",STARTING:"جارٍ بدء الاتصال",CONNECTING:"جارٍ الاتصال بالشركة وقراءة الرصيد",SAVING:"جارٍ تحديث الرصيد",DONE:"اكتملت المزامنة",FAILED:"تعذرت المزامنة"}[progress]||"جارٍ جلب الرصيد");
  async function startPartnerSyncJob(partner,payload={}){
    const started=await api.post(`/partners/${partner.id}/sync`,payload,{timeout:10000});
    const jobId=started.data?.jobId;
    if(!jobId)throw Object.assign(new Error("لم يُرجع الخادم رقم مهمة المزامنة"),{response:{data:started.data||{}}});
    let consecutiveErrors=0;
    for(let attempt=0;attempt<100;attempt+=1){
      await wait(attempt===0?500:1500);
      try{
        const statusResponse=await api.get(`/partners/sync-jobs/${jobId}`,{timeout:10000});
        consecutiveErrors=0;
        const job=statusResponse.data||{};
        setMessage(`${partner.name}: ${syncProgressLabel(job.progress)}`);
        if(job.status==="SUCCESS")return job.result||{};
        if(job.status==="FAILED"){
          const failure=job.error||{message:"تعذرت مزامنة الشركة"};
          throw Object.assign(new Error(failure.message),{response:{data:failure}});
        }
      }catch(error){
        if(error.response?.data&&error.response.data.code)throw error;
        consecutiveErrors+=1;
        if(consecutiveErrors>=4)throw error;
      }
    }
    throw Object.assign(new Error("استغرقت مزامنة الشركة وقتًا أطول من المتوقع"),{response:{data:{code:"PARTNER_SYNC_TIMEOUT",message:"استغرقت مزامنة الشركة وقتًا أطول من المتوقع؛ المهمة قد تكون ما زالت تعمل في الخلفية"}}});
  }

  async function syncPartner(partner){
    setError("");setMessage(`${partner.name}: جارٍ إرسال طلب جلب الرصيد...`);setSyncingId(partner.id);
    try{
      const data=await startPartnerSyncJob(partner,{otp:otpById[partner.id]||"",trigger:"MANUAL"});
      setOtpById(current=>({...current,[partner.id]:""}));
      if(data?.stale){
        const reason=syncFailureReason(data);
        setMessage(`${partner.name}: ${reason}. يتم عرض آخر رصيد ناجح${data.lastSyncAt?` من ${new Date(data.lastSyncAt).toLocaleString("ar-CA")}`:""}.`);
      }else{
        const syncedCurrencies=Object.entries(data.result?.currencies||{}).map(([code,value])=>`${code}: لنا ${money(value?.receivable)} / علينا ${money(value?.payable)}`).join(" — ");
        setMessage(`${partner.name}: ${data.message}${syncedCurrencies?` — ${syncedCurrencies}`:` — الرصيد ${money(data.result?.balance)} ${partner.accountCurrency||"USD"}`}`);
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
    }finally{setSyncingId("");}
  }

  async function fetchJadFees(partner,selectedFilter=feeFilter){
    if(!selectedFilter.fromDate||!selectedFilter.toDate){setError("اختر تاريخ البداية والنهاية");return;}
    if(selectedFilter.fromDate>selectedFilter.toDate){setError("تاريخ البداية يجب أن يسبق تاريخ النهاية");return;}
    setError("");setMessage(`${partner.name}: جارٍ إعداد تقرير الأجور...`);setSyncingId(partner.id);
    try{
      const data=await startPartnerSyncJob(partner,{fromDate:selectedFilter.fromDate,toDate:selectedFilter.toDate,otp:otpById[partner.id]||"",trigger:"FEE_REPORT"});
      const result=data?.result||{};
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
          const responseData=await startPartnerSyncJob(partner,{otp:otpById[partner.id]||"",trigger:"MANUAL"});
          if(responseData?.stale){
            console.warn("Partner sync stale",partner.name,responseData);
            setMessage(`${partner.name}: ${syncFailureReason(responseData)}. يتم عرض آخر رصيد ناجح.`);
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
    <div className="partner-currency-balance partner-cad-final">
      <div className="partner-currency-code"><span>🇨🇦</span><strong>CAD</strong></div>
      <div><span>الرصيد النهائي</span><b className={Number(partner.cadNet)<0?"partner-payable":"partner-receivable"}>{money(partner.cadNet)}</b></div>
      <small>حسب آخر سعر صرف آلي{partner.automaticRateUpdatedAt?` · ${new Date(partner.automaticRateUpdatedAt).toLocaleString("ar-CA")}`:""}</small>
    </div>
  </div>;

  const pageTitles={
    unified:"🏢 الشركات والربط الخارجي",
    companies:"🏢 جميع الشركات",
    balances:"💰 أرصدة الشركات",
    sync:"🔄 مزامنة الشركات",
    connections:"🔗 إعدادات الربط",
    logs:"📋 سجل عمليات المزامنة"
  };
  const unified=view==="unified";
  const showSummary=unified||view==="companies"||view==="balances";
  const showSync=unified||view==="sync"||view==="logs";
  const showConnections=view==="connections"||(unified&&showConnectionForm);
  const showCompaniesTable=view!=="logs";

  return <>
    <div className="page-title-row partner-title-row">
      <h2>{pageTitles[view]||pageTitles.unified}</h2>
      <div className="partner-page-toolbar">
        {(unified||view==="sync")&&<button type="button" className="sync-now-button" disabled={syncingAll||Boolean(syncingId)} onClick={syncAllPartners}>{syncingAll?<><span className="sync-spinner"/> جاري المزامنة...</>:"🔄 تحديث جميع الشركات"}</button>}
        {unified&&<button type="button" onClick={()=>setShowConnectionForm(value=>!value)}>{showConnectionForm?"إخفاء إعدادات الربط":"➕ إضافة أو تعديل شركة"}</button>}
        {unified&&<button type="button" onClick={()=>setShowFullSyncLog(value=>!value)}>{showFullSyncLog?"إخفاء السجل الكامل":"📋 عرض سجل العمليات"}</button>}
      </div>
    </div>
    {error&&<div className="card customer-error">{error}</div>}
    {message&&<div className="card rate-message">{message}</div>}
    {showSummary&&<><div className="stats">
      <div className="card receivable-card"><span>إجمالي دين لنا — {data.summaryCurrency||"CAD"}</span><strong>{money(data.totals.receivable)}</strong><small>بعد تحويل جميع العملات</small></div>
      <div className="card payable-card"><span>إجمالي دين علينا — {data.summaryCurrency||"CAD"}</span><strong>{money(data.totals.payable)}</strong><small>بعد تحويل جميع العملات</small></div>
      <div className="card final"><span>الصافي — {data.summaryCurrency||"CAD"}</span><strong>{money(data.totals.net)}</strong><small>حسب آخر سعر صرف</small></div>
      <div className="card"><span>عدد الشركات</span><strong>{data.rows.length}</strong></div>
    </div>
    {data.missingRates?.length>0&&<div className="card debt-message">لم تدخل العملات التالية في الإجمالي لعدم توفر سعر تحويل إلى {data.summaryCurrency||"CAD"}: {data.missingRates.join("، ")}</div>}</>}

    {showSync&&<section className="smart-sync-center">
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
        {(syncCenter.logs||[]).slice(0,(view==="logs"||showFullSyncLog)?100:6).map(log=><div className={`sync-log-row ${log.status==="SUCCESS"?"ok":"failed"}`} key={log.id}>
          <span className="sync-log-state">{log.status==="SUCCESS"?"✓":"!"}</span><div><strong>{log.partnerName}</strong><small>{log.trigger==="AUTO"?"تلقائية":"يدوية"} · {new Date(log.createdAt).toLocaleString("ar-CA")}</small></div><div className="sync-log-change"><b>{log.changed?`${money(log.beforeBalance)} ← ${money(log.afterBalance)}`:"بدون تغيير"}</b><small>{(log.durationMs/1000).toFixed(1)} ثانية</small></div>
        </div>)}
        {!syncCenter.logs?.length&&<p className="empty-sync-log">لا يوجد سجل مزامنة بعد.</p>}
      </div>
    </section>}

    {(view==="sync"||unified)&&feeReport&&<section className="card jad-fee-report jad-fee-total-only">
      <div className="jad-fee-report-head">
        <div><h3>💵 إجمالي الأجور</h3><p>من {feeReport.fromDate} إلى {feeReport.toDate}</p></div>
        <strong>{money(feeReport.totalFees)} {feeReport.currency}</strong>
      </div>
    </section>}

    {showConnections&&<form className="card form company-integration-form" onSubmit={add}>
      <h3>{editingId?"✏️ تعديل معلومات الشركة":form.companyMode==="MANUAL"?"➕ إضافة شركة يدوية":"➕ إضافة شركة وربطها"}</h3>
      <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="اسم الشركة" required/>
      <select value={form.companyMode} onChange={e=>setForm({...form,companyMode:e.target.value,syncEnabled:e.target.value==="MANUAL"?false:form.syncEnabled})}>
        <option value="CONNECTED">🔵 شركة مرتبطة بالنظام</option>
        <option value="MANUAL">🟡 شركة يدوية — دفتر حساب مستقل</option>
      </select>
      {form.companyMode==="MANUAL"&&<>
        <select value={form.accountCurrency} onChange={e=>setForm({...form,accountCurrency:e.target.value})}>
          {debtCurrencies.map(item=><option key={item.code} value={item.code}>{item.flag} {item.code}</option>)}
        </select>
        <input type="number" min="0" step="0.01" value={form.openingBalance} onChange={e=>setForm({...form,openingBalance:e.target.value})} placeholder="الرصيد الافتتاحي — اختياري" disabled={Boolean(editingId)}/>
        <select value={form.openingBalanceDirection} onChange={e=>setForm({...form,openingBalanceDirection:e.target.value})} disabled={Boolean(editingId)}>
          <option value="RECEIVABLE">رصيد لنا على الشركة</option><option value="PAYABLE">رصيد علينا للشركة</option>
        </select>
        <input value={form.contactName} onChange={e=>setForm({...form,contactName:e.target.value})} placeholder="اسم المسؤول — اختياري"/>
        <input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="الهاتف — اختياري"/>
        <input value={form.whatsapp} onChange={e=>setForm({...form,whatsapp:e.target.value})} placeholder="واتساب — اختياري"/>
      </>}
      {form.companyMode!=="MANUAL"&&<>
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
      <label className="integration-toggle"><input type="checkbox" checked={form.syncEnabled} onChange={e=>setForm({...form,syncEnabled:e.target.checked})}/><span>تفعيل المزامنة عند توفر موصل الشركة</span></label></>}
      {form.companyMode==="MANUAL"&&<div className="manual-company-note">بعد الحفظ افتح الشركة لإضافة دين أو تسجيل دفعة أو استخراج كشف حساب.</div>}
      <div className="partner-form-actions"><button>{editingId?"حفظ التعديلات":form.companyMode==="MANUAL"?"حفظ الشركة اليدوية":"حفظ وربط الشركة"}</button>{editingId&&<button type="button" className="danger-button" onClick={resetPartnerForm}>إلغاء التعديل</button>}</div>
    </form>}

    {showCompaniesTable&&<div className="card tablewrap">
      <AppTable>
        <thead><tr><th>الشركة</th><th>نوع الربط</th><th>الحالة</th><th>العملة الأساسية</th><th>أرصدة العملات</th><th>آخر مزامنة</th><th>الرابط</th><th>الإجراءات</th></tr></thead>
        <tbody>{data.rows.length?data.rows.map(partner=><tr key={partner.id}>
          <td><strong>{partner.name}</strong><small className="company-subline">{partner.contactName||partner.integrationName||"-"}</small></td>
          <td><span className={`company-mode-badge ${partner.companyMode==="MANUAL"?"manual":"connected"}`}>{partner.companyMode==="MANUAL"?"يدوية":"مرتبطة"}</span><small className="company-subline">{partner.connectorType==="TAWASUL"||partner.connectorType==="KONTORUN"?"موصل تواصل":partner.connectorType==="JAD"?"موصل جاد":partner.connectorType==="SURYANA"?"موصل سوريانا":partner.connectorType==="DAHAB"?"موصل دهب":"بدون موصل"}</small></td>
          <td>{(()=>{const effectiveStatus=partner.lastSyncAt&&Number.isFinite(Number(partner.externalBalance))?"READY":partner.connectionStatus;return <span className={`integration-status status-${String(effectiveStatus||"MANUAL").toLowerCase()}`}>{statusLabel(effectiveStatus)}</span>;})()}</td>
          <td><span className="partner-primary-currency">{flagOf(partner.accountCurrency||"USD")} {partner.accountCurrency||"USD"}</span><small className="company-subline">العملة الأساسية فقط</small></td>
          <td><PartnerCurrencyBalances partner={partner}/></td>
          <td><div className="relative-sync-time"><strong>{relativeSyncTime(partner.lastSyncAt)}</strong><small>{partner.lastSyncAt?new Date(partner.lastSyncAt).toLocaleString("ar-CA"):"—"}</small></div></td>
          <td>{partner.systemUrl?<a href={partner.systemUrl} target="_blank" rel="noreferrer">فتح الرابط</a>:"-"}</td>
          <td className="actions">
            <button onClick={()=>open(partner.id)}>{partner.companyMode==="MANUAL"?"فتح دفتر الحساب":"فتح"}</button>
            {(view==="connections"||unified)&&<><button type="button" onClick={()=>startEditPartner(partner)}>✏️ تعديل</button><button type="button" className="danger-button" onClick={()=>deletePartner(partner)}>🗑️ حذف</button>{partner.systemUrl&&<button type="button" onClick={()=>testConnection(partner)}>اختبار الاتصال</button>}</>}
            {(view==="sync"||unified)&&<>{["JAD","TAWASUL","KONTORUN","DAHAB","SURYANA"].includes(partner.connectorType)&&<input className="jad-otp-input" inputMode="numeric" autoComplete="one-time-code" maxLength="8" value={otpById[partner.id]||""} onChange={e=>setOtpById(current=>({...current,[partner.id]:e.target.value.replace(/\D/g,"").slice(0,8)}))} placeholder="رمز Authenticator" aria-label="رمز Google Authenticator"/>}{["JAD","TAWASUL","KONTORUN","DAHAB","SURYANA"].includes(partner.connectorType)&&<button type="button" disabled={syncingId===partner.id} onClick={()=>syncPartner(partner)}>{syncingId===partner.id?"جاري جلب الرصيد...":"جلب الرصيد"}</button>}{partner.connectorType==="JAD"&&<button type="button" onClick={()=>showJadDiagnostic(partner)}>عرض سجل الربط</button>}</>}
          </td>
        </tr>):<tr><td colSpan="8">لا توجد شركات بعد.</td></tr>}</tbody>
      </AppTable>
    </div>}
  </>;
}

export { PartnerProfile };
export { Partners };
