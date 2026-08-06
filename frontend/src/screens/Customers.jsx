import React,{useEffect,useMemo,useRef,useState} from "react";
import api,{cachedGet} from "../api";
import {APP_VERSION} from "../version";
import {AppPagination} from "../components/ui";
import {CustomerToolbar,CustomerListControls} from "../components/customers/CustomerToolbar";
import {money,cad,openRegularWhatsApp,currencyFlag,flagOf,cleanConnectorMessage,EXCHANGE_CURRENCY_CATALOG,debtCurrencies,CurrencyFlag,rateTrend,confirmAction} from "../shared";
import {authoritativeCustomerRate} from "../customerRate";


export function Customers({open}){
  const [list,setList]=useState([]);
  const [customerOptions,setCustomerOptions]=useState([]);
  const [search,setSearch]=useState("");
  const [page,setPage]=useState(1);
  const pageSize=20;
  const [serverTotal,setServerTotal]=useState(0);
  const [serverTotalPages,setServerTotalPages]=useState(1);
  const [totalCustomerDebt,setTotalCustomerDebt]=useState(0);
  const [sortMode,setSortMode]=useState(()=>{
    try{return localStorage.getItem("alaboud_customer_sort")||"name-asc"}catch{return "name-asc"}
  });
  const [error,setError]=useState("");

  const [customerForm,setCustomerForm]=useState({customerNumber:"",name:"",phone:"",email:"",oldBalance:""});
  const [editingCustomer,setEditingCustomer]=useState(null);
  const [duplicateCustomer,setDuplicateCustomer]=useState(null);

  const [transferForm,setTransferForm]=useState({
    customerId:"",
    currency:"USD",
    amount:"",
    costRate:"",
    finalRate:"",
    transferFee:"0",
    feeMethod:"ADD",
    paymentStatus:"UNPAID",
    transferDate:new Date().toISOString().slice(0,10),
    rateMode:"auto",
    rateSource:"exchange-rates",
    rateUpdatedAt:null
  });
  const [selectedRateMeta,setSelectedRateMeta]=useState(null);

  const [paymentForm,setPaymentForm]=useState({
    customerId:"",
    amount:"",
    paymentDate:new Date().toISOString().slice(0,10),
    method:"CASH",
    reference:""
  });

  const [activePanel,setActivePanel]=useState("");

  const serverSortMode=true;

  async function loadDebtSummary(){
    try{
      const response=await cachedGet("/customers/debt-summary",{cacheTtl:0});
      setTotalCustomerDebt(Number(response.data?.totalDebtCad||0));
    }catch{
      // لا نعطل قائمة العملاء إذا تعذر تحميل الملخص مؤقتًا.
    }
  }

  async function load(requestedSort=sortMode,requestedSearch=search,requestedPage=page){
    setError("");
    try{
      const params={page:requestedPage,pageSize,sort:requestedSort,search:requestedSearch.trim()};
      const customersResponse=await cachedGet("/customers",{params,cacheTtl:30*1000});
      const payload=customersResponse.data;
      if(payload&&Array.isArray(payload.items)){
        setList(payload.items);
        setServerTotal(Number(payload.total||0));
        setServerTotalPages(Math.max(1,Number(payload.totalPages||1)));
      }else{
        const rows=Array.isArray(payload)?payload:[];
        setList(rows);
        setServerTotal(rows.length);
        setServerTotalPages(Math.max(1,Math.ceil(rows.length/pageSize)));
      }
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر تحميل العملاء");
    }
  }

  useEffect(()=>{
    cachedGet("/customers/options",{params:{limit:500},cacheTtl:2*60*1000})
      .then(response=>setCustomerOptions(Array.isArray(response.data)?response.data:[]))
      .catch(()=>setCustomerOptions([]));
  },[]);

  useEffect(()=>{
    const timer=setTimeout(()=>load(sortMode,search,page),300);
    return()=>clearTimeout(timer);
  },[sortMode,search,page]);

  useEffect(()=>{loadDebtSummary()},[]);

  useEffect(()=>{setPage(1)},[sortMode,search]);

  useEffect(()=>{
    if(activePanel!=="transfer"||!transferForm.currency)return;

    if(transferForm.currency==="CAD"){
      setSelectedRateMeta({
        baseCurrency:"CAD",
        quoteCurrency:"CAD",
        buyRate:1,
        sellRate:1,
        createdAt:new Date().toISOString(),
        source:"base"
      });
      setTransferForm(current=>current.rateMode==="auto"
        ? {...current,costRate:"1",rateSource:"base",rateUpdatedAt:new Date().toISOString()}
        : current
      );
      return;
    }

    cachedGet("/exchange-rates")
      .then(response=>{
        const rates=Array.isArray(response.data)?response.data:[];
        const direct=rates.find(item=>
          String(item.baseCurrency||"").toUpperCase()===transferForm.currency &&
          String(item.quoteCurrency||"").toUpperCase()==="CAD"
        );

        if(!direct){
          setSelectedRateMeta(null);
          if(transferForm.rateMode==="auto"){
            setTransferForm(current=>({...current,costRate:"",rateUpdatedAt:null}));
          }
          return;
        }

        const automaticRate=Number(direct.buyRate||direct.sellRate||0);
        setSelectedRateMeta(direct);
        if(automaticRate>0&&transferForm.rateMode==="auto"){
          setTransferForm(current=>({
            ...current,
            costRate:String(automaticRate),
            rateSource:"exchange-rates",
            rateUpdatedAt:direct.createdAt||null
          }));
        }
      })
      .catch(()=>{
        setSelectedRateMeta(null);
        if(transferForm.rateMode==="auto"){
          setTransferForm(current=>({...current,costRate:"",rateUpdatedAt:null}));
        }
      });
  },[activePanel,transferForm.currency,transferForm.rateMode]);

  async function addCustomer(event){
    event.preventDefault();
    setDuplicateCustomer(null);
    try{
      const response=await api.post("/customers",customerForm);
      const created=response.data;
      setCustomerForm({customerNumber:"",name:"",phone:"",email:"",oldBalance:""});
      setError("✅ تم حفظ العميل بنجاح");
      setActivePanel("");
      setServerTotal(total=>total+1);
      setList(current=>{
        const rows=[created,...current.filter(item=>item.id!==created.id)];
        return rows.slice(0,pageSize);
      });
      if(Number(created?.finalBalance||created?.oldBalance||0)>0){
        setTotalCustomerDebt(total=>+(total+Number(created.finalBalance||created.oldBalance||0)).toFixed(2));
      }
      void load(sortMode,search,page);
      void loadDebtSummary();
    }catch(requestError){
      const existing=requestError.response?.data?.existingCustomer||null;
      setDuplicateCustomer(existing);
      setError(requestError.response?.data?.message||"تعذر إضافة العميل");
    }
  }

  async function saveCustomer(event){
    event.preventDefault();
    setDuplicateCustomer(null);
    try{
      await api.patch(`/customers/${editingCustomer.id}`,editingCustomer);
      setEditingCustomer(null);
      setActivePanel("");
      await load();
      await loadDebtSummary();
    }catch(requestError){
      const existing=requestError.response?.data?.existingCustomer||null;
      setDuplicateCustomer(existing);
      setError(requestError.response?.data?.message||"تعذر تعديل العميل");
    }
  }

  async function deleteCustomer(customer){
    const confirmed=await confirmAction({title:"تأكيد حذف العميل",message:`هل أنت متأكد من حذف العميل «${customer.name}»؟\nسيتم إخفاء العميل مع الحفاظ على السجلات المالية المرتبطة به.`,confirmText:"حذف العميل"});
    if(!confirmed)return;
    setError("");
    try{
      await api.delete(`/customers/${customer.id}`);
      if(editingCustomer?.id===customer.id)setEditingCustomer(null);
      await load();
      await loadDebtSummary();
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر حذف العميل");
    }
  }

  async function resetCustomerAccount(customer){
    const balance=Number(customer.finalBalance||0).toFixed(2);
    const confirmed=await confirmAction({title:"تأكيد تصفير الحساب",message:`تصفير حساب العميل «${customer.name}»؟\n\nالرصيد الحالي: ${balance} CAD\nسيبدأ حساب جديد من الصفر، ولن تظهر الحوالات والدفعات السابقة في الحساب الجديد.\nلن يتم حذف أي بيانات وسيبقى الحساب السابق محفوظًا في الأرشيف.`,confirmText:"تصفير الحساب",tone:"warning"});
    if(!confirmed)return;
    setError("");
    try{
      await api.post(`/customers/${customer.id}/reset-account`,{});
      if(editingCustomer?.id===customer.id)setEditingCustomer(null);
      await load();
      await loadDebtSummary();
      window.alert("تم تصفير الحساب وبدء حساب جديد بنجاح. الحساب السابق محفوظ في الأرشيف.");
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر تصفير حساب العميل");
    }
  }

  function prepareTransfer(customer){
    setTransferForm({
      customerId:customer.id,
      currency:"USD",
      amount:"",
      costRate:"",
      finalRate:"",
      transferFee:"0",
      feeMethod:"ADD",
      paymentStatus:"UNPAID",
      transferDate:new Date().toISOString().slice(0,10),
      rateMode:"auto",
      rateSource:"exchange-rates",
      rateUpdatedAt:null
    });
    setActivePanel("transfer");
    window.scrollTo({top:0,behavior:"smooth"});
  }

  async function addTransfer(event){
    event.preventDefault();
    try{
      const transactionResponse=await api.post("/transactions",{
        ...transferForm,
        amount:Number(transferForm.amount),
        costRate:Number(transferForm.costRate),
        finalRate:Number(transferForm.finalRate),
        transferFee:Number(transferForm.transferFee||0),
        rateSource:transferForm.rateMode==="auto"?"exchange-rates":"manual",
        rateUpdatedAt:transferForm.rateUpdatedAt||selectedRateMeta?.createdAt||null
      });

      const createdTransaction=transactionResponse.data;
      if(transferForm.paymentStatus==="PAID"&&createdTransaction?.id&&Number(createdTransaction.totalCustomerDue)>0){
        await api.post(`/transactions/${createdTransaction.id}/payments`,{
          amount:Number(createdTransaction.totalCustomerDue),
          paymentDate:transferForm.transferDate||new Date().toISOString().slice(0,10),
          method:"CASH",
          notes:"تم تسجيل الحوالة كمدفوعة عند الإنشاء"
        });
      }

      setTransferForm({
        customerId:"",
        currency:"USD",
        amount:"",
        costRate:"",
        finalRate:"",
        transferFee:"0",
        feeMethod:"ADD",
        paymentStatus:"UNPAID",
        transferDate:new Date().toISOString().slice(0,10),
        rateMode:"auto",
        rateSource:"exchange-rates",
        rateUpdatedAt:null
      });
      setSelectedRateMeta(null);
      setActivePanel("");
      await load();
      await loadDebtSummary();
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر إضافة الحوالة");
    }
  }

  function preparePayment(customer){
    setPaymentForm({
      customerId:customer.id,
      amount:"",
      paymentDate:new Date().toISOString().slice(0,10),
      method:"CASH",
      reference:""
    });
    setActivePanel("payment");
    window.scrollTo({top:0,behavior:"smooth"});
  }

  async function addPayment(event){
    event.preventDefault();
    try{
      if(!paymentForm.customerId)throw new Error("اختر العميل");
      await api.post(`/customers/${paymentForm.customerId}/payments`,{
        amount:Number(paymentForm.amount),
        paymentDate:paymentForm.paymentDate,
        method:paymentForm.method,
        reference:paymentForm.reference
      });
      setPaymentForm({
        customerId:"",
        amount:"",
        paymentDate:new Date().toISOString().slice(0,10),
        method:"CASH",
        reference:""
      });
      setActivePanel("");
      await load();
      await loadDebtSummary();
    }catch(error){
      setError(error.response?.data?.message||error.message||"تعذر إضافة الدفعة");
    }
  }

  function createStatementImage(data,customer){
    const rows=Array.isArray(data.transactions)?data.transactions:[];
    const width=1080,rowHeight=82;
    const height=Math.max(1350,390+rows.length*rowHeight+440);
    const canvas=document.createElement("canvas");
    canvas.width=720;canvas.height=Math.ceil(height*2/3);
    const ctx=canvas.getContext("2d");
      ctx.scale(2/3,2/3);
    const total=Number(data.totals?.formulaResultCad||0);
    const paid=Number(data.totals?.paid||0);
    const finalBalance=Math.max(total-paid,0);
    const txt=(v,x,y,size,color="#f4f4f5",align="center",weight="700")=>{
      ctx.fillStyle=color;ctx.font=`${weight} ${size}px Arial, sans-serif`;
      ctx.textAlign=align;ctx.textBaseline="middle";ctx.direction="rtl";ctx.fillText(String(v),x,y);
    };
    ctx.fillStyle="#061018";ctx.fillRect(0,0,width,height);
    const g=ctx.createLinearGradient(0,0,width,height);
    g.addColorStop(0,"#15232f");g.addColorStop(1,"#08131c");
    ctx.fillStyle=g;ctx.beginPath();ctx.roundRect(28,28,width-56,height-56,38);ctx.fill();
    ctx.strokeStyle="#47545e";ctx.lineWidth=2;ctx.stroke();
    txt(data.company?.name||"شركة العبود للتجارة",width/2,90,56);
    txt("كشف حساب العميل",width/2,165,48,"#d8a33f");
    txt(customer.name,width/2,235,41);
    ctx.strokeStyle="#69747c";ctx.beginPath();ctx.moveTo(55,292);ctx.lineTo(width-55,292);ctx.stroke();
    let y=345;
    rows.forEach((item,index)=>{
      const amount=Number(item.usdAmount||item.amount||0).toFixed(2).replace(/\.00$/,"");
      const rate=authoritativeCustomerRate(item).toFixed(4).replace(/0+$/,"").replace(/\.$/,"");
      ctx.direction="ltr";ctx.textAlign="left";ctx.fillStyle="#f4f4f5";
      ctx.font='700 39px Arial, sans-serif';
      ctx.fillText(`${index+1}_  ${amount}  🇺🇸  ×  ${rate}  =  ${money(item.formulaResultCad)}  🇨🇦`,65,y);
      ctx.strokeStyle="#2b3a45";ctx.beginPath();ctx.moveTo(55,y+38);ctx.lineTo(width-55,y+38);ctx.stroke();
      y+=rowHeight;
    });
    y+=25;ctx.setLineDash([12,10]);ctx.strokeStyle="#65717a";ctx.beginPath();ctx.moveTo(55,y);ctx.lineTo(width-55,y);ctx.stroke();ctx.setLineDash([]);
    y+=75;txt("💵  المجموع الإجمالي",90,y,38,"#f4f4f5","left");txt(`${money(total)}  🇨🇦`,width-75,y,43,"#f4f4f5","right","800");
    y+=88;txt("👛  الدفعات",90,y,38,"#f4f4f5","left");txt(`${money(paid)}  🇨🇦`,width-75,y,43,"#ef4444","right","800");
    y+=65;ctx.setLineDash([12,10]);ctx.strokeStyle="#65717a";ctx.beginPath();ctx.moveTo(55,y);ctx.lineTo(width-55,y);ctx.stroke();ctx.setLineDash([]);
    y+=88;txt("🧮  المجموع النهائي",90,y,42,"#f4f4f5","left","800");txt(`${money(finalBalance)}  🇨🇦`,width-75,y,49,"#63c443","right","900");
    y+=90;ctx.strokeStyle="#69747c";ctx.beginPath();ctx.moveTo(55,y);ctx.lineTo(width-55,y);ctx.stroke();
    y+=62;const d=new Date();txt(`📅 التاريخ: ${d.toLocaleDateString("en-CA")}`,65,y,28,"#aeb7bf","left","500");txt(`🕘 الوقت: ${d.toLocaleTimeString("ar-CA",{hour:"2-digit",minute:"2-digit"})}`,width-65,y,28,"#aeb7bf","right","500");
    y+=65;txt("شكراً لتعاملكم معنا",width/2,y,34,"#d8a33f");
    return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("تعذر إنشاء الصورة")),"image/png",0.96));
  }

  async function shareStatementImage(customer){
    try{
      const {data}=await cachedGet(`/customers/${customer.id}/statement`);
      const blob=await createStatementImage(data,customer);
      const safe=String(customer.name||"customer").replace(/[\\/:*?"<>|]+/g,"-");
      const file=new File([blob],`كشف-حساب-${safe}.png`,{type:"image/png"});
      if(navigator.share){
        try{
          await navigator.share({
            files:[file],
            title:"كشف حساب العميل"
          });
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
        link.target="_blank";
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      setTimeout(()=>URL.revokeObjectURL(url),60000);
      setError("تم فتح صورة كشف الحساب. اضغط مشاركة واختر واتساب.");
    }catch(e){
      if(e?.name==="AbortError")return;
      setError(e.response?.data?.message||e.message||"تعذر إنشاء صورة كشف الحساب");
    }
  }

  async function whatsappFinalBalance(customer, urgent=false){
    const phone=String(customer.phone||"").replace(/\D/g,"");
    if(!phone){
      setError("لا يوجد رقم واتساب محفوظ لهذا العميل");
      return;
    }

    if(urgent){
      const urgentMessage=`السلام عليكم ${customer.name}،
نذكّركم بضرورة تسديد الرصيد المستحق وقدره ${cad(customer.finalBalance)}.
عدد أيام التأخير: ${customer.overdueDays} يوم.
يرجى التواصل معنا لتسوية الحساب.`;
      openRegularWhatsApp(phone,urgentMessage);
      return;
    }

    try{
      const {data}=await cachedGet(`/customers/${customer.id}/statement`);
      const lines=(Array.isArray(data.transactions)?data.transactions:[]).map((item,index)=>{
        const amount=Number(item.usdAmount||0).toFixed(2).replace(/\.00$/,"");
        const rate=authoritativeCustomerRate(item).toFixed(4).replace(/0+$/,"").replace(/\.$/,"");
        return `${index+1}_ ${amount} 🇺🇸 × ${rate} = ${money(item.formulaResultCad)} 🇨🇦`;
      });

      const statementTotal=Number(data.totals?.formulaResultCad||0);
      const statementPaid=Number(data.totals?.paid||0);
      const finalStatementBalance=Math.max(statementTotal-statementPaid,0);

      const message=[
        data.company?.name||"شركة العبود التجارية",
        "",
        "كشف حساب العميل",
        customer.name,
        "",
        ...(Number(customer.oldBalance||0)>0?[`الحساب القديم: ${money(customer.oldBalance)} 🇨🇦`,""]:[]),
        ...lines,
        "",
        "--------------------",
        `الدفعات: ${money(statementPaid)} 🇨🇦`,
        `المجموع النهائي: ${money(finalStatementBalance)} 🇨🇦`
      ].join("\n");

      openRegularWhatsApp(phone,message);
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر تجهيز كشف الحساب للواتساب");
    }
  }

  const visibleCustomers=useMemo(()=>list,[list]);
  const effectiveTotalPages=serverTotalPages;

  useEffect(()=>{
    try{localStorage.setItem("alaboud_customer_sort",sortMode)}catch{}
  },[sortMode]);

  useEffect(()=>{if(page>effectiveTotalPages)setPage(effectiveTotalPages)},[page,effectiveTotalPages]);

  const customerActionFocus=activePanel==="transfer"||activePanel==="payment";

  return <>
    <h2>قائمة العملاء</h2>
    {error&&<div className="card customer-error">{error}</div>}
    {duplicateCustomer&&<div className="card duplicate-customer-alert">
      <div><strong>رقم الهاتف مسجل مسبقًا</strong><span>{duplicateCustomer.name} — {duplicateCustomer.phone||"بدون رقم"}</span></div>
      <button type="button" className="primary" onClick={()=>{setActivePanel("");setEditingCustomer(null);setDuplicateCustomer(null);open(duplicateCustomer.id)}}>فتح ملف العميل</button>
    </div>}

    {!customerActionFocus&&<CustomerToolbar
      activePanel={activePanel}
      totalDebt={totalCustomerDebt}
      onSelect={panel=>{setActivePanel(panel);if(panel==="newCustomer")setEditingCustomer(null)}}
    />}


    {activePanel==="newCustomer"&&
      <form className="card form edit-panel" onSubmit={addCustomer}>
        <h3>إضافة عميل جديد</h3>
        <input value={customerForm.customerNumber} onChange={e=>setCustomerForm({...customerForm,customerNumber:e.target.value})} placeholder="رقم العميل — يترك فارغًا للترقيم التلقائي"/>
        <input value={customerForm.name} onChange={e=>setCustomerForm({...customerForm,name:e.target.value})} placeholder="اسم العميل" required/>
        <input value={customerForm.phone} onChange={e=>setCustomerForm({...customerForm,phone:e.target.value})} placeholder="رقم الهاتف / واتساب"/>
        <input type="email" value={customerForm.email} onChange={e=>setCustomerForm({...customerForm,email:e.target.value})} placeholder="البريد الإلكتروني"/>
        <input type="number" min="0" step=".01" value={customerForm.oldBalance} onChange={e=>setCustomerForm({...customerForm,oldBalance:e.target.value})} placeholder="الحساب القديم (CAD)"/>
        <button>حفظ العميل</button>
        <button type="button" onClick={()=>setActivePanel("")}>إلغاء</button>
      </form>
    }

    {editingCustomer&&
      <form className="card form edit-panel" onSubmit={saveCustomer}>
        <h3>تعديل بيانات العميل</h3>
        <input value={editingCustomer.name||""} onChange={e=>setEditingCustomer({...editingCustomer,name:e.target.value})} placeholder="اسم العميل" required/>
        <input value={editingCustomer.phone||""} onChange={e=>setEditingCustomer({...editingCustomer,phone:e.target.value})} placeholder="رقم الهاتف / واتساب"/>
        <input type="email" value={editingCustomer.email||""} onChange={e=>setEditingCustomer({...editingCustomer,email:e.target.value})} placeholder="البريد الإلكتروني"/>
        <input type="number" min="0" step=".01" value={editingCustomer.oldBalance||""} onChange={e=>setEditingCustomer({...editingCustomer,oldBalance:e.target.value})} placeholder="الحساب القديم (CAD)"/>
        <button>حفظ التعديل</button>
        <button type="button" onClick={()=>setEditingCustomer(null)}>إلغاء</button>
      </form>
    }

    {activePanel==="transfer"&&
      <div className="customer-action-focus-page">
        <div className="customer-action-focus-header">
          <div><span>⇄</span><h2>إضافة حوالة</h2></div>
          <button type="button" onClick={()=>setActivePanel("")}>✕ إغلاق</button>
        </div>
      <form className="card form edit-panel customer-action-focus-form" onSubmit={addTransfer}>
        <h3>إضافة حوالة</h3>
        <select value={transferForm.customerId} onChange={e=>setTransferForm({...transferForm,customerId:e.target.value})} required>
          <option value="">اختر العميل</option>
          {customerOptions.map(customer=><option key={customer.id} value={customer.id}>{customer.name}</option>)}
        </select>
        <input type="date" value={transferForm.transferDate} onChange={e=>setTransferForm({...transferForm,transferDate:e.target.value})}/>
        <label className="currency-field">
          <span className="currency-field-title">عملة الحوالة</span>
          <span className="currency-badge">{transferForm.currency}</span>
          <select value={transferForm.currency} onChange={e=>setTransferForm({...transferForm,currency:e.target.value,costRate:"",finalRate:""})}>
            {["USD","EUR","SYP","AED","GBP","CAD"].map(code=><option key={code} value={code}>{code}</option>)}
          </select>
          <small>اختر العملة المرسلة، وسيتم جلب سعر التكلفة مقابل CAD تلقائيًا</small>
        </label>
        <label className="currency-field">
          <span className="currency-field-title">مبلغ الحوالة</span>
          <span className="currency-badge">{transferForm.currency}</span>
          <input type="number" inputMode="decimal" min=".01" step=".01" value={transferForm.amount} onChange={e=>setTransferForm({...transferForm,amount:e.target.value})} placeholder="0.00" required/>
          <small>المبلغ بعملة {transferForm.currency}</small>
        </label>
        <label className="currency-field">
          <span className="currency-field-title">سعر التكلفة مقابل CAD</span>
          <span className="currency-badge cad">CAD</span>
          <div className="rate-mode-switch">
            <button type="button" className={transferForm.rateMode==="auto"?"active":""} onClick={()=>setTransferForm({...transferForm,rateMode:"auto"})}>السعر الآلي</button>
            <button type="button" className={transferForm.rateMode==="manual"?"active":""} onClick={()=>setTransferForm({...transferForm,rateMode:"manual"})}>سعر يدوي</button>
          </div>
          <input type="number" inputMode="decimal" min=".0000001" step=".0000001" value={transferForm.costRate} onChange={e=>setTransferForm({...transferForm,costRate:e.target.value,rateMode:"manual"})} placeholder="0.0000" required readOnly={transferForm.rateMode==="auto"}/>
          <small>{(selectedRateMeta?.createdAt||selectedRateMeta?.updatedAt)?`آخر تحديث: ${new Date(selectedRateMeta.createdAt||selectedRateMeta.updatedAt).toLocaleString("ar-CA")}`:transferForm.rateMode==="manual"?"يُستخدم هذا السعر لهذه الحوالة فقط":"لا يوجد سعر آلي لهذه العملة؛ اختر سعر يدوي"}</small>
        </label>
        <label className="currency-field">
          <span className="currency-field-title">سعر التحويل للعميل</span>
          <span className="currency-badge cad">CAD</span>
          <input type="number" inputMode="decimal" min=".0001" step=".0001" value={transferForm.finalRate} onChange={e=>setTransferForm({...transferForm,finalRate:e.target.value})} placeholder="0.0000" required/>
          <small>السعر الذي يُحاسب عليه العميل مقابل كل وحدة من عملة الحوالة</small>
        </label>
        <div className="transfer-calculation-grid">
          <div className="transfer-total-preview">
            <span>المجموع النهائي (CAD) للعميل</span>
            <strong>{((Number(transferForm.amount)||0)*(Number(transferForm.finalRate)||0)+(Number(transferForm.transferFee)||0)).toFixed(2)} CAD</strong>
          </div>
          <div className="transfer-profit-preview">
            <span>ربح الحوالة</span>
            <strong>{((Number(transferForm.amount)||0)*((Number(transferForm.finalRate)||0)-(Number(transferForm.costRate)||0))+(Number(transferForm.transferFee)||0)).toFixed(2)} CAD</strong>
          </div>
        </div>
        <label className="currency-field">
          <span className="currency-field-title">أجور الحوالة</span>
          <span className="currency-badge cad">CAD</span>
          <input type="number" inputMode="decimal" min="0" step=".01" value={transferForm.transferFee} onChange={e=>setTransferForm({...transferForm,transferFee:e.target.value})} placeholder="0.00"/>
        </label>
        <div className="transfer-payment-status">
          <div className="transfer-payment-status-title">حالة الحوالة</div>
          <div className="transfer-payment-status-buttons">
            <button
              type="button"
              className={`transfer-status-button paid ${transferForm.paymentStatus==="PAID"?"active":""}`}
              onClick={()=>setTransferForm({...transferForm,paymentStatus:"PAID"})}
            >
              <span className="transfer-status-icon">✓</span>
              <span>مدفوع</span>
            </button>
            <button
              type="button"
              className={`transfer-status-button unpaid ${transferForm.paymentStatus==="UNPAID"?"active":""}`}
              onClick={()=>setTransferForm({...transferForm,paymentStatus:"UNPAID"})}
            >
              <span className="transfer-status-icon">−</span>
              <span>غير مدفوع</span>
            </button>
          </div>
        </div>
        <button className="save-transfer-button">حفظ الحوالة</button>
        <button type="button" onClick={()=>setActivePanel("")}>إلغاء</button>
      </form>
      </div>
    }

    {activePanel==="payment"&&
      <div className="customer-action-focus-page">
        <div className="customer-action-focus-header">
          <div><span>💵</span><h2>إضافة دفعة</h2></div>
          <button type="button" onClick={()=>setActivePanel("")}>✕ إغلاق</button>
        </div>
      <form className="card form edit-panel customer-action-focus-form" onSubmit={addPayment}>
        <h3>إضافة دفعة</h3>
        <p className="payment-auto-note">تُخصم الدفعة تلقائيًا من أقدم الحوالات غير المدفوعة للعميل.</p>
        <select value={paymentForm.customerId} onChange={e=>setPaymentForm({...paymentForm,customerId:e.target.value})} required>
          <option value="">اختر العميل</option>
          {customerOptions.map(customer=><option key={customer.id} value={customer.id}>{customer.name}</option>)}
        </select>
        <input type="number" min=".01" step=".01" value={paymentForm.amount} onChange={e=>setPaymentForm({...paymentForm,amount:e.target.value})} placeholder="مبلغ الدفعة" required/>
        <input type="date" value={paymentForm.paymentDate} onChange={e=>setPaymentForm({...paymentForm,paymentDate:e.target.value})}/>
        <select value={paymentForm.method} onChange={e=>setPaymentForm({...paymentForm,method:e.target.value})}>
          <option value="CASH">نقدي</option>
          <option value="BANK">بنك</option>
          <option value="TRANSFER">تحويل</option>
          <option value="CARD">بطاقة</option>
        </select>
        <input value={paymentForm.reference} onChange={e=>setPaymentForm({...paymentForm,reference:e.target.value})} placeholder="رقم المرجع"/>
        <button>حفظ الدفعة</button>
        <button type="button" onClick={()=>setActivePanel("")}>إلغاء</button>
      </form>
      </div>
    }

    {!customerActionFocus&&activePanel==="list"&&<>

    <div className="customer-list-panel card">
      <div className="customer-list-panel-header">
        <div>
          <h3>📋 قائمة العملاء</h3>
          <small>{serverTotal} عميل</small>
        </div>
        <button type="button" onClick={()=>{setActivePanel("");setSearch("")}}>✕ إغلاق القائمة</button>
      </div>
      <CustomerListControls search={search} onSearch={setSearch} sortMode={sortMode} onSort={setSortMode}/>
    </div>

    <div className="customer-cards customer-list-simple">
      {visibleCustomers.length?visibleCustomers.map(customer=><div
        className={`customer-simple-row customer-row-with-actions ${customer.overdue?"is-overdue":customer.finalBalance>0?"has-balance":"is-paid"}`}
        key={customer.id}
      >
        <button type="button" className="customer-open-button" onClick={()=>open(customer.id)}>
          <div className="customer-simple-main customer-name-only">
            <strong>{customer.name}</strong>
            <small>{customer.phone||"بدون رقم هاتف"}</small>
            {customer.accountResetAt&&<small className="customer-reset-date">حساب جديد منذ {new Date(customer.accountResetAt).toLocaleDateString("ar-CA")}</small>}
          </div>
        </button>
        <div className="customer-row-actions">
          <button
            type="button"
            className="customer-reset-button"
            onClick={()=>resetCustomerAccount(customer)}
            aria-label={`تصفير حساب ${customer.name}`}
          >
            🔄 تصفير الحساب
          </button>
          <button
            type="button"
            className="customer-edit-button"
            onClick={()=>{setEditingCustomer({...customer});setActivePanel("");window.scrollTo({top:0,behavior:"smooth"})}}
            aria-label={`تعديل ${customer.name}`}
          >
            ✏️ تعديل
          </button>
          <button
            type="button"
            className="customer-delete-button"
            onClick={()=>deleteCustomer(customer)}
            aria-label={`حذف ${customer.name}`}
          >
            🗑️ حذف
          </button>
        </div>
      </div>):<div className="card">لا توجد نتائج.</div>}
    </div>
    <AppPagination page={page} totalPages={effectiveTotalPages} onChange={setPage}/>
    </>}
  </>;
}

export function OverdueCustomers({openCustomer,onStatement,navigateCustomers}){
  const [data,setData]=useState({
    count:0,totalOverdue:0,largestOverdueBalance:0,largestOverdueCustomer:null,
    oldestCustomer:null,oldestDays:0,expectedToday:0,rows:[]
  });
  const [search,setSearch]=useState("");
  const [days,setDays]=useState("7");
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [drafts,setDrafts]=useState({});
  const [syncingId,setSyncingId]=useState("");
  const [syncCenter,setSyncCenter]=useState(null);
  const syncingAll=false;
  const autoSyncBusy=useRef(false);

  async function load(requestedSort=sortMode,requestedSearch=search){
    setError("");
    try{
      const response=await cachedGet("/customer-alerts");
      setData(response.data||{rows:[]});
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر تحميل العملاء المتأخرين");
    }
  }

  useEffect(()=>{load();},[]);
  // Partner balances are synchronized manually. Launching a remote-company
  // connector every minute from a browser tab can overload a small cloud instance.



  function updateDraft(customerId,patch){
    setDrafts(current=>({
      ...current,
      [customerId]:{promiseDate:"",expectedAmount:"",notes:"",messageType:"gentle",...(current[customerId]||{}),...patch}
    }));
  }

  function whatsappText(customer,type){
    const templates={
      gentle:[
        `السلام عليكم ${customer.name}،`,
        `نذكّركم بلطف بوجود رصيد مستحق قدره ${cad(customer.finalBalance)}.`,
        `مدة التأخير: ${customer.overdueDays} يوم.`,
        `نرجو التكرم بالسداد في الوقت المناسب.`,
        `شكراً لتعاملكم مع شركة العبود للتجارة.`
      ],
      formal:[
        `السيد/السيدة ${customer.name} المحترم/ة،`,
        `نفيدكم بوجود رصيد مستحق على حسابكم بقيمة ${cad(customer.finalBalance)}.`,
        `وقد تجاوزت مدة التأخير ${customer.overdueDays} يومًا.`,
        `يرجى تسوية الرصيد أو التواصل معنا لتحديد موعد الدفع.`,
        `شركة العبود للتجارة.`
      ],
      statement:[
        `السلام عليكم ${customer.name}،`,
        `ملخص حسابكم الحالي:`,
        `إجمالي الحساب: ${cad(customer.totalTransactions)}`,
        `إجمالي المدفوع: ${cad(customer.totalPaid)}`,
        `الرصيد المتبقي: ${cad(customer.finalBalance)}`,
        `يمكننا تزويدكم بكشف الحساب الكامل عند الطلب.`
      ]
    };
    return (templates[type]||templates.gentle).join("\n");
  }

  async function sendWhatsapp(customer){
    const phone=String(customer.phone||"").replace(/\D/g,"");
    if(!phone){
      setError(`لا يوجد رقم واتساب محفوظ للعميل ${customer.name}`);
      return;
    }
    const type=drafts[customer.id]?.messageType||"gentle";
    openRegularWhatsApp(phone,whatsappText(customer,type));
    try{
      await api.post("/notification-actions",{
        customerId:customer.id,
        action:"WHATSAPP_OPENED",
        notes:`تم فتح رسالة واتساب من النوع ${type}`
      });
      load();
    }catch{}
  }

  async function saveAction(customer,action){
    const draft=drafts[customer.id]||{};
    setError("");
    setSuccess("");
    try{
      await api.post("/notification-actions",{
        customerId:customer.id,
        action,
        notes:draft.notes||"",
        promiseDate:draft.promiseDate||null,
        expectedAmount:draft.expectedAmount||null
      });
      setSuccess(action==="PROMISE_TO_PAY"?"تم حفظ وعد الدفع":"تم تسجيل التواصل والملاحظة");
      updateDraft(customer.id,{notes:""});
      load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر حفظ المتابعة");
    }
  }

  const minDays=Number(days||7);
  const rows=(Array.isArray(data.rows)?data.rows:[])
    .filter(customer=>Number(customer.overdueDays||0)>=minDays)
    .filter(customer=>
      `${customer.name||""} ${customer.phone||""}`.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a,b)=>Number(b.overdueDays||0)-Number(a.overdueDays||0));

  const filteredTotal=rows.reduce((sum,customer)=>sum+Number(customer.finalBalance||0),0);
  const largest=rows.reduce((max,item)=>Number(item.finalBalance||0)>Number(max?.finalBalance||0)?item:max,null);
  const oldest=rows[0];

  function severity(daysLate){
    if(daysLate>=60)return "critical";
    if(daysLate>=30)return "danger";
    if(daysLate>=15)return "warning";
    return "notice";
  }

  return <>
    <div className="dashboard-title">
      <h2>⏰ مركز تحصيل العملاء المتأخرين</h2>
      <button onClick={load}>تحديث القائمة</button>
    </div>

    {error&&<div className="card customer-error">{error}</div>}
    {success&&<div className="card rate-message">{success}</div>}

    <div className="stats overdue-top-stats overdue-dark-scope">
      <div className="card overdue-card"><span>عدد العملاء المتأخرين</span><strong>{rows.length}</strong></div>
      <div className="card overdue-card"><span>إجمالي المبالغ المتأخرة</span><strong>{money(filteredTotal)} CAD</strong></div>
      <div className="card"><span>أكبر رصيد متأخر</span><strong>{money(largest?.finalBalance||0)} CAD</strong><small>{largest?.name||"-"}</small></div>
      <div className="card"><span>أكثر عميل تأخرًا</span><strong>{oldest?.name||"-"}</strong><small>{oldest?`${oldest.overdueDays} يوم`:"0 يوم"}</small></div>
      <div className="card expected-today-card"><span>المتوقع تحصيله اليوم</span><strong>{money(data.expectedToday||0)} CAD</strong></div>
    </div>

    <div className="card overdue-filters">
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="بحث باسم العميل أو رقم الهاتف"/>
      <select value={days} onChange={e=>setDays(e.target.value)}>
        <option value="7">أكثر من 7 أيام</option>
        <option value="15">أكثر من 15 يومًا</option>
        <option value="30">أكثر من 30 يومًا</option>
        <option value="60">أكثر من 60 يومًا</option>
      </select>
    </div>

    <div className="overdue-customers-grid overdue-dark-scope">
      {rows.length?rows.map(customer=>{
        const draft={promiseDate:"",expectedAmount:"",notes:"",messageType:"gentle",...(drafts[customer.id]||{})};
        return <article className={`card overdue-customer-card severity-${severity(customer.overdueDays)}`} key={customer.id}>
          <div className="overdue-customer-head">
            <div>
              <h3>{customer.name}</h3>
              <p>{customer.phone||"لا يوجد رقم هاتف"}</p>
            </div>
            <span>{customer.overdueDays} يوم</span>
          </div>

          <div className="overdue-customer-details expanded">
            <div className="overdue-metric overdue-metric-balance"><span>الرصيد المتبقي</span><strong>{cad(customer.finalBalance)}</strong></div>
            <div className="overdue-metric overdue-metric-total"><span>إجمالي الحساب</span><strong>{cad(customer.totalTransactions)}</strong></div>
            <div className="overdue-metric overdue-metric-paid"><span>إجمالي المدفوع</span><strong>{cad(customer.totalPaid)}</strong></div>
            <div className="overdue-metric overdue-metric-date"><span>أقدم حوالة غير مدفوعة</span><strong>{customer.oldestUnpaidDate||"-"}</strong></div>
            <div className="overdue-metric overdue-metric-date"><span>آخر دفعة</span><strong>{customer.lastPaymentDate||"-"}</strong></div>
            <div className="overdue-metric overdue-metric-date"><span>آخر متابعة</span><strong>{customer.latestAction?.action||"-"}</strong></div>
          </div>

          {customer.promiseDate&&<div className="promise-banner">
            وعد بالدفع: <strong>{customer.promiseDate}</strong>
            {customer.expectedAmount!=null&&<> — {money(customer.expectedAmount)} CAD</>}
          </div>}

          <div className="whatsapp-options">
            <label>نوع رسالة واتساب</label>
            <select value={draft.messageType} onChange={e=>updateDraft(customer.id,{messageType:e.target.value})}>
              <option value="gentle">تذكير لطيف</option>
              <option value="formal">تذكير رسمي</option>
              <option value="statement">ملخص كشف الحساب</option>
            </select>
          </div>

          <div className="followup-form">
            <input type="date" value={draft.promiseDate} onChange={e=>updateDraft(customer.id,{promiseDate:e.target.value})}/>
            <input type="number" step=".01" value={draft.expectedAmount} onChange={e=>updateDraft(customer.id,{expectedAmount:e.target.value})} placeholder="المبلغ المتوقع"/>
            <input value={draft.notes} onChange={e=>updateDraft(customer.id,{notes:e.target.value})} placeholder="ملاحظة مثل: وعد بالدفع يوم الجمعة"/>
          </div>

          <div className="customer-card-actions overdue-actions">
            <button onClick={()=>openCustomer(customer.id)}>فتح الحساب</button>
            <button onClick={()=>openCustomer(customer.id)}>إضافة دفعة</button>
            <button onClick={()=>onStatement(customer.id)}>طباعة / PDF</button>
            <button className="whatsapp-button" onClick={()=>sendWhatsapp(customer)}>إرسال واتساب</button>
            <button onClick={()=>saveAction(customer,"CONTACTED")}>تم التواصل</button>
            <button onClick={()=>saveAction(customer,"PROMISE_TO_PAY")}>حفظ وعد الدفع</button>
            <button onClick={navigateCustomers}>تعديل العميل</button>
          </div>
        </article>
      }):<div className="card">لا يوجد عملاء متأخرون ضمن الفلتر المحدد.</div>}
    </div>
  </>;
}

