import React,{useEffect,useRef,useState}from"react";
import api,{cachedGet} from"../api";
import {APP_VERSION} from"../version";
import {money,cad,openRegularWhatsApp,currencyFlag,flagOf,cleanConnectorMessage,EXCHANGE_CURRENCY_CATALOG,debtCurrencies,CurrencyFlag,rateTrend} from"../shared";

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


export { GeneralDebts };
