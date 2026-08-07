import React,{useEffect,useRef,useState}from"react";
import api,{cachedGet} from"../api";
import {APP_VERSION} from"../version";
import {money,cad,openRegularWhatsApp,currencyFlag,flagOf,cleanConnectorMessage,EXCHANGE_CURRENCY_CATALOG,debtCurrencies,CurrencyFlag,rateTrend,confirmAction} from"../shared";
import {AppTable} from "../components/ui";

function Simple({type}){
  const [list,setList]=useState([]),[title,setTitle]=useState(""),[amount,setAmount]=useState(""),[move,setMove]=useState("IN");
  const [currency,setCurrency]=useState("CAD"),[exchangeRate,setExchangeRate]=useState("1"),[category,setCategory]=useState("Other"),[date,setDate]=useState(new Date().toISOString().slice(0,10));
  const [editingId,setEditingId]=useState(null),[saving,setSaving]=useState(false),[message,setMessage]=useState("");
  const endpoint=type==="expenses"?"/expenses":"/capital";
  const expenseCurrencies=[
    {code:"CAD",flag:"🇨🇦",name:"دولار كندي"},{code:"USD",flag:"🇺🇸",name:"دولار أمريكي"},
    {code:"EUR",flag:"🇪🇺",name:"يورو"},{code:"GBP",flag:"🇬🇧",name:"جنيه إسترليني"},
    {code:"TRY",flag:"🇹🇷",name:"ليرة تركية"},{code:"SYP",flag:"🇸🇾",name:"ليرة سورية"},
    {code:"SAR",flag:"🇸🇦",name:"ريال سعودي"},{code:"AED",flag:"🇦🇪",name:"درهم إماراتي"},
    {code:"JOD",flag:"🇯🇴",name:"دينار أردني"}
  ];
  const flagOf=code=>expenseCurrencies.find(x=>x.code===String(code||"").toUpperCase())?.flag||"🏳️";
  const load=()=>cachedGet(endpoint,{params:{limit:150},cacheTtl:2*60*1000}).then(r=>setList(Array.isArray(r.data)?r.data:(r.data?.items||[])));
  useEffect(()=>{load();},[type]);
  useEffect(()=>{if(currency==="CAD")setExchangeRate("1");},[currency]);
  function resetExpenseForm(){setEditingId(null);setTitle("");setAmount("");setCurrency("CAD");setExchangeRate("1");setCategory("Other");setDate(new Date().toISOString().slice(0,10));}
  async function add(e){
    e.preventDefault();setSaving(true);setMessage("");
    try{
      const payload=type==="expenses"?{title,amount,currency,exchangeRate:Number(exchangeRate||1),category,date}:{type:move,amount,currency,description:title,date};
      if(type==="expenses"&&editingId)await api.put(`${endpoint}/${editingId}`,payload);else await api.post(endpoint,payload);
      if(type==="expenses")setMessage(editingId?"تم تعديل المصروف بنجاح":"تم حفظ المصروف بنجاح");
      resetExpenseForm();await load();
    }catch(err){setMessage(err?.response?.data?.message||"تعذر حفظ المصروف");}
    finally{setSaving(false);}
  }
  function editExpense(x){setEditingId(x.id);setTitle(x.title||"");setAmount(String(x.amount??""));setCurrency(x.currency||"CAD");setExchangeRate(String(x.exchangeRate||1));setCategory(x.category||"Other");setDate(x.date||new Date().toISOString().slice(0,10));setMessage("");window.scrollTo({top:0,behavior:"smooth"});}
  async function deleteExpense(x){
    if(!await confirmAction({title:"تأكيد حذف المصروف",message:`هل أنت متأكد من حذف المصروف: ${x.title}؟`,confirmText:"حذف المصروف"}))return;
    try{await api.delete(`${endpoint}/${x.id}`);if(String(editingId)===String(x.id))resetExpenseForm();setMessage("تم حذف المصروف بنجاح");await load();}
    catch(err){setMessage(err?.response?.data?.message||"تعذر حذف المصروف");}
  }
  if(type!=="expenses")return <><h2>رأس المال</h2><form className="card form" onSubmit={add}><select value={move} onChange={e=>setMove(e.target.value)}><option value="IN">زيادة</option><option value="OUT">سحب</option></select><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="الوصف" required/><input type="number" step=".01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="المبلغ" required/><button>حفظ</button></form><div className="card tablewrap"><AppTable><tbody>{list.map(x=><tr key={x.id}><td>{x.date}</td><td>{x.description}</td><td>{x.type}</td><td>{money(x.amount)} {x.currency||"CAD"}</td></tr>)}</tbody></AppTable></div></>;
  const totals=list.reduce((acc,x)=>{const code=x.currency||"CAD";acc[code]=(acc[code]||0)+Number(x.amount||0);acc.CAD_TOTAL=(acc.CAD_TOTAL||0)+Number(x.cadAmount??x.amount??0);return acc;},{});
  return <div className="expenses-multi-page">
    <div className="expenses-title-row"><div><h2>المصروفات بجميع العملات</h2><p>سجّل المصروف بعملته الأصلية وسيتم احتسابه تلقائيًا بالدولار الكندي.</p></div><div className="expenses-cad-total"><span>الإجمالي المعتمد</span><strong>{money(totals.CAD_TOTAL)} CAD 🇨🇦</strong></div></div>
    <form className="card form expenses-multi-form" onSubmit={add}>
      <label><span>الوصف</span><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="مثال: وقود، إيجار، خدمات" required/></label>
      <label><span>التصنيف</span><select value={category} onChange={e=>setCategory(e.target.value)}><option value="Other">أخرى</option><option value="Fuel">وقود</option><option value="Rent">إيجار</option><option value="Utilities">خدمات</option><option value="Salary">رواتب</option><option value="Office">مكتب</option><option value="Transport">نقل</option></select></label>
      <label><span>العملة</span><select value={currency} onChange={e=>setCurrency(e.target.value)}>{expenseCurrencies.map(c=><option key={c.code} value={c.code}>{c.flag} {c.code} — {c.name}</option>)}</select></label>
      <label><span>المبلغ بالعملة الأصلية</span><input type="number" min="0.01" step=".01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" required/></label>
      <label><span>سعر التحويل إلى CAD</span><input type="number" min="0.000001" step="0.000001" value={exchangeRate} onChange={e=>setExchangeRate(e.target.value)} disabled={currency==="CAD"} required/></label>
      <label><span>التاريخ</span><input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label>
      <div className="expense-conversion-preview"><span>القيمة المعتمدة في التقارير</span><strong>{money(Number(amount||0)*Number(exchangeRate||0))} CAD 🇨🇦</strong></div>
      <div className="expense-form-actions"><button className="expense-save-button" disabled={saving}>{saving?"جاري الحفظ…":editingId?"حفظ التعديلات":"حفظ المصروف"}</button>{editingId&&<button type="button" className="expense-cancel-button" onClick={resetExpenseForm}>إلغاء التعديل</button>}</div>{message&&<div className="expense-action-message">{message}</div>}
    </form>
    <section className="expense-currency-totals">{expenseCurrencies.filter(c=>totals[c.code]).map(c=><div className="card" key={c.code}><span>{c.flag} {c.name}</span><strong>{money(totals[c.code])} {c.code}</strong></div>)}</section>
    <div className="card tablewrap expense-table"><AppTable><thead><tr><th>التاريخ</th><th>الوصف</th><th>التصنيف</th><th>العملة</th><th>المبلغ الأصلي</th><th>سعر التحويل</th><th>القيمة CAD</th><th>الإجراءات</th></tr></thead><tbody>{list.map(x=><tr key={x.id} className={String(editingId)===String(x.id)?"expense-editing-row":""}><td>{x.date}</td><td>{x.title}</td><td>{x.category||"Other"}</td><td><span className="expense-currency-cell">{flagOf(x.currency)} {x.currency||"CAD"}</span></td><td>{money(x.amount)} {x.currency||"CAD"}</td><td>{Number(x.exchangeRate||1).toFixed(6)}</td><td><strong>{money(x.cadAmount??x.amount)} CAD 🇨🇦</strong></td><td><div className="expense-row-actions"><button type="button" className="expense-edit-button" onClick={()=>editExpense(x)}>✏️ تعديل</button><button type="button" className="expense-delete-button" onClick={()=>deleteExpense(x)}>🗑️ حذف</button></div></td></tr>)}</tbody></AppTable></div>
    <div className="expense-mobile-cards">{list.length?list.map(x=><article className="transaction-mobile-card expense-mobile-card" key={`expense-mobile-${x.id}`}><header className="transaction-mobile-card__head"><div><strong>{x.title||"مصروف"}</strong><small>{x.date||"-"}</small></div><span>{flagOf(x.currency)} {x.currency||"CAD"}</span></header><div className="transaction-mobile-card__grid"><div><span>التاريخ</span><strong>{x.date||"-"}</strong></div><div><span>الوصف</span><strong>{x.title||"-"}</strong></div><div><span>التصنيف</span><strong>{x.category||"Other"}</strong></div><div><span>العملة</span><strong>{flagOf(x.currency)} {x.currency||"CAD"}</strong></div><div><span>المبلغ الأصلي</span><strong>{money(x.amount)} {x.currency||"CAD"}</strong></div><div><span>سعر التحويل</span><strong>{Number(x.exchangeRate||1).toFixed(6)}</strong></div><div className="transaction-mobile-card__total"><span>القيمة CAD</span><strong>{money(x.cadAmount??x.amount)} CAD 🇨🇦</strong></div></div><footer className="transaction-mobile-card__actions expense-mobile-actions"><button type="button" className="expense-edit-button" onClick={()=>editExpense(x)}>✏️ تعديل</button><button type="button" className="expense-delete-button" onClick={()=>deleteExpense(x)}>🗑️ حذف</button></footer></article>):<div className="transaction-mobile-empty">لا توجد مصروفات.</div>}</div>
  </div>;
}
export { Simple };
