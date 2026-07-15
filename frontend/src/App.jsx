import React,{useEffect,useState}from"react";import api from"./api";
const money=n=>Number(n||0).toFixed(2);
const cad=n=>`${money(n)} CAD`;

function openRegularWhatsApp(phone,message){
  const cleanPhone=String(phone||"").replace(/\D/g,"");
  const encodedText=encodeURIComponent(String(message||""));

  if(!cleanPhone)return false;

  const isAndroid=/Android/i.test(navigator.userAgent||"");
  if(isAndroid){
    const intentUrl=`intent://send?phone=${cleanPhone}&text=${encodedText}#Intent;scheme=whatsapp;package=com.whatsapp;end`;
    window.location.href=intentUrl;
    return true;
  }

  window.open(`https://wa.me/${cleanPhone}?text=${encodedText}`,"_blank");
  return true;
}


const currencyFlag=code=>String(code||"").toUpperCase();

function CurrencyFlag({code,className=""}){
  const normalized=String(code||"").toUpperCase();
  const supported=["CAD","USD","EUR","GBP","AED","TRY","SYP"];
  if(supported.includes(normalized)){
    return <img
      className={`currency-flag-image ${normalized==="SYP"?"syria-new-flag":""} ${className}`}
      src={`/currency-flags/${normalized.toLowerCase()}.svg`}
      alt={`${normalized} flag`}
    />;
  }
  return <span className={className}>🏳️</span>;
}

function rateTrend(rate,history=[]){
  const pairHistory=history
    .filter(item=>item.baseCurrency===rate.baseCurrency&&item.quoteCurrency===rate.quoteCurrency)
    .sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
  const previous=pairHistory.find(item=>item.id!==rate.id);
  if(!previous)return {type:"new",symbol:"●",label:"جديد"};
  const currentValue=Number(rate.sellRate||rate.buyRate||0);
  const previousValue=Number(previous.sellRate||previous.buyRate||0);
  if(currentValue>previousValue)return {type:"up",symbol:"▲",label:"صعود"};
  if(currentValue<previousValue)return {type:"down",symbol:"▼",label:"نزول"};
  return {type:"same",symbol:"→",label:"ثابت"};
}


class AppErrorBoundary extends React.Component{
  constructor(props){
    super(props);
    this.state={error:null};
  }
  static getDerivedStateFromError(error){
    return {error};
  }
  componentDidCatch(error,info){
    console.error("Application error:",error,info);
  }
  render(){
    if(this.state.error){
      return <div className="card customer-error">
        <h2>حدث خطأ في الصفحة</h2>
        <p>{String(this.state.error.message||this.state.error)}</p>
        <button onClick={()=>window.location.reload()}>إعادة تحميل البرنامج</button>
      </div>;
    }
    return this.props.children;
  }
}


const APP_EN_TRANSLATIONS={
  "القائمة الرئيسية":"Main Dashboard","الرئيسية":"Home","القائمة":"Menu","العملاء":"Customers",
  "العملاء المتأخرون":"Overdue Customers","الموردون والشركات":"Suppliers & Companies",
  "الحوالات":"Transfers","الأرباح":"Profits","العملات وأسعار الصرف":"Currencies & Exchange Rates",
  "الدَّين العام":"General Debts","رأس المال الكلي":"Total Capital","التقارير الشهرية":"Monthly Reports",
  "إعدادات التنبيهات":"Alert Settings","الإعدادات":"Settings","المصروفات":"Expenses","حركة رأس المال":"Capital Movement",
  "تسجيل الخروج":"Log out","هل تريد تسجيل الخروج من البرنامج؟":"Do you want to log out of the application?",
  "نعم، تسجيل الخروج":"Yes, log out","إلغاء":"Cancel","العودة إلى القائمة الرئيسية":"Back to Main Dashboard",
  "شركة العبود التجارية":"AlAboud Trading Company","إدارة الحوالات والحسابات":"Transfers & Accounts Management",
  "البريد":"Email","كلمة المرور":"Password","تسجيل الدخول":"Sign in","فشل تسجيل الدخول":"Login failed",
  "جاري تحميل لوحة التحكم…":"Loading dashboard…","إجمالي الحوالات":"Total Transfers","حوالات اليوم":"Today's Transfers",
  "إجمالي الأرباح":"Total Profit","الربح اليومي":"Daily Profit","مصروفات اليوم":"Today's Expenses",
  "عدد العملاء":"Customers","ملخص اليوم":"Today's Summary","نشرة أسعار الصرف":"Exchange Rate Board",
  "عرض الكل":"View All","أحدث الحوالات":"Latest Transfers","إضافة حوالة":"Add Transfer","إضافة عميل":"Add Customer",
  "إضافة مصروف":"Add Expense","تقرير سريع":"Quick Report","تحديث أسعار الصرف":"Refresh Exchange Rates",
  "قائمة العملاء":"Customer List","بحث باسم العميل أو رقم الهاتف":"Search by customer name or phone",
  "مجموع الحسابات الكلي":"Total Accounts","مجموع المدفوع":"Total Paid","المجموع النهائي (CAD) المتبقي":"Final Remaining Total (CAD)",
  "المتأخرون أكثر من أسبوع":"Overdue More Than a Week","مجموع الحساب":"Account Total","المدفوع":"Paid",
  "فتح الحساب":"Open Account","إضافة دفعة":"Add Payment","تعديل":"Edit","واتساب بالمجموع النهائي (CAD)":"WhatsApp Final Total (CAD)",
  "مستحق":"Due","مسدد":"Paid","لا يوجد رقم هاتف":"No phone number",
  "حفظ الحوالة":"Save Transfer","مدفوع":"Paid","غير مدفوع":"Unpaid","أجور الحوالة":"Transfer Fee",
  "ربح الحوالة":"Transfer Profit","المجموع النهائي (CAD) للعميل":"Customer Final Total (CAD)",
  "سعر التحويل للعميل":"Customer Exchange Rate","السعر الذي يحاسب عليه العميل مقابل كل وحدة من عملة الحوالة":"Rate charged to the customer for each transfer currency unit",
  "آخر تحديث":"Last Update","شراء":"Buy","بيع":"Sell","صعود":"Up","نزول":"Down","ثابت":"Stable",
  "إعدادات التنبيهات وواتساب":"Alerts & WhatsApp Settings","بدء تنبيه التأخير بعد عدد الأيام":"Start overdue alert after days",
  "حد انخفاض السيولة (CAD)":"Low Cash Limit (CAD)","قالب رسالة واتساب (اختياري)":"WhatsApp Message Template (Optional)",
  "حفظ الإعدادات":"Save Settings","ملاحظة:":"Note:","اللغة":"Language","طريقة العرض":"Display Mode",
  "مضغوط":"Compact","مريح":"Comfortable","كبير":"Large","العملة الرئيسية":"Primary Currency",
  "حفظ إعدادات العرض":"Save Display Settings","إنشاء حساب":"Create Account","اسم المستخدم":"User Name",
  "البريد الإلكتروني":"Email Address","مستخدم":"User","مدير":"Manager","مسؤول كامل":"Full Administrator",
  "إنشاء الحساب":"Create Account","تغيير كلمة السر":"Change Password","كلمة المرور الحالية":"Current Password",
  "كلمة المرور الجديدة":"New Password","تأكيد كلمة المرور الجديدة":"Confirm New Password",
  "الدعم الفني":"Technical Support","البريد الفني":"Support Email","نسخ رقم الإصدار":"Copy Version Number",
  "التحديثات":"Updates","الإصدار الحالي":"Current Version","التحقق من التحديثات":"Check for Updates",
  "جاري التحقق...":"Checking...","تم حفظ إعدادات العرض":"Display settings saved",
  "تم إنشاء الحساب بنجاح":"Account created successfully","تم تغيير كلمة المرور بنجاح":"Password changed successfully",
  "تم نسخ رقم الإصدار":"Version number copied","حفظ":"Save","الوصف":"Description","المبلغ":"Amount",
  "زيادة":"Deposit","سحب":"Withdrawal","رأس المال":"Capital","لا توجد بيانات.":"No data available.",
  "لا توجد حوالات.":"No transfers.","لا توجد حوالات في هذا الشهر.":"No transfers this month.",
  "العميل":"Customer","التاريخ":"Date","الرقم":"Number","الأجور":"Fees","الربح":"Profit",
  "تفاصيل حوالات الشهر":"Monthly Transfer Details","أكثر العملاء تعاملًا خلال الشهر":"Top Customers This Month",
  "إجمالي الحوالات":"Total Transfers","جاري التحميل...":"Loading...","حدث خطأ في الصفحة":"Page Error",
  "إعادة تحميل البرنامج":"Reload Application"
};

function translateAppText(value){
  if(typeof value!=="string")return value;
  const direct=APP_EN_TRANSLATIONS[value.trim()];
  if(direct)return direct;
  let output=value;
  Object.entries(APP_EN_TRANSLATIONS)
    .sort((a,b)=>b[0].length-a[0].length)
    .forEach(([ar,en])=>{output=output.split(ar).join(en)});
  return output;
}

function AppLanguageBridge(){
  useEffect(()=>{
    const applyLanguage=()=>{
      const language=localStorage.getItem("alaboud_language")||"ar";
      const english=language==="en";
      document.documentElement.lang=language;
      document.documentElement.dir=english?"ltr":"rtl";
      document.body.classList.toggle("app-language-en",english);

      document.querySelectorAll("body *").forEach(node=>{
        if(node.closest("script,style"))return;
        node.childNodes.forEach(child=>{
          if(child.nodeType===Node.TEXT_NODE){
            if(english){
              if(child.__alaboudArabicOriginal===undefined)child.__alaboudArabicOriginal=child.nodeValue;
              child.nodeValue=translateAppText(child.__alaboudArabicOriginal);
            }else if(child.__alaboudArabicOriginal!==undefined){
              child.nodeValue=child.__alaboudArabicOriginal;
            }
          }
        });

        ["placeholder","title","aria-label"].forEach(attribute=>{
          if(!node.hasAttribute?.(attribute))return;
          const key=`alaboudOriginal${attribute.replace("-","")}`;
          if(english){
            if(node.dataset[key]===undefined)node.dataset[key]=node.getAttribute(attribute)||"";
            node.setAttribute(attribute,translateAppText(node.dataset[key]));
          }else if(node.dataset[key]!==undefined){
            node.setAttribute(attribute,node.dataset[key]);
          }
        });
      });
    };

    applyLanguage();
    const observer=new MutationObserver(()=>applyLanguage());
    observer.observe(document.body,{childList:true,subtree:true,characterData:false});
    window.addEventListener("alaboud-language-change",applyLanguage);
    return()=>{
      observer.disconnect();
      window.removeEventListener("alaboud-language-change",applyLanguage);
    };
  },[]);
  return null;
}

function Login({onLogin}){const[email,setEmail]=useState("admin@alaboud.local"),[password,setPassword]=useState("Admin123!"),[error,setError]=useState("");async function submit(e){e.preventDefault();try{const{data}=await api.post("/auth/login",{email,password});localStorage.setItem("afs_token",data.token);localStorage.setItem("afs_user",JSON.stringify(data.user));onLogin();}catch{setError("فشل تسجيل الدخول");}}return <div className="login"><form className="panel" onSubmit={submit}><img className="login-company-logo" src="/alaboud-company-logo.webp" alt="شركة العبود التجارية"/><h1>شركة العبود التجارية</h1><p className="login-company-en">ALABOUD TRADING COMPANY</p><p>إدارة الحوالات والحسابات</p><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="البريد"/><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="كلمة المرور"/>{error&&<div className="error">{error}</div>}<button>تسجيل الدخول</button><small>admin@alaboud.local / Admin123!</small></form></div>}
function Dashboard({navigate}){
  const [data,setData]=useState(null);
  const [noticeData,setNoticeData]=useState({count:0,overdueCount:0,overdueTotal:0,notifications:[]});
  const [recent,setRecent]=useState([]);
  const [dashboardRates,setDashboardRates]=useState([]);
  const [dashboardRateHistory,setDashboardRateHistory]=useState([]);
  const [open,setOpen]=useState(false);

  useEffect(()=>{
    let active=true;
    const loadDashboard=async(refreshRates=false)=>{
      try{
        if(refreshRates)await api.post("/exchange-rates/refresh");
        const [dashboardResponse,notificationResponse,transactionsResponse,ratesResponse,historyResponse]=await Promise.all([
          api.get("/dashboard"),
          api.get("/notifications"),
          api.get("/transactions"),
          api.get("/exchange-rates"),
          api.get("/exchange-rates/history")
        ]);
        if(!active)return;
        setData(dashboardResponse.data);
        setNoticeData(notificationResponse.data);
        const rows=Array.isArray(transactionsResponse.data)?transactionsResponse.data:[];
        setRecent(rows.slice().sort((a,b)=>new Date(b.createdAt||b.transferDate)-new Date(a.createdAt||a.transferDate)).slice(0,4));
        const rateRows=Array.isArray(ratesResponse.data)?ratesResponse.data:[];
        setDashboardRates(rateRows.slice().sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||""))).slice(0,7));
        setDashboardRateHistory(Array.isArray(historyResponse.data)?historyResponse.data:[]);
      }catch{}
    };
    loadDashboard(false);
    const hourly=setInterval(()=>loadDashboard(true),60*60*1000);
    return ()=>{active=false;clearInterval(hourly)};
  },[]);

  if(!data)return <div className="premium-loading">جاري تحميل لوحة التحكم…</div>;

  const kpis=[
    {label:"إجمالي الحوالات",value:data.todayTransactions||0,icon:"💱",tone:"green",note:"حوالات اليوم"},
    {label:"إجمالي الأرباح",value:cad(data.todayProfit),icon:"📈",tone:"blue",note:"الربح اليومي"},
    {label:"المصروفات",value:cad(data.todayExpenses||0),icon:"👛",tone:"orange",note:"مصروفات اليوم"},
    {label:"العملاء",value:data.customers||0,icon:"👥",tone:"purple",note:`${noticeData.overdueCount||0} متأخر`}
  ];

  return <div className="premium-dashboard">
    <section className="premium-hero">
      <img src="/alaboud-company-logo.webp" alt="شركة العبود التجارية"/>
      <div>
        <h2>شركة العبود التجارية</h2>
        <p>v15.3.25 Final Mobile</p>
      </div>
      <span className="online-chip">● متصل</span>
    </section>

    <section className="premium-kpis">
      {kpis.map(item=><button key={item.label} className={`premium-kpi ${item.tone}`} onClick={()=>{
        if(item.label==="إجمالي الحوالات")navigate("transactions");
        else if(item.label==="إجمالي الأرباح")navigate("profits");
        else if(item.label==="المصروفات")navigate("expenses");
        else navigate("customers");
      }}>
        <div className="premium-kpi-icon">{item.icon}</div>
        <div><span>{item.label}</span><strong>{item.value}</strong><small>{item.note}</small></div>
      </button>)}
    </section>

    <section className="premium-grid">
      <div className="premium-recent panel-dark">
        <div className="section-heading">
          <h3>أحدث الحوالات</h3>
          <button onClick={()=>navigate("transactions")}>عرض الكل</button>
        </div>
        {recent.length?recent.map(item=><button className="recent-row" key={item.id} onClick={()=>navigate("transactions")}>
          <div className="recent-currency"><span>{item.currency||"USD"}</span><small>{item.number||"حوالة"}</small></div>
          <div className="recent-date">{item.transferDate||String(item.createdAt||"").slice(0,10)}</div>
          <strong>{cad(item.totalCustomerDue||0)}</strong>
          <b>‹</b>
        </button>):<p className="empty-state">لا توجد حوالات حديثة.</p>}
      </div>

      <div className="premium-summary panel-dark dashboard-price-bulletin">
        <div className="section-heading">
          <h3>نشرة أسعار الصرف</h3>
          <button onClick={()=>navigate("rates")}>عرض الكل</button>
        </div>
        <div className="dashboard-rate-list">
          {dashboardRates.length?dashboardRates.map(rate=><button
            className="dashboard-rate-row"
            key={rate.id||`${rate.baseCurrency}-${rate.quoteCurrency}`}
            onClick={()=>navigate("rates")}
          >
            {(()=>{
              const trend=rateTrend(rate,dashboardRateHistory);
              return <>
                <strong className="dashboard-rate-pair">
                  <CurrencyFlag code={rate.baseCurrency} className="dashboard-rate-flag"/>
                  <span>{rate.baseCurrency}/{rate.quoteCurrency}</span>
                  <span className={`dashboard-rate-trend trend-${trend.type}`}>{trend.symbol}</span>
                </strong>
                <span>شراء <b>{Number(rate.buyRate||0).toFixed(4)}</b></span>
                <span>بيع <b>{Number(rate.sellRate||0).toFixed(4)}</b></span>
              </>;
            })()}
          </button>):<p className="empty-state">لا توجد أسعار صرف مسجلة.</p>}
        </div>
      </div>
    </section>

    <section className="premium-quick">
      <button onClick={()=>navigate("transactions")}><span>💱</span><strong>إضافة حوالة</strong></button>
      <button onClick={()=>navigate("expenses")}><span>👛</span><strong>إضافة مصروف</strong></button>
      <button onClick={()=>navigate("customers")}><span>👤＋</span><strong>عميل جديد</strong></button>
      <button onClick={()=>navigate("monthly-report")}><span>📄</span><strong>تقرير سريع</strong></button>
      <button onClick={()=>navigate("rates")}><span>☁</span><strong>أسعار الصرف</strong></button>
    </section>

    <button className="premium-alert-strip" onClick={()=>setOpen(!open)}>
      <span>🔔</span>
      <strong>{noticeData.count?`${noticeData.count} تنبيهات تحتاج المراجعة`:"لا توجد تنبيهات جديدة"}</strong>
      <b>‹</b>
    </button>

    {open&&<div className="panel-dark premium-notifications">
      <div className="section-heading"><h3>مركز التنبيهات</h3><button onClick={()=>setOpen(false)}>إغلاق</button></div>
      {noticeData.notifications.length?noticeData.notifications.map(item=>
        <div className={`notification-item severity-${item.severity}`} key={item.id}>
          <div><strong>{item.title}</strong><p>{item.message}</p></div>
          {item.customerId&&<button onClick={()=>navigate("customers")}>فتح</button>}
        </div>
      ):<p>لا توجد تنبيهات حالياً.</p>}
    </div>}
  </div>;
}

function Customers({open}){
  const [list,setList]=useState([]);
  const [alerts,setAlerts]=useState({count:0,totalOverdue:0,rows:[]});
  const [search,setSearch]=useState("");
  const [error,setError]=useState("");

  const [customerForm,setCustomerForm]=useState({name:"",phone:"",email:""});
  const [editingCustomer,setEditingCustomer]=useState(null);

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
    transactionId:"",
    amount:"",
    paymentDate:new Date().toISOString().slice(0,10),
    method:"CASH",
    reference:""
  });

  const [customerTransactions,setCustomerTransactions]=useState([]);
  const [activePanel,setActivePanel]=useState("");

  async function load(){
    setError("");
    try{
      const [customersResponse,alertsResponse]=await Promise.all([
        api.get("/customers"),
        api.get("/customer-alerts")
      ]);
      setList(Array.isArray(customersResponse.data)?customersResponse.data:[]);
      setAlerts(alertsResponse.data||{count:0,totalOverdue:0,rows:[]});
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر تحميل العملاء");
    }
  }

  useEffect(()=>{load();},[]);

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

    api.get("/exchange-rates")
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
    try{
      await api.post("/customers",customerForm);
      setCustomerForm({name:"",phone:"",email:""});
      setActivePanel("");
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر إضافة العميل");
    }
  }

  async function saveCustomer(event){
    event.preventDefault();
    try{
      await api.patch(`/customers/${editingCustomer.id}`,editingCustomer);
      setEditingCustomer(null);
      setActivePanel("");
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر تعديل العميل");
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
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر إضافة الحوالة");
    }
  }

  async function preparePayment(customer){
    setPaymentForm({
      customerId:customer.id,
      transactionId:"",
      amount:"",
      paymentDate:new Date().toISOString().slice(0,10),
      method:"CASH",
      reference:""
    });
    try{
      const response=await api.get(`/customers/${customer.id}`);
      const unpaid=(Array.isArray(response.data?.transactions)?response.data.transactions:[])
        .filter(item=>Number(item.remaining||0)>0);
      setCustomerTransactions(unpaid);
      setActivePanel("payment");
      window.scrollTo({top:0,behavior:"smooth"});
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر تحميل حوالات العميل");
    }
  }

  async function addPayment(event){
    event.preventDefault();
    try{
      await api.post(`/transactions/${paymentForm.transactionId}/payments`,paymentForm);
      setPaymentForm({
        customerId:"",
        transactionId:"",
        amount:"",
        paymentDate:new Date().toISOString().slice(0,10),
        method:"CASH",
        reference:""
      });
      setCustomerTransactions([]);
      setActivePanel("");
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر إضافة الدفعة");
    }
  }

  function whatsappFinalBalance(customer, urgent=false){
    const phone=String(customer.phone||"").replace(/\D/g,"");
    if(!phone){
      setError("لا يوجد رقم واتساب محفوظ لهذا العميل");
      return;
    }

    const message=urgent
      ? `السلام عليكم ${customer.name}،
نذكّركم بضرورة تسديد الرصيد المستحق وقدره ${cad(customer.finalBalance)}.
عدد أيام التأخير: ${customer.overdueDays} يوم.
يرجى التواصل معنا لتسوية الحساب.
شكراً لتعاملكم مع شركة العبود للتجارة.`
      : `السلام عليكم ${customer.name}،
مجموع حسابكم الكلي: ${cad(customer.totalTransactions)}
إجمالي المدفوع: ${cad(customer.totalPaid)}
الرصيد النهائي المتبقي: ${cad(customer.finalBalance)}
شكراً لتعاملكم مع شركة العبود للتجارة.`;

    openRegularWhatsApp(phone,message);
  }

  const filtered=list.filter(customer=>
    `${customer.name} ${customer.phone||""}`.toLowerCase().includes(search.toLowerCase())
  );

  return <>
    <h2>قائمة العملاء</h2>
    {error&&<div className="card customer-error">{error}</div>}

    <div className="stats customer-stats-final">
      <div className="card customer-stat-row">
        <div className="customer-stat-icon">👥</div>
        <span className="customer-stat-label">عدد العملاء</span>
        <strong className="customer-stat-value">{list.length}</strong>
      </div>
      <div className="card customer-stat-row">
        <div className="customer-stat-icon">👛</div>
        <span className="customer-stat-label">مجموع الحسابات الكلي</span>
        <strong className="customer-stat-value">{cad(list.reduce((sum,item)=>sum+Number(item.totalTransactions||0),0))}</strong>
      </div>
      <div className="card customer-stat-row">
        <div className="customer-stat-icon">🫴</div>
        <span className="customer-stat-label">مجموع المدفوع</span>
        <strong className="customer-stat-value">{cad(list.reduce((sum,item)=>sum+Number(item.totalPaid||0),0))}</strong>
      </div>
      <div className="card final customer-stat-row">
        <div className="customer-stat-icon">🧮</div>
        <span className="customer-stat-label">المجموع النهائي (CAD) المتبقي</span>
        <strong className="customer-stat-value">{cad(list.reduce((sum,item)=>sum+Number(item.finalBalance||0),0))}</strong>
      </div>
      <div className="card overdue-card customer-stat-row">
        <div className="customer-stat-icon">🕘</div>
        <span className="customer-stat-label">المتأخرون أكثر من أسبوع</span>
        <strong className="customer-stat-value">{alerts.count}</strong>
      </div>
    </div>

    <div className="customer-toolbar card">
      <button onClick={()=>{setActivePanel("newCustomer");setEditingCustomer(null)}}>إضافة عميل</button>
      <button onClick={()=>setActivePanel(activePanel==="transfer"?"":"transfer")}>إضافة حوالة</button>
      <button onClick={()=>setActivePanel(activePanel==="payment"?"":"payment")}>إضافة دفعة</button>
    </div>

    {activePanel==="newCustomer"&&
      <form className="card form edit-panel" onSubmit={addCustomer}>
        <h3>إضافة عميل جديد</h3>
        <input value={customerForm.name} onChange={e=>setCustomerForm({...customerForm,name:e.target.value})} placeholder="اسم العميل" required/>
        <input value={customerForm.phone} onChange={e=>setCustomerForm({...customerForm,phone:e.target.value})} placeholder="رقم الهاتف / واتساب"/>
        <input type="email" value={customerForm.email} onChange={e=>setCustomerForm({...customerForm,email:e.target.value})} placeholder="البريد الإلكتروني"/>
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
        <button>حفظ التعديل</button>
        <button type="button" onClick={()=>setEditingCustomer(null)}>إلغاء</button>
      </form>
    }

    {activePanel==="transfer"&&
      <form className="card form edit-panel" onSubmit={addTransfer}>
        <h3>إضافة حوالة</h3>
        <select value={transferForm.customerId} onChange={e=>setTransferForm({...transferForm,customerId:e.target.value})} required>
          <option value="">اختر العميل</option>
          {list.map(customer=><option key={customer.id} value={customer.id}>{customer.name}</option>)}
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
    }

    {activePanel==="payment"&&
      <form className="card form edit-panel" onSubmit={addPayment}>
        <h3>إضافة دفعة</h3>
        <select value={paymentForm.customerId} onChange={async e=>{
          const customer=list.find(item=>item.id===e.target.value);
          if(customer)await preparePayment(customer);
        }} required>
          <option value="">اختر العميل</option>
          {list.map(customer=><option key={customer.id} value={customer.id}>{customer.name}</option>)}
        </select>
        <select value={paymentForm.transactionId} onChange={e=>setPaymentForm({...paymentForm,transactionId:e.target.value})} required>
          <option value="">اختر الحوالة غير المدفوعة</option>
          {customerTransactions.map(transaction=><option key={transaction.id} value={transaction.id}>
            {transaction.number} — متبقي {money(transaction.remaining)}
          </option>)}
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
    }

    {alerts.count>0&&
      <div className="card overdue-panel">
        <h3>تنبيهات العملاء المتأخرين</h3>
        {alerts.rows.slice(0,8).map(customer=><div className="overdue-row" key={customer.id}>
          <span><strong>{customer.name}</strong> — متأخر {customer.overdueDays} يوم — الرصيد {cad(customer.finalBalance)}</span>
          <button className="danger-button" onClick={()=>whatsappFinalBalance(customer,true)}>تنبيه واتساب</button>
        </div>)}
      </div>
    }

    <input className="card customer-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="بحث باسم العميل أو رقم الهاتف"/>

    <div className="customer-cards">
      {filtered.length?filtered.map(customer=><article className={`customer-account-card ${customer.overdue?"is-overdue":customer.finalBalance>0?"has-balance":"is-paid"}`} key={customer.id}>
        <div className="customer-card-header">
          <div>
            <h3>{customer.name}</h3>
            <p>{customer.phone||"لا يوجد رقم هاتف"}</p>
          </div>
          <span className="customer-status">
            {customer.overdue?"متأخر":customer.finalBalance>0?"مستحق":"مسدد"}
          </span>
        </div>

        <div className="customer-totals">
          <div><span>مجموع الحساب</span><strong>{cad(customer.totalTransactions)}</strong></div>
          <div><span>المدفوع</span><strong>{cad(customer.totalPaid)}</strong></div>
          <div className="final-balance"><span>المجموع النهائي (CAD)</span><strong>{cad(customer.finalBalance)}</strong></div>
        </div>

        {customer.overdue&&<p className="overdue-text">متأخر {customer.overdueDays} يوم من أقدم حوالة غير مدفوعة.</p>}

        <div className="customer-card-actions">
          <button onClick={()=>open(customer.id)}>فتح الحساب</button>
          <button onClick={()=>prepareTransfer(customer)}>إضافة حوالة</button>
          <button onClick={()=>preparePayment(customer)}>إضافة دفعة</button>
          <button onClick={()=>{setEditingCustomer({...customer});setActivePanel("")}}>تعديل</button>
          <button className="whatsapp-button" onClick={()=>whatsappFinalBalance(customer,false)}>واتساب بالمجموع النهائي (CAD)</button>
          {customer.overdue&&<button className="danger-button" onClick={()=>whatsappFinalBalance(customer,true)}>تنبيه الدفع</button>}
        </div>
      </article>):<div className="card">لا توجد نتائج.</div>}
    </div>
  </>;
}

function OverdueCustomers({openCustomer,onStatement,navigateCustomers}){
  const [data,setData]=useState({
    count:0,totalOverdue:0,largestOverdueBalance:0,largestOverdueCustomer:null,
    oldestCustomer:null,oldestDays:0,expectedToday:0,rows:[]
  });
  const [search,setSearch]=useState("");
  const [days,setDays]=useState("7");
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [drafts,setDrafts]=useState({});

  async function load(){
    setError("");
    try{
      const response=await api.get("/customer-alerts");
      setData(response.data||{rows:[]});
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر تحميل العملاء المتأخرين");
    }
  }

  useEffect(()=>{load();},[]);



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
        `نذكّركم بلطف بوجود رصيد مستحق قدره ${cad(customer.finalBalance)} CAD.`,
        `مدة التأخير: ${customer.overdueDays} يوم.`,
        `نرجو التكرم بالسداد في الوقت المناسب.`,
        `شكراً لتعاملكم مع شركة العبود للتجارة.`
      ],
      formal:[
        `السيد/السيدة ${customer.name} المحترم/ة،`,
        `نفيدكم بوجود رصيد مستحق على حسابكم بقيمة ${cad(customer.finalBalance)} CAD.`,
        `وقد تجاوزت مدة التأخير ${customer.overdueDays} يومًا.`,
        `يرجى تسوية الرصيد أو التواصل معنا لتحديد موعد الدفع.`,
        `شركة العبود للتجارة.`
      ],
      statement:[
        `السلام عليكم ${customer.name}،`,
        `ملخص حسابكم الحالي:`,
        `إجمالي الحساب: ${cad(customer.totalTransactions)} CAD`,
        `إجمالي المدفوع: ${cad(customer.totalPaid)} CAD`,
        `الرصيد المتبقي: ${cad(customer.finalBalance)} CAD`,
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

    <div className="stats overdue-top-stats">
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

    <div className="overdue-customers-grid">
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
            <div><span>الرصيد المتبقي</span><strong>{cad(customer.finalBalance)} CAD</strong></div>
            <div><span>إجمالي الحساب</span><strong>{cad(customer.totalTransactions)} CAD</strong></div>
            <div><span>إجمالي المدفوع</span><strong>{cad(customer.totalPaid)} CAD</strong></div>
            <div><span>أقدم حوالة غير مدفوعة</span><strong>{customer.oldestUnpaidDate||"-"}</strong></div>
            <div><span>آخر دفعة</span><strong>{customer.lastPaymentDate||"-"}</strong></div>
            <div><span>آخر متابعة</span><strong>{customer.latestAction?.action||"-"}</strong></div>
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

function Customer({id,back,onStatement}){
  const [data,setData]=useState(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  const [paymentForm,setPaymentForm]=useState({
    transactionId:"",
    amount:"",
    paymentDate:new Date().toISOString().slice(0,10),
    method:"CASH",
    reference:"",
    notes:""
  });
  const [editingTransaction,setEditingTransaction]=useState(null);
  const [editingPayment,setEditingPayment]=useState(null);

  async function load(){
    setLoading(true);
    setError("");
    try{
      const response=await api.get(`/customers/${id}`);
      const result=response?.data||{};
      setData({
        customer:result.customer||{name:"عميل"},
        transactions:Array.isArray(result.transactions)?result.transactions:[],
        payments:Array.isArray(result.payments)?result.payments:[],
      });
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر تحميل ملف العميل");
      setData(null);
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{load();},[id]);

  async function addPayment(event){
    event.preventDefault();
    try{
      await api.post(`/transactions/${paymentForm.transactionId}/payments`,{
        amount:paymentForm.amount,
        paymentDate:paymentForm.paymentDate,
        method:paymentForm.method,
        reference:paymentForm.reference,
        notes:paymentForm.notes
      });
      setPaymentForm({
        transactionId:"",
        amount:"",
        paymentDate:new Date().toISOString().slice(0,10),
        method:"CASH",
        reference:"",
        notes:""
      });
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر حفظ الدفعة");
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
    if(!window.confirm("هل أنت متأكد من حذف الحوالة؟ سيتم حذف دفعاتها منطقيًا."))return;
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
    if(!window.confirm("هل تريد حذف هذه الدفعة؟"))return;
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

  return <>
    <div className="card no-print form">
      <button onClick={back}>رجوع</button>
      <button onClick={()=>onStatement(id)}>كشف حساب العميل</button>
    </div>

    <h2>{customer.name||"العميل"}</h2>
    {error&&<div className="card customer-error">{error}</div>}

    <div className="stats">
      <div className="card"><span>إجمالي الحساب</span><strong>{cad(customer.totalTransactions)}</strong></div>
      <div className="card"><span>المدفوع</span><strong>{cad(customer.totalPaid)}</strong></div>
      <div className="card final"><span>الحساب النهائي</span><strong>{cad(customer.finalBalance)}</strong></div>
    </div>

    {unpaidTransactions.length>0&&
      <form className="card form" onSubmit={addPayment}>
        <h3>إضافة دفعة</h3>
        <select value={paymentForm.transactionId} onChange={e=>setPaymentForm({...paymentForm,transactionId:e.target.value})} required>
          <option value="">اختر الحوالة</option>
          {unpaidTransactions.map(transaction=><option key={transaction.id} value={transaction.id}>
            {transaction.number} — متبقي {money(transaction.remaining)}
          </option>)}
        </select>
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
        <input type="number" min=".01" step=".01" value={editingPayment.amount} onChange={e=>setEditingPayment({...editingPayment,amount:e.target.value})}/>
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

    <div className="card tablewrap">
      <h3>الحوالات</h3>
      <table>
        <thead><tr><th>الرقم</th><th>التاريخ</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>الإجراءات</th></tr></thead>
        <tbody>{transactions.length?transactions.map(transaction=><tr key={transaction.id}>
          <td>{transaction.number}</td>
          <td>{transaction.transferDate||String(transaction.createdAt||"").slice(0,10)}</td>
          <td>{money(transaction.totalCustomerDue)}</td>
          <td>{money(transaction.paid)}</td>
          <td>{money(transaction.remaining)}</td>
          <td className="actions">
            <button onClick={()=>setPaymentForm({...paymentForm,transactionId:transaction.id})}>إضافة دفعة</button>
            <button onClick={()=>setEditingTransaction({...transaction})}>تعديل</button>
            <button className="danger-button" onClick={()=>deleteTransaction(transaction.id)}>حذف</button>
          </td>
        </tr>):<tr><td colSpan="6">لا توجد حوالات.</td></tr>}</tbody>
      </table>
    </div>

    <div className="card tablewrap">
      <h3>سجل الدفعات</h3>
      <table>
        <thead><tr><th>التاريخ</th><th>الحوالة</th><th>المبلغ</th><th>الطريقة</th><th>المرجع</th><th>الإجراءات</th></tr></thead>
        <tbody>{payments.length?payments.map(payment=>{
          const transaction=transactions.find(item=>item.id===payment.transactionId);
          return <tr key={payment.id}>
            <td>{payment.paymentDate||String(payment.date||"").slice(0,10)}</td>
            <td>{transaction?.number||"-"}</td>
            <td>{money(payment.amount)}</td>
            <td>{payment.method||"-"}</td>
            <td>{payment.reference||"-"}</td>
            <td className="actions">
              <button onClick={()=>setEditingPayment({...payment})}>تعديل</button>
              <button className="danger-button" onClick={()=>deletePayment(payment.id)}>حذف</button>
            </td>
          </tr>
        }):<tr><td colSpan="6">لا توجد دفعات.</td></tr>}</tbody>
      </table>
    </div>
  </>;
}

function Invoice({transactionId,back}){
  const [data,setData]=useState(null);
  const [error,setError]=useState("");

  useEffect(()=>{
    api.get(`/transactions/${transactionId}/invoice`)
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

      <table>
        <tbody>
          <tr><th>مبلغ الحوالة</th><td>{money(t.amount)}</td></tr>
          <tr><th>سعر الحوالة</th><td>{Number(t.finalRate||0).toFixed(4)}</td></tr>
          <tr><th>أجور الحوالة</th><td>{money(t.transferFee)}</td></tr>
          <tr><th>الإجمالي المطلوب</th><td>{money(t.totalCustomerDue)}</td></tr>
          <tr><th>المدفوع</th><td>{money(t.paid)}</td></tr>
          <tr><th>المتبقي</th><td><strong>{money(t.remaining)}</strong></td></tr>
        </tbody>
      </table>

      <p className="invoice-note">شكراً لتعاملكم مع شركة العبود للتجارة.</p>
    </section>
  </>;
}

function Statement({customerId,back}){
  const [filters,setFilters]=useState({from:"",to:""});
  const [data,setData]=useState(null);
  const [error,setError]=useState("");

  async function load(){
    setError("");
    try{
      const response=await api.get(`/customers/${customerId}/statement`,{params:filters});
      setData(response.data);
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر إنشاء كشف الحساب");
    }
  }

  useEffect(()=>{load();},[customerId]);

  function whatsappStatement(){
    if(!data)return;
    const phone=String(data.customer.phone||"").replace(/\D/g,"");
    if(!phone){
      setError("لا يوجد رقم واتساب محفوظ للعميل");
      return;
    }

    const message=[
      `السلام عليكم ${data.customer.name}،`,
      `كشف حسابكم لدى شركة العبود للتجارة:`,
      `إجمالي الحوالات: ${Number(data.totals.usdAmount).toFixed(2)} USD`,
      `إجمالي المبلغ النهائي: ${money(data.totals.totalCad)} CAD`,
      `إجمالي الدفعات: ${money(data.totals.paid)} CAD`,
      `الرصيد المتبقي: ${money(data.totals.remaining)} CAD`,
      `شكراً لتعاملكم معنا.`
    ].join("\n");

    openRegularWhatsApp(phone,message);
  }

  const statusLabel={
    PAID:"مسددة",
    PARTIAL:"مسدد جزئياً",
    UNPAID:"غير مسددة",
    OVERDUE:"متأخرة"
  };

  return <>
    <div className="card no-print statement-toolbar">
      <button onClick={back}>رجوع</button>
      <input type="date" value={filters.from} onChange={e=>setFilters({...filters,from:e.target.value})}/>
      <input type="date" value={filters.to} onChange={e=>setFilters({...filters,to:e.target.value})}/>
      <button onClick={load}>عرض كشف الحساب</button>
      <button onClick={()=>window.print()} disabled={!data}>طباعة / حفظ PDF</button>
      <button className="whatsapp-button" onClick={whatsappStatement} disabled={!data}>إرسال واتساب</button>
    </div>

    {error&&<div className="card customer-error">{error}</div>}

    {data&&<section className="invoice-sheet statement-sheet">
      <div className="invoice-header">
        <div>
          <h1>{data.company.name}</h1>
          <p>{data.company.nameEn}</p>
          <h3>كشف حساب العميل</h3>
        </div>
        <div>
          <p><strong>تاريخ الإصدار:</strong> {String(data.generatedAt).slice(0,10)}</p>
          <p><strong>الفترة:</strong> {data.from||"البداية"} إلى {data.to||"اليوم"}</p>
        </div>
      </div>

      <div className="statement-customer-header">
        <div>
          <h2>{data.customer.name}</h2>
          <p><strong>الهاتف / واتساب:</strong> {data.customer.phone||"-"}</p>
          <p><strong>البريد:</strong> {data.customer.email||"-"}</p>
          <p><strong>آخر حركة:</strong> {data.lastActivity||"-"}</p>
        </div>
        <div className="statement-balance">
          <span>الرصيد الحالي</span>
          <strong>{money(data.totals.remaining)} CAD</strong>
        </div>
      </div>

      <div className="statement-summary">
        <div><span>إجمالي الحوالات</span><strong>{Number(data.totals.usdAmount).toFixed(2)} USD</strong></div>
        <div><span>إجمالي المبلغ النهائي</span><strong>{money(data.totals.totalCad)} CAD</strong></div>
        <div><span>إجمالي الدفعات</span><strong>{money(data.totals.paid)} CAD</strong></div>
        <div className="remaining"><span>الرصيد المتبقي</span><strong>{money(data.totals.remaining)} CAD</strong></div>
      </div>

      <div className="tablewrap">
        <table className="statement-table">
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>رقم الحوالة</th>
              <th>مبلغ الحوالة (USD)</th>
              <th>تكلفة الحوالة (CAD)</th>
              <th>المجموع النهائي (CAD) (CAD)</th>
              <th>الدفعات (CAD)</th>
              <th>المتبقي (CAD)</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {data.transactions.length?
              data.transactions.map(item=><tr key={item.id} className={`statement-row status-${item.status.toLowerCase()}`}>
                <td>{item.transferDate}</td>
                <td>{item.number}</td>
                <td>{Number(item.usdAmount).toFixed(2)}</td>
                <td>{money(item.totalCad)}</td>
                <td>{money(item.paid)}</td>
                <td><strong>{money(item.remaining)}</strong></td>
                <td>
                  <span className={`statement-status ${item.status.toLowerCase()}`}>
                    {statusLabel[item.status]||item.status}
                  </span>
                  {item.status==="OVERDUE"&&<small>{item.overdueDays} يوم</small>}
                </td>
              </tr>)
              :<tr><td colSpan="7">لا توجد حوالات في هذه الفترة.</td></tr>
            }
          </tbody>
        </table>
      </div>

      <p className="invoice-note">هذا الكشف لا يتضمن أي معلومات داخلية عن أرباح الشركة.</p>
    </section>}
  </>;
}

function Transactions({openInvoice}){
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

  async function load(){
    try{
      const [customersResponse,transactionsResponse]=await Promise.all([
        api.get("/customers"),
        api.get("/transactions")
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

    api.get("/exchange-rates")
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
        transferDate:new Date().toISOString().slice(0,10)
      }));
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر حفظ الحوالة");
    }
  }

  return <>
    <h2>الحوالات</h2>
    {error&&<div className="card customer-error">{error}</div>}
    <form className="card form" onSubmit={add}>
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
      <button>حفظ</button>
    </form>

    <div className="card tablewrap">
      <table>
        <thead>
          <tr>
            <th>الرقم</th><th>تاريخ الحوالة</th><th>العميل</th><th>المبلغ</th>
            <th>الأجور</th><th>الإجمالي</th><th>الربح</th><th>الفاتورة</th>
          </tr>
        </thead>
        <tbody>
          {list.length?list.map(transaction=><tr key={transaction.id}>
            <td>{transaction.number}</td>
            <td>{transaction.transferDate||String(transaction.createdAt||"").slice(0,10)||"-"}</td>
            <td>{transaction.customerName}</td>
            <td>{money(transaction.amount)}</td>
            <td>{money(transaction.transferFee)}</td>
            <td>{money(transaction.totalCustomerDue)}</td>
            <td>{money(transaction.totalProfit)}</td>
            <td><button onClick={()=>openInvoice(transaction.id)}>فتح</button></td>
          </tr>):<tr><td colSpan="7">لا توجد حوالات.</td></tr>}
        </tbody>
      </table>
    </div>
  </>;
}

function Profits(){
  const [data,setData]=useState(null);
  const [filters,setFilters]=useState({from:"",to:""});
  const load=()=>api.get("/profits",{params:filters}).then(r=>setData(r.data));
  useEffect(()=>{load();},[]);
  if(!data)return <p>جاري تحميل الأرباح...</p>;
  return <>
    <h2>الأرباح</h2>
    <div className="card form">
      <input type="date" value={filters.from} onChange={e=>setFilters({...filters,from:e.target.value})}/>
      <input type="date" value={filters.to} onChange={e=>setFilters({...filters,to:e.target.value})}/>
      <button type="button" onClick={load}>عرض التقرير</button>
    </div>
    <div className="stats">
      <div className="card"><span>عدد الحوالات</span><strong>{data.transactionCount}</strong></div>
      <div className="card"><span>ربح فرق السعر</span><strong>{money(data.exchangeProfit)}</strong></div>
      <div className="card"><span>أجور الحوالات</span><strong>{money(data.transferFees)}</strong></div>
      <div className="card"><span>إجمالي الربح</span><strong>{money(data.grossProfit)}</strong></div>
      <div className="card"><span>المصروفات</span><strong>{money(data.expenses)}</strong></div>
      <div className="card final"><span>صافي الربح</span><strong>{money(data.netProfit)}</strong></div>
    </div>
    <div className="card tablewrap">
      <h3>الأرباح الشهرية</h3>
      <table>
        <thead><tr><th>الشهر</th><th>فرق السعر</th><th>أجور الحوالات</th><th>إجمالي الربح</th><th>المصروفات</th><th>صافي الربح</th></tr></thead>
        <tbody>{data.monthly.map(x=><tr key={x.month}>
          <td>{x.month}</td>
          <td>{money(x.exchangeProfit)}</td>
          <td>{money(x.transferFees)}</td>
          <td>{money(x.grossProfit)}</td>
          <td>{money(x.expenses)}</td>
          <td><b>{money(x.netProfit)}</b></td>
        </tr>)}</tbody>
      </table>
    </div>
  </>;
}

function ExchangeRates(){
  const [list,setList]=useState([]);
  const [history,setHistory]=useState([]);
  const [f,setF]=useState({baseCurrency:"CAD",quoteCurrency:"USD",buyRate:"",sellRate:"",notes:""});
  const [refreshing,setRefreshing]=useState(false);
  const [message,setMessage]=useState("");

  const trendFor=(rate)=>rateTrend(rate,history);
  const load=()=>Promise.all([api.get("/exchange-rates"),api.get("/exchange-rates/history")]).then(([a,b])=>{setList(a.data);setHistory(b.data)});
  useEffect(()=>{
    load();
    const hourly=setInterval(async()=>{
      try{await api.post("/exchange-rates/refresh")}catch{}
      await load();
    },60*60*1000);
    return ()=>clearInterval(hourly);
  },[]);
  async function add(e){
    e.preventDefault();
    await api.post("/exchange-rates",f);
    setF(x=>({...x,buyRate:"",sellRate:"",notes:""}));
    load();
  }
  async function refresh(){
    setRefreshing(true);setMessage("");
    try{
      const {data}=await api.post("/exchange-rates/refresh");
      setMessage(data.message);
      await load();
    }catch(e){
      setMessage(e.response?.data?.message||"تعذر التحديث التلقائي");
    }finally{setRefreshing(false)}
  }
  return <>
    <h2>العملات وأسعار الصرف</h2>
    <div className="card rate-legend">
      <span className="legend-up">↑ ارتفاع</span>
      <span className="legend-down">↓ انخفاض</span>
      <span className="legend-same">→ ثابت</span>
      <span className="legend-new">● سعر جديد</span>
    </div>
    <div className="card auto-rate-bar">
      <div>
        <strong>التحديث التلقائي</strong>
        <p>يتم تحديث الأسعار آليًا كل ساعة مع إظهار الصعود والنزول.</p>
      </div>
      <button type="button" onClick={refresh} disabled={refreshing}>
        {refreshing?"جاري التحديث...":"تحديث الأسعار الآن"}
      </button>
    </div>
    {message&&<div className="card rate-message">{message}</div>}
    <form className="card form" onSubmit={add}>
      <select value={f.baseCurrency} onChange={e=>setF({...f,baseCurrency:e.target.value})}>
        {["CAD","USD","EUR","SYP","AED","GBP"].map(x=><option key={x}>{x}</option>)}
      </select>
      <select value={f.quoteCurrency} onChange={e=>setF({...f,quoteCurrency:e.target.value})}>
        {["USD","CAD","EUR","SYP","AED","GBP"].map(x=><option key={x}>{x}</option>)}
      </select>
      <input type="number" step=".0001" value={f.buyRate} onChange={e=>setF({...f,buyRate:e.target.value})} placeholder="سعر الشراء" required/>
      <input type="number" step=".0001" value={f.sellRate} onChange={e=>setF({...f,sellRate:e.target.value})} placeholder="سعر البيع" required/>
      <input value={f.notes} onChange={e=>setF({...f,notes:e.target.value})} placeholder="ملاحظات"/>
      <button>حفظ السعر</button>
    </form>
    <div className="card tablewrap">
      <h3>آخر الأسعار</h3>
      <table>
        <thead><tr><th>من</th><th>إلى</th><th>شراء</th><th>بيع</th><th>المصدر</th><th>آخر تحديث</th></tr></thead>
        <tbody>{list.map(r=>{
          const trend=trendFor(r);
          return <tr key={r.id} className={`rate-row rate-${trend.type}`}>
            <td><span className="currency-badge currency-with-flag"><CurrencyFlag code={r.baseCurrency}/>{r.baseCurrency}</span></td>
            <td><span className="currency-badge currency-with-flag"><CurrencyFlag code={r.quoteCurrency}/>{r.quoteCurrency}</span></td>
            <td className="buy-rate">{Number(r.buyRate).toFixed(4)}</td>
            <td className={`sell-rate ${trend.type}`}>
              <strong>{Number(r.sellRate).toFixed(4)}</strong>
              <span className={`trend trend-${trend.type}`}>{trend.symbol} {trend.label}</span>
            </td>
            <td><span className={`source-badge ${r.source==="FRANKFURTER"?"auto":"manual"}`}>{r.source==="FRANKFURTER"?"تلقائي":"يدوي"}</span></td>
            <td>{new Date(r.createdAt).toLocaleString("ar-CA")}</td>
          </tr>
        })}</tbody>
      </table>
    </div>
    <div className="card tablewrap">
      <h3>سجل تغييرات الأسعار</h3>
      <table>
        <thead><tr><th>التاريخ</th><th>الزوج</th><th>شراء</th><th>بيع</th><th>المصدر</th><th>ملاحظات</th></tr></thead>
        <tbody>{history.map(r=><tr key={r.id}>
          <td>{new Date(r.createdAt).toLocaleString("ar-CA")}</td>
          <td>{r.baseCurrency}/{r.quoteCurrency}</td>
          <td>{Number(r.buyRate).toFixed(4)}</td>
          <td>{Number(r.sellRate).toFixed(4)}</td>
          <td>{r.source==="FRANKFURTER"?"تلقائي":"يدوي"}</td>
          <td>{r.notes||"-"}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </>;
}


function GeneralDebts(){
  const [data,setData]=useState({rows:[],totals:{receivable:0,payable:0,net:0}});
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
      const {data}=await api.get("/general-debts",{params:{type:filter}});
      setData({
        rows:Array.isArray(data?.rows)?data.rows:[],
        totals:data?.totals||{receivable:0,payable:0,net:0}
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

  const openDebts=data.rows.filter(item=>Number(item.remaining||0)>0);

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
        <span>دين لنا</span>
        <strong>{money(data.totals.receivable)}</strong>
      </div>
      <div className="card payable-card">
        <span>دين علينا</span>
        <strong>{money(data.totals.payable)}</strong>
      </div>
      <div className="card final">
        <span>صافي الديون</span>
        <strong>{money(data.totals.net)}</strong>
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
        {["CAD","USD","EUR","SYP","AED","GBP"].map(currency=>
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
                <td>{item.partyName}</td>
                <td>{money(item.amount)}</td>
                <td>{money(item.paid)}</td>
                <td><strong>{money(item.remaining)}</strong></td>
                <td>{item.currency}</td>
                <td>{item.dueDate||"-"}</td>
                <td>{statusLabel[item.status]||item.status}</td>
                <td>{item.reference||"-"}</td>
              </tr>
            )
            :<tr><td colSpan="9">لا توجد ديون مسجلة.</td></tr>
          }
        </tbody>
      </table>
    </div>
  </>;
}


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

  async function load(){
    try{
      const response=await api.get(`/partners/${id}`);
      setData(response.data);
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر تحميل المورد أو الشركة");
    }
  }

  useEffect(()=>{load();},[id]);

  async function addTransaction(event){
    event.preventDefault();
    await api.post(`/partners/${id}/transactions`,transaction);
    setTransaction(current=>({...current,amount:"",reference:"",description:""}));
    await load();
  }

  async function addPayment(event){
    event.preventDefault();
    await api.post(`/partners/${id}/payments`,payment);
    setPayment(current=>({...current,amount:"",reference:"",notes:""}));
    await load();
  }

  if(showStatement)return <PartnerStatement partnerId={id} back={()=>setShowStatement(false)}/>;
  if(error&&!data)return <div className="card customer-error"><button onClick={back}>رجوع</button><p>{error}</p></div>;
  if(!data)return <p>جاري التحميل...</p>;

  return <>
    <div className="card form no-print">
      <button onClick={back}>رجوع</button>
      <button onClick={()=>setShowStatement(true)}>كشف حساب</button>
    </div>

    <h2>{data.partner.name}</h2>
    <div className="stats">
      <div className="card receivable-card"><span>دين لنا</span><strong>{money(data.totals.receivable)}</strong></div>
      <div className="card payable-card"><span>دين علينا</span><strong>{money(data.totals.payable)}</strong></div>
      <div className="card final"><span>صافي الحساب</span><strong>{money(data.totals.net)}</strong></div>
    </div>

    <div className="card">
      <p><strong>المسؤول:</strong> {data.partner.contactName||"-"}</p>
      <p><strong>الهاتف:</strong> {data.partner.phone||"-"}</p>
      <p><strong>واتساب:</strong> {data.partner.whatsapp||"-"}</p>
      <p><strong>البريد:</strong> {data.partner.email||"-"}</p>
      <p><strong>الموقع:</strong> {[data.partner.city,data.partner.country].filter(Boolean).join("، ")||"-"}</p>
    </div>

    <form className="card form" onSubmit={addTransaction}>
      <select value={transaction.type} onChange={e=>setTransaction({...transaction,type:e.target.value})}>
        <option value="RECEIVABLE">دين لنا</option>
        <option value="PAYABLE">دين علينا</option>
      </select>
      <input type="number" min=".01" step=".01" value={transaction.amount} onChange={e=>setTransaction({...transaction,amount:e.target.value})} placeholder="المبلغ" required/>
      <select value={transaction.currency} onChange={e=>setTransaction({...transaction,currency:e.target.value})}>
        {["CAD","USD","EUR","SYP","AED","GBP"].map(currency=><option key={currency}>{currency}</option>)}
      </select>
      <input type="date" value={transaction.date} onChange={e=>setTransaction({...transaction,date:e.target.value})}/>
      <input type="date" value={transaction.dueDate} onChange={e=>setTransaction({...transaction,dueDate:e.target.value})}/>
      <input value={transaction.reference} onChange={e=>setTransaction({...transaction,reference:e.target.value})} placeholder="المرجع"/>
      <input value={transaction.description} onChange={e=>setTransaction({...transaction,description:e.target.value})} placeholder="البيان"/>
      <button>حفظ العملية</button>
    </form>

    <form className="card form" onSubmit={addPayment}>
      <select value={payment.direction} onChange={e=>setPayment({...payment,direction:e.target.value})}>
        <option value="RECEIVED">استلمنا دفعة</option>
        <option value="PAID">دفعنا مبلغًا</option>
      </select>
      <input type="number" min=".01" step=".01" value={payment.amount} onChange={e=>setPayment({...payment,amount:e.target.value})} placeholder="مبلغ الدفعة" required/>
      <select value={payment.currency} onChange={e=>setPayment({...payment,currency:e.target.value})}>
        {["CAD","USD","EUR","SYP","AED","GBP"].map(currency=><option key={currency}>{currency}</option>)}
      </select>
      <input type="date" value={payment.date} onChange={e=>setPayment({...payment,date:e.target.value})}/>
      <input value={payment.reference} onChange={e=>setPayment({...payment,reference:e.target.value})} placeholder="المرجع"/>
      <input value={payment.notes} onChange={e=>setPayment({...payment,notes:e.target.value})} placeholder="ملاحظات"/>
      <button>حفظ الدفعة</button>
    </form>
  </>;
}

function PartnerStatement({partnerId,back}){
  const [filters,setFilters]=useState({from:"",to:""});
  const [data,setData]=useState(null);
  const [error,setError]=useState("");

  async function load(){
    try{
      const response=await api.get(`/partners/${partnerId}/statement`,{params:filters});
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
      <table>
        <thead><tr><th>التاريخ</th><th>النوع</th><th>مدين</th><th>دائن</th><th>الرصيد</th><th>المرجع</th></tr></thead>
        <tbody>{data.rows.length?data.rows.map(row=><tr key={row.id}>
          <td>{row.date}</td><td>{row.kind}</td><td>{money(row.debit)}</td><td>{money(row.credit)}</td><td>{money(row.balance)}</td><td>{row.reference||"-"}</td>
        </tr>):<tr><td colSpan="6">لا توجد عمليات.</td></tr>}</tbody>
      </table>
      <div className="card final"><span>الرصيد النهائي</span><strong>{money(data.finalBalance)}</strong></div>
    </section>}
  </>;
}

function Partners({open}){
  const [data,setData]=useState({rows:[],totals:{receivable:0,payable:0,net:0}});
  const [error,setError]=useState("");
  const [form,setForm]=useState({
    name:"",contactName:"",phone:"",whatsapp:"",email:"",
    country:"",city:"",address:"",notes:""
  });

  async function load(){
    try{
      const response=await api.get("/partners");
      setData(response.data);
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر تحميل الموردين والشركات");
    }
  }

  useEffect(()=>{load();},[]);

  async function add(event){
    event.preventDefault();
    await api.post("/partners",form);
    setForm({name:"",contactName:"",phone:"",whatsapp:"",email:"",country:"",city:"",address:"",notes:""});
    await load();
  }

  return <>
    <h2>الموردون والشركات</h2>
    {error&&<div className="card customer-error">{error}</div>}
    <div className="stats">
      <div className="card receivable-card"><span>إجمالي دين لنا</span><strong>{money(data.totals.receivable)}</strong></div>
      <div className="card payable-card"><span>إجمالي دين علينا</span><strong>{money(data.totals.payable)}</strong></div>
      <div className="card final"><span>الصافي</span><strong>{money(data.totals.net)}</strong></div>
    </div>

    <form className="card form" onSubmit={add}>
      <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="اسم المورد أو الشركة" required/>
      <input value={form.contactName} onChange={e=>setForm({...form,contactName:e.target.value})} placeholder="اسم المسؤول"/>
      <input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="الهاتف"/>
      <input value={form.whatsapp} onChange={e=>setForm({...form,whatsapp:e.target.value})} placeholder="واتساب"/>
      <input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="البريد"/>
      <input value={form.country} onChange={e=>setForm({...form,country:e.target.value})} placeholder="الدولة"/>
      <input value={form.city} onChange={e=>setForm({...form,city:e.target.value})} placeholder="المدينة"/>
      <input value={form.address} onChange={e=>setForm({...form,address:e.target.value})} placeholder="العنوان"/>
      <button>إضافة</button>
    </form>

    <div className="card tablewrap">
      <table>
        <thead><tr><th>الاسم</th><th>المسؤول</th><th>الهاتف</th><th>دين لنا</th><th>دين علينا</th><th>الصافي</th><th>الملف</th></tr></thead>
        <tbody>{data.rows.length?data.rows.map(partner=><tr key={partner.id}>
          <td>{partner.name}</td><td>{partner.contactName||"-"}</td><td>{partner.phone||"-"}</td>
          <td>{money(partner.receivable)}</td><td>{money(partner.payable)}</td><td><strong>{money(partner.net)}</strong></td>
          <td><button onClick={()=>open(partner.id)}>فتح</button></td>
        </tr>):<tr><td colSpan="7">لا توجد شركات أو موردون.</td></tr>}</tbody>
      </table>
    </div>
  </>;
}

function CapitalOverview(){
  const [month,setMonth]=useState(new Date().toISOString().slice(0,7));
  const [data,setData]=useState(null);
  const [error,setError]=useState("");

  async function load(){
    setError("");
    try{
      const response=await api.get("/capital-overview",{params:{month}});
      setData(response.data);
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر تحميل رأس المال");
    }
  }

  useEffect(()=>{load();},[month]);

  if(!data)return <><h2>رأس المال الكلي</h2>{error?<div className="card customer-error">{error}</div>:<p>جاري التحميل...</p>}</>;

  const efficiency=data.turnoverRate>=3?"ممتاز":data.turnoverRate>=2?"جيد جداً":data.turnoverRate>=1?"جيد":"منخفض";

  return <>
    <div className="page-title-row">
      <h2>رأس المال الكلي وحركة دورانه</h2>
      <button className="no-print" onClick={()=>window.print()}>طباعة التقرير</button>
    </div>

    <div className="card form no-print">
      <label>اختيار الشهر</label>
      <input type="month" value={month} onChange={e=>setMonth(e.target.value)}/>
      <button onClick={load}>تحديث</button>
    </div>

    {error&&<div className="card customer-error">{error}</div>}

    <div className="stats">
      <div className="card final">
        <span>رأس المال الكلي التقديري</span>
        <strong>{money(data.totalCapital)}</strong>
      </div>
      <div className="card">
        <span>صافي حركة رأس المال</span>
        <strong>{money(data.capitalBalance)}</strong>
      </div>
      <div className="card transfer-total-card">
        <span>إجمالي الحوالات في الشهر</span>
        <strong>{money(data.monthlyTransferValue)}</strong>
      </div>
      <div className="card turnover-card">
        <span>معدل دوران رأس المال</span>
        <strong>{Number(data.turnoverRate).toFixed(2)} مرة</strong>
        <small>{efficiency}</small>
      </div>
    </div>

    <div className="stats">
      <div className="card"><span>عدد الحوالات الشهرية</span><strong>{data.monthlyTransferCount}</strong></div>
      <div className="card"><span>متوسط قيمة الحوالة</span><strong>{money(data.averageTransfer)}</strong></div>
      <div className="card"><span>أرباح الشهر</span><strong>{money(data.monthlyProfit)}</strong></div>
      <div className="card"><span>مصروفات الشهر</span><strong>{money(data.monthlyExpenses)}</strong></div>
      <div className="card receivable-card"><span>ذمم العملاء</span><strong>{money(data.receivables)}</strong></div>
      <div className="card receivable-card"><span>دين لنا</span><strong>{money(data.generalReceivable)}</strong></div>
      <div className="card payable-card"><span>دين علينا</span><strong>{money(data.generalPayable)}</strong></div>
    </div>

    <div className="card capital-formula">
      <h3>حركة دوران رأس المال</h3>
      <p><strong>إجمالي قيمة الحوالات الشهرية ÷ رأس المال المستخدم</strong></p>
      <p>النتيجة الحالية: <strong>{Number(data.turnoverRate).toFixed(2)} مرة</strong> خلال شهر {data.month}.</p>
    </div>
  </>;
}

function MonthlyReport(){
  const [month,setMonth]=useState(new Date().toISOString().slice(0,7));
  const [data,setData]=useState(null);
  const [error,setError]=useState("");

  async function load(){
    setError("");
    try{
      const response=await api.get("/monthly-report",{params:{month}});
      setData(response.data);
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر تحميل التقرير الشهري");
    }
  }

  useEffect(()=>{load();},[month]);

  if(!data)return <><h2>التقرير الشهري</h2>{error?<div className="card customer-error">{error}</div>:<p>جاري التحميل...</p>}</>;

  const s=data.summary;

  return <>
    <div className="page-title-row">
      <h2>التقرير الشهري — {data.month}</h2>
      <button className="no-print" onClick={()=>window.print()}>طباعة / حفظ PDF</button>
    </div>

    <div className="card form no-print">
      <label>الشهر</label>
      <input type="month" value={month} onChange={e=>setMonth(e.target.value)}/>
      <button onClick={load}>عرض التقرير</button>
    </div>

    {error&&<div className="card customer-error">{error}</div>}

    <div className="stats">
      <div className="card transfer-total-card"><span>إجمالي الحوالات</span><strong>{money(s.transferTotal)}</strong></div>
      <div className="card"><span>عدد الحوالات</span><strong>{s.transferCount}</strong></div>
      <div className="card"><span>متوسط الحوالة</span><strong>{money(s.averageTransfer)}</strong></div>
      <div className="card"><span>أكبر حوالة</span><strong>{money(s.largestTransfer)}</strong></div>
      <div className="card"><span>أصغر حوالة</span><strong>{money(s.smallestTransfer)}</strong></div>
    </div>

    <div className="stats">
      <div className="card"><span>أجور الحوالات</span><strong>{money(s.feesTotal)}</strong></div>
      <div className="card"><span>ربح فرق السعر</span><strong>{money(s.exchangeProfit)}</strong></div>
      <div className="card"><span>إجمالي الربح</span><strong>{money(s.grossProfit)}</strong></div>
      <div className="card payable-card"><span>المصروفات</span><strong>{money(s.expenses)}</strong></div>
      <div className="card final"><span>صافي الربح</span><strong>{money(s.netProfit)}</strong></div>
    </div>

    <div className="stats">
      <div className="card"><span>الدفعات المستلمة</span><strong>{money(s.paymentsReceived)}</strong></div>
      <div className="card receivable-card"><span>إضافات رأس المال</span><strong>{money(s.capitalIn)}</strong></div>
      <div className="card payable-card"><span>سحوبات رأس المال</span><strong>{money(s.capitalOut)}</strong></div>
      <div className="card"><span>صافي حركة رأس المال</span><strong>{money(s.netCapitalMovement)}</strong></div>
    </div>

    <div className="card tablewrap">
      <h3>الحركة اليومية خلال الشهر</h3>
      <table>
        <thead><tr><th>التاريخ</th><th>عدد الحوالات</th><th>قيمة الحوالات</th><th>الربح</th></tr></thead>
        <tbody>{data.daily.length?data.daily.map(row=><tr key={row.date}>
          <td>{row.date}</td>
          <td>{row.count}</td>
          <td>{money(row.total)}</td>
          <td>{money(row.profit)}</td>
        </tr>):<tr><td colSpan="4">لا توجد حوالات في هذا الشهر.</td></tr>}</tbody>
      </table>
    </div>

    <div className="card tablewrap">
      <h3>أكثر العملاء تعاملًا خلال الشهر</h3>
      <table>
        <thead><tr><th>العميل</th><th>إجمالي الحوالات</th></tr></thead>
        <tbody>{data.topCustomers.length?data.topCustomers.map(row=><tr key={row.customerId}>
          <td>{row.customerName}</td>
          <td>{money(row.total)}</td>
        </tr>):<tr><td colSpan="2">لا توجد بيانات.</td></tr>}</tbody>
      </table>
    </div>

    <div className="card tablewrap">
      <h3>تفاصيل حوالات الشهر</h3>
      <table>
        <thead><tr><th>الرقم</th><th>التاريخ</th><th>المبلغ</th><th>الأجور</th><th>الربح</th></tr></thead>
        <tbody>{data.transactions.length?data.transactions.map(item=><tr key={item.id}>
          <td>{item.number||item.id}</td>
          <td>{item.transferDate||String(item.createdAt||"").slice(0,10)}</td>
          <td>{money(item.amount)}</td>
          <td>{money(item.transferFee)}</td>
          <td>{money(item.totalProfit)}</td>
        </tr>):<tr><td colSpan="5">لا توجد حوالات.</td></tr>}</tbody>
      </table>
    </div>
  </>;
}

function NotificationSettings(){
  const [settings,setSettings]=useState({overdueDays:7,lowCashLimit:5000,whatsappTemplate:""});
  const [message,setMessage]=useState("");

  useEffect(()=>{
    api.get("/notification-settings").then(response=>setSettings(response.data));
  },[]);

  async function save(event){
    event.preventDefault();
    try{
      const response=await api.patch("/notification-settings",settings);
      setSettings(response.data);
      setMessage("تم حفظ إعدادات التنبيهات");
    }catch(error){
      setMessage(error.response?.data?.message||"تعذر حفظ الإعدادات");
    }
  }

  return <>
    <h2>إعدادات التنبيهات وواتساب</h2>
    {message&&<div className="card rate-message">{message}</div>}
    <form className="card form settings-form" onSubmit={save}>
      <label>بدء تنبيه التأخير بعد عدد الأيام</label>
      <input type="number" min="1" max="365" value={settings.overdueDays}
        onChange={e=>setSettings({...settings,overdueDays:e.target.value})}/>
      <label>حد انخفاض السيولة (CAD)</label>
      <input type="number" min="0" step=".01" value={settings.lowCashLimit}
        onChange={e=>setSettings({...settings,lowCashLimit:e.target.value})}/>
      <label>قالب رسالة واتساب (اختياري)</label>
      <textarea rows="6" value={settings.whatsappTemplate}
        onChange={e=>setSettings({...settings,whatsappTemplate:e.target.value})}
        placeholder="يمكن استخدام: {name} {balance} {days}"/>
      <button>حفظ الإعدادات</button>
    </form>
    <div className="card">
      <strong>ملاحظة:</strong>
      <p>زر واتساب يفتح الرسالة جاهزة للإرسال. الإرسال التلقائي دون ضغط يحتاج ربط WhatsApp Business API رسمي.</p>
    </div>
  </>;
}


function SettingsPanel(){
  const savedUser=(()=>{
    try{return JSON.parse(localStorage.getItem("afs_user")||"{}")}catch{return {}}
  })();

  const [language,setLanguage]=useState(localStorage.getItem("alaboud_language")||"ar");
  const [displayMode,setDisplayMode]=useState(localStorage.getItem("alaboud_display_mode")||"comfortable");
  const [currency,setCurrency]=useState(localStorage.getItem("alaboud_primary_currency")||"CAD");
  const [message,setMessage]=useState("");
  const [updateInfo,setUpdateInfo]=useState({checking:false,status:"",version:"v15.3.25 Final"});
  const [accountForm,setAccountForm]=useState({name:"",email:"",password:"",role:"USER"});
  const [passwordForm,setPasswordForm]=useState({currentPassword:"",newPassword:"",confirmPassword:""});

  useEffect(()=>{
    document.documentElement.lang=language;
    document.documentElement.dir=language==="ar"?"rtl":"ltr";
    window.dispatchEvent(new Event("alaboud-language-change"));
    document.body.classList.remove("display-compact","display-comfortable","display-large");
    document.body.classList.add(`display-${displayMode}`);
  },[]);

  function savePreferences(){
    localStorage.setItem("alaboud_language",language);
    localStorage.setItem("alaboud_display_mode",displayMode);
    localStorage.setItem("alaboud_primary_currency",currency);

    document.documentElement.lang=language;
    document.documentElement.dir=language==="ar"?"rtl":"ltr";
    document.body.classList.remove("display-compact","display-comfortable","display-large");
    document.body.classList.add(`display-${displayMode}`);

    setMessage(language==="ar"?"تم حفظ إعدادات العرض":"Display settings saved");
  }

  async function createAccount(event){
    event.preventDefault();
    setMessage("");
    try{
      await api.post("/users",accountForm);
      setAccountForm({name:"",email:"",password:"",role:"USER"});
      setMessage("تم إنشاء الحساب بنجاح");
    }catch(error){
      setMessage(error.response?.data?.message||"تعذر إنشاء الحساب");
    }
  }

  async function changePassword(event){
    event.preventDefault();
    setMessage("");
    if(passwordForm.newPassword!==passwordForm.confirmPassword){
      setMessage("تأكيد كلمة المرور غير مطابق");
      return;
    }

    try{
      const response=await api.post("/auth/change-password",{
        currentPassword:passwordForm.currentPassword,
        newPassword:passwordForm.newPassword
      });
      setPasswordForm({currentPassword:"",newPassword:"",confirmPassword:""});
      setMessage(response.data?.message||"تم تغيير كلمة المرور");
    }catch(error){
      setMessage(error.response?.data?.message||"تعذر تغيير كلمة المرور");
    }
  }

  async function checkUpdates(){
    setUpdateInfo(current=>({...current,checking:true,status:"جاري التحقق..."}));
    try{
      const response=await api.get("/health");
      const serverVersion=response.data?.version||"غير معروف";
      setUpdateInfo({
        checking:false,
        status:`الخدمة تعمل بشكل طبيعي — إصدار الخادم ${serverVersion}`,
        version:"v15.3.25 Final"
      });
    }catch{
      setUpdateInfo(current=>({...current,checking:false,status:"تعذر التحقق من حالة التحديث"}));
    }
  }

  const labels=language==="ar"
    ?{
      title:"الإعدادات",
      language:"اللغة",
      arabic:"العربية",
      english:"English",
      display:"طريقة العرض",
      compact:"مضغوط",
      comfortable:"مريح",
      large:"كبير",
      currency:"العملة الرئيسية",
      save:"حفظ إعدادات العرض"
    }
    :{
      title:"Settings",
      language:"Language",
      arabic:"العربية",
      english:"English",
      display:"Display mode",
      compact:"Compact",
      comfortable:"Comfortable",
      large:"Large",
      currency:"Primary currency",
      save:"Save display settings"
    };

  return <section className="settings-page">
    <div className="settings-hero">
      <div>
        <span className="settings-hero-icon">⚙️</span>
        <div>
          <h2>{labels.title}</h2>
          <p>شركة العبود التجارية — إدارة تفضيلات البرنامج والحساب</p>
        </div>
      </div>
      <span className="settings-version">v15.3.25 Final</span>
    </div>

    {message&&<div className="card settings-message">{message}</div>}

    <div className="settings-grid">
      <article className="settings-card">
        <div className="settings-card-title"><span>🌐</span><h3>{labels.language}</h3></div>
        <div className="settings-choice-grid">
          <button type="button" className={language==="ar"?"selected":""} onClick={()=>setLanguage("ar")}>العربية</button>
          <button type="button" className={language==="en"?"selected":""} onClick={()=>setLanguage("en")}>English</button>
        </div>

        <div className="settings-card-title settings-subtitle"><span>🖥️</span><h3>{labels.display}</h3></div>
        <div className="settings-choice-grid three">
          <button type="button" className={displayMode==="compact"?"selected":""} onClick={()=>setDisplayMode("compact")}>{labels.compact}</button>
          <button type="button" className={displayMode==="comfortable"?"selected":""} onClick={()=>setDisplayMode("comfortable")}>{labels.comfortable}</button>
          <button type="button" className={displayMode==="large"?"selected":""} onClick={()=>setDisplayMode("large")}>{labels.large}</button>
        </div>

        <label className="settings-label">{labels.currency}</label>
        <select value={currency} onChange={e=>setCurrency(e.target.value)}>
          {["CAD","USD","EUR","GBP","AED","TRY","SYP"].map(code=><option key={code} value={code}>{code}</option>)}
        </select>

        <button className="settings-primary-button" type="button" onClick={savePreferences}>{labels.save}</button>
      </article>

      <article className="settings-card">
        <div className="settings-card-title"><span>👤</span><h3>إنشاء حساب</h3></div>
        <p className="settings-help">الحساب الحالي: {savedUser.name||savedUser.email||"مدير النظام"}</p>
        <form className="settings-form-modern" onSubmit={createAccount}>
          <input value={accountForm.name} onChange={e=>setAccountForm({...accountForm,name:e.target.value})} placeholder="اسم المستخدم" required/>
          <input type="email" value={accountForm.email} onChange={e=>setAccountForm({...accountForm,email:e.target.value})} placeholder="البريد الإلكتروني" required/>
          <input type="password" value={accountForm.password} onChange={e=>setAccountForm({...accountForm,password:e.target.value})} placeholder="كلمة المرور — 8 أحرف على الأقل" required/>
          <select value={accountForm.role} onChange={e=>setAccountForm({...accountForm,role:e.target.value})}>
            <option value="USER">مستخدم</option>
            <option value="MANAGER">مدير</option>
            <option value="ADMIN">مسؤول كامل</option>
          </select>
          <button>إنشاء الحساب</button>
        </form>
      </article>

      <article className="settings-card">
        <div className="settings-card-title"><span>🔐</span><h3>تغيير كلمة السر</h3></div>
        <form className="settings-form-modern" onSubmit={changePassword}>
          <input type="password" value={passwordForm.currentPassword} onChange={e=>setPasswordForm({...passwordForm,currentPassword:e.target.value})} placeholder="كلمة المرور الحالية" required/>
          <input type="password" value={passwordForm.newPassword} onChange={e=>setPasswordForm({...passwordForm,newPassword:e.target.value})} placeholder="كلمة المرور الجديدة" required/>
          <input type="password" value={passwordForm.confirmPassword} onChange={e=>setPasswordForm({...passwordForm,confirmPassword:e.target.value})} placeholder="تأكيد كلمة المرور الجديدة" required/>
          <button>تغيير كلمة السر</button>
        </form>
      </article>

      <article className="settings-card">
        <div className="settings-card-title"><span>🛟</span><h3>الدعم الفني</h3></div>
        <p className="settings-help">عند حدوث مشكلة، أرسل صورة الخطأ ورقم الإصدار الظاهر في البرنامج.</p>
        <div className="support-actions">
          <a href="mailto:support@alaboud.local?subject=ALABOUD%20Business%20Suite%20Support">✉️ البريد الفني</a>
          <button type="button" onClick={()=>navigator.clipboard?.writeText("v15.3.25 Final").then(()=>setMessage("تم نسخ رقم الإصدار"))}>📋 نسخ رقم الإصدار</button>
        </div>
      </article>

      <article className="settings-card settings-updates-card">
        <div className="settings-card-title"><span>⬆️</span><h3>التحديثات</h3></div>
        <div className="update-current-version">
          <span>الإصدار الحالي</span>
          <strong>{updateInfo.version}</strong>
        </div>
        <p className="settings-help">{updateInfo.status||"اضغط للتحقق من حالة الخدمة والتحديث."}</p>
        <button type="button" className="settings-primary-button" onClick={checkUpdates} disabled={updateInfo.checking}>
          {updateInfo.checking?"جاري التحقق...":"التحقق من التحديثات"}
        </button>
      </article>
    </div>
  </section>;
}

function Simple({type}){const[list,setList]=useState([]),[title,setTitle]=useState(""),[amount,setAmount]=useState(""),[move,setMove]=useState("IN");const endpoint=type==="expenses"?"/expenses":"/capital";const load=()=>api.get(endpoint).then(r=>setList(r.data));useEffect(()=>{load();},[type]);async function add(e){e.preventDefault();await api.post(endpoint,type==="expenses"?{title,amount}:{type:move,amount,description:title});setTitle("");setAmount("");load();}return <><h2>{type==="expenses"?"المصروفات":"رأس المال"}</h2><form className="card form" onSubmit={add}>{type==="capital"&&<select value={move} onChange={e=>setMove(e.target.value)}><option value="IN">زيادة</option><option value="OUT">سحب</option></select>}<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="الوصف" required/><input type="number" step=".01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="المبلغ" required/><button>حفظ</button></form><div className="card tablewrap"><table><tbody>{list.map(x=><tr key={x.id}><td>{x.date}</td><td>{x.title||x.description}</td><td>{x.type||x.category}</td><td>{money(x.amount)}</td></tr>)}</tbody></table></div></>}
export default function App(){
  const [token,setToken]=useState(localStorage.getItem("afs_token"));
  const [page,setPage]=useState("dashboard");
  const [customerId,setCustomerId]=useState(null);
  const [invoiceId,setInvoiceId]=useState(null);
  const [statementCustomerId,setStatementCustomerId]=useState(null);
  const [partnerId,setPartnerId]=useState(null);
  const [overdueCount,setOverdueCount]=useState(0);
  const [logoutConfirm,setLogoutConfirm]=useState(false);
  const [mobileMenuOpen,setMobileMenuOpen]=useState(
    typeof window!=="undefined" ? window.matchMedia("(max-width: 800px)").matches : false
  );

  useEffect(()=>{
    if(token){
      api.get("/customer-alerts")
        .then(response=>setOverdueCount(Number(response.data?.count||0)))
        .catch(()=>setOverdueCount(0));
    }
  },[token,page,customerId]);

  useEffect(()=>{
    if(typeof window==="undefined")return;
    const onBack=()=>{
      if(mobileMenuOpen){
        setMobileMenuOpen(false);
        history.pushState(null,"",location.href);
      }
    };
    history.pushState(null,"",location.href);
    window.addEventListener("popstate",onBack);
    return()=>window.removeEventListener("popstate",onBack);
  },[mobileMenuOpen]);

  if(!token){
    return <Login onLogin={()=>setToken(localStorage.getItem("afs_token"))}/>;
  }

  function navigate(nextPage){
    setPage(nextPage);
    setCustomerId(null);
    setInvoiceId(null);
    setStatementCustomerId(null);
    setPartnerId(null);
    if(typeof window!=="undefined"&&window.matchMedia("(max-width: 800px)").matches){
      setMobileMenuOpen(false);
      window.scrollTo({top:0,behavior:"smooth"});
    }
  }

  let content;
  if(invoiceId){
    content=<Invoice transactionId={invoiceId} back={()=>setInvoiceId(null)}/>;
  }else if(statementCustomerId){
    content=<Statement customerId={statementCustomerId} back={()=>setStatementCustomerId(null)}/>;
  }else if(customerId){
    content=<Customer id={customerId} back={()=>setCustomerId(null)} onStatement={setStatementCustomerId}/>;
  }else if(partnerId){
    content=<PartnerProfile id={partnerId} back={()=>setPartnerId(null)}/>;
  }else if(page==="dashboard"){
    content=<Dashboard navigate={navigate}/>;
  }else if(page==="customers"){
    content=<Customers open={setCustomerId}/>;
  }else if(page==="overdue-customers"){
    content=<OverdueCustomers openCustomer={setCustomerId} onStatement={setStatementCustomerId} navigateCustomers={()=>navigate("customers")}/>;
  }else if(page==="partners"){
    content=<Partners open={setPartnerId}/>;
  }else if(page==="transactions"){
    content=<Transactions openInvoice={setInvoiceId}/>;
  }else if(page==="profits"){
    content=<Profits/>;
  }else if(page==="rates"){
    content=<ExchangeRates/>;
  }else if(page==="debts"){
    content=<GeneralDebts/>;
  }else if(page==="capital-overview"){
    content=<CapitalOverview/>;
  }else if(page==="monthly-report"){
    content=<MonthlyReport/>;
  }else if(page==="notification-settings"){
    content=<NotificationSettings/>;
  }else if(page==="settings"){
    content=<SettingsPanel/>;
  }else if(page==="expenses"){
    content=<Simple type="expenses"/>;
  }else{
    content=<Simple type="capital"/>;
  }

  const showHomeButton =
    page !== "dashboard" ||
    Boolean(customerId) ||
    Boolean(invoiceId) ||
    Boolean(statementCustomerId) ||
    Boolean(partnerId);

  const menu=[
    ["dashboard","⌂ القائمة الرئيسية"],
    ["customers","👥 العملاء"],
    ["overdue-customers",`⏰ العملاء المتأخرون${overdueCount?` (${overdueCount})`:""}`],
    ["partners","🏢 الموردون والشركات"],
    ["transactions","⇄ الحوالات"],
    ["profits","📈 الأرباح"],
    ["rates","💱 العملات وأسعار الصرف"],
    ["debts","📒 الدَّين العام"],
    ["capital-overview","💰 رأس المال الكلي"],
    ["monthly-report","📊 التقارير الشهرية"],
    ["notification-settings","🔔 إعدادات التنبيهات"],
    ["settings","⚙️ الإعدادات"],
    ["expenses","🧾 المصروفات"],
    ["capital","🏦 حركة رأس المال"]
  ];

  return <><AppLanguageBridge/><div className={`app ${mobileMenuOpen?"mobile-menu-view":"mobile-page-view"}`}>
    <div className="mobile-page-header no-print">
      <button className="mobile-header-action mobile-menu-action" onClick={()=>setMobileMenuOpen(true)} aria-label="فتح القائمة">
        <span className="mobile-header-icon">☰</span><span>القائمة</span>
      </button>
      <div className="mobile-brand-center"><img className="mobile-header-logo" src="/alaboud-company-logo.webp" alt="شركة العبود التجارية"/><small>v15.3.25 Final</small></div>
      <button className="mobile-header-action mobile-home-action" onClick={()=>setMobileMenuOpen(true)} aria-label="القائمة الرئيسية">
        <span className="mobile-header-icon">⌂</span><span>الرئيسية</span>
      </button>
    </div>
    <aside>
      <div className="mobile-menu-heading no-print">
        <img className="alaboud-sidebar-logo mobile-logo" src="/alaboud-company-logo.webp" alt="شركة العبود التجارية" />
        <button onClick={()=>setMobileMenuOpen(false)}>✕</button>
      </div>
      <div className="sidebar-logo-wrap"><img className="alaboud-sidebar-logo" src="/alaboud-company-logo.webp" alt="شركة العبود التجارية" /></div>
      <div className="sidebar-account-box no-print">
        <div>
          <strong>شركة العبود التجارية</strong>
          <small>v15.3.25 Final Mobile</small>
        </div>
      </div>
      {menu.map(([key,label])=><button
        key={key}
        className={page===key&&!customerId&&!invoiceId&&!statementCustomerId&&!partnerId?"active":""}
        onClick={()=>navigate(key)}
      >{label}</button>)}
      <button className="logout-top sidebar-logout-bottom" onClick={()=>setLogoutConfirm(true)}>🚪 تسجيل الخروج</button>
      {logoutConfirm&&<div className="logout-confirm-overlay no-print" onClick={()=>setLogoutConfirm(false)}>
        <div className="logout-confirm-card" onClick={e=>e.stopPropagation()}>
          <h3>تسجيل الخروج</h3>
          <p>هل تريد تسجيل الخروج من البرنامج؟</p>
          <div>
            <button className="danger-button" onClick={()=>{
              localStorage.clear();
              setToken(null);
              setLogoutConfirm(false);
            }}>نعم، تسجيل الخروج</button>
            <button onClick={()=>setLogoutConfirm(false)}>إلغاء</button>
          </div>
        </div>
      </div>}
    </aside>
    <main className="app-main-content">
      {showHomeButton&&<div className="home-return-bar no-print">
        <button className="home-return-button" onClick={()=>{
          if(typeof window!=="undefined"&&window.matchMedia("(max-width: 800px)").matches){
            setMobileMenuOpen(true);
          }else{
            navigate("dashboard");
          }
        }}>
          ⬅ العودة إلى القائمة الرئيسية
        </button>
      </div>}
      <AppErrorBoundary key={`${page}-${customerId}-${invoiceId}-${statementCustomerId}-${partnerId}`}>
        {content}
      </AppErrorBoundary>
    </main>
    <nav className="mobile-bottom-nav no-print" aria-label="التنقل السريع">
      <button className={page==="customers"?"active":""} onClick={()=>navigate("customers")}>
        <span>👥</span><small>العملاء</small>
      </button>
      <button className={page==="transactions"?"active":""} onClick={()=>navigate("transactions")}>
        <span>⇄</span><small>الحوالات</small>
      </button>
      <button className={page==="dashboard"?"active":""} onClick={()=>navigate("dashboard")}>
        <span>⌂</span><small>الرئيسية</small>
      </button>
      <button className={page==="monthly-report"?"active":""} onClick={()=>navigate("monthly-report")}>
        <span>▥</span><small>التقارير</small>
      </button>
      <button onClick={()=>setMobileMenuOpen(true)}>
        <span>•••</span><small>المزيد</small>
      </button>
    </nav>
  </div></>;
}
