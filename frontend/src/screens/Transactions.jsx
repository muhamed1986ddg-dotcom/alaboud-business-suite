import React,{useEffect,useMemo,useState} from "react";
import api,{cachedGet,clearApiGetCache} from "../api";
import {money,confirmAction,revealAppEditor} from "../shared";
import {AppTable} from "../components/ui";
import {transferFinancialPreview} from "../transferFinancialPreview";

export function Transactions({openInvoice}){
  const [customers,setCustomers]=useState([]);
  const [partners,setPartners]=useState([]);
  const [providerFeeSettings,setProviderFeeSettings]=useState({enabled:true,feePer100:0.40});
  const [list,setList]=useState([]);
  const [error,setError]=useState("");
  const [editingTransaction,setEditingTransaction]=useState(null);
  const [editSaving,setEditSaving]=useState(false);
  const [search,setSearch]=useState("");
  const [activeMode,setActiveMode]=useState("all");
  const [customerFilter,setCustomerFilter]=useState("");
  const [currencyFilter,setCurrencyFilter]=useState("");
  const [statusFilter,setStatusFilter]=useState("");
  const [dateFrom,setDateFrom]=useState("");
  const [dateTo,setDateTo]=useState("");
  const [page,setPage]=useState(1);
  const pageSize=10;

  async function load(){
    try{
      const [customersResponse,transactionsResponse,partnersResponse,feeSettingsResponse]=await Promise.all([
        cachedGet("/customers/options",{params:{limit:200},cacheTtl:5*60*1000}),
        cachedGet("/transactions",{params:{limit:200},cacheTtl:2*60*1000}),
        cachedGet("/partners",{cacheTtl:5*60*1000}),
        cachedGet("/transfer-fee-settings",{cacheTtl:60*1000})
      ]);
      const customerList=Array.isArray(customersResponse.data)?customersResponse.data:[];
      const partnerList=Array.isArray(partnersResponse.data?.rows)?partnersResponse.data.rows:[];
      setCustomers(customerList);
      setPartners(partnerList);
      setProviderFeeSettings({enabled:feeSettingsResponse.data?.enabled!==false,feePer100:Number(feeSettingsResponse.data?.feePer100??0.40)});
      setList(Array.isArray(transactionsResponse.data)?transactionsResponse.data:[]);
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر تحميل الحوالات");
    }
  }

  useEffect(()=>{load();},[]);


  function startEditTransaction(transaction){
    setError("");
    setEditingTransaction({
      ...transaction,
      amount:String(transaction.amount??""),
      costRate:String(transaction.costRate??""),
      finalRate:String(transaction.finalRate??""),
      feeMethod:transaction.feeMethod==="PAID"?"PAID":"SPREAD",
      transferFee:transaction.feeMethod==="PAID"?String(transaction.transferFee??""):"",
      partnerId:transaction.partnerId||"",
      providerFeeCompany:transaction.providerFeeCompany||transaction.partnerName||"",
      providerFeeAmount:String(transaction.providerFeeAmount??""),
      providerFeeCurrency:transaction.providerFeeCurrency||transaction.currency||"USD",
      providerFeeRateCad:String(transaction.providerFeeRateCad??""),
      providerFeeAuto:String(transaction.providerFeeMode||"").toUpperCase()==="AUTO",
      providerFeePer100:Number(transaction.providerFeePer100??providerFeeSettings.feePer100??0.40),
      currency:transaction.currency||"USD",
      transferDate:transaction.transferDate||String(transaction.createdAt||"").slice(0,10)
    });
    revealAppEditor('[data-app-editor="transaction"]');
  }

  async function saveEditedTransaction(event){
    event.preventDefault();
    if(!editingTransaction)return;
    setError("");
    setEditSaving(true);
    try{
      const preview=transferFinancialPreview(editingTransaction);
      await api.patch(`/transactions/${editingTransaction.id}`,{
        currency:editingTransaction.currency,
        amount:Number(editingTransaction.amount),
        costRate:Number(editingTransaction.costRate),
        finalRate:Number(editingTransaction.finalRate),
        feeMethod:editingTransaction.feeMethod,
        transferFee:editingTransaction.feeMethod==="PAID"?Number(editingTransaction.transferFee||0):0,
        partnerId:editingTransaction.partnerId||"",
        providerFeeCompany:String(editingTransaction.providerFeeCompany||"").trim(),
        providerFeeAmount:Number(editingTransaction.providerFeeAmount||0),
        providerFeeCurrency:String(editingTransaction.providerFeeCurrency||editingTransaction.currency||"USD").toUpperCase(),
        providerFeeRateCad:preview.providerFeeRateCad,
        providerFeeMode:editingTransaction.providerFeeAuto?"AUTO":"MANUAL",
        providerFeePer100:Number(editingTransaction.providerFeePer100||providerFeeSettings.feePer100||0),
        transferDate:editingTransaction.transferDate,
        status:editingTransaction.status||"COMPLETED",
        rateSource:"manual"
      });
      setEditingTransaction(null);
      void load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر تعديل الحوالة");
    }finally{
      setEditSaving(false);
    }
  }


  async function deleteTransaction(transaction){
    if(!transaction?.id)return;
    const confirmed=await confirmAction({
      title:"تأكيد حذف الحوالة",
      message:`هل أنت متأكد من حذف الحوالة ${transaction.number||""}؟ سيتم إخفاؤها وحذف دفعاتها المرتبطة.`,
      confirmText:"حذف الحوالة"
    });
    if(!confirmed)return;
    setError("");
    try{
      await api.patch(`/transactions/${transaction.id}`,{_softDelete:true,reason:"حذف الحوالة"});
      clearApiGetCache();
      setList(current=>current.filter(item=>item.id!==transaction.id));
      void load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر حذف الحوالة");
    }
  }


  const normalizedSearch=search.trim().toLowerCase();
  const filteredTransactions=useMemo(()=>list.filter(transaction=>{
    const remaining=Number(transaction.remaining||0);
    const paymentStatus=String(transaction.paymentStatus||"").toUpperCase();
    const createdValue=transaction.transferDate||transaction.createdAt;
    if(activeMode==="unpaid"&&remaining<=0&&paymentStatus==="PAID")return false;
    if(activeMode==="paid"&&(remaining>0||paymentStatus!=="PAID"))return false;
    if(customerFilter&&String(transaction.customerId||"")!==customerFilter)return false;
    if(currencyFilter&&String(transaction.currency||"").toUpperCase()!==currencyFilter)return false;
    if(statusFilter&&paymentStatus!==statusFilter)return false;
    const date=String(createdValue||"").slice(0,10);
    if(dateFrom&&date<dateFrom)return false;
    if(dateTo&&date>dateTo)return false;
    if(!normalizedSearch)return true;
    return [transaction.number,transaction.referenceNumber,transaction.customerName,transaction.companyName,transaction.partnerName,transaction.providerFeeCompany,transaction.currency,transaction.transferDate,transaction.paymentStatus]
      .some(value=>String(value||"").toLowerCase().includes(normalizedSearch));
  }),[list,activeMode,customerFilter,currencyFilter,statusFilter,dateFrom,dateTo,normalizedSearch]);

  const pageCount=Math.max(Math.ceil(filteredTransactions.length/pageSize),1);
  const safePage=Math.min(page,pageCount);
  const visibleTransactions=filteredTransactions.slice((safePage-1)*pageSize,safePage*pageSize);
  const totalBaseCad=list.reduce((sum,transaction)=>sum+(Number(transaction.amount||0)*Number(transaction.finalRate||transaction.clientRate||0)),0);
  const totalUsdAmount=list.filter(transaction=>String(transaction.currency||"").toUpperCase()==="USD").reduce((sum,transaction)=>sum+Number(transaction.amount||0),0);

  const resetFilters=()=>{
    setSearch("");setCustomerFilter("");setCurrencyFilter("");setStatusFilter("");setDateFrom("");setDateTo("");setPage(1);
  };

  function exportTransactions(){
    const headers=["رقم الحوالة","التاريخ","العميل","الشركة المنفذة","العملة","المبلغ الأصلي","سعر الصرف CAD","القيمة CAD","طريقة أجور العميل","أجور العميل CAD","أجور الشركة الأصلية","عملة أجور الشركة","أجور الشركة CAD","ربح فرق السعر CAD","صافي ربح الحوالة CAD","المجموع النهائي CAD","الحالة"];
    const rows=filteredTransactions.map(transaction=>{
      const baseCad=Number(transaction.amount||0)*Number(transaction.finalRate||transaction.clientRate||0);
      return [transaction.number,transaction.transferDate||String(transaction.createdAt||"").slice(0,10),transaction.customerName||"-",transaction.providerFeeCompany||transaction.partnerName||transaction.companyName||"-",transaction.currency||"USD",Number(transaction.amount||0).toFixed(2),Number(transaction.finalRate||transaction.clientRate||0).toFixed(6),baseCad.toFixed(2),transaction.feeMethod==="PAID"?"أجور مستقلة":"فرق السعر",Number(transaction.customerFee||transaction.paidFee||0).toFixed(2),Number(transaction.providerFeeAmount||0).toFixed(2),transaction.providerFeeCurrency||transaction.currency||"USD",Number(transaction.providerFeeCad||0).toFixed(2),Number(transaction.exchangeProfit||0).toFixed(2),Number(transaction.totalProfit||0).toFixed(2),Number(transaction.totalCustomerDue||0).toFixed(2),transaction.paymentStatus==="PAID"?"مدفوعة":"غير مدفوعة"];
    });
    const csv="\uFEFF"+[headers,...rows].map(row=>row.map(value=>`"${String(value??"").replaceAll('"','""')}"`).join(",")).join("\n");
    const link=document.createElement("a");
    link.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
    link.download=`transactions-${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function selectMode(nextMode){
    setActiveMode(nextMode);
    setPage(1);
  }

  const editPreview=editingTransaction?transferFinancialPreview(editingTransaction):null;
  const editProviderSelection=editingTransaction?(editingTransaction.partnerId||(editingTransaction.providerFeeCompany?"__OTHER__":"")):"";
  const editProviderCurrencies=editingTransaction?[...new Set([editingTransaction.currency,"CAD","USD","EUR","TRY","SYP","SAR","JOD"].filter(Boolean))]:[];

  return <>
    <div className="transactions-page-heading">
      <div>
        <h2>الحوالات</h2>
        <p>متابعة الحوالات والبحث والتصفية والتعديل والحذف.</p>
      </div>
    </div>
    {error&&<div className="card customer-error">{error}</div>}

    <section className="transaction-summary-grid transaction-ledger-summary">
      <div className="card transaction-summary-card"><span>إجمالي الحوالات</span><strong>{list.length}</strong><small>عدد الحوالات المسجلة</small></div>
      <div className="card transaction-summary-card usd"><span>إجمالي المبلغ (USD)</span><strong>{money(totalUsdAmount)}</strong><small>مجموع الحوالات بالدولار الأمريكي</small></div>
      <div className="card transaction-summary-card cad"><span>إجمالي القيمة (CAD)</span><strong>{money(totalBaseCad)}</strong><small>القيمة المحولة إلى الدولار الكندي</small></div>
    </section>

    <div className="card transaction-mode-tabs no-print">
      <button type="button" className={activeMode==="all"?"active":""} onClick={()=>selectMode("all")}>📋 جميع الحوالات</button>
      <button type="button" className={activeMode==="paid"?"active":""} onClick={()=>selectMode("paid")}>✅ الحوالات المدفوعة</button>
      <button type="button" className={activeMode==="unpaid"?"active":""} onClick={()=>selectMode("unpaid")}>⏳ غير المدفوعة</button>

    </div>


    {editingTransaction&&
      <form className="card form edit-panel transaction-edit-panel no-print" data-app-editor="transaction" onSubmit={saveEditedTransaction}>
        <div className="transaction-edit-title">
          <h3>✏️ تعديل الحوالة</h3>
          <small>{editingTransaction.number}</small>
        </div>

        <label className="currency-field">
          <span className="currency-field-title">عملة الحوالة</span>
          <select value={editingTransaction.currency} onChange={e=>{const next=e.target.value;setEditingTransaction(current=>({...current,currency:next,providerFeeCurrency:(!current.providerFeeCurrency||current.providerFeeCurrency===current.currency)?next:current.providerFeeCurrency}))}}>
            {["USD","EUR","SYP","AED","GBP","CAD"].map(code=><option key={code} value={code}>{code}</option>)}
          </select>
        </label>

        <label className="currency-field">
          <span className="currency-field-title">مبلغ الحوالة</span>
          <input type="number" inputMode="decimal" step=".01" value={editingTransaction.amount} onChange={e=>{const amount=e.target.value;setEditingTransaction(current=>({...current,amount,providerFeeAmount:(current.providerFeeAuto&&editProviderSelection)?((Number(amount||0)/100)*Number(current.providerFeePer100||providerFeeSettings.feePer100||0)).toFixed(2):current.providerFeeAmount}))}} required/>
        </label>

        <label className="currency-field">
          <span className="currency-field-title">سعر التكلفة</span>
          <input type="number" inputMode="decimal" step=".0000001" value={editingTransaction.costRate} onChange={e=>setEditingTransaction({...editingTransaction,costRate:e.target.value})} required/>
        </label>

        <label className="currency-field">
          <span className="currency-field-title">سعر التحويل للعميل</span>
          <input type="number" inputMode="decimal" step=".0000001" value={editingTransaction.finalRate} onChange={e=>setEditingTransaction({...editingTransaction,finalRate:e.target.value})} required/>
        </label>

        <label className="currency-field">
          <span className="currency-field-title">طريقة احتساب الأجور</span>
          <select value={editingTransaction.feeMethod} onChange={e=>setEditingTransaction({...editingTransaction,feeMethod:e.target.value,transferFee:e.target.value==="PAID"?editingTransaction.transferFee:""})}>
            <option value="SPREAD">فرق سعر التحويل</option>
            <option value="PAID">أجور مدفوعة بشكل مستقل</option>
          </select>
        </label>

        {editingTransaction.feeMethod==="PAID"&&<label className="currency-field">
          <span className="currency-field-title">الأجور المأخوذة من العميل (CAD)</span>
          <input type="number" inputMode="decimal" min="0" step=".01" value={editingTransaction.transferFee} onChange={e=>setEditingTransaction({...editingTransaction,transferFee:e.target.value})} required/>
        </label>}

        <label className="currency-field">
          <span className="currency-field-title">الشركة المنفذة وأجورها</span>
          <select value={editProviderSelection} onChange={e=>{
            const value=e.target.value;
            if(!value){setEditingTransaction(current=>({...current,partnerId:"",providerFeeCompany:"",providerFeeAmount:"",providerFeeCurrency:current.currency,providerFeeRateCad:"",providerFeeAuto:providerFeeSettings.enabled,providerFeePer100:providerFeeSettings.feePer100}));return;}
            if(value==="__OTHER__"){setEditingTransaction(current=>({...current,partnerId:"",providerFeeCompany:"",providerFeeAmount:current.providerFeeAuto?((Number(current.amount||0)/100)*Number(current.providerFeePer100||providerFeeSettings.feePer100||0)).toFixed(2):current.providerFeeAmount,providerFeeCurrency:current.providerFeeCurrency||current.currency}));return;}
            const partner=partners.find(item=>item.id===value);
            setEditingTransaction(current=>({...current,partnerId:value,providerFeeCompany:partner?.name||"",providerFeeAmount:current.providerFeeAuto?((Number(current.amount||0)/100)*Number(current.providerFeePer100||providerFeeSettings.feePer100||0)).toFixed(2):current.providerFeeAmount,providerFeeCurrency:current.providerFeeCurrency||current.currency}));
          }}>
            <option value="">لا توجد أجور شركة منفذة</option>
            {partners.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
            <option value="__OTHER__">شركة أخرى</option>
          </select>
        </label>
        {editProviderSelection==="__OTHER__"&&<label className="currency-field">
          <span className="currency-field-title">اسم الشركة المنفذة</span>
          <input value={editingTransaction.providerFeeCompany||""} onChange={e=>setEditingTransaction({...editingTransaction,providerFeeCompany:e.target.value})} placeholder="مثال: دهب / جاد"/>
        </label>}
        {editProviderSelection&&<>
          <label className="currency-field">
            <span className="currency-field-title">أجور الشركة</span>
            <div className="provider-fee-inline">
              <input type="number" inputMode="decimal" min="0" step=".01" value={editingTransaction.providerFeeAmount||""} onChange={e=>setEditingTransaction({...editingTransaction,providerFeeAmount:e.target.value,providerFeeAuto:false})} placeholder="0.00"/>
              <select value={editingTransaction.providerFeeCurrency||editingTransaction.currency} onChange={e=>setEditingTransaction({...editingTransaction,providerFeeCurrency:e.target.value,providerFeeRateCad:""})}>
                {editProviderCurrencies.map(code=><option key={code} value={code}>{code}</option>)}
              </select>
            </div>
            <small>{editingTransaction.providerFeeAuto?`تلقائي: ${Number(editingTransaction.providerFeePer100||providerFeeSettings.feePer100||0).toFixed(2)} لكل 100.`:"أجرة معدلة يدويًا لهذه الحوالة."}</small>
            {!editingTransaction.providerFeeAuto&&providerFeeSettings.enabled&&<button type="button" className="provider-fee-auto-button" onClick={()=>setEditingTransaction(current=>({...current,providerFeeAuto:true,providerFeePer100:providerFeeSettings.feePer100,providerFeeAmount:((Number(current.amount||0)/100)*Number(providerFeeSettings.feePer100||0)).toFixed(2),providerFeeCurrency:current.currency,providerFeeRateCad:""}))}>استخدام الأجرة التلقائية</button>}
          </label>
          {editingTransaction.providerFeeCurrency!=="CAD"&&editingTransaction.providerFeeCurrency!==editingTransaction.currency&&<label className="currency-field">
            <span className="currency-field-title">سعر عملة الأجور إلى CAD</span>
            <input type="number" inputMode="decimal" min=".0000001" step=".0000001" value={editingTransaction.providerFeeRateCad||""} onChange={e=>setEditingTransaction({...editingTransaction,providerFeeRateCad:e.target.value})} required={Number(editingTransaction.providerFeeAmount||0)>0}/>
          </label>}
        </>}

        <input type="date" value={editingTransaction.transferDate||""} onChange={e=>setEditingTransaction({...editingTransaction,transferDate:e.target.value})}/>

        <div className="transaction-edit-preview"><span>المجموع بعد التعديل</span><strong>{editPreview.totalCustomerDue.toFixed(2)} CAD</strong></div>
        <div className="transaction-edit-preview"><span>ربح فرق السعر</span><strong>{editPreview.exchangeProfit.toFixed(2)} CAD</strong></div>
        <div className="transaction-edit-preview"><span>أجور العميل</span><strong>{editPreview.customerFee.toFixed(2)} CAD</strong></div>
        <div className="transaction-edit-preview"><span>أجور الشركة المنفذة</span><strong>- {editPreview.providerFeeCad.toFixed(2)} CAD</strong></div>
        <div className="transaction-edit-preview"><span>صافي ربح الحوالة</span><strong>{editPreview.netProfit.toFixed(2)} CAD</strong></div>

        <div className="transaction-edit-actions">
          <button disabled={editSaving}>{editSaving?"جاري الحفظ...":"حفظ تعديل الحوالة"}</button>
          <button type="button" onClick={()=>setEditingTransaction(null)}>إلغاء</button>
        </div>
      </form>
    }

    <section className="card transaction-ledger-controls no-print">
      <div className="transaction-ledger-actions">
        <button type="button" className="transaction-export-button" onClick={exportTransactions}>⇩ تصدير</button>
        <button type="button" className="transaction-filter-reset" onClick={resetFilters}>⌁ تصفية</button>
      </div>
      <div className="transaction-ledger-filters">
        <input value={search} onChange={event=>{setSearch(event.target.value);setPage(1)}} placeholder="بحث برقم الحوالة أو المرجع..."/>
        <select value={statusFilter} onChange={event=>{setStatusFilter(event.target.value);setPage(1)}}><option value="">جميع الحالات</option><option value="PAID">مدفوعة</option><option value="UNPAID">غير مدفوعة</option></select>
        <select value={currencyFilter} onChange={event=>{setCurrencyFilter(event.target.value);setPage(1)}}><option value="">العملة الأصلية</option>{[...new Set(list.map(item=>String(item.currency||"USD").toUpperCase()))].map(code=><option key={code} value={code}>{code}</option>)}</select>
        <input type="date" value={dateFrom} onChange={event=>{setDateFrom(event.target.value);setPage(1)}} aria-label="من تاريخ"/>
        <input type="date" value={dateTo} onChange={event=>{setDateTo(event.target.value);setPage(1)}} aria-label="إلى تاريخ"/>
        <select value={customerFilter} onChange={event=>{setCustomerFilter(event.target.value);setPage(1)}}><option value="">جميع العملاء</option>{customers.map(customer=><option key={customer.id} value={customer.id}>{customer.name}</option>)}</select>
      </div>
    </section>

    <div className="transaction-mobile-cards">
      {visibleTransactions.length?visibleTransactions.map((transaction)=>{
        const exchangeRate=Number(transaction.finalRate||transaction.clientRate||0);
        const cadValue=Number(transaction.amount||0)*exchangeRate;
        const finalTotal=Number(transaction.totalCustomerDue||cadValue);
        return <article className="transaction-mobile-card" key={`mobile-${transaction.id}`}>
          <header className="transaction-mobile-card__head">
            <div><strong>{transaction.number}</strong><small>{transaction.transferDate||String(transaction.createdAt||"").slice(0,10)||"-"}</small></div>
            <span className={`transfer-payment-badge ${transaction.paymentStatus==="PAID"?"paid":"unpaid"}`}>{transaction.paymentStatus==="PAID"?"مدفوعة":"غير مدفوعة"}</span>
          </header>
          <div className="transaction-mobile-card__customer">{transaction.customerName||"-"}</div>
          {(transaction.providerFeeCompany||transaction.partnerName)&&<div className="transaction-mobile-card__customer">الشركة المنفذة: {transaction.providerFeeCompany||transaction.partnerName}</div>}
          <div className="transaction-mobile-card__grid">
            <div><span>المبلغ</span><strong>{money(transaction.amount)} {transaction.currency||"USD"}</strong></div>
            <div><span>سعر التحويل</span><strong>{exchangeRate?exchangeRate.toFixed(4):"-"}</strong></div>
            <div><span>القيمة CAD</span><strong>{money(cadValue)}</strong></div>
            <div className="transaction-mobile-card__total"><span>الإجمالي CAD</span><strong>{money(finalTotal)}</strong></div>
          </div>
          {Number(transaction.customerFee||transaction.paidFee||0)!==0&&<div className="transaction-mobile-card__fee">أجور العميل: <strong>{money(transaction.customerFee||transaction.paidFee)} CAD</strong></div>}
          {Number(transaction.providerFeeCad||0)!==0&&<div className="transaction-mobile-card__fee">أجور {transaction.providerFeeCompany||transaction.partnerName||"الشركة"}: <strong>- {money(transaction.providerFeeCad)} CAD</strong></div>}
          <div className="transaction-mobile-card__fee">صافي ربح الحوالة: <strong>{money(transaction.totalProfit||0)} CAD</strong></div>
          <footer className="transaction-mobile-card__actions">
            <button title="فتح الفاتورة" onClick={()=>openInvoice(transaction.id)}>فاتورة</button>
            <button title="تعديل" onClick={()=>startEditTransaction(transaction)}>تعديل</button>
            <button title="حذف" className="danger-button" onClick={()=>deleteTransaction(transaction)}>حذف</button>
          </footer>
        </article>;
      }):<div className="transaction-mobile-empty">لا توجد حوالات مطابقة.</div>}
    </div>

    <div className="card tablewrap transaction-ledger-tablewrap">
      <AppTable tableClassName="transaction-ledger-table">
        <thead>
          <tr>
            <th>#</th><th>تاريخ الحوالة</th><th>رقم الحوالة</th><th>العميل</th><th>الشركة</th>
            <th>العملة الأصلية</th><th>المبلغ الأصلي</th><th>سعر الصرف (CAD)</th><th>القيمة بالكندي (CAD)</th>
            <th>طريقة أجور العميل</th><th>أجور العميل (CAD)</th><th>أجور الشركة (CAD)</th><th>صافي الربح (CAD)</th><th>المجموع النهائي (CAD)</th><th>الحالة</th><th>الإجراءات</th>
          </tr>
        </thead>
        <tbody>
          {visibleTransactions.length?visibleTransactions.map((transaction,index)=>{
            const exchangeRate=Number(transaction.finalRate||transaction.clientRate||0);
            const cadValue=Number(transaction.amount||0)*exchangeRate;
            return <tr key={transaction.id}>
              <td data-label="#" className="transaction-mobile-index">{(safePage-1)*pageSize+index+1}</td>
              <td data-label="التاريخ" className="transaction-mobile-date">{transaction.transferDate||String(transaction.createdAt||"").slice(0,10)||"-"}</td>
              <td data-label="رقم الحوالة" className="transaction-number-cell transaction-mobile-number">{transaction.number}</td>
              <td data-label="العميل" className="transaction-mobile-customer">{transaction.customerName||"-"}</td>
              <td data-label="الشركة" className="transaction-mobile-company">{transaction.providerFeeCompany||transaction.partnerName||transaction.companyName||"-"}</td>
              <td data-label="العملة"><span className={`transaction-currency-badge currency-${String(transaction.currency||"USD").toLowerCase()}`}>{transaction.currency||"USD"}</span></td>
              <td data-label="المبلغ الأصلي">{money(transaction.amount)} <small>{transaction.currency||"USD"}</small></td>
              <td data-label="سعر التحويل">{exchangeRate?exchangeRate.toFixed(4):"-"}</td>
              <td data-label="القيمة CAD" className="transaction-cad-value">{money(cadValue)}</td>
              <td data-label="طريقة أجور العميل">{transaction.feeMethod==="PAID"?"أجور مستقلة":"فرق السعر"}</td>
              <td data-label="أجور العميل CAD">{money(transaction.customerFee||transaction.paidFee||0)}</td>
              <td data-label="أجور الشركة CAD">{money(transaction.providerFeeCad||0)}</td>
              <td data-label="صافي الربح CAD" className={Number(transaction.totalProfit||0)<0?"value-negative":"value-positive"}>{money(transaction.totalProfit||0)}</td>
              <td data-label="الإجمالي CAD" className="transaction-final-total">{money(transaction.totalCustomerDue||cadValue)}</td>
              <td data-label="الحالة"><span className={`transfer-payment-badge ${transaction.paymentStatus==="PAID"?"paid":"unpaid"}`}>{transaction.paymentStatus==="PAID"?"مكتملة":"غير مدفوعة"}</span></td>
              <td data-label="الإجراءات" className="transaction-mobile-actions"><div className="transaction-row-actions"><button title="فتح الفاتورة" onClick={()=>openInvoice(transaction.id)}>◉</button><button title="تعديل" className="transaction-edit-button" onClick={()=>startEditTransaction(transaction)}>✎</button><button title="حذف" className="danger-button" onClick={()=>deleteTransaction(transaction)}>🗑</button></div></td>
            </tr>;
          }):<tr><td colSpan="16">لا توجد حوالات مطابقة.</td></tr>}
        </tbody>
      </AppTable>
    </div>

    <div className="transaction-ledger-pagination no-print">
      <span>عرض {(safePage-1)*pageSize+1}-{Math.min(safePage*pageSize,filteredTransactions.length)} من {filteredTransactions.length} حوالة</span>
      <div>{Array.from({length:Math.min(pageCount,7)},(_,i)=>i+1).map(number=><button key={number} className={safePage===number?"active":""} onClick={()=>setPage(number)}>{number}</button>)}{pageCount>7&&<><span>…</span><button className={safePage===pageCount?"active":""} onClick={()=>setPage(pageCount)}>{pageCount}</button></>}<button disabled={safePage>=pageCount} onClick={()=>setPage(value=>Math.min(value+1,pageCount))}>‹</button></div>
    </div>

    <section className="transaction-ledger-formula">
      <div><strong>معلومات مهمة للقراءة</strong><p><b>العملة الأصلية:</b> العملة التي تم إرسال المبلغ بها.</p><p><b>القيمة بالكندي:</b> قيمة المبلغ بعد التحويل إلى CAD.</p><p><b>المجموع النهائي:</b> المبلغ النهائي الذي يُسجل على العميل.</p></div>
      <div className="transaction-formula-flow"><strong>طريقة الحساب</strong><p><span>صافي ربح الحوالة:</span> ربح فرق السعر + أجور العميل − أجور الشركة المنفذة (دهب/جاد). أجور الشركة تكلفة مباشرة للحوالة ولا تُخصم مرة ثانية كمصروف عام.</p></div>
    </section>
  </>;
}


export default Transactions;
