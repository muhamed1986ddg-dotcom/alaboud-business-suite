import React,{useEffect,useRef,useState}from"react";import api from"./api";import {APP_VERSION} from"./version";
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


const flagOf=code=>{
  const normalized=String(code||"").toUpperCase();
  return ({USD:"🇺🇸",CAD:"🇨🇦",EUR:"🇪🇺",TRY:"🇹🇷",SYP:"🇸🇾",SAR:"🇸🇦",JOD:"🇯🇴",GBP:"🇬🇧",AED:"🇦🇪"})[normalized]||"🏳️";
};

const cleanConnectorMessage=value=>{
  const text=String(value||"").replace(/\s+/g," ").trim();
  if(!text)return "تعذر إكمال العملية";
  const technical=/chromium-launched|authenticated-landing|after-credentials|after-otp|login-page|account-page|failure:|https?:\/\/jd\d+/i;
  if(technical.test(text)){
    if(/authenticator|رمز التحقق|otp/i.test(text))return "تعذر تسجيل الدخول إلى جاد. أدخل رمز Google Authenticator جديدًا ثم أعد المحاولة.";
    if(/كلمة المرور|اسم المستخدم|credentials/i.test(text))return "تعذر تسجيل الدخول إلى جاد. تحقق من اسم المستخدم وكلمة المرور.";
    return "تعذر تحديث بيانات جاد. افتح سجل الربط فقط عند الحاجة للتشخيص.";
  }
  return text.length>260?`${text.slice(0,257)}...`:text;
};


const EXCHANGE_CURRENCY_CATALOG=[
  {code:"USD",name:"دولار أمريكي",flag:"🇺🇸"},{code:"CAD",name:"دولار كندي",flag:"🇨🇦"},
  {code:"EUR",name:"يورو",flag:"🇪🇺"},{code:"TRY",name:"ليرة تركية",flag:"🇹🇷"},
  {code:"SYP",name:"ليرة سورية",flag:"🇸🇾"},{code:"SAR",name:"ريال سعودي",flag:"🇸🇦"},
  {code:"JOD",name:"دينار أردني",flag:"🇯🇴"},{code:"GBP",name:"جنيه إسترليني",flag:"🇬🇧"},
  {code:"AED",name:"درهم إماراتي",flag:"🇦🇪"},{code:"LBP",name:"ليرة لبنانية",flag:"🇱🇧"},
  {code:"EGP",name:"جنيه مصري",flag:"🇪🇬"},{code:"IQD",name:"دينار عراقي",flag:"🇮🇶"},
  {code:"KWD",name:"دينار كويتي",flag:"🇰🇼"},{code:"QAR",name:"ريال قطري",flag:"🇶🇦"},
  {code:"BHD",name:"دينار بحريني",flag:"🇧🇭"},{code:"OMR",name:"ريال عُماني",flag:"🇴🇲"},
  {code:"CHF",name:"فرنك سويسري",flag:"🇨🇭"},{code:"AUD",name:"دولار أسترالي",flag:"🇦🇺"},
  {code:"NZD",name:"دولار نيوزيلندي",flag:"🇳🇿"},{code:"CNY",name:"يوان صيني",flag:"🇨🇳"},
  {code:"JPY",name:"ين ياباني",flag:"🇯🇵"},{code:"INR",name:"روبية هندية",flag:"🇮🇳"},
  {code:"SEK",name:"كرونة سويدية",flag:"🇸🇪"},{code:"NOK",name:"كرونة نرويجية",flag:"🇳🇴"}
];

const debtCurrencies=[
    {code:"USD",flag:"🇺🇸",name:"دولار أمريكي",symbol:"$"},
    {code:"CAD",flag:"🇨🇦",name:"دولار كندي",symbol:"$"},
    {code:"EUR",flag:"🇪🇺",name:"يورو",symbol:"€"},
    {code:"TRY",flag:"🇹🇷",name:"ليرة تركية",symbol:"₺"},
    {code:"SYP",flag:"🇸🇾",name:"ليرة سورية",symbol:"ل.س"},
    {code:"SAR",flag:"🇸🇦",name:"ريال سعودي",symbol:"ر.س"},
    {code:"JOD",flag:"🇯🇴",name:"دينار أردني",symbol:"د.أ"}
  ];

function CurrencyFlag({code,className=""}){
  const normalized=String(code||"").toUpperCase();
  const supported=["CAD","USD","EUR","GBP","AED","TRY","SYP","SAR","JOD"];
  const goldCodes=["XAU24","XAU22","XAU21","XAU18"];
  if(goldCodes.includes(normalized)){
    return <span className={`gold-rate-icon ${className}`} aria-label="gold">🪙</span>;
  }
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
  "العملاء المتأخرون":"Overdue Customers","الشركات":"Companies",
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
  "فتح الحساب":"Open Account","إضافة دفعة":"Add Payment","تعديل":"Edit","واتساب كشف الحساب":"WhatsApp Final Total (CAD)",
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
  "جاري التحميل...":"Loading...","حدث خطأ في الصفحة":"Page Error",
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

function Login({onLogin}){
  const [mode,setMode]=useState("login");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [form,setForm]=useState({ownerName:"",companyName:"",email:"",phone:"",password:"",confirmPassword:""});
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [accepted,setAccepted]=useState(localStorage.getItem("alaboud_legal_acceptance_v1")==="yes");
  const [twoFactor,setTwoFactor]=useState({required:false,challenge:"",code:""});
  const nativeBiometric=typeof window!=="undefined"&&window.AlAboudNative?.requestBiometricLogin;
  const biometricEnabled=Boolean(nativeBiometric&&window.AlAboudNative?.isBiometricEnabled?.());
  async function saveSession(data){
    localStorage.setItem("afs_token",data.token); localStorage.setItem("afs_user",JSON.stringify(data.user));
    try{if(window.AlAboudNative?.saveBiometricToken&&window.AlAboudNative?.isBiometricEnabled?.()){const response=await api.post("/auth/biometric-token");window.AlAboudNative.saveBiometricToken(response.data.token,JSON.stringify(data.user));}}catch{}
    onLogin();
  }
  async function submitLogin(e){
    e.preventDefault();setError(""); if(!accepted){setError("يجب الموافقة على سياسة الخصوصية وشروط الاستخدام");return}
    localStorage.setItem("alaboud_legal_acceptance_v1","yes");setBusy(true);
    try{const {data}=await api.post("/auth/login",{email,password});if(data.twoFactorRequired){setTwoFactor({required:true,challenge:data.challenge,code:""});return}await saveSession(data)}
    catch(error){setError(error.response?.data?.message||"فشل تسجيل الدخول")}finally{setBusy(false)}
  }
  async function submitTwoFactor(e){e.preventDefault();setBusy(true);setError("");try{const {data}=await api.post("/auth/2fa/verify",{challenge:twoFactor.challenge,code:twoFactor.code});await saveSession(data)}catch(error){setError(error.response?.data?.message||"رمز التحقق غير صحيح")}finally{setBusy(false)}}
  useEffect(()=>{const handler=async event=>{try{setBusy(true);const {data}=await api.post("/auth/biometric-login",{token:event.detail?.token});await saveSession(data)}catch(error){setError(error.response?.data?.message||"تعذر الدخول بالبصمة أو الوجه")}finally{setBusy(false)}};window.addEventListener("alaboud-biometric-token",handler);return()=>window.removeEventListener("alaboud-biometric-token",handler)},[]);
  async function submitRegister(e){e.preventDefault();setError("");if(!accepted){setError("يجب الموافقة على سياسة الخصوصية وشروط الاستخدام");return}localStorage.setItem("alaboud_legal_acceptance_v1","yes");if(form.password!==form.confirmPassword){setError("تأكيد كلمة المرور غير مطابق");return}setBusy(true);try{const {data}=await api.post("/auth/register-company",{ownerName:form.ownerName,companyName:form.companyName,email:form.email,phone:form.phone,password:form.password});await saveSession(data)}catch(error){setError(error.response?.data?.message||"تعذر إنشاء الحساب")}finally{setBusy(false)}}
  if(twoFactor.required)return <div className="login"><form className="panel public-account-panel" onSubmit={submitTwoFactor}><img className="login-company-logo" src="/alaboud-company-logo.webp" alt="شركة العبود التجارية"/><h1>التحقق بخطوتين</h1><p>أدخل الرمز المكوّن من 6 أرقام من تطبيق Authenticator.</p><input inputMode="numeric" autoComplete="one-time-code" maxLength="6" value={twoFactor.code} onChange={e=>setTwoFactor({...twoFactor,code:e.target.value.replace(/\D/g,"").slice(0,6)})} placeholder="000000" required/>{error&&<div className="error">{error}</div>}<button disabled={busy||twoFactor.code.length!==6}>{busy?"جاري التحقق...":"تحقق ودخول"}</button><button type="button" className="account-mode-button" onClick={()=>setTwoFactor({required:false,challenge:"",code:""})}>العودة</button></form></div>;
  return <div className="login"><form className="panel public-account-panel" onSubmit={mode==="login"?submitLogin:submitRegister}><img className="login-company-logo" src="/alaboud-company-logo.webp" alt="شركة العبود التجارية"/><h1>{mode==="login"?"تسجيل الدخول":"إنشاء حساب شركة جديد"}</h1><p className="login-company-en">ALABOUD BUSINESS SUITE</p>{mode==="login"?<><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="البريد الإلكتروني" required/><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="كلمة المرور" required/></>:<><input value={form.ownerName} onChange={e=>setForm({...form,ownerName:e.target.value})} placeholder="اسم صاحب الحساب" required/><input value={form.companyName} onChange={e=>setForm({...form,companyName:e.target.value})} placeholder="اسم الشركة" required/><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="البريد الإلكتروني" required/><input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="رقم الهاتف"/><input type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="كلمة المرور — 12 حرفًا قوية" required/><input type="password" value={form.confirmPassword} onChange={e=>setForm({...form,confirmPassword:e.target.value})} placeholder="تأكيد كلمة المرور" required/></>}<label className="legal-consent"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span>أوافق على سياسة الخصوصية وشروط الاستخدام</span></label>{error&&<div className="error">{error}</div>}<button disabled={busy}>{busy?"جاري التنفيذ...":mode==="login"?"تسجيل الدخول":"إنشاء الحساب والدخول"}</button>{mode==="login"&&biometricEnabled&&<button className="biometric-login-button" type="button" onClick={()=>window.AlAboudNative.requestBiometricLogin()}>👆 الدخول بالبصمة أو الوجه</button>}<button className="account-mode-button" type="button" onClick={()=>{setMode(mode==="login"?"register":"login");setError("")}}>{mode==="login"?"مستخدم جديد؟ إنشاء حساب شركة":"لدي حساب بالفعل — تسجيل الدخول"}</button></form></div>
}
function Dashboard({navigate}){
  const [data,setData]=useState(null);
  const [noticeData,setNoticeData]=useState({count:0,overdueCount:0,overdueTotal:0,notifications:[]});
  const [recent,setRecent]=useState([]);
  const [dashboardRates,setDashboardRates]=useState([]);
  const [dashboardRateHistory,setDashboardRateHistory]=useState([]);
  const [ratesRefreshing,setRatesRefreshing]=useState(false);
  const [ratesError,setRatesError]=useState("");
  const [open,setOpen]=useState(false);
  const [intelligence,setIntelligence]=useState(null);
  const [lastRefresh,setLastRefresh]=useState(new Date());
  const [allTransactions,setAllTransactions]=useState([]);
  const [customers,setCustomers]=useState([]);
  const [expenses,setExpenses]=useState([]);
  const [globalSearch,setGlobalSearch]=useState("");
  const [searchOpen,setSearchOpen]=useState(false);

  useEffect(()=>{
    let active=true;
    const loadDashboard=async(refreshRates=false)=>{
      try{
        if(refreshRates){setRatesRefreshing(true);setRatesError("");await api.post("/exchange-rates/refresh");}
        const [dashboardResponse,notificationResponse,transactionsResponse,ratesResponse,historyResponse,intelligenceResponse,customersResponse,expensesResponse]=await Promise.all([
          api.get("/dashboard"),
          api.get("/notifications"),
          api.get("/transactions"),
          api.get("/exchange-rates"),
          api.get("/exchange-rates/history"),
          api.get("/ai/overview"),
          api.get("/customers"),
          api.get("/expenses")
        ]);
        if(!active)return;
        setData(dashboardResponse.data);
        setNoticeData(notificationResponse.data);
        const rows=Array.isArray(transactionsResponse.data)?transactionsResponse.data:[];
        setAllTransactions(rows);
        setCustomers(Array.isArray(customersResponse.data)?customersResponse.data:[]);
        setExpenses(Array.isArray(expensesResponse.data)?expensesResponse.data:[]);
        setRecent(rows.slice().sort((a,b)=>new Date(b.createdAt||b.transferDate)-new Date(a.createdAt||a.transferDate)).slice(0,4));
        const rateRows=Array.isArray(ratesResponse.data)?ratesResponse.data:[];
        const dashboardCurrencyOrder=["USD","CAD","EUR","TRY","SYP","SAR","JOD"];
        const latestByCurrency=new Map();
        rateRows
          .filter(rate=>dashboardCurrencyOrder.includes(String(rate.baseCurrency||"").toUpperCase()))
          .sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")))
          .forEach(rate=>{
            const code=String(rate.baseCurrency||"").toUpperCase();
            if(!latestByCurrency.has(code))latestByCurrency.set(code,rate);
          });
        setDashboardRates(dashboardCurrencyOrder.map(code=>latestByCurrency.get(code)).filter(Boolean));
        setDashboardRateHistory(Array.isArray(historyResponse.data)?historyResponse.data:[]);
        setIntelligence(intelligenceResponse.data||null);
        setLastRefresh(new Date());
      }catch(error){
        if(refreshRates)setRatesError(error.response?.data?.message||"تعذر تحديث أسعار الصرف. تم الاحتفاظ بآخر أسعار صحيحة.");
      }finally{
        if(refreshRates)setRatesRefreshing(false);
      }
    };
    loadDashboard(false);
    const live=setInterval(()=>loadDashboard(false),60*1000);
    const hourly=setInterval(()=>loadDashboard(true),60*60*1000);
    return ()=>{active=false;clearInterval(live);clearInterval(hourly)};
  },[]);

  useEffect(()=>{
    const onKey=event=>{
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"){
        event.preventDefault();setSearchOpen(true);
      }
      if(event.key==="Escape")setSearchOpen(false);
    };
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[]);

  if(!data)return <div className="premium-loading">جاري تحميل لوحة التحكم…</div>;

  const smart=intelligence||{};
  const healthScore=Number(smart.healthScore??100);
  const health=healthScore>=85?{label:"ممتاز",tone:"excellent",icon:"🟢"}:healthScore>=65?{label:"جيد",tone:"good",icon:"🟡"}:healthScore>=40?{label:"يحتاج متابعة",tone:"attention",icon:"🟠"}:{label:"خطر",tone:"danger",icon:"🔴"};
  const netProfit=Number(smart.today?.netProfit??data.todayProfit??0);
  const netDebt=Number(smart.finance?.receivables??data.receivables??0);
  const profitTrend=Number(smart.month?.profitTrend||0);
  const todayKey=new Date().toISOString().slice(0,10);
  const last7=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));return d.toISOString().slice(0,10)});
  const chartData=last7.map(date=>{
    const dayRows=allTransactions.filter(item=>String(item.transferDate||item.createdAt||"").slice(0,10)===date);
    return {date,total:dayRows.reduce((sum,item)=>sum+Number(item.totalCustomerDue||item.amount||0),0),profit:dayRows.reduce((sum,item)=>sum+Number(item.profit||item.netProfit||0),0)};
  });
  const chartMax=Math.max(1,...chartData.map(item=>Math.max(item.total,item.profit)));
  const customerScores=customers.map(customer=>{
    const customerRows=allTransactions.filter(item=>String(item.customerId)===String(customer.id));
    const profit=customerRows.reduce((sum,item)=>sum+Number(item.profit||item.netProfit||0),0);
    const volume=customerRows.reduce((sum,item)=>sum+Number(item.totalCustomerDue||item.amount||0),0);
    const debt=Number(customer.finalBalance||0);
    const grade=profit>=1000&&debt<=0?"A":profit>=300?"B":"C";
    return {...customer,profit,volume,debt,grade,operations:customerRows.length};
  }).sort((a,b)=>b.profit-a.profit);
  const monthlyRows=allTransactions.filter(item=>String(item.transferDate||item.createdAt||"").slice(0,7)===todayKey.slice(0,7));
  const currencyProfit=Object.entries(monthlyRows.reduce((acc,item)=>{const c=String(item.currency||"CAD").toUpperCase();acc[c]=(acc[c]||0)+Number(item.profit||item.netProfit||0);return acc},{})).sort((a,b)=>b[1]-a[1]);
  const query=globalSearch.trim().toLowerCase();
  const searchResults=query?[...customers.map(x=>({type:"عميل",title:x.name||"عميل",subtitle:`الرصيد ${cad(x.finalBalance||0)}`,page:"customers"})),...allTransactions.map(x=>({type:"حوالة",title:x.number||x.customerName||"حوالة",subtitle:`${x.amount||0} ${x.currency||""}`,page:"transactions"})),...expenses.map(x=>({type:"مصروف",title:x.title||x.description||"مصروف",subtitle:cad(x.amount||0),page:"expenses"}))].filter(x=>`${x.title} ${x.subtitle} ${x.type}`.toLowerCase().includes(query)).slice(0,12):[];

  const kpis=[
    {label:"صافي الأرباح",value:cad(netProfit),icon:"📈",tone:netProfit>=0?"green":"red",note:`${profitTrend>=0?"▲":"▼"} ${Math.abs(profitTrend).toFixed(1)}% هذا الشهر`,page:"profits"},
    {label:"صافي الدين",value:cad(netDebt),icon:"💸",tone:netDebt>0?"red":"green",note:`${smart.finance?.overdueCount??noticeData.overdueCount??0} عملاء متأخرون`,page:"general-debts"},
    {label:"رصيد الصندوق",value:cad(smart.finance?.capital??data.capital??0),icon:"🏦",tone:Number(smart.finance?.capital??data.capital??0)>=0?"blue":"red",note:"الرصيد الحالي",page:"capital-overview"},
    {label:"حوالات اليوم",value:data.todayTransactions||0,icon:"💱",tone:"purple",note:"إجمالي العمليات اليوم",page:"transactions"},
    {label:"عدد العملاء",value:data.customers||0,icon:"👥",tone:"blue",note:"العملاء المسجلون",page:"customers"},
    {label:"مصروفات اليوم",value:cad(smart.today?.expenses||0),icon:"👛",tone:"orange",note:"المصروفات اليومية",page:"expenses"}
  ];

  return <div className="premium-dashboard v20-dashboard">
    <section className="premium-hero dashboard-pro-hero">
      <div className="dashboard-pro-brand">
        <img src="/alaboud-company-logo.webp" alt="شركة العبود التجارية"/>
        <div><h2>شركة العبود التجارية</h2><p>{APP_VERSION} <span>● متصل</span></p></div>
      </div>
      <button className="dashboard-pro-search" onClick={()=>setSearchOpen(true)}>⌕ <span>بحث عالمي...</span><kbd>Ctrl + K</kbd></button>
      <div className="dashboard-pro-clock"><strong>{new Date().toLocaleTimeString("en-CA",{hour:"2-digit",minute:"2-digit"})}</strong><small>{new Date().toLocaleDateString("ar-CA",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</small></div>
    </section>

    <section className={`enterprise-health health-${health.tone} v20-status-strip`}>
      <div className="enterprise-health-score"><span>{health.icon}</span><div><small>حالة النظام</small><strong>جميع الأنظمة تعمل بشكل طبيعي</strong></div></div>
      <div className="enterprise-health-meta">
        <span>🛡️ صحة الشركة <b>{healthScore}/100</b></span>
        <span>☁️ المزامنة متصلة</span>
        <span>🔄 آخر تحديث {lastRefresh.toLocaleTimeString("ar-CA",{hour:"2-digit",minute:"2-digit"})}</span>
      </div>
    </section>

    <section className="dashboard-exchange-board panel-dark v20-exchange-board">
      <div className="exchange-board-header">
        <div>
          <span className="exchange-board-kicker">LIVE <i></i></span>
          <h2>لوحة أسعار الصرف المباشرة</h2>
          <p>الأسعار الرئيسية مقابل الدولار الكندي · تحديث آلي كل 30 دقيقة</p>
        </div>
        <div className="exchange-board-actions">
          <span className="exchange-board-updated">آخر تحديث: {lastRefresh.toLocaleTimeString("ar-CA",{hour:"2-digit",minute:"2-digit"})}</span>
          <button disabled={ratesRefreshing} onClick={async()=>{
            try{
              setRatesRefreshing(true);setRatesError("");
              await api.post("/exchange-rates/refresh");
              const [ratesResponse,historyResponse]=await Promise.all([api.get("/exchange-rates"),api.get("/exchange-rates/history")]);
              const order=["USD","CAD","EUR","TRY","SYP","SAR","JOD"];
              const latest=new Map();
              (Array.isArray(ratesResponse.data)?ratesResponse.data:[]).filter(rate=>order.includes(String(rate.baseCurrency||"").toUpperCase())).sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||""))).forEach(rate=>{const code=String(rate.baseCurrency||"").toUpperCase();if(!latest.has(code))latest.set(code,rate)});
              setDashboardRates(order.map(code=>latest.get(code)).filter(Boolean));
              setDashboardRateHistory(Array.isArray(historyResponse.data)?historyResponse.data:[]);
              setLastRefresh(new Date());
            }catch(error){setRatesError(error.response?.data?.message||"تعذر تحديث أسعار الصرف. تم الاحتفاظ بآخر أسعار صحيحة.")}finally{setRatesRefreshing(false)}
          }}>{ratesRefreshing?"جاري التحديث…":"↻ تحديث الآن"}</button>
          <button className="exchange-board-all" onClick={()=>navigate("rates")}>عرض التفاصيل</button>
        </div>
      </div>
      {ratesError&&<div className="exchange-board-error">⚠️ {ratesError}</div>}
      <div className="exchange-board-grid">
        {["USD","CAD","EUR","TRY","SYP","SAR","JOD"].map(code=>{
          const rate=dashboardRates.find(item=>String(item.baseCurrency||"").toUpperCase()===code);
          const trend=rate?rateTrend(rate,dashboardRateHistory):{type:"same",symbol:"—"};
          const currencyMeta=debtCurrencies.find(item=>item.code===code)||{name:code};
          const pairHistory=rate?dashboardRateHistory.filter(item=>String(item.baseCurrency||"").toUpperCase()===code).sort((a,b)=>String(a.createdAt||"").localeCompare(String(b.createdAt||""))).slice(-7):[];
          const values=pairHistory.map(item=>Number(item.sellRate||item.buyRate||0)).filter(Number.isFinite);
          const low=Math.min(...values,0),high=Math.max(...values,1),range=Math.max(high-low,.000001);
          const points=values.length>1?values.map((value,index)=>`${(index/(values.length-1))*100},${34-((value-low)/range)*28}`).join(" "):"0,26 25,22 50,24 75,15 100,18";
          const previous=values.length>1?values[values.length-2]:Number(rate?.sellRate||rate?.buyRate||0);
          const current=Number(rate?.sellRate||rate?.buyRate||0);
          const percent=previous?((current-previous)/previous)*100:0;
          return <button className={`exchange-rate-card trend-card-${trend.type}`} key={code} onClick={()=>navigate("rates")}>
            <div className="exchange-rate-card-top"><CurrencyFlag code={code} className="exchange-rate-card-flag"/><div><strong>{code}</strong><small>{currencyMeta.name}</small></div><span className={`dashboard-rate-trend trend-${trend.type}`}>{trend.symbol} {Math.abs(percent).toFixed(2)}%</span></div>
            {rate?<><div className="exchange-rate-prices"><div><small>شراء</small><b>{Number(rate.buyRate||0).toFixed(code==="SYP"?6:4)}</b></div><div><small>بيع</small><b>{Number(rate.sellRate||0).toFixed(code==="SYP"?6:4)}</b></div></div><div className="exchange-rate-spark"><svg viewBox="0 0 100 38" preserveAspectRatio="none"><polyline points={points}/></svg><span><em>فرق السعر</em><b>{Math.abs(Number(rate.sellRate||0)-Number(rate.buyRate||0)).toFixed(code==="SYP"?6:4)}</b></span></div></>:<div className="exchange-rate-empty"><span className="exchange-rate-empty-icon">＋</span><strong>إضافة سعر الصرف</strong><small>لم يتم تسجيل سعر {code} بعد</small></div>}
          </button>
        })}
      </div>
      <div className="exchange-board-summary">
        <span><b>{dashboardRates.filter(item=>["USD","CAD","EUR","TRY","SYP","SAR","JOD"].includes(String(item.baseCurrency||"").toUpperCase())).length}</b> عملات محدثة</span>
        <span><b>{7-dashboardRates.filter(item=>["USD","CAD","EUR","TRY","SYP","SAR","JOD"].includes(String(item.baseCurrency||"").toUpperCase())).length}</b> تحتاج إضافة سعر</span>
        <span>التحديث الآلي كل 30 دقيقة</span>
      </div>
    </section>

    <section className="enterprise-decision-grid">
      <div className="enterprise-decisions panel-dark">
        <div className="section-heading"><h3>🧠 مركز القرارات الذكية</h3><button onClick={()=>navigate("ai-center")}>فتح المركز الذكي</button></div>
        <div className="enterprise-decision-list">
          {(smart.anomalies||[]).slice(0,3).map((item,index)=><article className={`decision-${item.level||"warning"}`} key={`${item.title}-${index}`}><span>{item.level==="danger"?"!":"i"}</span><div><strong>{item.title}</strong><small>{item.message}</small></div></article>)}
          {!(smart.anomalies||[]).length&&<article className="decision-success"><span>✓</span><div><strong>الوضع مستقر</strong><small>لا توجد حالات حرجة تحتاج تدخلاً الآن.</small></div></article>}
        </div>
      </div>
      <div className="enterprise-tasks panel-dark">
        <div className="section-heading"><h3>✅ مهام اليوم الذكية</h3><span>{(smart.recommendations||[]).length} مهام</span></div>
        <div className="enterprise-task-list">
          {(smart.recommendations||["راجع الحوالات والديون المفتوحة اليوم."]).slice(0,4).map((task,index)=><button key={index} onClick={()=>navigate(index===0&&smart.finance?.overdueCount?"customers":"ai")}><i>{index+1}</i><span>{task}</span><b>‹</b></button>)}
        </div>
      </div>
    </section>

    <section className="premium-kpis">
      {kpis.map(item=><button key={item.label} className={`premium-kpi ${item.tone}`} onClick={()=>navigate(item.page)}>
        <div className="premium-kpi-icon">{item.icon}</div>
        <div><span>{item.label}</span><strong>{item.value}</strong><small>{item.note}</small></div>
      </button>)}
    </section>

    <section className="premium-grid premium-grid-single">
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

    </section>

    <section className="dashboard-pro-analysis">
      <div className="dashboard-pro-performance panel-dark">
        <div className="section-heading"><h3>ملخص الأداء (آخر 7 أيام)</h3><span className="dashboard-pro-period">آخر 7 أيام</span></div>
        <div className="dashboard-pro-chart">
          <div className="dashboard-pro-grid"><i/><i/><i/><i/><i/></div>
          <div className="dashboard-pro-bars">{chartData.map((item,index)=><div className="dashboard-pro-bar-col" key={item.date} title={`${item.date} — ${cad(item.total)}`}><div className="dashboard-pro-bar" style={{height:`${Math.max(3,(item.total/chartMax)*100)}%`}}/><small>{item.date.slice(5)}</small></div>)}</div>
          <svg viewBox="0 0 700 220" preserveAspectRatio="none"><polyline points={chartData.map((item,index)=>`${50+index*100},${205-(item.profit/chartMax)*165}`).join(" ")}/></svg>
        </div>
        <div className="dashboard-pro-legend"><span>● إجمالي الحوالات (CAD)</span><span>● إجمالي الأرباح</span></div>
      </div>
      <div className="dashboard-pro-finance panel-dark">
        <div className="section-heading"><h3>⚖️ الميزانية</h3><button onClick={()=>navigate("capital-overview")}>عرض الكل</button></div>
        <p><span>الرصيد الحالي</span><strong>{cad(data.capital||0)}</strong></p>
        <p><span>الذمم المستحقة</span><strong>{cad(data.receivables||0)}</strong></p>
        <p><span>العملاء المتأخرون</span><strong>{noticeData.overdueCount||0}</strong></p>
      </div>
      <div className="dashboard-pro-alerts panel-dark">
        <div className="section-heading"><h3>أحدث التنبيهات</h3><button onClick={()=>setOpen(!open)}>عرض الكل</button></div>
        {(noticeData.notifications||[]).slice(0,3).map(item=><div className={`dashboard-pro-alert severity-${item.severity}`} key={item.id}><b>!</b><div><strong>{item.title}</strong><small>{item.message}</small></div></div>)}
        {!noticeData.notifications?.length&&<p className="empty-state">لا توجد تنبيهات حالياً.</p>}
      </div>
      <div className="dashboard-pro-stats panel-dark">
        <div className="section-heading"><h3>إحصائيات سريعة</h3></div>
        <p><span>حوالات اليوم</span><strong>{data.todayTransactions||0}</strong></p>
        <p><span>أرباح اليوم</span><strong>{cad(data.todayProfit)}</strong></p>
        <p><span>عدد العملاء</span><strong>{data.customers||0}</strong></p>
      </div>
    </section>

    <section className="executive-intelligence-grid">
      <article className="panel-dark intelligence-card">
        <div className="section-heading"><h3>🏆 أفضل العملاء ربحًا</h3><button onClick={()=>navigate("customers")}>عرض العملاء</button></div>
        <div className="customer-ranking">{customerScores.slice(0,5).map((customer,index)=><button key={customer.id||index} onClick={()=>navigate("customers")}><i>{index+1}</i><span><strong>{customer.name}</strong><small>{customer.operations} عمليات · حجم {cad(customer.volume)}</small></span><b className={`grade-${customer.grade}`}>{customer.grade}</b><em>{cad(customer.profit)}</em></button>)}{!customerScores.length&&<p className="empty-state">لا توجد بيانات عملاء للتحليل.</p>}</div>
      </article>
      <article className="panel-dark intelligence-card">
        <div className="section-heading"><h3>💹 تحليل الربح حسب العملة</h3><button onClick={()=>navigate("profits")}>تقرير الأرباح</button></div>
        <div className="currency-profit-list">{currencyProfit.slice(0,6).map(([currency,profit],index)=><div key={currency}><span><CurrencyFlag code={currency}/><strong>{currency}</strong></span><progress max={Math.max(1,currencyProfit[0]?.[1]||1)} value={Math.max(0,profit)}/><b>{cad(profit)}</b></div>)}{!currencyProfit.length&&<p className="empty-state">لا توجد أرباح مسجلة هذا الشهر.</p>}</div>
      </article>
      <article className="panel-dark intelligence-card executive-comparison">
        <div className="section-heading"><h3>📌 مقارنة تنفيذية</h3><span>هذا الشهر</span></div>
        <p><span>إجمالي الحوالات</span><strong>{monthlyRows.length}</strong></p>
        <p><span>حجم الأعمال</span><strong>{cad(monthlyRows.reduce((s,x)=>s+Number(x.totalCustomerDue||x.amount||0),0))}</strong></p>
        <p><span>إجمالي الربح</span><strong>{cad(monthlyRows.reduce((s,x)=>s+Number(x.profit||x.netProfit||0),0))}</strong></p>
        <p><span>مصروفات مسجلة</span><strong>{cad(expenses.filter(x=>String(x.expenseDate||x.createdAt||"").slice(0,7)===todayKey.slice(0,7)).reduce((s,x)=>s+Number(x.amount||0),0))}</strong></p>
      </article>
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

    {searchOpen&&<div className="global-search-overlay" onClick={()=>setSearchOpen(false)}><div className="global-search-modal" onClick={event=>event.stopPropagation()}><div className="global-search-input"><span>⌕</span><input autoFocus value={globalSearch} onChange={event=>setGlobalSearch(event.target.value)} placeholder="ابحث عن عميل، حوالة أو مصروف..."/><kbd>ESC</kbd></div><div className="global-search-results">{query?searchResults.map((result,index)=><button key={`${result.type}-${index}`} onClick={()=>{navigate(result.page);setSearchOpen(false)}}><i>{result.type}</i><span><strong>{result.title}</strong><small>{result.subtitle}</small></span><b>فتح ‹</b></button>):<div className="global-search-help"><strong>بحث عالمي سريع</strong><p>اكتب الاسم أو رقم الحوالة أو وصف المصروف.</p></div>}{query&&!searchResults.length&&<p className="empty-state">لا توجد نتائج مطابقة.</p>}</div></div></div>}

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

  const [customerForm,setCustomerForm]=useState({name:"",phone:"",email:"",oldBalance:""});
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
    amount:"",
    paymentDate:new Date().toISOString().slice(0,10),
    method:"CASH",
    reference:""
  });

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

  useEffect(()=>{
    load();
    const timer=setInterval(()=>setNowTick(Date.now()),30000);
    return()=>clearInterval(timer);
  },[]);

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
      setCustomerForm({name:"",phone:"",email:"",oldBalance:""});
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

  async function deleteCustomer(customer){
    const confirmed=window.confirm(`هل أنت متأكد من حذف العميل «${customer.name}»؟\nسيتم إخفاء العميل مع الحفاظ على السجلات المالية المرتبطة به.`);
    if(!confirmed)return;
    setError("");
    try{
      await api.delete(`/customers/${customer.id}`);
      if(editingCustomer?.id===customer.id)setEditingCustomer(null);
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر حذف العميل");
    }
  }

  async function resetCustomerAccount(customer){
    const balance=Number(customer.finalBalance||0).toFixed(2);
    const confirmed=window.confirm(
      `تصفير حساب العميل «${customer.name}»؟\n\nالرصيد الحالي: ${balance} CAD\nسيبدأ حساب جديد من الصفر، ولن تظهر الحوالات والدفعات السابقة في الحساب الجديد.\nلن يتم حذف أي بيانات وسيبقى الحساب السابق محفوظًا في الأرشيف.`
    );
    if(!confirmed)return;
    setError("");
    try{
      await api.post(`/customers/${customer.id}/reset-account`,{});
      if(editingCustomer?.id===customer.id)setEditingCustomer(null);
      await load();
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
      const rate=Number(item.customerRate||item.finalRate||0).toFixed(4).replace(/0+$/,"").replace(/\.$/,"");
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
      const {data}=await api.get(`/customers/${customer.id}/statement`);
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
      const {data}=await api.get(`/customers/${customer.id}/statement`);
      const lines=(Array.isArray(data.transactions)?data.transactions:[]).map((item,index)=>{
        const amount=Number(item.usdAmount||0).toFixed(2).replace(/\.00$/,"");
        const rate=Number(item.customerRate||0).toFixed(4).replace(/0+$/,"").replace(/\.$/,"");
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
        ...(oldBalance>0?[`الحساب القديم: ${money(oldBalance)} 🇨🇦`,""]:[]),
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

  const filtered=list.filter(customer=>
    `${customer.name} ${customer.phone||""}`.toLowerCase().includes(search.toLowerCase())
  );

  const customerActionFocus=activePanel==="transfer"||activePanel==="payment";

  return <>
    <h2>قائمة العملاء</h2>
    {error&&<div className="card customer-error">{error}</div>}

    {!customerActionFocus&&<>
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
    </>}


    {activePanel==="newCustomer"&&
      <form className="card form edit-panel" onSubmit={addCustomer}>
        <h3>إضافة عميل جديد</h3>
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
          {list.map(customer=><option key={customer.id} value={customer.id}>{customer.name}</option>)}
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

    {!customerActionFocus&&<>
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

    <div className="customer-cards customer-list-simple">
      {filtered.length?filtered.map(customer=><div
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
    </>}
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
  useEffect(()=>{
    const timer=setInterval(async()=>{
      if(autoSyncBusy.current||syncingAll||syncingId)return;
      try{
        const center=(await api.get("/partners/sync-center")).data;
        setSyncCenter(center);
        const dueSet=new Set(center.duePartnerIds||[]);
        const duePartner=(data.rows||[]).find(item=>dueSet.has(item.id)&&item.syncEnabled&&["JAD","TAWASUL","KONTORUN"].includes(item.connectorType));
        if(!duePartner)return;
        autoSyncBusy.current=true;
        setSyncingId(duePartner.id);
        await api.post(`/partners/${duePartner.id}/sync`,{trigger:"AUTO"});
        await load();
      }catch(error){console.warn("Automatic partner sync skipped",error.response?.data||error.message);}
      finally{autoSyncBusy.current=false;setSyncingId("");}
    },60000);
    return()=>clearInterval(timer);
  },[data.rows,syncingAll,syncingId]);



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
      const response=await api.get(`/customers/${id}`);
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

      const response=await api.get(`/customers/${id}/statement`);
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
      const response=await api.get(`/customers/${id}/statement`);
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

    {unpaidTransactions.length>0&&
      <form className="card form" onSubmit={addPayment}>
        <h3>إضافة دفعة</h3>
        <p className="payment-auto-note">تُوزع الدفعة تلقائيًا على أقدم الحوالات المستحقة.</p>
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
        <table className="simple-statement-table">
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
        </table>
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
          Number(data.totals.formulaResultCad ?? data.transactions.reduce((sum,item)=>sum+Number(item.formulaResultCad||0),0))
          - Number(data.totals.paid||0),
          0
        ))} 🇨🇦</strong>
      </div>
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
  const [editingTransaction,setEditingTransaction]=useState(null);
  const [editSaving,setEditSaving]=useState(false);

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
        transferDate:new Date().toISOString().slice(0,10),
        paymentStatus:"UNPAID"
      }));
      await load();
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

      <button>حفظ</button>
    </form>

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

    <div className="card tablewrap">
      <table>
        <thead>
          <tr>
            <th>الرقم</th><th>تاريخ الحوالة</th><th>العميل</th><th>المبلغ</th>
            <th>الأجور</th><th>الإجمالي</th><th>حالة الدفع</th><th>المتبقي</th><th>الربح</th><th>الفاتورة</th><th>تعديل</th>
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
      <div className="card metric-card metric-count"><span>عدد الحوالات</span><strong>{data.transactionCount}</strong></div>
      <div className="card metric-card metric-profit"><span>ربح فرق السعر</span><strong>{money(data.exchangeProfit)}</strong></div>
      <div className="card metric-card metric-fees"><span>أجور الحوالات</span><strong>{money(data.transferFees)}</strong></div>
      <div className="card metric-card metric-total"><span>إجمالي الربح</span><strong>{money(data.grossProfit)}</strong></div>
      <div className="card metric-card metric-expense"><span>المصروفات</span><strong>{money(data.expenses)}</strong></div>
      <div className={`card final metric-card metric-net ${Number(data.netProfit||0)<0?"value-negative":"value-positive"}`}><span>صافي الربح</span><strong>{money(data.netProfit)}</strong></div>
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
          <td className={`table-total-value ${Number(x.netProfit||0)<0?"value-negative":"value-positive"}`}><b>{money(x.netProfit)}</b></td>
        </tr>)}</tbody>
      </table>
    </div>
  </>;
}

function ExchangeRates(){
  const [list,setList]=useState([]);
  const [history,setHistory]=useState([]);
  const [f,setF]=useState({baseCurrency:"CAD",quoteCurrency:"USD",buyRate:"",sellRate:"",notes:""});
  const [goldForm,setGoldForm]=useState({baseCurrency:"XAU24",quoteCurrency:"CAD",buyRate:"",sellRate:"",notes:"سعر غرام الذهب"});
  const [refreshing,setRefreshing]=useState(false);
  const [message,setMessage]=useState("");
  const [currencySearch,setCurrencySearch]=useState("");
  const [showCurrencyManager,setShowCurrencyManager]=useState(false);
  const [customCurrency,setCustomCurrency]=useState({code:"",name:"",flag:"🏳️"});
  const [enabledCurrencies,setEnabledCurrencies]=useState(()=>{
    try{
      const saved=JSON.parse(localStorage.getItem("alaboud_exchange_currencies")||"null");
      return Array.isArray(saved)&&saved.length?saved:EXCHANGE_CURRENCY_CATALOG.slice(0,9);
    }catch{return EXCHANGE_CURRENCY_CATALOG.slice(0,9)}
  });

  useEffect(()=>{localStorage.setItem("alaboud_exchange_currencies",JSON.stringify(enabledCurrencies))},[enabledCurrencies]);

  const trendFor=(rate)=>rateTrend(rate,history);
  const isGoldRate=rate=>String(rate.baseCurrency||"").startsWith("XAU");
  const goldLabel=code=>({
    XAU24:"ذهب 24 قيراط",
    XAU22:"ذهب 22 قيراط",
    XAU21:"ذهب 21 قيراط",
    XAU18:"ذهب 18 قيراط"
  }[code]||code);

  const normalizeRatesPayload=(payload)=>{
    if(Array.isArray(payload))return payload;
    if(Array.isArray(payload?.rows))return payload.rows;
    if(Array.isArray(payload?.rates))return payload.rates;
    if(Array.isArray(payload?.data))return payload.data;
    return [];
  };
  const safeDateText=(value)=>{
    const date=new Date(value||Date.now());
    return Number.isNaN(date.getTime())?"—":date.toLocaleString("ar-CA");
  };
  const currencyInfo=Object.fromEntries([...EXCHANGE_CURRENCY_CATALOG,...enabledCurrencies].map(item=>[item.code,item]));
  const currencyLabel=(code)=>`${currencyInfo[code]?.flag||"🏳️"} ${currencyInfo[code]?.name||code} (${code})`;
  const currencyCodes=[...new Set(enabledCurrencies.map(item=>item.code))];
  const filteredCatalog=EXCHANGE_CURRENCY_CATALOG.filter(item=>{
    const q=currencySearch.trim().toLowerCase();
    return !q||`${item.code} ${item.name}`.toLowerCase().includes(q);
  });
  const toggleCurrency=item=>setEnabledCurrencies(current=>current.some(x=>x.code===item.code)?current.filter(x=>x.code!==item.code):[...current,item]);
  const addCustomCurrency=()=>{
    const code=customCurrency.code.trim().toUpperCase().replace(/[^A-Z]/g,"").slice(0,5);
    const name=customCurrency.name.trim();
    if(code.length<3||!name){setMessage("أدخل رمز عملة من 3 أحرف واسم العملة");return}
    if(enabledCurrencies.some(item=>item.code===code)){setMessage("هذه العملة مضافة مسبقًا");return}
    setEnabledCurrencies(current=>[...current,{code,name,flag:customCurrency.flag||"🏳️"}]);
    setCustomCurrency({code:"",name:"",flag:"🏳️"});
    setMessage(`تمت إضافة ${name} إلى قائمة العملات`);
  };

  const load=async()=>{
    setMessage("");
    try{
      const [ratesResponse,historyResponse]=await Promise.all([
        api.get("/exchange-rates"),
        api.get("/exchange-rates/history").catch(()=>({data:[]}))
      ]);
      setList(normalizeRatesPayload(ratesResponse.data));
      setHistory(normalizeRatesPayload(historyResponse.data));
    }catch(error){
      setList([]);setHistory([]);
      setMessage(error.response?.data?.message||"تعذر تحميل أسعار الصرف. حاول التحديث مرة أخرى.");
    }
  };

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
    setMessage("");
    try{
      await api.post("/exchange-rates",f);
      setF(x=>({...x,buyRate:"",sellRate:"",notes:""}));
      setMessage("تم حفظ سعر العملة");
      await load();
    }catch(error){
      setMessage(error.response?.data?.message||"تعذر حفظ سعر العملة");
    }
  }

  async function addGold(e){
    e.preventDefault();
    setMessage("");
    try{
      await api.post("/exchange-rates",goldForm);
      setGoldForm(x=>({...x,buyRate:"",sellRate:""}));
      setMessage("تم حفظ سعر الذهب");
      await load();
    }catch(error){
      setMessage(error.response?.data?.message||"تعذر حفظ سعر الذهب");
    }
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

  const storedCurrencyRates=list.filter(rate=>!isGoldRate(rate));
  const hasSyrianPound=storedCurrencyRates.some(rate=>rate.baseCurrency==="SYP"||rate.quoteCurrency==="SYP");
  const currencyRates=hasSyrianPound?storedCurrencyRates:[
    ...storedCurrencyRates,
    {
      id:"syp-visible-placeholder",
      baseCurrency:"USD",
      quoteCurrency:"SYP",
      buyRate:0,
      sellRate:0,
      source:"MANUAL",
      createdAt:new Date().toISOString(),
      sypPlaceholder:true
    }
  ];
  const goldRates=list.filter(isGoldRate);

  return <>
    <h2>العملات وأسعار الصرف والذهب</h2>

    <div className="card rate-legend">
      <span className="legend-up">↑ ارتفاع</span>
      <span className="legend-down">↓ انخفاض</span>
      <span className="legend-same">→ ثابت</span>
      <span className="legend-new">● سعر جديد</span>
    </div>

    <div className="card auto-rate-bar">
      <div>
        <strong>التحديث التلقائي للعملات</strong>
        <p>العملات والليرة السورية وأسعار الذهب تتحدث تلقائيًا كل ساعة. يبقى آخر سعر محفوظ إذا تعذر أحد المصادر.</p>
      </div>
      <button type="button" onClick={refresh} disabled={refreshing}>
        {refreshing?"جاري التحديث...":"تحديث أسعار العملات الآن"}
      </button>
    </div>

    {message&&<div className="card rate-message">{message}</div>}

    <div className="card currency-manager-card">
      <div className="currency-manager-head">
        <div><h3>➕ إدارة العملات</h3><p>أضف العملات التي تريد استخدامها في لوحة الصرف، وابحث عنها بسرعة.</p></div>
        <button type="button" className="currency-manager-toggle" onClick={()=>setShowCurrencyManager(value=>!value)}>{showCurrencyManager?"إغلاق":"إضافة عملات"}</button>
      </div>
      <div className="enabled-currency-chips">{enabledCurrencies.map(item=><button type="button" key={item.code} onClick={()=>toggleCurrency(item)} title="اضغط للإزالة"><span>{item.flag}</span><b>{item.code}</b><small>{item.name}</small><i>×</i></button>)}</div>
      {showCurrencyManager&&<div className="currency-manager-body">
        <input className="currency-search-input" value={currencySearch} onChange={e=>setCurrencySearch(e.target.value)} placeholder="ابحث بالاسم أو الرمز..."/>
        <div className="currency-catalog-grid">{filteredCatalog.map(item=>{const active=enabledCurrencies.some(x=>x.code===item.code);return <button type="button" key={item.code} className={active?"active":""} onClick={()=>toggleCurrency(item)}><span>{item.flag}</span><div><b>{item.code}</b><small>{item.name}</small></div><strong>{active?"✓":"+"}</strong></button>})}</div>
        <div className="custom-currency-row">
          <input value={customCurrency.flag} onChange={e=>setCustomCurrency({...customCurrency,flag:e.target.value})} placeholder="العلم" maxLength="4"/>
          <input value={customCurrency.code} onChange={e=>setCustomCurrency({...customCurrency,code:e.target.value})} placeholder="الرمز مثل MXN" maxLength="5"/>
          <input value={customCurrency.name} onChange={e=>setCustomCurrency({...customCurrency,name:e.target.value})} placeholder="اسم العملة"/>
          <button type="button" onClick={addCustomCurrency}>إضافة عملة مخصصة</button>
        </div>
      </div>}
    </div>

    <div className="rates-entry-grid">
      <form className="card form" onSubmit={add}>
        <h3>💱 إضافة سعر عملة</h3>
        <select value={f.baseCurrency} onChange={e=>setF({...f,baseCurrency:e.target.value})}>
          {currencyCodes.map(x=><option key={x} value={x}>{currencyLabel(x)}</option>)}
        </select>
        <select value={f.quoteCurrency} onChange={e=>setF({...f,quoteCurrency:e.target.value})}>
          {currencyCodes.map(x=><option key={x} value={x}>{currencyLabel(x)}</option>)}
        </select>
        <input type="number" step=".000001" value={f.buyRate} onChange={e=>setF({...f,buyRate:e.target.value})} placeholder="سعر الشراء" required/>
        <input type="number" step=".000001" value={f.sellRate} onChange={e=>setF({...f,sellRate:e.target.value})} placeholder="سعر البيع" required/>
        <input value={f.notes} onChange={e=>setF({...f,notes:e.target.value})} placeholder="ملاحظات"/>
        <button>حفظ سعر العملة</button>
      </form>

      <form className="card form gold-rate-form" onSubmit={addGold}>
        <h3>🪙 إضافة سعر الذهب للغرام</h3>
        <select value={goldForm.baseCurrency} onChange={e=>setGoldForm({...goldForm,baseCurrency:e.target.value})}>
          <option value="XAU24">ذهب 24 قيراط</option>
          <option value="XAU22">ذهب 22 قيراط</option>
          <option value="XAU21">ذهب 21 قيراط</option>
          <option value="XAU18">ذهب 18 قيراط</option>
        </select>
        <select value={goldForm.quoteCurrency} onChange={e=>setGoldForm({...goldForm,quoteCurrency:e.target.value})}>
          <option value="CAD">CAD 🇨🇦</option>
          <option value="USD">USD 🇺🇸</option>
          <option value="SYP">SYP 🇸🇾</option>
        </select>
        <input type="number" step=".01" value={goldForm.buyRate} onChange={e=>setGoldForm({...goldForm,buyRate:e.target.value})} placeholder="سعر شراء الغرام" required/>
        <input type="number" step=".01" value={goldForm.sellRate} onChange={e=>setGoldForm({...goldForm,sellRate:e.target.value})} placeholder="سعر بيع الغرام" required/>
        <input value={goldForm.notes} onChange={e=>setGoldForm({...goldForm,notes:e.target.value})} placeholder="ملاحظات"/>
        <button>حفظ سعر الذهب</button>
      </form>
    </div>

    <div className="card tablewrap currency-rates-table">
      <h3>💱 أسعار العملات</h3>
      <table>
        <thead><tr><th>من</th><th>إلى</th><th>شراء</th><th>بيع</th><th>الحركة</th><th>المصدر</th><th>آخر تحديث</th></tr></thead>
        <tbody>{currencyRates.length?currencyRates.map(r=>{
          const trend=trendFor(r);
          return <tr key={r.id} className={`rate-row rate-${trend.type} ${r.baseCurrency==="SYP"||r.quoteCurrency==="SYP"?"syp-highlight":""}`}>
            <td><span className="currency-badge currency-with-flag"><CurrencyFlag code={r.baseCurrency}/><span>{currencyInfo[r.baseCurrency]?.name||r.baseCurrency}</span><small>{r.baseCurrency}</small></span></td>
            <td><span className="currency-badge currency-with-flag"><CurrencyFlag code={r.quoteCurrency}/><span>{currencyInfo[r.quoteCurrency]?.name||r.quoteCurrency}</span><small>{r.quoteCurrency}</small></span></td>
            <td className="buy-rate">{r.sypPlaceholder?"أدخل السعر":Number(r.buyRate).toFixed(6).replace(/0+$/,"").replace(/\.$/,"")}</td>
            <td className="sell-rate"><strong>{r.sypPlaceholder?"أدخل السعر":Number(r.sellRate).toFixed(6).replace(/0+$/,"").replace(/\.$/,"")}</strong></td>
            <td><span className={`trend trend-${r.sypPlaceholder?"new":trend.type}`}>{r.sypPlaceholder?"● بانتظار السعر":`${trend.symbol} ${trend.label}`}</span></td>
            <td><span className={`source-badge ${["FRANKFURTER","EXCHANGE_RATE_API","GOLD_API"].includes(r.source)?"auto":"manual"}`}>{r.sypPlaceholder?"سوري":r.source==="FRANKFURTER"?"تلقائي":"يدوي"}</span></td>
            <td>{safeDateText(r.createdAt)}</td>
          </tr>
        }):<tr><td colSpan="7">لا توجد أسعار عملات مسجلة.</td></tr>}</tbody>
      </table>
    </div>

    <div className="card tablewrap gold-rates-table">
      <h3>🪙 أسعار الذهب للغرام</h3>
      <table>
        <thead><tr><th>العيار</th><th>العملة</th><th>شراء الغرام</th><th>بيع الغرام</th><th>الحركة</th><th>آخر تحديث</th></tr></thead>
        <tbody>{goldRates.length?goldRates.map(r=>{
          const trend=trendFor(r);
          return <tr key={r.id} className={`rate-row gold-rate-row rate-${trend.type}`}>
            <td><span className="gold-karat-badge">🪙 {goldLabel(r.baseCurrency)}</span></td>
            <td><span className="currency-badge currency-with-flag"><CurrencyFlag code={r.quoteCurrency}/><span>{currencyInfo[r.quoteCurrency]?.name||r.quoteCurrency}</span><small>{r.quoteCurrency}</small></span></td>
            <td className="buy-rate">{money(r.buyRate)}</td>
            <td className="sell-rate"><strong>{money(r.sellRate)}</strong></td>
            <td><span className={`trend trend-${trend.type}`}>{trend.symbol} {trend.label}</span></td>
            <td>{safeDateText(r.createdAt)}</td>
          </tr>
        }):<tr><td colSpan="6">لا توجد أسعار ذهب مسجلة. أضف سعر الذهب من النموذج أعلاه.</td></tr>}</tbody>
      </table>
    </div>

    <div className="exchange-rates-summary">
      <div><span>عدد العملات</span><strong>{currencyRates.length}</strong><small>أزواج عملات مسجلة</small></div>
      <div><span>أفضل سعر اليوم</span><strong>{currencyRates.length?`${currencyRates[0].baseCurrency}/${currencyRates[0].quoteCurrency}`:"—"}</strong><small>آخر سعر محدث</small></div>
      <div><span>متوسط التغيير</span><strong className="positive">+0.28%</strong><small>مؤشر تقريبي</small></div>
      <div><span>الذهب</span><strong>GOLD/CAD</strong><small>سعر يدوي</small></div>
    </div>

    <div className="card tablewrap">
      <h3>سجل تغييرات الأسعار</h3>
      <table>
        <thead><tr><th>التاريخ</th><th>الزوج / العيار</th><th>شراء</th><th>بيع</th><th>المصدر</th><th>ملاحظات</th></tr></thead>
        <tbody>{history.map(r=><tr key={r.id}>
          <td>{safeDateText(r.createdAt)}</td>
          <td>{isGoldRate(r)?goldLabel(r.baseCurrency):`${r.baseCurrency}/${r.quoteCurrency}`}</td>
          <td>{Number(r.buyRate).toFixed(6).replace(/0+$/,"").replace(/\.$/,"")}</td>
          <td>{Number(r.sellRate).toFixed(6).replace(/0+$/,"").replace(/\.$/,"")}</td>
          <td>{r.source==="FRANKFURTER"?"تلقائي":r.source==="EXCHANGE_RATE_API"?"تلقائي SYP":r.source==="GOLD_API"?"تلقائي ذهب":"يدوي"}</td>
          <td>{r.notes||"-"}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </>;
}


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
      const {data}=await api.get("/general-debts",{params:{type:filter}});
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
        <option value="CAD">CAD 🇨🇦 — الدولار الكندي</option>
        <option value="USD">USD 🇺🇸 — الدولار الأمريكي</option>
        <option value="SYP">SYP 🇸🇾 — الليرة السورية</option>
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
        <option value="CAD">CAD 🇨🇦 — الدولار الكندي</option>
        <option value="USD">USD 🇺🇸 — الدولار الأمريكي</option>
        <option value="SYP">SYP 🇸🇾 — الليرة السورية</option>
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
  const emptyPartnerForm={
    name:"",contactName:"",phone:"",whatsapp:"",email:"",country:"",city:"",address:"",notes:"",
    systemUrl:"",connectionType:"WEB",accountCurrency:"USD",integrationName:"",username:"",password:"",externalAccountId:"",connectorType:"GENERIC",pathPrefix:"/ssljd/merkez112/1/2",syncFromDate:"",syncEnabled:true,syncIntervalMinutes:5,syncMode:"BALANCE_ONLY"
  };
  const [form,setForm]=useState({
    name:"",contactName:"",phone:"",whatsapp:"",email:"",country:"",city:"",address:"",notes:"",
    systemUrl:"",connectionType:"WEB",accountCurrency:"USD",integrationName:"",username:"",password:"",externalAccountId:"",connectorType:"GENERIC",pathPrefix:"/ssljd/merkez112/1/2",syncFromDate:"",syncEnabled:true,syncIntervalMinutes:5,syncMode:"BALANCE_ONLY"
  });

  async function load(){
    try{
      const [response,centerResponse]=await Promise.all([api.get("/partners"),api.get("/partners/sync-center")]);
      setData(response.data);
      setSyncCenter(centerResponse.data);
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر تحميل الشركات");
    }
  }

  useEffect(()=>{load();},[]);

  function resetPartnerForm(){
    setEditingId("");
    setForm({...emptyPartnerForm});
  }

  function startEditPartner(partner){
    setError("");setMessage("");
    setEditingId(partner.id);
    setForm({
      name:partner.name||"",contactName:partner.contactName||"",phone:partner.phone||"",whatsapp:partner.whatsapp||"",email:partner.email||"",country:partner.country||"",city:partner.city||"",address:partner.address||"",notes:partner.notes||"",
      systemUrl:partner.systemUrl||"",connectionType:partner.connectionType||"WEB",accountCurrency:partner.accountCurrency||"USD",integrationName:partner.integrationName||"",username:partner.username||"",password:"",externalAccountId:partner.externalAccountId||"",connectorType:partner.connectorType==="KONTORUN"?"TAWASUL":partner.connectorType||"GENERIC",pathPrefix:partner.pathPrefix||"/ssljd/merkez112/1/2",syncFromDate:partner.syncFromDate||"",syncEnabled:partner.syncEnabled!==false,syncIntervalMinutes:Number(partner.syncIntervalMinutes)||5,syncMode:partner.syncMode||"BALANCE_ONLY"
    });
    window.scrollTo({top:0,behavior:"smooth"});
  }

  async function deletePartner(partner){
    const confirmed=window.confirm(`هل أنت متأكد من حذف شركة «${partner.name}»؟\nسيتم حذف الشركة وحركاتها ودفعاتها المرتبطة بها.`);
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
      const response=await api.post(`/partners/${partner.id}/test-connection`,{otp:otpById[partner.id]||"",trigger:"MANUAL"});
      setMessage(`${partner.name}: ${response.data.message}`);
      await load();
    }catch(requestError){
      setError(cleanConnectorMessage(requestError.response?.data?.message||"تعذر اختبار الاتصال"));
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

  async function syncPartner(partner){
    setError("");setMessage("");setSyncingId(partner.id);
    try{
      const response=await api.post(`/partners/${partner.id}/sync`,{otp:otpById[partner.id]||"",trigger:"MANUAL"});
      setOtpById(current=>({...current,[partner.id]:""}));
      if(response.data?.stale){
        const reason=syncFailureReason(response.data);
        setMessage(`${partner.name}: ${reason}. يتم عرض آخر رصيد ناجح${response.data.lastSyncAt?` من ${new Date(response.data.lastSyncAt).toLocaleString("ar-CA")}`:""}.`);
      }else{
        const syncedCurrencies=Object.entries(response.data.result?.currencies||{}).map(([code,value])=>`${code}: لنا ${money(value?.receivable)} / علينا ${money(value?.payable)}`).join(" — ");
        setMessage(`${partner.name}: ${response.data.message}${syncedCurrencies?` — ${syncedCurrencies}`:` — الرصيد ${money(response.data.result.balance)} ${partner.accountCurrency||"USD"}`}`);
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
    }
    finally{setSyncingId("");}
  }

  async function showJadDiagnostic(partner){
    setError("");setMessage("");
    try{
      const response=await api.get(`/partners/${partner.id}/jad-diagnostic`);
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
    const partners=(data.rows||[]).filter(partner=>["JAD","TAWASUL","KONTORUN"].includes(partner.connectorType));
    if(!partners.length){setError("لا توجد شركة مرتبطة للمزامنة");return;}
    setError("");setMessage("جاري مزامنة الأرصدة الآن...");setSyncingAll(true);
    let successCount=0;
    try{
      for(const partner of partners){
        setSyncingId(partner.id);
        try{
          const response=await api.post(`/partners/${partner.id}/sync`,{otp:otpById[partner.id]||"",trigger:"MANUAL"});
          if(response.data?.stale){
            console.warn("Partner sync stale",partner.name,response.data);
            setMessage(`${partner.name}: ${syncFailureReason(response.data)}. يتم عرض آخر رصيد ناجح.`);
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
  </div>;

  return <>
    <div className="page-title-row partner-title-row"><h2>🏢 الشركات والربط الخارجي</h2><button type="button" className="sync-now-button" disabled={syncingAll||Boolean(syncingId)} onClick={syncAllPartners}>{syncingAll?<><span className="sync-spinner"/> جاري المزامنة...</>:"🔄 مزامنة الآن"}</button></div>
    {error&&<div className="card customer-error">{error}</div>}
    {message&&<div className="card rate-message">{message}</div>}
    <div className="stats">
      <div className="card receivable-card"><span>إجمالي دين لنا</span><strong>{money(data.totals.receivable)}</strong></div>
      <div className="card payable-card"><span>إجمالي دين علينا</span><strong>{money(data.totals.payable)}</strong></div>
      <div className="card final"><span>الصافي</span><strong>{money(data.totals.net)}</strong></div>
      <div className="card"><span>عدد الشركات</span><strong>{data.rows.length}</strong></div>
    </div>

    <section className="smart-sync-center">
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
        {(syncCenter.logs||[]).slice(0,6).map(log=><div className={`sync-log-row ${log.status==="SUCCESS"?"ok":"failed"}`} key={log.id}>
          <span className="sync-log-state">{log.status==="SUCCESS"?"✓":"!"}</span><div><strong>{log.partnerName}</strong><small>{log.trigger==="AUTO"?"تلقائية":"يدوية"} · {new Date(log.createdAt).toLocaleString("ar-CA")}</small></div><div className="sync-log-change"><b>{log.changed?`${money(log.beforeBalance)} ← ${money(log.afterBalance)}`:"بدون تغيير"}</b><small>{(log.durationMs/1000).toFixed(1)} ثانية</small></div>
        </div>)}
        {!syncCenter.logs?.length&&<p className="empty-sync-log">لا يوجد سجل مزامنة بعد.</p>}
      </div>
    </section>

    <form className="card form company-integration-form" onSubmit={add}>
      <h3>{editingId?"✏️ تعديل معلومات الشركة":"➕ إضافة شركة وربطها"}</h3>
      <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="اسم الشركة" required/>
      <input value={form.integrationName} onChange={e=>setForm({...form,integrationName:e.target.value})} placeholder="اسم الربط (اختياري)"/>
      <input type="url" value={form.systemUrl} onChange={e=>setForm({...form,systemUrl:e.target.value})} placeholder="رابط نظام الشركة https://..."/>
      <select value={form.connectionType} onChange={e=>setForm({...form,connectionType:e.target.value})}>
        <option value="WEB">رابط ويب</option><option value="API">API</option><option value="CSV">CSV</option><option value="EXCEL">Excel</option><option value="PDF">PDF</option>
      </select>
      <select value={form.connectorType} onChange={e=>setForm({...form,connectorType:e.target.value})}>
        <option value="GENERIC">شركة عامة — بدون مزامنة تلقائية</option><option value="JAD">موصل شركة جاد — جلب الرصيد تلقائيًا</option><option value="TAWASUL">موصل شركة تواصل — كشف الحساب والرصيد</option>
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
      <label className="integration-toggle"><input type="checkbox" checked={form.syncEnabled} onChange={e=>setForm({...form,syncEnabled:e.target.checked})}/><span>تفعيل المزامنة عند توفر موصل الشركة</span></label>
      <div className="partner-form-actions"><button>{editingId?"حفظ التعديلات":"حفظ وربط الشركة"}</button>{editingId&&<button type="button" className="danger-button" onClick={resetPartnerForm}>إلغاء التعديل</button>}</div>
    </form>

    <div className="card tablewrap">
      <table>
        <thead><tr><th>الشركة</th><th>نوع الربط</th><th>الحالة</th><th>العملة الأساسية</th><th>أرصدة العملات</th><th>آخر مزامنة</th><th>الرابط</th><th>الإجراءات</th></tr></thead>
        <tbody>{data.rows.length?data.rows.map(partner=><tr key={partner.id}>
          <td><strong>{partner.name}</strong><small className="company-subline">{partner.contactName||partner.integrationName||"-"}</small></td>
          <td>{partner.connectionType||"يدوي"}<small className="company-subline">{partner.connectorType==="TAWASUL"||partner.connectorType==="KONTORUN"?"موصل تواصل":partner.connectorType==="JAD"?"موصل جاد":"بدون موصل"}</small></td>
          <td>{(()=>{const effectiveStatus=partner.lastSyncAt&&Number.isFinite(Number(partner.externalBalance))?"READY":partner.connectionStatus;return <span className={`integration-status status-${String(effectiveStatus||"MANUAL").toLowerCase()}`}>{statusLabel(effectiveStatus)}</span>;})()}</td>
          <td><span className="partner-primary-currency">{flagOf(partner.accountCurrency||"USD")} {partner.accountCurrency||"USD"}</span><small className="company-subline">العملة الأساسية فقط</small></td>
          <td><PartnerCurrencyBalances partner={partner}/></td>
          <td><div className="relative-sync-time"><strong>{relativeSyncTime(partner.lastSyncAt)}</strong><small>{partner.lastSyncAt?new Date(partner.lastSyncAt).toLocaleString("ar-CA"):"—"}</small></div></td>
          <td>{partner.systemUrl?<a href={partner.systemUrl} target="_blank" rel="noreferrer">فتح الرابط</a>:"-"}</td>
          <td className="actions"><button onClick={()=>open(partner.id)}>فتح</button><button type="button" onClick={()=>startEditPartner(partner)}>✏️ تعديل</button><button type="button" className="danger-button" onClick={()=>deletePartner(partner)}>🗑️ حذف</button>{["JAD","TAWASUL","KONTORUN"].includes(partner.connectorType)&&<input className="jad-otp-input" inputMode="numeric" autoComplete="one-time-code" maxLength="8" value={otpById[partner.id]||""} onChange={e=>setOtpById(current=>({...current,[partner.id]:e.target.value.replace(/\D/g,"").slice(0,8)}))} placeholder="رمز Authenticator" aria-label="رمز Google Authenticator"/>}{partner.systemUrl&&<button type="button" onClick={()=>testConnection(partner)}>اختبار الاتصال</button>}{["JAD","TAWASUL","KONTORUN"].includes(partner.connectorType)&&<button type="button" disabled={syncingId===partner.id} onClick={()=>syncPartner(partner)}>{syncingId===partner.id?"جاري جلب الرصيد...":"جلب الرصيد"}</button>}{partner.connectorType==="JAD"&&<button type="button" onClick={()=>showJadDiagnostic(partner)}>عرض سجل الربط</button>}</td>
        </tr>):<tr><td colSpan="8">لا توجد شركات بعد.</td></tr>}</tbody>
      </table>
    </div>
  </>;
}

function CapitalOverview(){
  const [month,setMonth]=useState(new Date().toISOString().slice(0,7));
  const [data,setData]=useState(null);
  const [previousData,setPreviousData]=useState(null);
  const [movements,setMovements]=useState([]);
  const [goals,setGoals]=useState(()=>{
    try{return JSON.parse(localStorage.getItem("alaboud-budget-goals")||"")||{profit:25000,expenses:10000,capital:50000};}
    catch{return {profit:25000,expenses:10000,capital:50000};}
  });
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [editing,setEditing]=useState(null);
  const [movementFilter,setMovementFilter]=useState("ALL");
  const [movementSearch,setMovementSearch]=useState("");
  const [form,setForm]=useState({
    type:"IN",
    amount:"",
    currency:"CAD",
    description:"",
    date:new Date().toISOString().slice(0,10)
  });

  async function load(){
    setError("");
    try{
      const selectedDate=new Date(`${month}-01T00:00:00`);
      selectedDate.setMonth(selectedDate.getMonth()-1);
      const previousMonth=selectedDate.toISOString().slice(0,7);
      const [overviewResponse,previousResponse,movementsResponse]=await Promise.all([
        api.get("/capital-overview",{params:{month}}),
        api.get("/capital-overview",{params:{month:previousMonth}}),
        api.get("/capital")
      ]);
      setData(overviewResponse.data);
      setPreviousData(previousResponse.data);
      setMovements(Array.isArray(movementsResponse.data)?movementsResponse.data:[]);
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر تحميل رأس المال");
    }
  }

  useEffect(()=>{load();},[month]);

  async function addCapital(event){
    event.preventDefault();
    setError("");setMessage("");
    try{
      await api.post("/capital",form);
      setForm({
        type:"IN",
        amount:"",
        currency:"CAD",
        description:"",
        date:new Date().toISOString().slice(0,10)
      });
      setMessage("تمت إضافة حركة رأس المال بنجاح");
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر إضافة رأس المال");
    }
  }

  async function saveEdit(event){
    event.preventDefault();
    setError("");setMessage("");
    try{
      await api.patch(`/capital/${editing.id}`,editing);
      setEditing(null);
      setMessage("تم تعديل حركة رأس المال بنجاح");
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر تعديل رأس المال");
    }
  }

  async function deleteCapital(item){
    if(!window.confirm(`هل تريد حذف حركة رأس المال بقيمة ${money(item.amount)} ${item.currency||"CAD"}؟`))return;
    setError("");setMessage("");
    try{
      await api.delete(`/capital/${item.id}`);
      setMessage("تم حذف حركة رأس المال");
      if(editing?.id===item.id)setEditing(null);
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر حذف رأس المال");
    }
  }

  if(!data)return <><h2>رأس المال الكلي</h2>{error?<div className="card customer-error">{error}</div>:<p>جاري التحميل...</p>}</>;

  const efficiency=data.turnoverRate>=3?"ممتاز":data.turnoverRate>=2?"جيد جداً":data.turnoverRate>=1?"جيد":"منخفض";
  const selectedMonthMovements=movements.filter(item=>String(item.date||item.createdAt||"").slice(0,7)===month);
  const capitalIn=selectedMonthMovements.filter(item=>item.type==="IN").reduce((sum,item)=>sum+Number(item.amount||0),0);
  const capitalOut=selectedMonthMovements.filter(item=>item.type==="OUT").reduce((sum,item)=>sum+Number(item.amount||0),0);
  const netCapitalMovement=capitalIn-capitalOut;
  const totalFlow=capitalIn+capitalOut;
  const inShare=totalFlow?Math.round((capitalIn/totalFlow)*100):0;
  const outShare=totalFlow?100-inShare:0;
  const monthlyNet=Number(data.monthlyProfit||0)-Number(data.monthlyExpenses||0);
  const liquidityStatus=Number(data.capitalBalance||0)>0?"مستقرة":"تحتاج متابعة";
  const filteredMovements=movements.filter(item=>{
    const matchesType=movementFilter==="ALL"||item.type===movementFilter;
    const text=`${item.description||""} ${item.currency||""} ${item.amount||""} ${item.date||item.createdAt||""}`.toLowerCase();
    return matchesType&&text.includes(movementSearch.trim().toLowerCase());
  });
  const currencySummary=Object.values(selectedMonthMovements.reduce((acc,item)=>{
    const currency=item.currency||"CAD";
    acc[currency]??={currency,in:0,out:0};
    acc[currency][item.type==="IN"?"in":"out"]+=Number(item.amount||0);
    return acc;
  },{}));

  const today=new Date();
  const selectedDate=new Date(`${month}-01T00:00:00`);
  const isCurrentMonth=today.getFullYear()===selectedDate.getFullYear()&&today.getMonth()===selectedDate.getMonth();
  const daysInMonth=new Date(selectedDate.getFullYear(),selectedDate.getMonth()+1,0).getDate();
  const elapsedDays=isCurrentMonth?Math.max(1,today.getDate()):daysInMonth;
  const projectedProfit=(Number(data.monthlyProfit||0)/elapsedDays)*daysInMonth;
  const projectedExpenses=(Number(data.monthlyExpenses||0)/elapsedDays)*daysInMonth;
  const projectedNet=projectedProfit-projectedExpenses;
  const netWorth=Number(data.capitalBalance||0)+Number(data.receivables||0)+Number(data.generalReceivable||0)-Number(data.generalPayable||0)+monthlyNet;
  const profitChange=previousData&&Number(previousData.monthlyProfit||0)!==0?((Number(data.monthlyProfit||0)-Number(previousData.monthlyProfit||0))/Math.abs(Number(previousData.monthlyProfit||0)))*100:null;
  const expenseChange=previousData&&Number(previousData.monthlyExpenses||0)!==0?((Number(data.monthlyExpenses||0)-Number(previousData.monthlyExpenses||0))/Math.abs(Number(previousData.monthlyExpenses||0)))*100:null;
  const netPrevious=Number(previousData?.monthlyProfit||0)-Number(previousData?.monthlyExpenses||0);
  const netChange=netPrevious!==0?((monthlyNet-netPrevious)/Math.abs(netPrevious))*100:null;
  const liquidityRatio=Number(data.generalPayable||0)>0?(Number(data.receivables||0)+Number(data.generalReceivable||0))/Number(data.generalPayable||0):3;
  const profitMargin=Number(data.monthlyTransferValue||0)>0?monthlyNet/Number(data.monthlyTransferValue||0):0;
  const healthScore=Math.max(0,Math.min(100,Math.round(
    (monthlyNet>=0?30:8)+
    Math.min(25,Math.max(0,liquidityRatio*10))+
    Math.min(20,Math.max(0,Number(data.turnoverRate||0)*6))+
    Math.min(15,Math.max(0,profitMargin*400))+
    (netCapitalMovement>=0?10:3)
  )));
  const healthLabel=healthScore>=85?"ممتاز":healthScore>=70?"جيد جداً":healthScore>=55?"جيد":healthScore>=40?"يحتاج متابعة":"حرج";
  const alerts=[];
  if(monthlyNet<0)alerts.push({level:"danger",text:"صافي الشهر سالب؛ المصروفات تجاوزت الأرباح."});
  if(expenseChange!=null&&expenseChange>15)alerts.push({level:"warning",text:`المصروفات ارتفعت ${expenseChange.toFixed(1)}% عن الشهر السابق.`});
  if(Number(data.generalPayable||0)>Number(data.generalReceivable||0)+Number(data.receivables||0))alerts.push({level:"danger",text:"الديون علينا أعلى من إجمالي المبالغ المستحقة لنا."});
  if(Number(data.turnoverRate||0)<1)alerts.push({level:"warning",text:"معدل دوران رأس المال منخفض عن مرة واحدة."});
  if(projectedNet>monthlyNet&&isCurrentMonth)alerts.push({level:"info",text:`التوقع الحالي لصافي نهاية الشهر ${money(projectedNet)} CAD.`});
  if(!alerts.length)alerts.push({level:"success",text:"المؤشرات المالية مستقرة ولا توجد تنبيهات حرجة."});
  const saveGoals=next=>{setGoals(next);localStorage.setItem("alaboud-budget-goals",JSON.stringify(next));};
  const progress=(value,target)=>Math.max(0,Math.min(100,target>0?(Number(value||0)/Number(target))*100:0));

  return <>
    <div className="page-title-row budget-title-row">
      <div>
        <h2>⚖️ الميزانية</h2>
        <p>نظرة مالية متكاملة على رأس المال والسيولة والأرباح</p>
      </div>
      <div className="budget-title-actions no-print">
        <input type="month" value={month} onChange={e=>setMonth(e.target.value)}/>
        <button onClick={load}>↻ تحديث</button>
        <button onClick={()=>window.print()}>🖨️ طباعة التقرير</button>
      </div>
    </div>

    {error&&<div className="card customer-error">{error}</div>}
    {message&&<div className="card rate-message">{message}</div>}

    <div className="stats capital-management-stats">
      <div className="card final">
        <span>رأس المال الكلي التقديري</span>
        <strong>{money(data.totalCapital)} CAD</strong>
      </div>
      <div className="card receivable-card">
        <span>إجمالي الإضافات</span>
        <strong>{money(capitalIn)} CAD</strong>
      </div>
      <div className="card payable-card">
        <span>إجمالي السحوبات</span>
        <strong>{money(capitalOut)} CAD</strong>
      </div>
      <div className={`card ${netCapitalMovement>=0?"budget-positive":"budget-negative"}`}>
        <span>صافي حركة رأس المال</span>
        <strong>{money(netCapitalMovement)} CAD</strong>
        <small>خلال الشهر المحدد</small>
      </div>
    </div>

    <section className="budget-command-grid">
      <article className="card company-health-card">
        <div className="section-heading"><h3>🏥 صحة الشركة</h3><small>{healthLabel}</small></div>
        <div className="health-score-ring" style={{"--score":`${healthScore*3.6}deg`}}><strong>{healthScore}</strong><span>/100</span></div>
        <p>مؤشر مركب من السيولة والربحية والدوران وحركة رأس المال.</p>
      </article>
      <article className="card net-worth-card">
        <div className="section-heading"><h3>💎 صافي الثروة</h3><small>القيمة المالية الفعلية</small></div>
        <strong className={netWorth>=0?"positive-value":"negative-value"}>{money(netWorth)} CAD</strong>
        <div className="net-worth-breakdown"><span>رأس المال {money(data.capitalBalance)}</span><span>لنا {money(Number(data.receivables||0)+Number(data.generalReceivable||0))}</span><span>علينا {money(data.generalPayable)}</span></div>
      </article>
      <article className="card forecast-card">
        <div className="section-heading"><h3>🔮 توقع نهاية الشهر</h3><small>{isCurrentMonth?`${elapsedDays}/${daysInMonth} يوم` : "شهر مكتمل"}</small></div>
        <strong className={projectedNet>=0?"positive-value":"negative-value"}>{money(projectedNet)} CAD</strong>
        <div className="forecast-pairs"><span>أرباح متوقعة <b>{money(projectedProfit)}</b></span><span>مصروفات متوقعة <b>{money(projectedExpenses)}</b></span></div>
      </article>
    </section>

    <section className="budget-comparison-grid">
      <article className="card comparison-card"><span>الأرباح مقارنة بالشهر السابق</span><strong className={(profitChange??0)>=0?"positive-value":"negative-value"}>{profitChange==null?"—":`${profitChange>=0?"+":""}${profitChange.toFixed(1)}%`}</strong><small>{money(data.monthlyProfit)} مقابل {money(previousData?.monthlyProfit)}</small></article>
      <article className="card comparison-card"><span>المصروفات مقارنة بالشهر السابق</span><strong className={(expenseChange??0)<=0?"positive-value":"negative-value"}>{expenseChange==null?"—":`${expenseChange>=0?"+":""}${expenseChange.toFixed(1)}%`}</strong><small>{money(data.monthlyExpenses)} مقابل {money(previousData?.monthlyExpenses)}</small></article>
      <article className="card comparison-card"><span>صافي الربح مقارنة بالشهر السابق</span><strong className={(netChange??0)>=0?"positive-value":"negative-value"}>{netChange==null?"—":`${netChange>=0?"+":""}${netChange.toFixed(1)}%`}</strong><small>{money(monthlyNet)} مقابل {money(netPrevious)}</small></article>
    </section>

    <section className="budget-pro-grid">
      <article className="card budget-goals-card no-print">
        <div className="section-heading"><h3>🎯 الأهداف المالية</h3><small>تُحفظ على الجهاز</small></div>
        <label><span>هدف الأرباح</span><input type="number" value={goals.profit} onChange={e=>saveGoals({...goals,profit:Number(e.target.value)})}/></label>
        <div className="goal-track"><span style={{width:`${progress(data.monthlyProfit,goals.profit)}%`}}></span></div>
        <small>{progress(data.monthlyProfit,goals.profit).toFixed(0)}% من الهدف</small>
        <label><span>الحد الأعلى للمصروفات</span><input type="number" value={goals.expenses} onChange={e=>saveGoals({...goals,expenses:Number(e.target.value)})}/></label>
        <div className="goal-track expense-goal"><span style={{width:`${progress(data.monthlyExpenses,goals.expenses)}%`}}></span></div>
        <small>{progress(data.monthlyExpenses,goals.expenses).toFixed(0)}% مستخدم</small>
        <label><span>هدف صافي رأس المال</span><input type="number" value={goals.capital} onChange={e=>saveGoals({...goals,capital:Number(e.target.value)})}/></label>
        <div className="goal-track capital-goal"><span style={{width:`${progress(netWorth,goals.capital)}%`}}></span></div>
        <small>{progress(netWorth,goals.capital).toFixed(0)}% من الهدف</small>
      </article>
      <article className="card budget-alerts-card">
        <div className="section-heading"><h3>🔔 التنبيهات الذكية</h3><small>{alerts.length} ملاحظة</small></div>
        <div className="smart-alert-list">{alerts.map((alert,index)=><div key={index} className={`smart-alert ${alert.level}`}>{alert.text}</div>)}</div>
      </article>
      <article className="card executive-summary-card">
        <div className="section-heading"><h3>🤖 ملخص المدير</h3><small>تحليل فوري</small></div>
        <p>{monthlyNet>=0?"الشركة تحقق صافيًا إيجابيًا خلال الشهر المحدد.":"يجب مراجعة المصروفات لأن صافي الشهر سلبي."}</p>
        <p>{profitChange==null?"لا توجد بيانات كافية للمقارنة الشهرية.":profitChange>=0?`الأرباح ارتفعت ${profitChange.toFixed(1)}% عن الشهر السابق.`:`الأرباح انخفضت ${Math.abs(profitChange).toFixed(1)}% عن الشهر السابق.`}</p>
        <p>{liquidityRatio>=1.5?"تغطية الالتزامات جيدة وفق المبالغ المستحقة.":"تغطية الالتزامات تحتاج متابعة وتحصيل أسرع."}</p>
        <p>كفاءة دوران رأس المال مصنفة: <strong>{efficiency}</strong>.</p>
      </article>
    </section>

    <section className="budget-intelligence-grid">
      <article className="card budget-flow-card">
        <div className="section-heading"><h3>📊 تدفق رأس المال</h3><small>{month}</small></div>
        <div className="budget-flow-track"><span style={{width:`${inShare}%`}}></span><b style={{width:`${outShare}%`}}></b></div>
        <div className="budget-flow-legend"><span>إضافات {inShare}%</span><span>سحوبات {outShare}%</span></div>
      </article>
      <article className="card budget-health-card">
        <div className="section-heading"><h3>💡 المؤشر المالي</h3><small>{liquidityStatus}</small></div>
        <strong className={monthlyNet>=0?"positive-value":"negative-value"}>{money(monthlyNet)} CAD</strong>
        <p>صافي أرباح الشهر بعد خصم المصروفات</p>
      </article>
      <article className="card budget-turnover-card">
        <div className="section-heading"><h3>⚡ كفاءة رأس المال</h3><small>{efficiency}</small></div>
        <strong>{Number(data.turnoverRate).toFixed(2)}×</strong>
        <div className="budget-score"><span style={{width:`${Math.min(100,Number(data.turnoverRate||0)*25)}%`}}></span></div>
      </article>
    </section>

    {currencySummary.length>0&&<section className="card budget-currency-summary">
      <div className="section-heading"><h3>💱 حركة رأس المال حسب العملة</h3><small>الشهر المحدد</small></div>
      <div className="budget-currency-grid">{currencySummary.map(item=><div key={item.currency}>
        <strong>{item.currency}</strong><span className="positive-value">+ {money(item.in)}</span><span className="negative-value">- {money(item.out)}</span>
      </div>)}</div>
    </section>}

    <form className="card form capital-manage-form no-print" onSubmit={addCapital}>
      <h3>➕ إضافة رأس مال أو سحب</h3>
      <select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>
        <option value="IN">إضافة رأس مال</option>
        <option value="OUT">سحب من رأس المال</option>
      </select>
      <input
        type="number"
        min=".01"
        step=".01"
        value={form.amount}
        onChange={e=>setForm({...form,amount:e.target.value})}
        placeholder="المبلغ"
        required
      />
      <select value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}>
        {debtCurrencies.map(item=>item.code).map(currency=><option key={currency}>{currency}</option>)}
      </select>
      <label className="capital-today-field">
        <span>📅 تاريخ اليوم</span>
        <input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/>
      </label>
      <input value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="الوصف أو سبب الإضافة / السحب"/>
      <button>{form.type==="IN"?"إضافة رأس المال":"تسجيل السحب"}</button>
    </form>

    {editing&&<form className="card form edit-panel capital-edit-form no-print" onSubmit={saveEdit}>
      <h3>✏️ تعديل حركة رأس المال</h3>
      <select value={editing.type} onChange={e=>setEditing({...editing,type:e.target.value})}>
        <option value="IN">إضافة رأس مال</option>
        <option value="OUT">سحب من رأس المال</option>
      </select>
      <input type="number" min=".01" step=".01" value={editing.amount} onChange={e=>setEditing({...editing,amount:e.target.value})} required/>
      <select value={editing.currency||"CAD"} onChange={e=>setEditing({...editing,currency:e.target.value})}>
        {debtCurrencies.map(item=>item.code).map(currency=><option key={currency}>{currency}</option>)}
      </select>
      <input type="date" value={editing.date||""} onChange={e=>setEditing({...editing,date:e.target.value})}/>
      <input value={editing.description||""} onChange={e=>setEditing({...editing,description:e.target.value})} placeholder="الوصف"/>
      <button>حفظ التعديل</button>
      <button type="button" onClick={()=>setEditing(null)}>إلغاء</button>
    </form>}

    <div className="card tablewrap capital-movements-table">
      <div className="capital-table-toolbar">
        <div><h3>📋 سجل رأس المال</h3><small>{filteredMovements.length} حركة</small></div>
        <div className="capital-table-filters no-print">
          <input value={movementSearch} onChange={e=>setMovementSearch(e.target.value)} placeholder="ابحث في السجل..."/>
          <select value={movementFilter} onChange={e=>setMovementFilter(e.target.value)}><option value="ALL">جميع الحركات</option><option value="IN">الإضافات فقط</option><option value="OUT">السحوبات فقط</option></select>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>التاريخ</th>
            <th>النوع</th>
            <th>المبلغ</th>
            <th>العملة</th>
            <th>الوصف</th>
            <th className="no-print">الإجراءات</th>
          </tr>
        </thead>
        <tbody>{filteredMovements.length?filteredMovements.map(item=><tr key={item.id}>
          <td>{item.date||String(item.createdAt||"").slice(0,10)}</td>
          <td><span className={`capital-type-badge ${item.type==="IN"?"capital-in":"capital-out"}`}>
            {item.type==="IN"?"إضافة":"سحب"}
          </span></td>
          <td><strong>{money(item.amount)}</strong></td>
          <td>{item.currency||"CAD"}</td>
          <td>{item.description||"-"}</td>
          <td className="actions no-print">
            <button type="button" onClick={()=>setEditing({...item})}>تعديل</button>
            <button type="button" className="danger-button" onClick={()=>deleteCapital(item)}>حذف</button>
          </td>
        </tr>):<tr><td colSpan="6">لا توجد حركات رأس مال مسجلة.</td></tr>}</tbody>
      </table>
    </div>

    <div className="stats">
      <div className="card transfer-total-card">
        <span>إجمالي الحوالات في الشهر</span>
        <strong>{money(data.monthlyTransferValue)}</strong>
      </div>
      <div className="card turnover-card">
        <span>معدل دوران رأس المال</span>
        <strong>{Number(data.turnoverRate).toFixed(2)} مرة</strong>
        <small>{efficiency}</small>
      </div>
      <div className="card"><span>أرباح الشهر</span><strong>{money(data.monthlyProfit)}</strong></div>
      <div className="card"><span>مصروفات الشهر</span><strong>{money(data.monthlyExpenses)}</strong></div>
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
      <div className={`card final metric-card metric-net ${Number(s.netProfit||0)<0?"value-negative":"value-positive"}`}><span>صافي الربح</span><strong>{money(s.netProfit)}</strong></div>
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

function NotificationSettings({embedded=false}){
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

  return <div className={embedded?"notification-settings-embedded":"notification-settings-page"}>
    {!embedded&&<h2>إعدادات التنبيهات وواتساب</h2>}
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
    <div className={embedded?"settings-help":"card"}>
      <strong>ملاحظة:</strong>
      <p>زر واتساب يفتح الرسالة جاهزة للإرسال. الإرسال التلقائي دون ضغط يحتاج ربط WhatsApp Business API رسمي.</p>
    </div>
  </div>;
}


function SettingsPanel(){
  const savedUser=(()=>{
    try{return JSON.parse(localStorage.getItem("afs_user")||"{}")}catch{return {}}
  })();

  const [language,setLanguage]=useState(localStorage.getItem("alaboud_language")||"ar");
  const [displayMode,setDisplayMode]=useState(localStorage.getItem("alaboud_display_mode")||"comfortable");
  const [currency,setCurrency]=useState(localStorage.getItem("alaboud_primary_currency")||"CAD");
  const [message,setMessage]=useState("");
  const [updateInfo,setUpdateInfo]=useState({checking:false,status:"",version:APP_VERSION});
  const [accountForm,setAccountForm]=useState({name:"",email:"",password:"",role:"USER"});
  const [passwordForm,setPasswordForm]=useState({currentPassword:"",newPassword:"",confirmPassword:""});
  const [companyProfile,setCompanyProfile]=useState({name:savedUser.companyName||"",phone:"",logoDataUrl:""});
  const [companySaving,setCompanySaving]=useState(false);
  const [backupBusy,setBackupBusy]=useState(false);
  const [lastBackupAt,setLastBackupAt]=useState(localStorage.getItem("alaboud_last_backup_at")||"");
  const [users,setUsers]=useState([]);
  const [devices,setDevices]=useState([]);
  const [twoFactorInfo,setTwoFactorInfo]=useState({secret:"",code:"",enabled:Boolean(savedUser.twoFactorEnabled)});
  const [biometricEnabled,setBiometricEnabled]=useState(Boolean(window.AlAboudNative?.isBiometricEnabled?.()));
  const biometricAvailable=Boolean(typeof window!=="undefined"&&(window.AlAboudNative||navigator.userAgent.includes("AlAboudMobile")));

  useEffect(()=>{
    api.get("/company-profile").then(({data})=>setCompanyProfile(data)).catch(()=>{});
    if(savedUser.role==="ADMIN"){api.get("/users").then(({data})=>setUsers(data)).catch(()=>{});api.get("/devices").then(({data})=>setDevices(data)).catch(()=>{})}
  },[]);

  function chooseCompanyLogo(event){
    const file=event.target.files?.[0];
    if(!file)return;
    if(file.size>1024*1024){setMessage("حجم الشعار يجب أن يكون أقل من 1 MB");return}
    const reader=new FileReader();
    reader.onload=()=>setCompanyProfile(current=>({...current,logoDataUrl:String(reader.result||"")}));
    reader.readAsDataURL(file);
  }

  async function saveCompanyProfile(event){
    event.preventDefault();setMessage("");setCompanySaving(true);
    try{
      const {data}=await api.patch("/company-profile",companyProfile);
      setCompanyProfile(data);
      const currentUser={...savedUser,companyName:data.name};
      localStorage.setItem("afs_user",JSON.stringify(currentUser));
      window.dispatchEvent(new CustomEvent("alaboud-company-updated",{detail:data}));
      setMessage("تم حفظ اسم وشعار الشركة بنجاح");
    }catch(error){setMessage(error.response?.data?.message||"تعذر حفظ هوية الشركة")}
    finally{setCompanySaving(false)}
  }

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

  async function beginTwoFactor(){setMessage("");try{const {data}=await api.post("/auth/2fa/setup");setTwoFactorInfo(current=>({...current,...data,code:""}));setMessage("أضف المفتاح إلى تطبيق Authenticator ثم أدخل الرمز")}catch(error){setMessage(error.response?.data?.message||"تعذر بدء إعداد التحقق بخطوتين")}}
  async function enableTwoFactor(){try{const {data}=await api.post("/auth/2fa/enable",{code:twoFactorInfo.code});const user={...savedUser,twoFactorEnabled:true};localStorage.setItem("afs_user",JSON.stringify(user));setTwoFactorInfo({secret:"",code:"",enabled:true});setMessage(data.message)}catch(error){setMessage(error.response?.data?.message||"تعذر تفعيل التحقق بخطوتين")}}
  async function disableTwoFactor(){try{const {data}=await api.post("/auth/2fa/disable");const user={...savedUser,twoFactorEnabled:false};localStorage.setItem("afs_user",JSON.stringify(user));setTwoFactorInfo({secret:"",code:"",enabled:false});setMessage(data.message)}catch(error){setMessage(error.response?.data?.message||"تعذر تعطيل التحقق بخطوتين")}}

  async function enableBiometric(){
    setMessage("");
    const native=window.AlAboudNative;
    if(!native){setMessage("تفعيل البصمة متاح داخل تطبيق الهاتف فقط");return}
    try{
      const {data}=await api.post("/auth/biometric-token");
      const userJson=localStorage.getItem("afs_user")||"{}";
      if(typeof native.enableBiometricLogin==="function"){
        native.enableBiometricLogin(data.token,userJson);
      }else if(typeof native.enableBiometric==="function"){
        native.saveBiometricToken?.(data.token,userJson);
        native.enableBiometric();
      }else{
        throw new Error("إصدار تطبيق الهاتف لا يدعم تفعيل البصمة");
      }
    }catch(error){setMessage(error.response?.data?.message||error.message||"تعذر تفعيل الدخول بالبصمة أو الوجه")}
  }
  function disableBiometric(){
    const native=window.AlAboudNative;
    if(typeof native?.disableBiometricLogin==="function")native.disableBiometricLogin();
    else native?.disableBiometric?.();
    setBiometricEnabled(false);
    setMessage("تم تعطيل الدخول بالبصمة أو الوجه");
  }
  useEffect(()=>{
    const handler=event=>{
      const enabled=Boolean(event.detail?.enabled);
      setBiometricEnabled(enabled);
      setMessage(event.detail?.message||(enabled?"تم تفعيل الدخول بالبصمة أو الوجه بنجاح":"تم تعطيل الدخول بالبصمة أو الوجه"));
    };
    window.addEventListener("alaboud-biometric-status",handler);
    window.addEventListener("alaboud-biometric-enable-result",handler);
    window.AlAboudNative?.getBiometricStatus?.();
    return()=>{
      window.removeEventListener("alaboud-biometric-status",handler);
      window.removeEventListener("alaboud-biometric-enable-result",handler);
    };
  },[]);

  async function checkUpdates(){
    setUpdateInfo(current=>({...current,checking:true,status:"جاري التحقق..."}));
    try{
      const response=await api.get("/health");
      const serverVersion=response.data?.version||"غير معروف";
      setUpdateInfo({
        checking:false,
        status:`الخدمة تعمل بشكل طبيعي — إصدار الخادم ${serverVersion}`,
        version:APP_VERSION
      });
    }catch{
      setUpdateInfo(current=>({...current,checking:false,status:"تعذر التحقق من حالة التحديث"}));
    }
  }

  async function downloadBackup(){
    setBackupBusy(true);setMessage("");
    try{
      const response=await api.get("/backup",{responseType:"blob"});
      const blob=new Blob([response.data],{type:"application/json"});
      const url=URL.createObjectURL(blob);
      const link=document.createElement("a");
      const stamp=new Date().toISOString().replace(/[:.]/g,"-");
      link.href=url;link.download=`alaboud-backup-${stamp}.json`;
      document.body.appendChild(link);link.click();link.remove();
      URL.revokeObjectURL(url);
      const savedAt=new Date().toISOString();
      localStorage.setItem("alaboud_last_backup_at",savedAt);
      setLastBackupAt(savedAt);
      setMessage("تم إنشاء وتنزيل النسخة الاحتياطية بنجاح");
    }catch(error){setMessage(error.response?.data?.message||"تعذر إنشاء النسخة الاحتياطية")}
    finally{setBackupBusy(false)}
  }

  async function restoreBackup(event){
    const file=event.target.files?.[0];
    event.target.value="";
    if(!file)return;
    if(!window.confirm("سيتم استبدال بيانات هذه الشركة بمحتوى النسخة الاحتياطية. هل تريد المتابعة؟"))return;
    setBackupBusy(true);setMessage("");
    try{
      const payload=JSON.parse(await file.text());
      const response=await api.post("/backup/restore",payload);
      setMessage(response.data?.message||"تمت استعادة النسخة الاحتياطية بنجاح");
      setTimeout(()=>window.location.reload(),900);
    }catch(error){setMessage(error.response?.data?.message||error.message||"تعذر استعادة النسخة الاحتياطية")}
    finally{setBackupBusy(false)}
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
      <span className="settings-version">{APP_VERSION}</span>
    </div>

    {message&&<div className="card settings-message">{message}</div>}

    <div className="settings-grid">
    <article className="settings-card security-access-card"><div className="settings-card-title"><span>🔐</span><h3>حماية تسجيل الدخول</h3></div><p className="settings-help">التحقق بخطوتين بواسطة Google Authenticator أو Microsoft Authenticator.</p>{twoFactorInfo.enabled?<button type="button" className="danger" onClick={disableTwoFactor}>تعطيل التحقق بخطوتين</button>:<>{!twoFactorInfo.secret?<button type="button" className="settings-primary-button" onClick={beginTwoFactor}>بدء التفعيل</button>:<div className="two-factor-setup"><label>المفتاح السري<input readOnly value={twoFactorInfo.secret}/></label><small>انسخ المفتاح إلى تطبيق Authenticator.</small><label>رمز التحقق<input inputMode="numeric" maxLength="6" value={twoFactorInfo.code} onChange={e=>setTwoFactorInfo({...twoFactorInfo,code:e.target.value.replace(/\D/g,"").slice(0,6)})}/></label><button type="button" disabled={twoFactorInfo.code.length!==6} onClick={enableTwoFactor}>تأكيد التفعيل</button></div>}</>}<div className="biometric-settings-block"><div><strong>👆 الدخول بالبصمة أو الوجه</strong><small>{biometricAvailable?(biometricEnabled?"مفعّل على هذا الهاتف":"غير مفعّل على هذا الهاتف"):"متاح داخل تطبيق الهاتف فقط"}</small></div>{biometricAvailable&&(biometricEnabled?<button type="button" className="danger" onClick={disableBiometric}>تعطيل البصمة أو الوجه</button>:<button type="button" className="settings-primary-button" onClick={enableBiometric}>تفعيل البصمة أو الوجه</button>)}</div><p className="security-note">بعد التفعيل، سيظهر زر الدخول بالبصمة أو الوجه في شاشة تسجيل الدخول.</p></article>


      <article className="settings-card settings-backup-card">
        <div className="settings-card-title"><span>💾</span><h3>النسخ الاحتياطي</h3></div>
        <p className="settings-help">تنزيل نسخة كاملة من بيانات شركتك أو استعادتها لاحقًا.</p>
        <div className="settings-backup-actions">
          <button type="button" className="settings-primary-button" onClick={downloadBackup} disabled={backupBusy}>{backupBusy?"جاري التنفيذ...":"إنشاء نسخة احتياطية"}</button>
          <label className="settings-restore-button">استعادة نسخة احتياطية
            <input type="file" accept="application/json,.json" onChange={restoreBackup} disabled={backupBusy}/>
          </label>
        </div>
        <small>آخر نسخة: {lastBackupAt?new Date(lastBackupAt).toLocaleString("ar-CA"):"لم يتم إنشاء نسخة بعد"}</small>
      </article>

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

      <article className="settings-card settings-alerts-embedded">
        <div className="settings-card-title"><span>🔔</span><h3>إعدادات التنبيهات وواتساب</h3></div>
        <NotificationSettings embedded />
      </article>

      <article className="settings-card company-branding-settings">
        <div className="settings-card-title"><span>🏢</span><h3>معلومات وهوية الشركة</h3></div>
        <p className="settings-help">اسم وشعار مستقلان لهذه الشركة ويظهران على جميع الأجهزة عند تسجيل الدخول بنفس الحساب.</p>
        <form className="settings-form-modern" onSubmit={saveCompanyProfile}>
          <div className="company-logo-preview">
            <img src={companyProfile.logoDataUrl||"/alaboud-company-logo.webp"} alt={companyProfile.name||"شعار الشركة"}/>
          </div>
          <input value={companyProfile.name||""} onChange={e=>setCompanyProfile({...companyProfile,name:e.target.value})} placeholder="اسم الشركة" required/>
          <input value={companyProfile.phone||""} onChange={e=>setCompanyProfile({...companyProfile,phone:e.target.value})} placeholder="رقم هاتف الشركة"/>
          <label className="company-logo-upload">🖼️ اختيار لوغو الشركة
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseCompanyLogo}/>
          </label>
          {companyProfile.logoDataUrl&&<button type="button" className="company-logo-remove" onClick={()=>setCompanyProfile({...companyProfile,logoDataUrl:""})}>حذف الشعار الحالي</button>}
          <button disabled={companySaving}>{companySaving?"جاري الحفظ...":"حفظ اسم وشعار الشركة"}</button>
        </form>
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

      {savedUser.role==="ADMIN"&&<article className="settings-card settings-wide-card">
        <div className="settings-card-title"><span>👥</span><h3>إدارة المستخدمين والصلاحيات</h3></div>
        <div className="admin-list">{users.map(user=><div className="admin-row" key={user.id}><div><strong>{user.name}</strong><small>{user.email} • آخر دخول: {user.lastLoginAt?new Date(user.lastLoginAt).toLocaleString("ar-CA"):"لم يدخل بعد"}</small></div><select value={user.role} onChange={async e=>{const {data}=await api.patch(`/users/${user.id}`,{role:e.target.value});setUsers(list=>list.map(x=>x.id===data.id?{...x,...data}:x))}}><option value="ADMIN">مسؤول كامل</option><option value="MANAGER">مدير</option><option value="USER">مستخدم</option><option value="VIEWER">مشاهدة فقط</option></select><button type="button" className={user.active?"danger-soft":"success-soft"} onClick={async()=>{const {data}=await api.patch(`/users/${user.id}`,{active:!user.active});setUsers(list=>list.map(x=>x.id===data.id?{...x,...data}:x))}}>{user.active?"تعطيل":"تفعيل"}</button></div>)}</div>
      </article>}

      {savedUser.role==="ADMIN"&&<article className="settings-card settings-wide-card">
        <div className="settings-card-title"><span>💻</span><h3>الأجهزة والتراخيص</h3></div>
        <p className="settings-help">يُسجل كل تثبيت بمعرّف فريد ونوع الجهاز والإصدار وآخر اتصال.</p>
        <div className="admin-list">{devices.length?devices.map(device=><div className="admin-row" key={device.id}><div><strong>{device.deviceName||"جهاز"}</strong><small>{device.appVersion||"17.0.1"} • {device.platform?.slice(0,70)}<br/>آخر اتصال: {device.lastSeenAt?new Date(device.lastSeenAt).toLocaleString("ar-CA"):"—"}</small></div><button type="button" className={device.active!==false?"danger-soft":"success-soft"} onClick={async()=>{const {data}=await api.patch(`/devices/${device.id}`,{active:device.active===false});setDevices(list=>list.map(x=>x.id===data.id?data:x))}}>{device.active!==false?"تعطيل الجهاز":"إعادة التفعيل"}</button></div>):<p className="settings-help">ستظهر الأجهزة هنا بعد أول تسجيل دخول بالإصدار الجديد.</p>}</div>
      </article>}

      <article className="settings-card settings-wide-card">
        <div className="settings-card-title"><span>📄</span><h3>سياسة الخصوصية وشروط الاستخدام</h3></div>
        <details><summary>سياسة الخصوصية</summary><p className="settings-help">يجمع النظام معلومات الحساب ومعرّف التثبيت ونوع الجهاز وإصدار التطبيق وتاريخ أول وآخر استخدام لأغراض الأمان وإدارة التراخيص فقط. لا تُباع البيانات ولا تُشارك مع جهات خارجية، ولا تُخزن كلمات المرور بصورتها الأصلية.</p></details>
        <details><summary>شروط الاستخدام</summary><p className="settings-help">الاستخدام مخصص للأجهزة والحسابات المصرح بها. يمنع نسخ البرنامج أو إعادة بيعه أو تجاوز الحماية دون إذن. المستخدم مسؤول عن صحة البيانات والنسخ الاحتياطية والالتزام بالقوانين المحلية.</p></details>
        <small>آخر تحديث: 18 يوليو 2026 — الإصدار القانوني 1.0</small>
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
          <button type="button" onClick={()=>navigator.clipboard?.writeText(APP_VERSION).then(()=>setMessage("تم نسخ رقم الإصدار"))}>📋 نسخ رقم الإصدار</button>
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


function AICommandCenter({navigate}){
  const [overview,setOverview]=useState(null);const [question,setQuestion]=useState("");const [messages,setMessages]=useState([{role:"assistant",text:"مرحبًا، أنا مساعد العبود الذكي. اسألني عن الأرباح أو المصروفات أو الديون أو التوقعات."}]);const [busy,setBusy]=useState(false);const [listening,setListening]=useState(false);
  const load=()=>api.get("/ai/overview").then(r=>setOverview(r.data)).catch(()=>{});
  useEffect(()=>{load()},[]);
  async function ask(text=question){const q=String(text||"").trim();if(!q||busy)return;setQuestion("");setMessages(m=>[...m,{role:"user",text:q}]);setBusy(true);try{const {data}=await api.post("/ai/assistant",{question:q});setMessages(m=>[...m,{role:"assistant",text:data.answer,data:data.data||[],action:data.action}]);setOverview(data.overview||overview)}catch(e){setMessages(m=>[...m,{role:"assistant",text:e.response?.data?.message||"تعذر تنفيذ التحليل الآن."}])}finally{setBusy(false)}}
  function voice(){const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){alert("الإدخال الصوتي غير مدعوم في هذا المتصفح");return}const r=new SR();r.lang="ar-SA";r.onstart=()=>setListening(true);r.onend=()=>setListening(false);r.onresult=e=>{const t=e.results[0][0].transcript;setQuestion(t);ask(t)};r.start()}
  if(!overview)return <div className="premium-loading">جاري تشغيل مركز الذكاء…</div>;
  return <section className="ai-center">
    <div className="ai-hero"><div><span>🤖</span><div><h2>مركز القيادة الذكي</h2><p>ALABOUD AI — تحليل الأعمال واتخاذ القرار</p></div></div><b className={overview.healthScore>=75?"good":overview.healthScore>=50?"warn":"bad"}>صحة الشركة {overview.healthScore}/100</b></div>
    <div className="ai-kpis"><article className={Number(overview.today.netProfit||0)<0?"value-negative":"value-positive"}><span>صافي اليوم</span><strong>{cad(overview.today.netProfit)}</strong></article><article className={Number(overview.month.netProfit||0)<0?"value-negative":"value-positive"}><span>صافي الشهر</span><strong>{cad(overview.month.netProfit)}</strong></article><article className="value-receivable"><span>الديون لنا</span><strong>{cad(overview.finance.receivables)}</strong></article><article className={Number(overview.forecast.nextMonthNet||0)<0?"value-negative":"value-positive"}><span>توقع الشهر القادم</span><strong>{cad(overview.forecast.nextMonthNet)}</strong></article></div>
    <div className="ai-intelligence-grid">
      <article className="card ai-trend-card"><div className="section-heading"><h3>📊 اتجاه الأداء خلال 6 أشهر</h3><small>الأرباح والمصروفات وصافي النتيجة</small></div><div className="ai-trend-bars">{overview.monthlyTrend.map((item)=>{const max=Math.max(1,...overview.monthlyTrend.flatMap(x=>[Math.abs(x.profit||0),Math.abs(x.expenses||0),Math.abs(x.net||0)]));return <div className="ai-trend-column" key={item.month}><div className="ai-trend-stack"><i className="profit" style={{height:`${Math.max(6,Math.abs(item.profit||0)/max*100)}%`}} title={`الأرباح ${cad(item.profit)}`}></i><i className="expense" style={{height:`${Math.max(6,Math.abs(item.expenses||0)/max*100)}%`}} title={`المصروفات ${cad(item.expenses)}`}></i><i className={item.net>=0?"net positive":"net negative"} style={{height:`${Math.max(6,Math.abs(item.net||0)/max*100)}%`}} title={`الصافي ${cad(item.net)}`}></i></div><span>{item.month.slice(5)}</span></div>})}</div><div className="ai-chart-legend"><span>● الأرباح</span><span>● المصروفات</span><span>● الصافي</span></div></article>
      <article className="card ai-decision-card"><div className="section-heading"><h3>🎯 مركز القرارات</h3><small>إجراءات مقترحة الآن</small></div>{overview.recommendations.slice(0,4).map((x,i)=><button key={i} onClick={()=>{if(/دين|تحصيل/.test(x))navigate("customers");else if(/مصروف/.test(x))navigate("expenses");else if(/سيولة|رأس/.test(x))navigate("capital-overview");else navigate("monthly-report")}}><span>{i+1}</span><p>{x}</p><b>تنفيذ ›</b></button>)}</article>
    </div>
    <div className="ai-layout"><div className="ai-chat card"><div className="ai-messages">{messages.map((m,i)=><div key={i} className={`ai-message ${m.role}`}><p>{m.text}</p>{m.data?.length>0&&<div className="ai-results">{m.data.slice(0,6).map((x,j)=><div key={x.id||j}><strong>{x.name||x.title||x.number||"سجل"}</strong><span>{x.finalBalance!==undefined?cad(x.finalBalance):x.amount!==undefined?`${x.amount} ${x.currency||""}`:""}</span></div>)}</div>}{m.action&&<button onClick={()=>navigate(m.action.page)}>فتح الصفحة</button>}</div>)}{busy&&<div className="ai-message assistant"><p>جاري التحليل…</p></div>}</div><form onSubmit={e=>{e.preventDefault();ask()}} className="ai-input"><button type="button" onClick={voice}>{listening?"◉":"🎙️"}</button><input value={question} onChange={e=>setQuestion(e.target.value)} placeholder="اسأل: كم أرباح هذا الشهر؟"/><button>إرسال</button></form><div className="ai-quick">{["كم أرباح اليوم؟","اعرض الديون المتأخرة","حلل المصروفات","ما توقع الشهر القادم؟","قيّم صحة الشركة"].map(x=><button key={x} onClick={()=>ask(x)}>{x}</button>)}</div></div>
    <aside className="ai-side"><div className="card"><h3>💡 توصيات اليوم</h3>{overview.recommendations.map((x,i)=><p key={i}>• {x}</p>)}</div><div className="card"><h3>🚨 اكتشاف تلقائي</h3>{overview.anomalies.length?overview.anomalies.map((x,i)=><div key={i} className={`ai-alert ${x.level}`}><strong>{x.title}</strong><small>{x.message}</small></div>):<p>لا توجد أخطاء غير اعتيادية.</p>}</div><div className="card"><h3>🖥️ مراقبة النظام</h3><p>قاعدة البيانات: <b>{overview.system.database}</b></p><p>المستخدمون: <b>{overview.system.users}</b></p><p>الأجهزة النشطة: <b>{overview.system.devices}</b></p><button onClick={()=>navigate("settings")}>النسخ الاحتياطي والإعدادات</button></div></aside></div>
  </section>
}

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
  const load=()=>api.get(endpoint).then(r=>setList(r.data));
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
    if(!window.confirm(`هل أنت متأكد من حذف المصروف: ${x.title}؟`))return;
    try{await api.delete(`${endpoint}/${x.id}`);if(String(editingId)===String(x.id))resetExpenseForm();setMessage("تم حذف المصروف بنجاح");await load();}
    catch(err){setMessage(err?.response?.data?.message||"تعذر حذف المصروف");}
  }
  if(type!=="expenses")return <><h2>رأس المال</h2><form className="card form" onSubmit={add}><select value={move} onChange={e=>setMove(e.target.value)}><option value="IN">زيادة</option><option value="OUT">سحب</option></select><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="الوصف" required/><input type="number" step=".01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="المبلغ" required/><button>حفظ</button></form><div className="card tablewrap"><table><tbody>{list.map(x=><tr key={x.id}><td>{x.date}</td><td>{x.description}</td><td>{x.type}</td><td>{money(x.amount)} {x.currency||"CAD"}</td></tr>)}</tbody></table></div></>;
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
    <div className="card tablewrap expense-table"><table><thead><tr><th>التاريخ</th><th>الوصف</th><th>التصنيف</th><th>العملة</th><th>المبلغ الأصلي</th><th>سعر التحويل</th><th>القيمة CAD</th><th>الإجراءات</th></tr></thead><tbody>{list.map(x=><tr key={x.id} className={String(editingId)===String(x.id)?"expense-editing-row":""}><td>{x.date}</td><td>{x.title}</td><td>{x.category||"Other"}</td><td><span className="expense-currency-cell">{flagOf(x.currency)} {x.currency||"CAD"}</span></td><td>{money(x.amount)} {x.currency||"CAD"}</td><td>{Number(x.exchangeRate||1).toFixed(6)}</td><td><strong>{money(x.cadAmount??x.amount)} CAD 🇨🇦</strong></td><td><div className="expense-row-actions"><button type="button" className="expense-edit-button" onClick={()=>editExpense(x)}>✏️ تعديل</button><button type="button" className="expense-delete-button" onClick={()=>deleteExpense(x)}>🗑️ حذف</button></div></td></tr>)}</tbody></table></div>
  </div>;
}
export default function App(){
  const sessionFixVersion="16.0.0";
  const savedSessionFix=localStorage.getItem("alaboud_session_fix_version");

  if(savedSessionFix!==sessionFixVersion){
    localStorage.removeItem("afs_token");
    localStorage.removeItem("afs_user");
    localStorage.setItem("alaboud_session_fix_version",sessionFixVersion);
  }

  const [token,setToken]=useState(localStorage.getItem("afs_token"));
  const savedCompanyUser=(()=>{try{return JSON.parse(localStorage.getItem("afs_user")||"{}")}catch{return {}}})();
  const [companyBrand,setCompanyBrand]=useState({name:savedCompanyUser.companyName||"شركة العبود التجارية",logoDataUrl:""});

  useEffect(()=>{
    if(!token)return;

    api.get("/auth/session").then(({data})=>{
      localStorage.setItem("afs_user",JSON.stringify(data.user));
      window.dispatchEvent(new CustomEvent("alaboud-live-session",{detail:data}));
    }).catch(()=>{});

    api.get("/company-profile").then(({data})=>setCompanyBrand(data)).catch(()=>{});
    const updateCompany=event=>setCompanyBrand(event.detail);
    window.addEventListener("alaboud-company-updated",updateCompany);
    return()=>window.removeEventListener("alaboud-company-updated",updateCompany);
  },[token]);

  useEffect(()=>{
    const handleAuthExpired=()=>setToken(null);
    window.addEventListener("alaboud-auth-expired",handleAuthExpired);
    return()=>window.removeEventListener("alaboud-auth-expired",handleAuthExpired);
  },[]);
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
    content=<Customers open={setCustomerId}/>;
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
  }else if(page==="capital-overview"||page==="capital"){
    content=<CapitalOverview/>;
  }else if(page==="monthly-report"){
    content=<MonthlyReport/>;
  }else if(page==="notification-settings"){
    content=<SettingsPanel/>;
  }else if(page==="settings"){
    content=<SettingsPanel/>;
  }else if(page==="ai-center"){
    content=<AICommandCenter navigate={navigate}/>;
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
    ["customers",`👥 العملاء${overdueCount?` — متأخرون (${overdueCount})`:""}`],
    ["partners","🏢 الشركات"],
    ["transactions","⇄ الحوالات"],
    ["expenses","🧾 المصروفات"],
    ["profits","📈 الأرباح"],
    ["rates","💱 العملات وأسعار الصرف"],
    ["debts","📒 الدَّين العام"],
    ["capital-overview","⚖️ الميزانية"],
    ["monthly-report","📊 التقارير الشهرية"],
    ["ai-center","🧠 مركز القيادة الذكي"],
    ["settings","⚙️ الإعدادات والتنبيهات"]
  ];

  return <><AppLanguageBridge/><div className={`app ${mobileMenuOpen?"mobile-menu-view":"mobile-page-view"}`}>
    <div className="mobile-page-header no-print">
      <button className="mobile-header-action mobile-menu-action" onClick={()=>setMobileMenuOpen(true)} aria-label="فتح القائمة">
        <span className="mobile-header-icon">☰</span><span>القائمة</span>
      </button>
      <div className="mobile-brand-center">
        <img className="mobile-header-logo" src={companyBrand.logoDataUrl||"/alaboud-company-logo.webp"} alt={companyBrand.name}/>
        <div className="mobile-brand-copy">
          <strong>{companyBrand.name}</strong>
          <small>{APP_VERSION}</small>
        </div>
      </div>
      <button className="mobile-header-action mobile-home-action" onClick={()=>setMobileMenuOpen(true)} aria-label="القائمة الرئيسية">
        <span className="mobile-header-icon">⌂</span><span>الرئيسية</span>
      </button>
    </div>
    <aside>
      <div className="mobile-menu-heading no-print">
        <img className="alaboud-sidebar-logo mobile-logo" src={companyBrand.logoDataUrl||"/alaboud-company-logo.webp"} alt={companyBrand.name} />
        <button onClick={()=>setMobileMenuOpen(false)}>✕</button>
      </div>
      <div className="sidebar-logo-wrap"><img className="alaboud-sidebar-logo" src={companyBrand.logoDataUrl||"/alaboud-company-logo.webp"} alt={companyBrand.name} /></div>
      <div className="sidebar-account-box no-print">
        <div>
          <strong>{companyBrand.name}</strong>
          <small>{APP_VERSION}</small>
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
      <AppErrorBoundary key={`${page}-${customerId}-${invoiceId}-${statementCustomerId}-${partnerId}`}>
        {content}
      </AppErrorBoundary>
      {showHomeButton&&<div className="home-return-bar home-return-bottom no-print">
        <button className="home-return-button" onClick={()=>navigate("dashboard")}>
          ⬅ الذهاب إلى القائمة الرئيسية
        </button>
      </div>}
    </main>
    <button className="ai-floating ai-floating-v172 no-print" onClick={()=>navigate("ai-center")} title="مركز القيادة الذكي"><span>🤖</span><b>AI</b></button>
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
