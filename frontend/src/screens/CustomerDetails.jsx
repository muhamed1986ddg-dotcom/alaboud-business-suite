import React,{useEffect,useRef,useState} from "react";
import api,{cachedGet} from "../api";
import {APP_VERSION} from "../version";
import {money,cad,openRegularWhatsApp,currencyFlag,flagOf,cleanConnectorMessage,EXCHANGE_CURRENCY_CATALOG,debtCurrencies,CurrencyFlag,rateTrend,confirmAction} from "../shared";
import {AppTable} from "../components/ui";

export function Customer({id,back,onStatement}){
  const [data,setData]=useState(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  const [paymentForm,setPaymentForm]=useState({
    amount:"",
    paymentDate:new Date().toISOString().slice(0,10),
    method:"CASH",
    reference:"",
    notes:""
  });
  const [editingTransaction,setEditingTransaction]=useState(null);
  const [editingPayment,setEditingPayment]=useState(null);
  const [oldBalanceForm,setOldBalanceForm]=useState("");
  const [savingOldBalance,setSavingOldBalance]=useState(false);

  async function load(){
    setLoading(true);
    setError("");
    try{
      const response=await cachedGet(`/customers/${id}`);
      const result=response?.data||{};
      const loadedCustomer=result.customer||{name:"عميل"};
      setData({
        customer:loadedCustomer,
        transactions:Array.isArray(result.transactions)?result.transactions:[],
        payments:Array.isArray(result.payments)?result.payments:[],
      });
      setOldBalanceForm(String(loadedCustomer.oldBalance??""));
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر تحميل ملف العميل");
      setData(null);
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{load();},[id]);

  async function saveOldBalance(event){
    event.preventDefault();
    setSavingOldBalance(true);
    setError("");
    try{
      await api.patch(`/customers/${id}`,{
        oldBalance:Number(oldBalanceForm||0)
      });
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر حفظ الحساب القديم");
    }finally{
      setSavingOldBalance(false);
    }
  }

  async function addPayment(event){
    event.preventDefault();
    try{
      await api.post(`/customers/${id}/payments`,{
        amount:Number(paymentForm.amount),
        paymentDate:paymentForm.paymentDate,
        method:paymentForm.method,
        reference:paymentForm.reference,
        notes:paymentForm.notes
      });
      setPaymentForm({
        amount:"",
        paymentDate:new Date().toISOString().slice(0,10),
        method:"CASH",
        reference:"",
        notes:""
      });
      await load();
    }catch(error){
      setError(error.response?.data?.message||error.message||"تعذر حفظ الدفعة");
    }
  }

  async function shareCustomerStatementText(){
    try{
      const phone=String(customer.phone||"").replace(/\D/g,"");
      if(!phone){
        setError("لا يوجد رقم واتساب محفوظ لهذا العميل");
        return;
      }

      const response=await cachedGet(`/customers/${id}/statement`);
      const statement=response.data;
      const rows=Array.isArray(statement.transactions)?statement.transactions:[];
      const oldBalance=Number(statement.totals?.oldBalance||0);
      const total=Number(statement.totals?.formulaResultCad||0)+oldBalance;
      const paid=Number(statement.totals?.paid||0);
      const finalBalance=Number(statement.totals?.remaining||Math.max(total-paid,0));

      const lines=rows.map((item,index)=>{
        const amount=Number(item.usdAmount||0).toFixed(2).replace(/\.00$/,"");
        const rate=Number(item.customerRate||0).toFixed(4).replace(/0+$/,"").replace(/\.$/,"");
        return `${index+1}_ ${amount} 🇺🇸 × ${rate} = ${money(item.formulaResultCad)} 🇨🇦`;
      });

      const message=[
        statement.company?.name||"شركة العبود التجارية",
        "",
        "كشف حساب العميل",
        customer.name,
        "",
        ...lines,
        "",
        "--------------------",
        `الحساب القديم: ${money(oldBalance)} 🇨🇦`,
        `الدفعات: ${money(paid)} 🇨🇦`,
        `المجموع النهائي: ${money(finalBalance)} 🇨🇦`
      ].join("\n");

      openRegularWhatsApp(phone,message);
    }catch(error){
      setError(error.response?.data?.message||error.message||"تعذر إرسال رسالة كشف الحساب");
    }
  }

  async function shareCustomerStatement(action="share"){
    try{
      const response=await cachedGet(`/customers/${id}/statement`);
      const statement=response.data||{};
      const rows=Array.isArray(statement.transactions)?statement.transactions:[];
      const oldBalance=Number(statement.totals?.oldBalance||0);
      const paid=Number(statement.totals?.paid||0);
      const finalBalance=Number(
        statement.totals?.remaining ??
        Math.max(Number(statement.totals?.formulaResultCad||0)+oldBalance-paid,0)
      );

      const width=720;
      const sidePadding=34;
      const rowHeight=54;
      const headerHeight=205;
      const summaryHeight=188;
      const footerHeight=82;
      const height=headerHeight+(rows.length*rowHeight)+summaryHeight+footerHeight;

      const canvas=document.createElement("canvas");
      canvas.width=width;
      canvas.height=height;
      const ctx=canvas.getContext("2d");
      if(!ctx)throw new Error("تعذر إنشاء صورة كشف الحساب");

      const drawText=(value,x,y,size,{color="#f5f5f5",align="center",weight="700",direction="rtl"}={})=>{
        ctx.save();
        ctx.fillStyle=color;
        ctx.font=`${weight} ${size}px Arial, sans-serif`;
        ctx.textAlign=align;
        ctx.textBaseline="middle";
        ctx.direction=direction;
        ctx.fillText(String(value??""),x,y);
        ctx.restore();
      };

      const drawLine=(y,color="#51606b",dash=[])=>{
        ctx.save();
        ctx.strokeStyle=color;
        ctx.lineWidth=1.5;
        ctx.setLineDash(dash);
        ctx.beginPath();
        ctx.moveTo(sidePadding,y);
        ctx.lineTo(width-sidePadding,y);
        ctx.stroke();
        ctx.restore();
      };

      const gradient=ctx.createLinearGradient(0,0,width,height);
      gradient.addColorStop(0,"#142331");
      gradient.addColorStop(1,"#08131c");
      ctx.fillStyle=gradient;
      ctx.fillRect(0,0,width,height);

      ctx.strokeStyle="#9b7425";
      ctx.lineWidth=2;
      ctx.strokeRect(14,14,width-28,height-28);

      drawText(statement.company?.name||"شركة العبود التجارية",width/2,50,34,{weight:"800"});
      drawText("كشف حساب العميل",width/2,101,30,{color:"#d8a33f",weight:"800"});
      drawText(customer.name||"العميل",width/2,147,26,{weight:"700"});
      drawLine(180);

      let y=219;
      rows.forEach((item,index)=>{
        const amount=Number(item.usdAmount||item.amount||0).toFixed(2).replace(/\.00$/,"");
        const rate=Number(item.customerRate||item.finalRate||0).toFixed(4).replace(/0+$/,"").replace(/\.$/,"");
        const result=money(item.formulaResultCad ?? item.totalCad ?? 0);

        drawText(
          `${index+1}_ ${amount} 🇺🇸 × ${rate} = ${result} 🇨🇦`,
          sidePadding,
          y,
          24,
          {align:"left",direction:"ltr",weight:"700"}
        );
        drawLine(y+27,"#283844");
        y+=rowHeight;
      });

      drawLine(y+7,"#68747c",[10,8]);
      y+=37;

      drawText("الحساب القديم",sidePadding,y,23,{align:"left"});
      drawText(`${money(oldBalance)} 🇨🇦`,width-sidePadding,y,24,{align:"right",color:"#d8a33f",weight:"800"});
      y+=48;

      drawText("الدفعات",sidePadding,y,23,{align:"left"});
      drawText(`${money(paid)} 🇨🇦`,width-sidePadding,y,24,{align:"right",color:"#ef4444",weight:"800"});
      y+=48;

      drawText("المجموع النهائي",sidePadding,y,25,{align:"left",weight:"800"});
      drawText(`${money(finalBalance)} 🇨🇦`,width-sidePadding,y,28,{align:"right",color:"#63c443",weight:"900"});
      y+=46;

      drawLine(y+4,"#68747c");
      y+=34;

      const nowDate=new Date();
      drawText(`التاريخ: ${nowDate.toLocaleDateString("en-CA")}`,sidePadding,y,18,{align:"left",color:"#b8c0c7",weight:"500"});
      drawText(`الوقت: ${nowDate.toLocaleTimeString("ar-CA",{hour:"2-digit",minute:"2-digit"})}`,width-sidePadding,y,18,{align:"right",color:"#b8c0c7",weight:"500"});
      drawText("شكراً لتعاملكم معنا",width/2,height-34,22,{color:"#d8a33f"});

      const blob=await new Promise((resolve,reject)=>{
        canvas.toBlob(value=>value?resolve(value):reject(new Error("تعذر إنشاء صورة كشف الحساب")),"image/png",0.96);
      });

      const safeName=String(customer.name||"customer").replace(/[\\/:*?"<>|]+/g,"-");
      const file=new File([blob],`كشف-حساب-${safeName}.png`,{type:"image/png"});

      if(action==="save"){
        const saveUrl=URL.createObjectURL(blob);
        const saveLink=document.createElement("a");
        saveLink.href=saveUrl;
        saveLink.download=file.name;
        document.body.appendChild(saveLink);
        saveLink.click();
        saveLink.remove();
        setTimeout(()=>URL.revokeObjectURL(saveUrl),30000);
        setError("تم حفظ صورة كشف الحساب");
        return;
      }

      // داخل تطبيق أندرويد استخدم الجسر الأصلي لفتح نافذة المشاركة مباشرة.
      // WebView لا يدعم navigator.share مع الملفات بشكل موثوق على جميع الأجهزة.
      if(window.AlAboudNative?.shareImageToWhatsApp){
        const dataUrl=await new Promise((resolve,reject)=>{
          const reader=new FileReader();
          reader.onload=()=>resolve(String(reader.result||""));
          reader.onerror=()=>reject(new Error("تعذر تجهيز الصورة للمشاركة"));
          reader.readAsDataURL(blob);
        });
        window.AlAboudNative.shareImageToWhatsApp(dataUrl,file.name);
        return;
      }

      if(navigator.share && (!navigator.canShare || navigator.canShare({files:[file]}))){
        try{
          await navigator.share({files:[file],title:"كشف حساب العميل"});
          return;
        }catch(shareError){
          if(shareError?.name==="AbortError")return;
          console.warn("Native file share failed",shareError);
        }
      }

      const url=URL.createObjectURL(blob);
      const preview=window.open(url,"_blank");
      if(!preview){
        const link=document.createElement("a");
        link.href=url;
        link.download=file.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch(error){
      setError(error.response?.data?.message||error.message||"تعذر مشاركة صورة كشف الحساب");
    }
  }

  async function saveTransaction(event){
    event.preventDefault();
    try{
      await api.patch(`/transactions/${editingTransaction.id}`,editingTransaction);
      setEditingTransaction(null);
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر تعديل الحوالة");
    }
  }

  async function deleteTransaction(transactionId){
    if(!await confirmAction({title:"تأكيد حذف الحوالة",message:"هل أنت متأكد من حذف الحوالة؟ سيتم حذف دفعاتها منطقيًا.",confirmText:"حذف الحوالة"}))return;
    try{
      await api.delete(`/transactions/${transactionId}`);
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر حذف الحوالة");
    }
  }

  async function savePayment(event){
    event.preventDefault();
    try{
      await api.patch(`/payments/${editingPayment.id}`,editingPayment);
      setEditingPayment(null);
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر تعديل الدفعة");
    }
  }

  async function deletePayment(paymentId){
    if(!await confirmAction({title:"تأكيد حذف الدفعة",message:"هل تريد حذف هذه الدفعة؟",confirmText:"حذف الدفعة"}))return;
    try{
      await api.delete(`/payments/${paymentId}`);
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر حذف الدفعة");
    }
  }

  if(loading)return <><button onClick={back}>رجوع</button><p>جاري تحميل ملف العميل...</p></>;
  if(error&&!data)return <div className="card customer-error"><button onClick={back}>رجوع</button><h3>تعذر فتح ملف العميل</h3><p>{error}</p><button onClick={load}>إعادة المحاولة</button></div>;

  const customer=data?.customer||{};
  const transactions=Array.isArray(data?.transactions)?data.transactions:[];
  const payments=Array.isArray(data?.payments)?data.payments:[];
  const unpaidTransactions=transactions.filter(transaction=>Number(transaction?.remaining||0)>0);
  const transactionRows=transactions.map(transaction=>{
    const usdAmount=Number(transaction.usdAmount ?? transaction.amount ?? 0);
    const exchangeRate=Number(transaction.customerRate ?? transaction.finalRate ?? 0);
    const cadValue=Number(
      transaction.formulaResultCad ??
      transaction.totalCad ??
      (usdAmount*exchangeRate)
    );
    return {transaction,usdAmount,exchangeRate,cadValue};
  });
  const totalTransactionUsd=transactionRows.reduce((sum,row)=>sum+row.usdAmount,0);
  const totalTransactionCad=transactionRows.reduce((sum,row)=>sum+row.cadValue,0);
  const averageExchangeRate=transactionRows.length
    ? transactionRows.reduce((sum,row)=>sum+row.exchangeRate,0)/transactionRows.length
    : 0;

  return <div className="customer-details-page">
    <div className="card no-print form">
      <button onClick={back}>رجوع</button>
      <button onClick={()=>onStatement(id)}>كشف حساب العميل</button>
      <button className="whatsapp-text-button" onClick={shareCustomerStatementText}>💬 إرسال رسالة نصية عبر واتساب</button>
      <button className="whatsapp-image-button" onClick={()=>shareCustomerStatement("share")}>📤 مشاركة صورة كشف الحساب</button>
      <button className="statement-save-image-button" onClick={()=>shareCustomerStatement("save")}>💾 حفظ الصورة</button>
    </div>

    <h2>{customer.name||"العميل"}</h2>
    {error&&<div className="card customer-error">{error}</div>}

    <div className="stats">
      <form className="card old-balance-card old-balance-edit-card" onSubmit={saveOldBalance}>
        <span>الحساب القديم</span>
        <input
          type="number"
          min="0"
          step=".01"
          inputMode="decimal"
          value={oldBalanceForm}
          onChange={event=>setOldBalanceForm(event.target.value)}
          placeholder="اكتب الحساب القديم"
        />
        <small>المتبقي: {cad(customer.oldBalanceRemaining||0)}</small>
        <button type="submit" disabled={savingOldBalance}>
          {savingOldBalance?"جاري الحفظ...":"حفظ الحساب القديم"}
        </button>
      </form>
      <div className="card"><span>إجمالي الحساب</span><strong>{cad(customer.totalTransactions)}</strong></div>
      <div className="card"><span>المدفوع</span><strong>{cad(customer.totalPaid)}</strong></div>
      <div className="card final"><span>الحساب النهائي</span><strong>{cad(customer.finalBalance)}</strong></div>
    </div>

    {Number(customer.finalBalance||0)>0.0001&&
      <form className="card form" onSubmit={addPayment}>
        <h3>إضافة دفعة</h3>
        <p className="payment-auto-note">تُوزع الدفعة على أقدم الحوالات أولًا، ثم يُخصم الباقي من الحساب القديم.</p>
        <input type="number" min=".01" step=".01" value={paymentForm.amount} onChange={e=>setPaymentForm({...paymentForm,amount:e.target.value})} placeholder="المبلغ" required/>
        <input type="date" value={paymentForm.paymentDate} onChange={e=>setPaymentForm({...paymentForm,paymentDate:e.target.value})}/>
        <select value={paymentForm.method} onChange={e=>setPaymentForm({...paymentForm,method:e.target.value})}>
          <option value="CASH">نقدي</option>
          <option value="BANK">بنك</option>
          <option value="TRANSFER">تحويل</option>
          <option value="CARD">بطاقة</option>
        </select>
        <input value={paymentForm.reference} onChange={e=>setPaymentForm({...paymentForm,reference:e.target.value})} placeholder="رقم المرجع"/>
        <input value={paymentForm.notes} onChange={e=>setPaymentForm({...paymentForm,notes:e.target.value})} placeholder="ملاحظات"/>
        <button>حفظ الدفعة</button>
      </form>
    }

    {editingTransaction&&
      <form className="card form edit-panel" onSubmit={saveTransaction}>
        <h3>تعديل الحوالة {editingTransaction.number}</h3>
        <input type="date" value={editingTransaction.transferDate||""} onChange={e=>setEditingTransaction({...editingTransaction,transferDate:e.target.value})}/>
        <input type="number" step=".01" value={editingTransaction.amount} onChange={e=>setEditingTransaction({...editingTransaction,amount:e.target.value})} placeholder="المبلغ"/>
        <input type="number" step=".0001" value={editingTransaction.costRate} onChange={e=>setEditingTransaction({...editingTransaction,costRate:e.target.value})} placeholder="سعر التكلفة (CAD)"/>
        <input type="number" step=".0001" value={editingTransaction.finalRate} onChange={e=>setEditingTransaction({...editingTransaction,finalRate:e.target.value})} placeholder="سعر الحوالة (CAD)"/>
        <input type="number" step=".01" value={editingTransaction.transferFee} onChange={e=>setEditingTransaction({...editingTransaction,transferFee:e.target.value})} placeholder="الأجور"/>
        <select value={editingTransaction.feeMethod} onChange={e=>setEditingTransaction({...editingTransaction,feeMethod:e.target.value})}>
          <option value="ADD">إضافة الأجور</option>
          <option value="DEDUCT">خصم الأجور</option>
        </select>
        <button>حفظ التعديل</button>
        <button type="button" onClick={()=>setEditingTransaction(null)}>إلغاء</button>
      </form>
    }

    {editingPayment&&
      <form className="card form edit-panel" onSubmit={savePayment}>
        <h3>تعديل الدفعة</h3>
        <input type="number" min=".01" step=".01" value={editingPayment.amount} readOnly={Boolean(editingPayment.isGroupedPayment)} onChange={e=>setEditingPayment({...editingPayment,amount:e.target.value})}/>
        {editingPayment.isGroupedPayment&&<small className="payment-auto-note">مبلغ الدفعة الأصلية ثابت لأنه موزع على عدة حوالات. يمكنك تعديل التاريخ والطريقة والمرجع والملاحظات، أو حذف الدفعة وتسجيلها من جديد.</small>}
        <input type="date" value={editingPayment.paymentDate||String(editingPayment.date||"").slice(0,10)} onChange={e=>setEditingPayment({...editingPayment,paymentDate:e.target.value})}/>
        <select value={editingPayment.method||"CASH"} onChange={e=>setEditingPayment({...editingPayment,method:e.target.value})}>
          <option value="CASH">نقدي</option>
          <option value="BANK">بنك</option>
          <option value="TRANSFER">تحويل</option>
          <option value="CARD">بطاقة</option>
        </select>
        <input value={editingPayment.reference||""} onChange={e=>setEditingPayment({...editingPayment,reference:e.target.value})} placeholder="المرجع"/>
        <input value={editingPayment.notes||""} onChange={e=>setEditingPayment({...editingPayment,notes:e.target.value})} placeholder="ملاحظات"/>
        <button>حفظ التعديل</button>
        <button type="button" onClick={()=>setEditingPayment(null)}>إلغاء</button>
      </form>
    }

    <section className="customer-transfer-ledger">
      <div className="customer-transfer-heading">
        <div>
          <h3>سجل الحوالات</h3>
          <p>عرض حوالات العميل بالدولار الأمريكي وقيمتها النهائية بالدولار الكندي.</p>
        </div>
      </div>

      <div className="customer-transfer-summary">
        <div className="customer-transfer-summary-card usd"><span>إجمالي الحوالات (USD)</span><strong>{money(totalTransactionUsd)} USD</strong></div>
        <div className="customer-transfer-summary-card rate"><span>متوسط سعر التحويل</span><strong>{averageExchangeRate.toFixed(4)}</strong></div>
        <div className="customer-transfer-summary-card cad"><span>إجمالي القيمة (CAD)</span><strong>{money(totalTransactionCad)} CAD</strong></div>
        <div className="customer-transfer-summary-card count"><span>عدد الحوالات</span><strong>{transactionRows.length}</strong></div>
      </div>

      <div className="card tablewrap customer-transfer-tablewrap">
        <AppTable tableClassName="customer-transfer-table">
          <thead><tr><th>رقم الحوالة</th><th>تاريخ الحوالة</th><th>المبلغ بالدولار الأمريكي (USD)</th><th>سعر التحويل</th><th>القيمة بالدولار الكندي (CAD)</th><th>الإجراءات</th></tr></thead>
          <tbody>{transactionRows.length?transactionRows.map(({transaction,usdAmount,exchangeRate,cadValue})=><tr key={transaction.id}>
            <td className="customer-transfer-number">{transaction.number}</td>
            <td>{transaction.transferDate||String(transaction.createdAt||"").slice(0,10)}</td>
            <td className="customer-transfer-usd">{money(usdAmount)} USD</td>
            <td className="customer-transfer-rate">{exchangeRate.toFixed(4)}</td>
            <td className="customer-transfer-cad">{money(cadValue)} CAD</td>
            <td className="actions customer-transfer-actions">
              <button onClick={()=>setEditingTransaction({...transaction})}>تعديل</button>
              <button className="danger-button" onClick={()=>deleteTransaction(transaction.id)}>حذف</button>
            </td>
          </tr>):<tr><td colSpan="6">لا توجد حوالات.</td></tr>}</tbody>
        </AppTable>
      </div>
    </section>

    <div className="card tablewrap">
      <h3>سجل الدفعات</h3>
      <AppTable>
        <thead><tr><th>التاريخ</th><th>البيان</th><th>المبلغ الكامل</th><th>طريقة الدفع</th><th>المرجع</th><th>تفاصيل التوزيع</th><th>الإجراءات</th></tr></thead>
        <tbody>{payments.length?payments.map(payment=>{
          const transaction=transactions.find(item=>item.id===payment.transactionId);
          const allocations=Array.isArray(payment.allocations)?payment.allocations:[];
          return <tr key={payment.id}>
            <td>{payment.paymentDate||String(payment.date||"").slice(0,10)}</td>
            <td>{payment.isGroupedPayment?"دفعة من العميل":transaction?.number||"دفعة حوالة"}</td>
            <td><strong>{money(payment.amount)} CAD</strong></td>
            <td>{payment.method||"-"}</td>
            <td>{payment.reference||"-"}</td>
            <td>{(allocations.length||Number(payment.oldBalanceAllocation||0)>0)?
              <details className="payment-allocation-details"><summary>عرض التوزيع</summary>{allocations.map((allocation,index)=>{
                const allocatedTransaction=transactions.find(item=>item.id===allocation.transactionId);
                return <div key={`${payment.id}-${allocation.transactionId||index}`}>{allocatedTransaction?.number||allocation.transactionId||"حوالة"} — {money(allocation.amount)} CAD</div>
              })}{Number(payment.oldBalanceAllocation||0)>0&&<div>الحساب القديم — {money(payment.oldBalanceAllocation)} CAD</div>}</details>
              :transaction?.number||"—"}</td>
            <td className="actions">
              <button onClick={()=>setEditingPayment({...payment})}>تعديل</button>
              <button className="danger-button" onClick={()=>deletePayment(payment.id)}>حذف</button>
            </td>
          </tr>
        }):<tr><td colSpan="7">لا توجد دفعات.</td></tr>}</tbody>
      </AppTable>
    </div>
  </div>;
}

export function Invoice({transactionId,back}){
  const [data,setData]=useState(null);
  const [error,setError]=useState("");

  useEffect(()=>{
    cachedGet(`/transactions/${transactionId}/invoice`)
      .then(response=>setData(response.data))
      .catch(requestError=>setError(requestError.response?.data?.message||"تعذر تحميل الفاتورة"));
  },[transactionId]);

  function sendWhatsApp(){
    if(!data)return;
    const phone=String(data.customer.phone||"").replace(/\D/g,"");
    if(!phone){
      setError("لا يوجد رقم هاتف محفوظ للعميل");
      return;
    }
    const message=[
      `السلام عليكم ${data.customer.name}،`,
      `فاتورتكم من شركة العبود للتجارة`,
      `رقم الفاتورة: ${data.invoiceNumber}`,
      `التاريخ: ${data.invoiceDate}`,
      `الإجمالي: ${money(data.transaction.totalCustomerDue)}`,
      `المدفوع: ${money(data.transaction.paid)}`,
      `المتبقي: ${money(data.transaction.remaining)}`
    ].join("\n");
    openRegularWhatsApp(phone,message);
  }

  if(error&&!data)return <div className="card customer-error"><button onClick={back}>رجوع</button><p>{error}</p></div>;
  if(!data)return <p>جاري تحميل الفاتورة...</p>;

  const t=data.transaction;

  return <>
    <div className="card no-print form">
      <button onClick={back}>رجوع</button>
      <button onClick={()=>window.print()}>طباعة / حفظ PDF</button>
      <button onClick={sendWhatsApp}>إرسال عبر واتساب</button>
    </div>

    {error&&<div className="card customer-error">{error}</div>}

    <section className="invoice-sheet">
      <div className="invoice-header">
        <div>
          <h1>{data.company.name}</h1>
          <p>{data.company.nameEn}</p>
          <h3>فاتورة حوالة مالية</h3>
        </div>
        <div>
          <p><strong>رقم الفاتورة:</strong> {data.invoiceNumber}</p>
          <p><strong>تاريخ الحوالة:</strong> {data.invoiceDate}</p>
        </div>
      </div>

      <div className="invoice-customer">
        <p><strong>اسم العميل:</strong> {data.customer.name}</p>
        <p><strong>الهاتف:</strong> {data.customer.phone||"-"}</p>
        <p><strong>البريد:</strong> {data.customer.email||"-"}</p>
      </div>

      <AppTable>
        <tbody>
          <tr><th>مبلغ الحوالة</th><td>{money(t.amount)}</td></tr>
          <tr><th>سعر الحوالة</th><td>{Number(t.finalRate||0).toFixed(4)}</td></tr>
          <tr><th>أجور الحوالة</th><td>{money(t.transferFee)}</td></tr>
          <tr><th>الإجمالي المطلوب</th><td>{money(t.totalCustomerDue)}</td></tr>
          <tr><th>المدفوع</th><td>{money(t.paid)}</td></tr>
          <tr><th>المتبقي</th><td><strong>{money(t.remaining)}</strong></td></tr>
        </tbody>
      </AppTable>

      <p className="invoice-note">شكراً لتعاملكم مع شركة العبود للتجارة.</p>
    </section>
  </>;
}

export function Statement({customerId,back}){
  const [filters,setFilters]=useState({from:"",to:""});
  const [data,setData]=useState(null);
  const [error,setError]=useState("");

  async function load(){
    setError("");
    try{
      const response=await cachedGet(`/customers/${customerId}/statement`,{params:filters});
      setData(response.data);
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر إنشاء كشف الحساب");
    }
  }

  useEffect(()=>{load();},[customerId]);

  return <>
    <div className="card no-print statement-toolbar">
      <button onClick={back}>رجوع</button>
      <input type="date" value={filters.from} onChange={e=>setFilters({...filters,from:e.target.value})}/>
      <input type="date" value={filters.to} onChange={e=>setFilters({...filters,to:e.target.value})}/>
      <button onClick={load}>عرض كشف الحساب</button>
      <button onClick={()=>window.print()} disabled={!data}>طباعة / حفظ PDF</button>
    </div>

    {error&&<div className="card customer-error">{error}</div>}

    {data&&<section className="invoice-sheet simple-customer-statement" dir="rtl">
      <div className="simple-statement-heading">
        {data.company.logoDataUrl&&<img src={data.company.logoDataUrl} alt={data.company.name}/>}
        <h1>{data.company.name}</h1>
        <h2>كشف حساب العميل</h2>
        <h3>{data.customer.name}</h3>
      </div>

      <div className="tablewrap">
        <AppTable tableClassName="simple-statement-table">
          <thead>
            <tr>
              <th>#</th>
              <th>مبلغ الحوالة</th>
              <th>سعر التحويل</th>
              <th>النتيجة</th>
            </tr>
          </thead>
          <tbody>
            {data.transactions.length?
              data.transactions.map((item,index)=><tr key={item.id}>
                <td>{index+1}</td>
                <td>{Number(item.usdAmount).toFixed(2)} 🇺🇸</td>
                <td>× {Number(item.customerRate).toFixed(4).replace(/0+$/,"").replace(/\.$/,"")} =</td>
                <td>{money(item.formulaResultCad)} 🇨🇦</td>
              </tr>)
              :<tr><td colSpan="4">لا توجد حوالات في هذه الفترة.</td></tr>
            }
          </tbody>
        </AppTable>
      </div>


      <div className="tablewrap statement-payments-ledger">
        <h3>الدفعات المسجلة</h3>
        <AppTable tableClassName="simple-statement-table">
          <thead><tr><th>#</th><th>تاريخ الدفعة</th><th>البيان</th><th>قيمة الدفعة</th></tr></thead>
          <tbody>{Array.isArray(data.payments)&&data.payments.length?
            data.payments.map((payment,index)=><tr key={payment.id||index}>
              <td>{index+1}</td>
              <td>{payment.paymentDate||String(payment.date||payment.createdAt||"").slice(0,10)}</td>
              <td>{payment.notes||"دفعة من العميل"}</td>
              <td><strong>{money(payment.amount)} CAD</strong></td>
            </tr>)
            :<tr><td colSpan="4">لا توجد دفعات في هذه الفترة.</td></tr>}
          </tbody>
        </AppTable>
      </div>

      <div className="simple-statement-old-balance">
        <span>الحساب القديم:</span>
        <strong>{money(data.totals.oldBalance||0)} 🇨🇦</strong>
      </div>
      <div className="simple-statement-payments">
        <span>الدفعات:</span>
        <strong>{money(data.totals.paid||0)} 🇨🇦</strong>
      </div>
      <div className="simple-statement-total">
        <span>المجموع النهائي:</span>
        <strong>{money(Math.max(
          Number(data.totals.remaining ?? (
            Number(data.totals.formulaResultCad ?? data.transactions.reduce((sum,item)=>sum+Number(item.formulaResultCad||0),0))
            + Number(data.totals.oldBalance||0)
            - Number(data.totals.paid||0)
          )),
          0
        ))} 🇨🇦</strong>
      </div>
    </section>}
  </>;
}

