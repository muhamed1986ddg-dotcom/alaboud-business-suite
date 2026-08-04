import React,{useEffect,useRef,useState} from "react";
import api,{cachedGet} from "../api";
import {APP_VERSION} from "../version";
import {money,cad,openRegularWhatsApp,currencyFlag,flagOf,cleanConnectorMessage,EXCHANGE_CURRENCY_CATALOG,debtCurrencies,CurrencyFlag,rateTrend,confirmAction} from "../shared";

export function Transactions({openInvoice}){
  const [customers,setCustomers]=useState([]);
  const [list,setList]=useState([]);
  const [error,setError]=useState("");
  const [f,setF]=useState({
    customerId:"",
    currency:"USD",
    amount:"",
    costRate:"",
    finalRate:"",
    transferFee:"0",
    feeMethod:"ADD",
    transferDate:new Date().toISOString().slice(0,10),
    rateMode:"auto",
    rateSource:"exchange-rates",
    rateUpdatedAt:null
  });
  const [rateMeta,setRateMeta]=useState(null);
  const [editingTransaction,setEditingTransaction]=useState(null);
  const [editSaving,setEditSaving]=useState(false);
  const [search,setSearch]=useState("");
  const [visibleCount,setVisibleCount]=useState(50);
  const [activeMode,setActiveMode]=useState("all");
  const [showAddModal,setShowAddModal]=useState(false);

  async function load(){
    try{
      const [customersResponse,transactionsResponse]=await Promise.all([
        cachedGet("/customers"),
        cachedGet("/transactions")
      ]);
      const customerList=Array.isArray(customersResponse.data)?customersResponse.data:[];
      setCustomers(customerList);
      setList(Array.isArray(transactionsResponse.data)?transactionsResponse.data:[]);
      if(!f.customerId&&customerList[0]){
        setF(current=>({...current,customerId:customerList[0].id}));
      }
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر تحميل الحوالات");
    }
  }

  useEffect(()=>{load();},[]);

  useEffect(()=>{
    if(!f.currency)return;

    if(f.currency==="CAD"){
      const timestamp=new Date().toISOString();
      setRateMeta({baseCurrency:"CAD",quoteCurrency:"CAD",buyRate:1,createdAt:timestamp});
      if(f.rateMode==="auto"){
        setF(current=>({...current,costRate:"1",rateUpdatedAt:timestamp,rateSource:"base"}));
      }
      return;
    }

    cachedGet("/exchange-rates")
      .then(response=>{
        const rates=Array.isArray(response.data)?response.data:[];
        const direct=rates.find(item=>
          String(item.baseCurrency||"").toUpperCase()===f.currency &&
          String(item.quoteCurrency||"").toUpperCase()==="CAD"
        );
        setRateMeta(direct||null);
        const rate=Number(direct?.buyRate||direct?.sellRate||0);
        if(rate>0&&f.rateMode==="auto"){
          setF(current=>({...current,costRate:String(rate),rateUpdatedAt:direct.createdAt||null,rateSource:"exchange-rates"}));
        }else if(!direct&&f.rateMode==="auto"){
          setF(current=>({...current,costRate:"",rateUpdatedAt:null}));
        }
      })
      .catch(()=>{
        setRateMeta(null);
        if(f.rateMode==="auto"){
          setF(current=>({...current,costRate:"",rateUpdatedAt:null}));
        }
      });
  },[f.currency,f.rateMode]);


  async function add(event){
    event.preventDefault();
    setError("");
    try{
      await api.post("/transactions",{
        ...f,
        amount:Number(f.amount),
        costRate:Number(f.costRate),
        finalRate:Number(f.finalRate),
        transferFee:Number(f.transferFee||0),
        rateSource:f.rateMode==="auto"?"exchange-rates":"manual",
        rateUpdatedAt:f.rateUpdatedAt||rateMeta?.createdAt||null
      });
      setF(current=>({
        ...current,
        amount:"",
        finalRate:"",
        transferFee:"0",
        transferDate:new Date().toISOString().slice(0,10),
        paymentStatus:"UNPAID"
      }));
      await load();
      setShowAddModal(false);
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر حفظ الحوالة");
    }
  }

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
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر تعديل الحوالة");
    }finally{
      setEditSaving(false);
    }
  }


  async function markTransactionPaid(transaction){
    const remaining=Number(transaction.remaining||0);
    if(remaining<=0)return;
    setError("");
    try{
      await api.post(`/transactions/${transaction.id}/payments`,{
        amount:remaining,
        method:"CASH",
        notes:"تسديد كامل للحوالة",
        paymentDate:new Date().toISOString().slice(0,10)
      });
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر تسجيل الحوالة كمدفوعة");
    }
  }

  const now=Date.now();
  const normalizedSearch=search.trim().toLowerCase();
  const filteredTransactions=list.filter(transaction=>{
    const remaining=Number(transaction.remaining||0);
    const paymentStatus=String(transaction.paymentStatus||"").toUpperCase();
    const createdValue=transaction.transferDate||transaction.createdAt;
    const createdTime=createdValue?new Date(createdValue).getTime():now;
    const overdue=remaining>0&&Number.isFinite(createdTime)&&(now-createdTime)>7*24*60*60*1000;
    const paidAmount=Math.max(Number(transaction.totalCustomerDue||0)-remaining,0);
    if(activeMode==="unpaid"&&remaining<=0&&paymentStatus==="PAID")return false;
    if(activeMode==="paid"&&(remaining>0||paymentStatus!=="PAID"))return false;
    if(activeMode==="overdue"&&!overdue)return false;
    if(activeMode==="payments"&&paidAmount<=0)return false;
    if(!normalizedSearch)return true;
    return [transaction.number,transaction.customerName,transaction.currency,transaction.transferDate,transaction.paymentStatus]
      .some(value=>String(value||"").toLowerCase().includes(normalizedSearch));
  });
  const visibleTransactions=filteredTransactions.slice(0,visibleCount);

  const totalAllCad=list.reduce((sum,transaction)=>sum+Number(transaction.totalCustomerDue||0),0);
  const totalUnpaidCad=list.reduce((sum,transaction)=>sum+Math.max(Number(transaction.remaining||0),0),0);
  const totalPaidCad=Math.max(totalAllCad-totalUnpaidCad,0);
  const paidCount=list.filter(transaction=>Number(transaction.remaining||0)<=0||String(transaction.paymentStatus||"").toUpperCase()==="PAID").length;
  const unpaidCount=list.length-paidCount;

  function selectMode(nextMode){
    setActiveMode(nextMode);
    setVisibleCount(50);
  }

  return <>
    <div className="transactions-page-heading">
      <h2>الحوالات</h2>
      <button type="button" className="transaction-add-open" onClick={()=>setShowAddModal(true)}>＋ إضافة حوالة</button>
    </div>
    {error&&<div className="card customer-error">{error}</div>}

    <section className="transaction-summary-grid">
      <div className="card transaction-summary-card"><span>إجمالي الحوالات الكامل</span><strong>{money(totalAllCad)} CAD</strong><small>{list.length} حوالة</small></div>
      <div className="card transaction-summary-card unpaid"><span>الرصيد غير المدفوع</span><strong>{money(totalUnpaidCad)} CAD</strong><small>{unpaidCount} حوالة</small></div>
      <div className="card transaction-summary-card paid"><span>إجمالي المدفوع</span><strong>{money(totalPaidCad)} CAD</strong><small>{paidCount} حوالة</small></div>
    </section>

    <div className="card transaction-mode-tabs no-print">
      <button type="button" className={activeMode==="all"?"active":""} onClick={()=>selectMode("all")}>📋 جميع الحوالات</button>
      <button type="button" className={activeMode==="paid"?"active":""} onClick={()=>selectMode("paid")}>✅ الحوالات المدفوعة</button>
      <button type="button" className={activeMode==="unpaid"?"active":""} onClick={()=>selectMode("unpaid")}>⏳ غير المدفوعة</button>
      <button type="button" className={activeMode==="payments"?"active":""} onClick={()=>selectMode("payments")}>💳 الدفعات</button>
      <button type="button" className={activeMode==="overdue"?"active":""} onClick={()=>selectMode("overdue")}>⏰ المتأخرة</button>
    </div>

    {showAddModal&&<div className="transaction-modal-backdrop no-print" role="dialog" aria-modal="true">
      <div className="transaction-modal-panel">
        <div className="transaction-modal-header"><h3>إضافة حوالة جديدة</h3><button type="button" onClick={()=>setShowAddModal(false)}>✕</button></div>
        <form className="card form transaction-add-form" onSubmit={add}>
      <select value={f.customerId} onChange={e=>setF({...f,customerId:e.target.value})} required>
        <option value="">العميل</option>
        {customers.map(customer=><option key={customer.id} value={customer.id}>{customer.name}</option>)}
      </select>
      <input type="date" value={f.transferDate} onChange={e=>setF({...f,transferDate:e.target.value})} required/>
      <label className="currency-field">
        <span className="currency-field-title">عملة الحوالة</span>
        <span className="currency-badge">{f.currency}</span>
        <select value={f.currency} onChange={e=>setF({...f,currency:e.target.value,costRate:"",finalRate:"",rateUpdatedAt:null})}>
          {["USD","EUR","SYP","AED","GBP","CAD"].map(code=><option key={code} value={code}>{code}</option>)}
        </select>
        <small>سعر التكلفة يُجلب مقابل CAD</small>
      </label>
      <label className="currency-field">
        <span className="currency-field-title">مبلغ الحوالة</span>
        <span className="currency-badge">{f.currency}</span>
        <input type="number" inputMode="decimal" step=".01" value={f.amount} onChange={e=>setF({...f,amount:e.target.value})} placeholder="0.00" required/>
        <small>المبلغ بعملة {f.currency}</small>
      </label>
      <label className="currency-field">
        <span className="currency-field-title">سعر التكلفة مقابل CAD</span>
        <span className="currency-badge cad">CAD</span>
        <div className="rate-mode-switch">
          <button type="button" className={f.rateMode==="auto"?"active":""} onClick={()=>setF({...f,rateMode:"auto"})}>السعر الآلي</button>
          <button type="button" className={f.rateMode==="manual"?"active":""} onClick={()=>setF({...f,rateMode:"manual"})}>سعر يدوي</button>
        </div>
        <input type="number" inputMode="decimal" step=".0000001" value={f.costRate} onChange={e=>setF({...f,costRate:e.target.value,rateMode:"manual"})} placeholder="0.0000" required readOnly={f.rateMode==="auto"}/>
        <small>{(rateMeta?.createdAt||rateMeta?.updatedAt)?`آخر تحديث: ${new Date(rateMeta.createdAt||rateMeta.updatedAt).toLocaleString("ar-CA")}`:(f.rateMode==="manual"?"يُستخدم هذا السعر لهذه الحوالة فقط":"لا يوجد سعر آلي؛ اختر سعر يدوي")}</small>
      </label>
      <label className="currency-field">
        <span className="currency-field-title">سعر التحويل للعميل</span>
        <span className="currency-badge cad">CAD</span>
        <input type="number" inputMode="decimal" step=".0000001" value={f.finalRate} onChange={e=>setF({...f,finalRate:e.target.value})} placeholder="0.0000" required/>
        <small>السعر المحسوب للعميل مقابل كل وحدة من {f.currency}</small>
      </label>
      <div className="transfer-calculation-grid">
        <div className="transfer-total-preview">
          <span>المجموع النهائي للعميل</span>
          <strong>{((Number(f.amount)||0)*(Number(f.finalRate)||0)+(Number(f.transferFee)||0)).toFixed(2)} CAD</strong>
        </div>
        <div className="transfer-profit-preview">
          <span>ربح الحوالة</span>
          <strong>{((Number(f.amount)||0)*((Number(f.finalRate)||0)-(Number(f.costRate)||0))+(Number(f.transferFee)||0)).toFixed(2)} CAD</strong>
        </div>
      </div>
      <label className="currency-field">
        <span className="currency-field-title">أجور الحوالة</span>
        <span className="currency-badge cad">CAD</span>
        <input type="number" inputMode="decimal" step=".01" value={f.transferFee} onChange={e=>setF({...f,transferFee:e.target.value})} placeholder="0.00"/>
      </label>
      <select value={f.feeMethod} onChange={e=>setF({...f,feeMethod:e.target.value})}>
        <option value="ADD">إضافة الأجور</option>
        <option value="DEDUCT">خصم الأجور</option>
      </select>

      <div className="transfer-payment-choice">
        <div className="transfer-payment-choice-title">
          <strong>حالة دفع الحوالة</strong>
          <small>الحوالة غير المدفوعة تُحتسب تلقائيًا ضمن رصيد «الدين لنا».</small>
        </div>
        <div className="transfer-payment-choice-buttons">
          <button type="button" className={f.paymentStatus==="PAID"?"is-active paid":""} onClick={()=>setF({...f,paymentStatus:"PAID"})}>✓ مدفوع</button>
          <button type="button" className={f.paymentStatus==="UNPAID"?"is-active unpaid":""} onClick={()=>setF({...f,paymentStatus:"UNPAID"})}>◷ غير مدفوع</button>
        </div>
      </div>

      <div className="transaction-modal-actions">
        <button type="submit">حفظ الحوالة</button>
        <button type="button" onClick={()=>setShowAddModal(false)}>إلغاء</button>
      </div>
        </form>
      </div>
    </div>}

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

    <div className="card transaction-list-toolbar no-print">
      <input value={search} onChange={event=>{setSearch(event.target.value);setVisibleCount(50)}} placeholder="بحث برقم الحوالة أو اسم العميل أو العملة"/>
      <span>النتائج: <strong>{filteredTransactions.length}</strong></span>
    </div>
    <div className="card tablewrap">
      <table>
        <thead>
          <tr>
            <th>الرقم</th><th>تاريخ الحوالة</th><th>العميل</th><th>المبلغ</th>
            <th>الأجور</th><th>الإجمالي</th><th>حالة الدفع</th><th>المتبقي</th><th>الربح</th><th>الفاتورة</th><th>تعديل</th>
          </tr>
        </thead>
        <tbody>
          {visibleTransactions.length?visibleTransactions.map(transaction=><tr key={transaction.id}>
            <td>{transaction.number}</td>
            <td>{transaction.transferDate||String(transaction.createdAt||"").slice(0,10)||"-"}</td>
            <td>{transaction.customerName}</td>
            <td>{money(transaction.amount)}</td>
            <td>{money(transaction.transferFee)}</td>
            <td>{money(transaction.totalCustomerDue)}</td>
            <td>
              <span className={`transfer-payment-badge ${transaction.paymentStatus==="PAID"?"paid":"unpaid"}`}>
                {transaction.paymentStatus==="PAID"?"مدفوع":"غير مدفوع"}
              </span>
            </td>
            <td>
              <div className="transfer-remaining-cell">
                <strong>{money(transaction.remaining||0)}</strong>
                {transaction.paymentStatus!=="PAID"&&
                  <button type="button" onClick={()=>markTransactionPaid(transaction)}>تسديد كامل</button>
                }
              </div>
            </td>
            <td>{money(transaction.totalProfit)}</td>
            <td><button onClick={()=>openInvoice(transaction.id)}>فتح</button></td>
            <td><button className="transaction-edit-button" onClick={()=>startEditTransaction(transaction)}>✏️ تعديل</button></td>
          </tr>):<tr><td colSpan="9">لا توجد حوالات.</td></tr>}
        </tbody>
      </table>
    </div>
    {visibleCount<filteredTransactions.length&&<div className="load-more-wrap no-print"><button type="button" onClick={()=>setVisibleCount(count=>count+50)}>تحميل 50 حوالة إضافية</button></div>}
  </>;
}


export default Transactions;
