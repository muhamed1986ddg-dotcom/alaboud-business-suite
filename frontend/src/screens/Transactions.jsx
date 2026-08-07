import React,{useEffect,useMemo,useState} from "react";
import api,{cachedGet,clearApiGetCache} from "../api";
import {money,confirmAction} from "../shared";
import {AppTable} from "../components/ui";

export function Transactions({openInvoice}){
  const [customers,setCustomers]=useState([]);
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
      const [customersResponse,transactionsResponse]=await Promise.all([
        cachedGet("/customers/options",{params:{limit:200},cacheTtl:5*60*1000}),
        cachedGet("/transactions",{params:{limit:200},cacheTtl:2*60*1000})
      ]);
      const customerList=Array.isArray(customersResponse.data)?customersResponse.data:[];
      setCustomers(customerList);
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
      transferFee:String(transaction.transferFee??0),
      feeMethod:transaction.feeMethod||"ADD",
      currency:transaction.currency||"USD",
      transferDate:transaction.transferDate||String(transaction.createdAt||"").slice(0,10)
    });
  }

  async function saveEditedTransaction(event){
    event.preventDefault();
    if(!editingTransaction)return;
    setError("");
    setEditSaving(true);
    try{
      await api.patch(`/transactions/${editingTransaction.id}`,{
        currency:editingTransaction.currency,
        amount:Number(editingTransaction.amount),
        costRate:Number(editingTransaction.costRate),
        finalRate:Number(editingTransaction.finalRate),
        transferFee:Number(editingTransaction.transferFee||0),
        feeMethod:editingTransaction.feeMethod,
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
    return [transaction.number,transaction.referenceNumber,transaction.customerName,transaction.companyName,transaction.currency,transaction.transferDate,transaction.paymentStatus]
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
    const headers=["رقم الحوالة","التاريخ","العميل","الشركة","العملة","المبلغ الأصلي","سعر الصرف CAD","القيمة CAD","العمولة CAD","المجموع النهائي CAD","الحالة"];
    const rows=filteredTransactions.map(transaction=>{
      const baseCad=Number(transaction.amount||0)*Number(transaction.finalRate||transaction.clientRate||0);
      return [transaction.number,transaction.transferDate||String(transaction.createdAt||"").slice(0,10),transaction.customerName||"-",transaction.companyName||transaction.partnerName||"-",transaction.currency||"USD",Number(transaction.amount||0).toFixed(2),Number(transaction.finalRate||transaction.clientRate||0).toFixed(6),baseCad.toFixed(2),Number(transaction.transferFee||0).toFixed(2),Number(transaction.totalCustomerDue||0).toFixed(2),transaction.paymentStatus==="PAID"?"مدفوعة":"غير مدفوعة"];
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
      <form className="card form edit-panel transaction-edit-panel no-print" onSubmit={saveEditedTransaction}>
        <div className="transaction-edit-title">
          <h3>✏️ تعديل الحوالة</h3>
          <small>{editingTransaction.number}</small>
        </div>

        <label className="currency-field">
          <span className="currency-field-title">عملة الحوالة</span>
          <select value={editingTransaction.currency} onChange={e=>setEditingTransaction({...editingTransaction,currency:e.target.value})}>
            {["USD","EUR","SYP","AED","GBP","CAD"].map(code=><option key={code} value={code}>{code}</option>)}
          </select>
        </label>

        <label className="currency-field">
          <span className="currency-field-title">مبلغ الحوالة</span>
          <input type="number" inputMode="decimal" step=".01" value={editingTransaction.amount} onChange={e=>setEditingTransaction({...editingTransaction,amount:e.target.value})} required/>
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
          <span className="currency-field-title">أجور الحوالة</span>
          <input type="number" inputMode="decimal" step=".01" value={editingTransaction.transferFee} onChange={e=>setEditingTransaction({...editingTransaction,transferFee:e.target.value})}/>
        </label>

        <select value={editingTransaction.feeMethod} onChange={e=>setEditingTransaction({...editingTransaction,feeMethod:e.target.value})}>
          <option value="ADD">إضافة الأجور</option>
          <option value="DEDUCT">خصم الأجور</option>
        </select>

        <input type="date" value={editingTransaction.transferDate||""} onChange={e=>setEditingTransaction({...editingTransaction,transferDate:e.target.value})}/>

        <div className="transaction-edit-preview">
          <span>المجموع بعد التعديل</span>
          <strong>{(
            (Number(editingTransaction.amount)||0)*(Number(editingTransaction.finalRate)||0)
            +(editingTransaction.feeMethod==="ADD"?(Number(editingTransaction.transferFee)||0):0)
          ).toFixed(2)} CAD</strong>
        </div>

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
          <div className="transaction-mobile-card__grid">
            <div><span>المبلغ</span><strong>{money(transaction.amount)} {transaction.currency||"USD"}</strong></div>
            <div><span>سعر التحويل</span><strong>{exchangeRate?exchangeRate.toFixed(4):"-"}</strong></div>
            <div><span>القيمة CAD</span><strong>{money(cadValue)}</strong></div>
            <div className="transaction-mobile-card__total"><span>الإجمالي CAD</span><strong>{money(finalTotal)}</strong></div>
          </div>
          {Number(transaction.transferFee||0)>0&&<div className="transaction-mobile-card__fee">العمولة: <strong>{money(transaction.transferFee)} CAD</strong></div>}
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
            <th>العمولة (CAD)</th><th>المجموع النهائي (CAD)</th><th>الحالة</th><th>الإجراءات</th>
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
              <td data-label="الشركة" className="transaction-mobile-company">{transaction.companyName||transaction.partnerName||"-"}</td>
              <td data-label="العملة"><span className={`transaction-currency-badge currency-${String(transaction.currency||"USD").toLowerCase()}`}>{transaction.currency||"USD"}</span></td>
              <td data-label="المبلغ الأصلي">{money(transaction.amount)} <small>{transaction.currency||"USD"}</small></td>
              <td data-label="سعر التحويل">{exchangeRate?exchangeRate.toFixed(4):"-"}</td>
              <td data-label="القيمة CAD" className="transaction-cad-value">{money(cadValue)}</td>
              <td data-label="العمولة CAD">{money(transaction.transferFee||0)}</td>
              <td data-label="الإجمالي CAD" className="transaction-final-total">{money(transaction.totalCustomerDue||cadValue)}</td>
              <td data-label="الحالة"><span className={`transfer-payment-badge ${transaction.paymentStatus==="PAID"?"paid":"unpaid"}`}>{transaction.paymentStatus==="PAID"?"مكتملة":"غير مدفوعة"}</span></td>
              <td data-label="الإجراءات" className="transaction-mobile-actions"><div className="transaction-row-actions"><button title="فتح الفاتورة" onClick={()=>openInvoice(transaction.id)}>◉</button><button title="تعديل" className="transaction-edit-button" onClick={()=>startEditTransaction(transaction)}>✎</button><button title="حذف" className="danger-button" onClick={()=>deleteTransaction(transaction)}>🗑</button></div></td>
            </tr>;
          }):<tr><td colSpan="13">لا توجد حوالات مطابقة.</td></tr>}
        </tbody>
      </AppTable>
    </div>

    <div className="transaction-ledger-pagination no-print">
      <span>عرض {(safePage-1)*pageSize+1}-{Math.min(safePage*pageSize,filteredTransactions.length)} من {filteredTransactions.length} حوالة</span>
      <div>{Array.from({length:Math.min(pageCount,7)},(_,i)=>i+1).map(number=><button key={number} className={safePage===number?"active":""} onClick={()=>setPage(number)}>{number}</button>)}{pageCount>7&&<><span>…</span><button className={safePage===pageCount?"active":""} onClick={()=>setPage(pageCount)}>{pageCount}</button></>}<button disabled={safePage>=pageCount} onClick={()=>setPage(value=>Math.min(value+1,pageCount))}>‹</button></div>
    </div>

    <section className="transaction-ledger-formula">
      <div><strong>معلومات مهمة للقراءة</strong><p><b>العملة الأصلية:</b> العملة التي تم إرسال المبلغ بها.</p><p><b>القيمة بالكندي:</b> قيمة المبلغ بعد التحويل إلى CAD.</p><p><b>المجموع النهائي:</b> المبلغ النهائي الذي يُسجل على العميل.</p></div>
      <div className="transaction-formula-flow"><strong>طريقة حساب المجموع النهائي</strong><p><span>المجموع النهائي (CAD)</span> = <span>القيمة بالكندي (CAD)</span> + <span>العمولة (CAD)</span></p></div>
    </section>
  </>;
}


export default Transactions;
