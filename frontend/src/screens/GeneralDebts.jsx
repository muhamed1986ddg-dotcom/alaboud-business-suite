import React,{useEffect,useState}from"react";
import api,{cachedGet} from"../api";
import {money,debtCurrencies,confirmAction} from"../shared";
import {AppButton,AppModal} from"../components/ui";

function GeneralDebts(){
  const [data,setData]=useState({rows:[],payments:[],totals:{receivable:0,payable:0,net:0},receivableBreakdown:{customers:0,customerPayable:0,companies:0,manual:0,companyPayable:0,manualPayable:0,total:0},totalsByCurrency:{},possibleDuplicateParties:[],excludedLinkedManualDebts:0,excludedLinkedPartnerRows:0,partnerReviewFlags:[]});
  const [mode,setMode]=useState("ALL");
  const [message,setMessage]=useState("");
  const [refreshingRates,setRefreshingRates]=useState(false);
  const [showAddModal,setShowAddModal]=useState(false);
  const [actionMode,setActionMode]=useState("");
  const [selectedDebtId,setSelectedDebtId]=useState("");
  const [editForm,setEditForm]=useState({partyName:"",amount:"",currency:"CAD",dueDate:"",description:"",reference:""});
  const [payment,setPayment]=useState({debtId:"",amount:"",paymentDate:"",method:"CASH",notes:""});
  const [settlementDebt,setSettlementDebt]=useState(null);
  const [settlementMode,setSettlementMode]=useState("PARTIAL");
  const [savingPayment,setSavingPayment]=useState(false);
  const [form,setForm]=useState({type:"RECEIVABLE",partyName:"",amount:"",currency:"CAD",dueDate:"",description:"",reference:""});

  async function load(){
    try{
      const {data}=await cachedGet("/general-debts");
      setData({
        rows:Array.isArray(data?.rows)?data.rows:[],
        payments:Array.isArray(data?.payments)?data.payments:[],
        totals:data?.totals||{receivable:0,payable:0,net:0},
        receivableBreakdown:data?.receivableBreakdown||{customers:0,customerPayable:0,companies:0,manual:0,companyPayable:0,manualPayable:0,total:Number(data?.totals?.receivable||0)},
        summaryCurrency:data?.summaryCurrency||"CAD",
        totalsByCurrency:data?.totalsByCurrency||{},
        missingRates:Array.isArray(data?.missingRates)?data.missingRates:[],
        ratesUpdatedAt:data?.ratesUpdatedAt||null,
        possibleDuplicateParties:Array.isArray(data?.possibleDuplicateParties)?data.possibleDuplicateParties:[],
        excludedLinkedManualDebts:Number(data?.excludedLinkedManualDebts||0),
        excludedLinkedPartnerRows:Number(data?.excludedLinkedPartnerRows||0),
        partnerReviewFlags:Array.isArray(data?.partnerReviewFlags)?data.partnerReviewFlags:[]
      });
    }catch(error){setMessage(error.response?.data?.message||"تعذر تحميل الديون");}
  }

  useEffect(()=>{load();},[]);

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
      setShowAddModal(false);setMessage("تم حفظ الدين بنجاح");void load();
    }catch(error){setMessage(error.response?.data?.message||"تعذر حفظ الدين");}
  }

  async function addPayment(event){
    event.preventDefault();
    if(!payment.debtId||!payment.amount||savingPayment)return false;
    setMessage("");setSavingPayment(true);
    try{
      await api.post(`/general-debts/${payment.debtId}/payments`,payment);
      setPayment({debtId:"",amount:"",paymentDate:"",method:"CASH",notes:""});
      void load();
      setMessage("تم تسجيل الدفعة بنجاح");
      return true;
    }catch(error){
      setMessage(error.response?.data?.message||"تعذر تسجيل الدفعة. لم يتغير الرصيد.");
      return false;
    }finally{setSavingPayment(false);}
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


  const selectedDebt=data.rows.find(item=>item.id===selectedDebtId&&item.source==="MANUAL")||null;

  function openAction(mode){
    setMessage("");setActionMode(mode);setSelectedDebtId("");
  }

  function chooseDebt(id){
    setSelectedDebtId(id);
    const item=data.rows.find(row=>row.id===id);
    if(item)setEditForm({partyName:item.partyName||"",amount:String(item.amount||""),currency:item.currency||"CAD",dueDate:item.dueDate||"",description:item.description||"",reference:item.reference||""});
  }

  async function updateDebt(event){
    event.preventDefault();if(!selectedDebtId)return;setMessage("");
    try{await api.patch(`/general-debts/${selectedDebtId}`,editForm);setActionMode("");setSelectedDebtId("");setMessage("تم تعديل الدين بنجاح");void load();}
    catch(error){setMessage(error.response?.data?.message||"تعذر تعديل الدين");}
  }

  async function deleteDebt(){
    if(!selectedDebtId||!await confirmAction({title:"تأكيد حذف الدين",message:"هل أنت متأكد من حذف هذا الدين؟ لا يمكن حذف دين مرتبط بدفعات.",confirmText:"حذف الدين"}))return;setMessage("");
    try{await api.delete(`/general-debts/${selectedDebtId}`);setActionMode("");setSelectedDebtId("");setMessage("تم حذف الدين بنجاح");void load();}
    catch(error){setMessage(error.response?.data?.message||"تعذر حذف الدين");}
  }

  const openDebts=data.rows.filter(item=>Number(item.remaining||0)>0&&item.source==="MANUAL");
  const currencyMeta=Object.fromEntries(debtCurrencies.map(item=>[item.code,item]));
  const statusLabel={OPEN:"مفتوح",PARTIAL:"مدفوع جزئيًا",PAID:"مدفوع",OVERDUE:"متأخر"};
  const nowDate=new Date().toISOString().slice(0,10);

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
    {data.excludedLinkedManualDebts>0&&<div className="card customer-success">تم استبعاد {data.excludedLinkedManualDebts} من السجلات اليدوية من الإجمالي لأنها مرتبطة مباشرةً بحساب رسمي محسوب.</div>}
    {data.excludedLinkedPartnerRows>0&&<div className="card customer-success">تم استبعاد {data.excludedLinkedPartnerRows} من حركات الشركات لأنها مرتبطة مباشرةً بالرصيد الخارجي نفسه.</div>}
    {data.possibleDuplicateParties.some(item=>item.reviewStatus==="FLAGGED")&&<div className="card debt-message">توجد سجلات قديمة متشابهة بالاسم مع عملاء أو شركات. بقيت محسوبة دون تعديل، وتم تعليمها للمراجعة فقط.</div>}
    {data.possibleDuplicateParties.some(item=>item.reviewStatus==="FLAGGED")&&<div className="card debt-review-list"><strong>سجلات تحت المراجعة</strong>{data.possibleDuplicateParties.filter(item=>item.reviewStatus==="FLAGGED").map(item=><div key={item.manualDebtId}><span>⚑ {item.partyName}</span><small>{item.warning}</small></div>)}</div>}
    {data.partnerReviewFlags.length>0&&<div className="card debt-message">توجد شركات لها رصيد خارجي وحركات محلية للعملة نفسها دون مرجع مباشر. بقي الرقمان محسوبين ويجب مراجعتهما للتأكد أنهما مستقلان.</div>}

    <div className="debt-summary-mini">
      <div className="card"><span>الديون المفتوحة</span><strong>{openCount}</strong></div>
      <div className="card"><span>الديون المتأخرة</span><strong>{overdueCount}</strong></div>
      <div className="card"><span>الديون المسددة</span><strong>{paidCount}</strong></div>
      <div className="card"><span>إجمالي السجلات</span><strong>{data.rows.length}</strong></div>
    </div>

    <div className="card debt-mode-tabs no-print">
      <button type="button" className="primary debt-add-open" onClick={()=>setShowAddModal(true)}>➕ إضافة دين</button>
      <button type="button" onClick={()=>openAction("PAY")}>💳 تسديد دين</button>
      <button type="button" onClick={()=>openAction("EDIT")}>✏️ تعديل دين</button>
      <button type="button" className="danger" onClick={()=>openAction("DELETE")}>🗑️ حذف دين</button>
      {[['ALL','📋 جميع الديون'],['RECEIVABLE','🟢 الدين لنا'],['PAYABLE','🔴 الدين علينا'],['OVERDUE','⏳ المتأخرة'],['PAID','✅ المسددة'],['PAYMENTS','💳 الدفعات']].map(([key,label])=><button key={key} type="button" className={mode===key?"active":""} onClick={()=>setMode(key)}>{label}</button>)}
    </div>

    {message&&<div className="card debt-message">{message}</div>}

    <div className="debt-numbers-only">
      {mode==="ALL"&&<>
        <div className="card debt-balance-row"><span>💰 إجمالي الدين لنا</span><strong>{money(data.totals.receivable)} {data.summaryCurrency||"CAD"}</strong></div>
        <div className="card debt-balance-row"><span>💸 إجمالي الدين علينا</span><strong>{money(data.totals.payable)} {data.summaryCurrency||"CAD"}</strong></div>
        <div className="card debt-balance-row debt-balance-total"><span>🧮 الصافي النهائي</span><strong>{money(data.totals.net)} {data.summaryCurrency||"CAD"}</strong></div>
      </>}
      {mode==="RECEIVABLE"&&<>
        <div className="card debt-balance-row"><span>👤 رصيد دين العملاء</span><strong>{money(data.receivableBreakdown?.customers)} {data.summaryCurrency||"CAD"}</strong></div>
        <div className="card debt-balance-row"><span>🏢 دين الشركات لنا</span><strong>{money(data.receivableBreakdown?.companies)} {data.summaryCurrency||"CAD"}</strong></div>
        {Number(data.receivableBreakdown?.manual||0)!==0&&<div className="card debt-balance-row"><span>📝 ديون يدوية لنا</span><strong>{money(data.receivableBreakdown?.manual)} {data.summaryCurrency||"CAD"}</strong></div>}
        <div className="card debt-balance-row debt-balance-total"><span>💰 المجموع الكلي</span><strong>{money(data.receivableBreakdown?.total??data.totals.receivable)} {data.summaryCurrency||"CAD"}</strong></div>
      </>}
      {mode==="PAYABLE"&&<>
        <div className="card debt-balance-row"><span>👤 دين العملاء علينا</span><strong>{money(data.receivableBreakdown?.customerPayable||0)} {data.summaryCurrency||"CAD"}</strong></div>
        <div className="card debt-balance-row"><span>🏢 دين الشركات علينا</span><strong>{money(data.receivableBreakdown?.companyPayable||0)} {data.summaryCurrency||"CAD"}</strong></div>
        {Number(data.receivableBreakdown?.manualPayable||0)!==0&&<div className="card debt-balance-row"><span>📝 ديون يدوية علينا</span><strong>{money(data.receivableBreakdown?.manualPayable)} {data.summaryCurrency||"CAD"}</strong></div>}
        <div className="card debt-balance-row debt-balance-total"><span>💸 إجمالي الدين علينا</span><strong>{money(data.totals.payable)} {data.summaryCurrency||"CAD"}</strong></div>
        <div className="card debt-balance-row"><span>📋 عدد الديون المفتوحة علينا</span><strong>{data.rows.filter(item=>item.type==="PAYABLE"&&Number(item.remaining||0)>0.001).length}</strong></div>
      </>}
      {mode==="OVERDUE"&&<>
        <div className="card debt-balance-row"><span>⏳ عدد الديون المتأخرة</span><strong>{overdueCount}</strong></div>
      </>}
      {mode==="PAID"&&<>
        <div className="card debt-balance-row"><span>✅ عدد الديون المسددة</span><strong>{paidCount}</strong></div>
      </>}
      {mode==="PAYMENTS"&&<>
        <div className="card debt-balance-row"><span>💳 عدد الدفعات المسجلة</span><strong>{data.payments.length}</strong></div>
      </>}
    </div>


    <AppModal open={Boolean(actionMode)} title={actionMode==="PAY"?"تسديد دين":actionMode==="EDIT"?"تعديل دين":"حذف دين"} onClose={()=>{setActionMode("");setSelectedDebtId("")}}>
      <div className="form debt-add-form">
        <select value={selectedDebtId} onChange={e=>chooseDebt(e.target.value)} required>
          <option value="">اختر الدين</option>
          {(actionMode==="PAY"?openDebts:data.rows.filter(item=>item.source==="MANUAL")).map(item=><option key={item.id} value={item.id}>{item.reviewStatus==="FLAGGED"?"⚑ تحت المراجعة — ":""}{item.partyName} — {money(item.remaining??item.amount)} {item.currency} — {item.type==="PAYABLE"?"دين علينا":"دين لنا"}</option>)}
        </select>
        {selectedDebt&&actionMode==="PAY"&&<div className="debt-settlement-summary"><strong>{selectedDebt.partyName}</strong><span>المتبقي: {money(selectedDebt.remaining)} {selectedDebt.currency}</span><AppButton variant="primary" onClick={()=>{setActionMode("");openSettlement(selectedDebt)}}>متابعة التسديد</AppButton></div>}
        {selectedDebt&&actionMode==="EDIT"&&<form className="form debt-add-form" onSubmit={updateDebt}>
          <input value={editForm.partyName} onChange={e=>setEditForm({...editForm,partyName:e.target.value})} placeholder="اسم الشخص أو الجهة" required/>
          <input type="number" min="0.01" step="0.01" value={editForm.amount} onChange={e=>setEditForm({...editForm,amount:e.target.value})} placeholder="مبلغ الدين" required/>
          <select value={editForm.currency} onChange={e=>setEditForm({...editForm,currency:e.target.value})}>{debtCurrencies.map(item=><option key={item.code}>{item.code}</option>)}</select>
          <input type="date" value={editForm.dueDate} onChange={e=>setEditForm({...editForm,dueDate:e.target.value})}/><input value={editForm.reference} onChange={e=>setEditForm({...editForm,reference:e.target.value})} placeholder="المرجع"/><input value={editForm.description} onChange={e=>setEditForm({...editForm,description:e.target.value})} placeholder="ملاحظات"/>
          <div className="transaction-modal-actions"><AppButton type="button" onClick={()=>setActionMode("")}>إلغاء</AppButton><AppButton variant="primary">حفظ التعديل</AppButton></div>
        </form>}
        {selectedDebt&&actionMode==="DELETE"&&<><div className="debt-settlement-summary"><strong>{selectedDebt.partyName}</strong><span>{money(selectedDebt.amount)} {selectedDebt.currency}</span></div><div className="transaction-modal-actions"><AppButton type="button" onClick={()=>setActionMode("")}>إلغاء</AppButton><AppButton variant="danger" onClick={deleteDebt}>تأكيد الحذف</AppButton></div></>}
      </div>
    </AppModal>

    <AppModal open={Boolean(settlementDebt)} title={settlementDebt?.type==="PAYABLE"?"تسديد الدين علينا":"تسجيل دفعة من العميل"} onClose={()=>setSettlementDebt(null)}>
      {settlementDebt&&<form className="form debt-add-form" onSubmit={async event=>{const saved=await addPayment(event);if(saved)setSettlementDebt(null)}}>
        <div className="debt-settlement-summary"><strong>{settlementDebt.partyName}</strong><span>المتبقي: {money(settlementDebt.remaining)} {settlementDebt.currency}</span></div>
        <div className="debt-settlement-modes"><AppButton type="button" variant={settlementMode==="FULL"?"primary":"secondary"} onClick={()=>changeSettlementMode("FULL")}>تسديد كامل</AppButton><AppButton type="button" variant={settlementMode==="PARTIAL"?"primary":"secondary"} onClick={()=>changeSettlementMode("PARTIAL")}>تسديد جزئي</AppButton></div>
        <input type="number" min="0.01" max={settlementDebt.remaining} step="0.01" value={payment.amount} onChange={e=>{setSettlementMode("PARTIAL");setPayment({...payment,amount:e.target.value})}} placeholder="مبلغ الدفعة" required/>
        <input type="date" value={payment.paymentDate} onChange={e=>setPayment({...payment,paymentDate:e.target.value})}/>
        <select value={payment.method||"CASH"} onChange={e=>setPayment({...payment,method:e.target.value})}><option value="CASH">نقدي</option><option value="BANK">بنك</option><option value="TRANSFER">تحويل</option><option value="CARD">بطاقة</option></select>
        <input value={payment.notes} onChange={e=>setPayment({...payment,notes:e.target.value})} placeholder="ملاحظات السداد"/>
        <div className="transaction-modal-actions"><AppButton type="button" onClick={()=>setSettlementDebt(null)}>إلغاء</AppButton><AppButton variant="primary" disabled={savingPayment}>{savingPayment?"جارٍ الحفظ...":settlementDebt.type==="PAYABLE"?"تأكيد الدفع":"تأكيد الاستلام"}</AppButton></div>
      </form>}
    </AppModal>

    <AppModal open={showAddModal} title="إضافة دين جديد" onClose={()=>setShowAddModal(false)}>
      <form className="form debt-add-form" onSubmit={addDebt}>
        <select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}><option value="RECEIVABLE">دين لنا</option><option value="PAYABLE">دين علينا</option></select>
        <input value={form.partyName} onChange={e=>setForm({...form,partyName:e.target.value})} placeholder="اسم الشخص أو الجهة" required/>
        <input type="number" min="0.01" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="مبلغ الدين" required/>
        <select value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}>{debtCurrencies.map(item=><option key={item.code}>{item.code}</option>)}</select>
        <input type="date" value={form.dueDate} onChange={e=>setForm({...form,dueDate:e.target.value})}/>
        <input value={form.reference} onChange={e=>setForm({...form,reference:e.target.value})} placeholder="رقم مرجع أو فاتورة"/>
        <input value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="ملاحظات"/>
        <div className="transaction-modal-actions"><AppButton type="button" onClick={()=>setShowAddModal(false)}>إلغاء</AppButton><AppButton variant="primary">حفظ الدين</AppButton></div>
      </form>
    </AppModal>
  </>;
}

export { GeneralDebts };
