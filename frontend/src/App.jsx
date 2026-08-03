import React,{useEffect,useRef,useState}from"react";import api,{cachedGet} from"./api";import {APP_VERSION} from"./version";
import{money,cad,openRegularWhatsApp,currencyFlag,flagOf,cleanConnectorMessage,EXCHANGE_CURRENCY_CATALOG,debtCurrencies,CurrencyFlag,rateTrend}from"./shared";

// شاشات مؤجّلة التحميل: تُحمَّل فقط عند فتحها فعليًا، لا مع كل شاشة أساسية.
// هذا يقلّل حجم التحميل الأولي للتطبيق بشكل كبير (خصوصًا على الهاتف).
const ExchangeRates=React.lazy(()=>import("./screens/ExchangeRates").then(m=>({default:m.ExchangeRates})));
const GeneralDebts=React.lazy(()=>import("./screens/GeneralDebts").then(m=>({default:m.GeneralDebts})));
const PartnerProfile=React.lazy(()=>import("./screens/Partners").then(m=>({default:m.PartnerProfile})));
const CompaniesList=React.lazy(()=>import("./screens/CompaniesList").then(m=>({default:m.CompaniesList})));
const CapitalOverview=React.lazy(()=>import("./screens/CapitalOverview").then(m=>({default:m.CapitalOverview})));
const ReportsProfits=React.lazy(()=>import("./screens/ReportsProfits").then(m=>({default:m.ReportsProfits})));
const SettingsPanel=React.lazy(()=>import("./screens/SettingsPanel").then(m=>({default:m.SettingsPanel})));
const AICommandCenter=React.lazy(()=>import("./screens/AICommandCenter").then(m=>({default:m.AICommandCenter})));
const Simple=React.lazy(()=>import("./screens/Simple").then(m=>({default:m.Simple})));


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
  "العملاء المتأخرون":"Overdue Customers","الشركات":"Companies","جميع الشركات":"All Companies","أرصدة الشركات":"Company Balances","مزامنة الشركات":"Company Sync","إعدادات الربط":"Connection Settings","سجل عمليات الشركات":"Company Activity Log",
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
  const resetParams=new URLSearchParams(window.location.search);
  const [recovery,setRecovery]=useState({identifier:"",email:resetParams.get("email")||"",token:resetParams.get("token")||"",newPassword:"",confirmPassword:"",message:""});
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
  useEffect(()=>{
    if(mode!=="login")return;
    const passwordInput=document.querySelector('.public-account-panel input[type="password"]');
    if(!passwordInput||document.getElementById("forgot-password-button"))return;
    const button=document.createElement("button");button.id="forgot-password-button";button.type="button";button.className="account-mode-button";button.textContent="نسيت كلمة السر؟";button.onclick=()=>setMode("forgot");passwordInput.insertAdjacentElement("afterend",button);
    return()=>button.remove();
  },[mode]);
  async function submitRegister(e){e.preventDefault();setError("");if(!accepted){setError("يجب الموافقة على سياسة الخصوصية وشروط الاستخدام");return}localStorage.setItem("alaboud_legal_acceptance_v1","yes");if(form.password!==form.confirmPassword){setError("تأكيد كلمة المرور غير مطابق");return}setBusy(true);try{const {data}=await api.post("/auth/register-company",{ownerName:form.ownerName,companyName:form.companyName,email:form.email,phone:form.phone,password:form.password});await saveSession(data)}catch(error){setError(error.response?.data?.message||"تعذر إنشاء الحساب")}finally{setBusy(false)}}
  async function requestPasswordReset(e){e.preventDefault();setBusy(true);setError("");try{const {data}=await api.post("/auth/forgot-password",{identifier:recovery.identifier});setRecovery({...recovery,message:data.message||"تم إرسال تعليمات الاستعادة إلى البريد المسجل"})}catch(error){setError(error.response?.data?.message||"تعذر إرسال طلب الاستعادة")}finally{setBusy(false)}}
  async function submitPasswordReset(e){e.preventDefault();setError("");if(recovery.newPassword!==recovery.confirmPassword){setError("تأكيد كلمة المرور غير مطابق");return}setBusy(true);try{await api.post("/auth/reset-password",{email:recovery.email,token:recovery.token,newPassword:recovery.newPassword});window.history.replaceState({},"",window.location.pathname);setRecovery({...recovery,token:"",message:"تم تغيير كلمة المرور، يمكنك تسجيل الدخول الآن"});setMode("login")}catch(error){setError(error.response?.data?.message||"تعذر إعادة تعيين كلمة المرور")}finally{setBusy(false)}}
  if(recovery.token)return <div className="login"><form className="panel public-account-panel" onSubmit={submitPasswordReset}><img className="login-company-logo" src="/alaboud-company-logo.webp" alt="شركة العبود التجارية"/><h1>تعيين كلمة مرور جديدة</h1><input type="email" value={recovery.email} onChange={e=>setRecovery({...recovery,email:e.target.value})} placeholder="البريد الإلكتروني" required/><input type="password" value={recovery.newPassword} onChange={e=>setRecovery({...recovery,newPassword:e.target.value})} placeholder="كلمة المرور الجديدة — 12 حرفًا قوية" required/><input type="password" value={recovery.confirmPassword} onChange={e=>setRecovery({...recovery,confirmPassword:e.target.value})} placeholder="تأكيد كلمة المرور" required/>{error&&<div className="error">{error}</div>}<button disabled={busy}>{busy?"جاري الحفظ...":"حفظ كلمة المرور الجديدة"}</button></form></div>;
  if(mode==="forgot")return <div className="login"><form className="panel public-account-panel" onSubmit={requestPasswordReset}><img className="login-company-logo" src="/alaboud-company-logo.webp" alt="شركة العبود التجارية"/><h1>نسيت كلمة السر</h1><p>أدخل البريد الإلكتروني أو رقم الهاتف المسجل. سيصل رابط الاستعادة إلى البريد المرتبط بالحساب.</p><input value={recovery.identifier} onChange={e=>setRecovery({...recovery,identifier:e.target.value,message:""})} placeholder="البريد الإلكتروني أو رقم الهاتف" required/>{recovery.message&&<div className="rate-message">{recovery.message}</div>}{error&&<div className="error">{error}</div>}<button disabled={busy}>{busy?"جاري الإرسال...":"إرسال رابط الاستعادة"}</button><button type="button" className="account-mode-button" onClick={()=>{setMode("login");setError("")}}>العودة إلى تسجيل الدخول</button></form></div>;
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
        // Render the main page as soon as its compact summary arrives. The
        // heavier reports below are enhancements and must not block navigation.
        const dashboardResponse=await cachedGet("/dashboard");
        if(!active)return;
        setData(dashboardResponse.data);
        setLastRefresh(new Date());

        const results=await Promise.allSettled([
          cachedGet("/notifications"),
          cachedGet("/transactions"),
          cachedGet("/exchange-rates"),
          cachedGet("/exchange-rates/history"),
          cachedGet("/ai/overview"),
          cachedGet("/customers"),
          cachedGet("/expenses")
        ]);
        if(!active)return;
        const value=index=>results[index]?.status==="fulfilled"?results[index].value?.data:null;
        const notificationData=value(0),transactionData=value(1),rateData=value(2),historyData=value(3),intelligenceData=value(4),customerData=value(5),expenseData=value(6);
        if(notificationData)setNoticeData(notificationData);
        if(transactionData){
          const rows=Array.isArray(transactionData)?transactionData:[];
          setAllTransactions(rows);
          setRecent(rows.slice().sort((a,b)=>new Date(b.createdAt||b.transferDate)-new Date(a.createdAt||a.transferDate)).slice(0,4));
        }
        if(Array.isArray(customerData))setCustomers(customerData);
        if(Array.isArray(expenseData))setExpenses(expenseData);
        const rateRows=Array.isArray(rateData)?rateData:[];
        // Keep every latest currency pair. Grouping only by base currency caused
        // CAD/USD to be treated as CAD/CAD and produced incorrect cross-rates.
        if(rateData)setDashboardRates(rateRows);
        if(Array.isArray(historyData))setDashboardRateHistory(historyData);
        if(intelligenceData)setIntelligence(intelligenceData);
        setLastRefresh(new Date());
      }catch(error){
        setRatesError(error.response?.data?.message||(refreshRates?"تعذر تحديث أسعار الصرف. تم الاحتفاظ بآخر أسعار صحيحة.":"تعذر تحميل ملخص القائمة الرئيسية؛ حاول مرة أخرى."));
      }finally{
        if(refreshRates)setRatesRefreshing(false);
      }
    };
    loadDashboard(false);
    let lastRatesRefresh=Date.now();
    const refreshVisible=()=>{
      if(document.visibilityState!=="visible")return;
      const refreshRates=Date.now()-lastRatesRefresh>=60*60*1000;
      if(refreshRates)lastRatesRefresh=Date.now();
      loadDashboard(refreshRates);
    };
    const live=setInterval(refreshVisible,60*1000);
    const onVisibility=()=>{if(document.visibilityState==="visible")refreshVisible()};
    document.addEventListener("visibilitychange",onVisibility);
    return ()=>{
      active=false;
      clearInterval(live);
      document.removeEventListener("visibilitychange",onVisibility);
    };
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

    <section className="dashboard-exchange-board panel-dark v20-exchange-board usd-base-board">
      <div className="exchange-board-header">
        <div>
          <span className="exchange-board-kicker">USD BASE <i></i></span>
          <h2>لوحة أسعار الصرف مقابل الدولار</h2>
          <p>الدولار الأمريكي هو العملة الأساسية الثابتة · تحديث آلي كل 30 دقيقة</p>
        </div>
        <div className="exchange-board-actions">
          <span className="exchange-board-updated">آخر تحديث: {lastRefresh.toLocaleTimeString("ar-CA",{hour:"2-digit",minute:"2-digit"})}</span>
          <button disabled={ratesRefreshing} onClick={async()=>{
            try{
              setRatesRefreshing(true);setRatesError("");
              await api.post("/exchange-rates/refresh");
              const [ratesResponse,historyResponse]=await Promise.all([cachedGet("/exchange-rates"),cachedGet("/exchange-rates/history")]);
              setDashboardRates(Array.isArray(ratesResponse.data)?ratesResponse.data:[]);
              setDashboardRateHistory(Array.isArray(historyResponse.data)?historyResponse.data:[]);
              setLastRefresh(new Date());
            }catch(error){setRatesError(error.response?.data?.message||"تعذر تحديث أسعار الصرف. تم الاحتفاظ بآخر أسعار صحيحة.")}finally{setRatesRefreshing(false)}
          }}>{ratesRefreshing?"جاري التحديث…":"↻ تحديث الآن"}</button>
          <button className="exchange-board-all" onClick={()=>navigate("rates")}>عرض التفاصيل</button>
        </div>
      </div>
      {ratesError&&<div className="exchange-board-error">⚠️ {ratesError}</div>}
      <div className="usd-base-rate-list">
        {["CAD","EUR","TRY","SAR","JOD","SYP"].map(code=>{
          const pairRate=(base,quote)=>dashboardRates.find(item=>
            String(item.baseCurrency||"").toUpperCase()===base&&
            String(item.quoteCurrency||"").toUpperCase()===quote
          );
          const numericRate=item=>Number(item?.sellRate||item?.buyRate||0);
          const direct=numericRate(pairRate("USD",code));
          const inverse=numericRate(pairRate(code,"USD"));
          let quote=direct>0?direct:(inverse>0?1/inverse:null);
          // Fallback through CAD only when a direct USD pair is unavailable.
          if(!quote){
            const usdCadDirect=numericRate(pairRate("USD","CAD"));
            const cadUsdInverse=numericRate(pairRate("CAD","USD"));
            const usdCad=usdCadDirect>0?usdCadDirect:(cadUsdInverse>0?1/cadUsdInverse:null);
            const targetCadDirect=numericRate(pairRate(code,"CAD"));
            const cadTargetInverse=numericRate(pairRate("CAD",code));
            const targetCad=code==="CAD"?1:(targetCadDirect>0?targetCadDirect:(cadTargetInverse>0?1/cadTargetInverse:null));
            quote=usdCad&&targetCad?usdCad/targetCad:null;
          }
          const decimals=code==="SYP"?0:code==="TRY"?2:4;
          const targetMeta=debtCurrencies.find(item=>item.code===code)||{name:code};
          return <button className={`usd-base-rate-row ${quote?"":"missing"}`} key={code} onClick={()=>navigate("rates")}>
            <span className="usd-base-side usd-side"><CurrencyFlag code="USD"/><strong>USD</strong><small>1</small></span>
            <span className="usd-base-equals">=</span>
            <span className="usd-base-value">{quote?quote.toLocaleString("en-CA",{minimumFractionDigits:decimals,maximumFractionDigits:decimals}):"—"}</span>
            <span className="usd-base-side target-side"><CurrencyFlag code={code}/><strong>{code}</strong><small>{targetMeta.name}</small></span>
          </button>
        })}
      </div>
      <div className="exchange-board-summary usd-base-summary">
        <span><b>USD</b> العملة الأساسية</span>
        <span><b>{dashboardRates.filter(item=>["USD","EUR","TRY","SYP","SAR","JOD"].includes(String(item.baseCurrency||"").toUpperCase())).length}</b> أسعار متوفرة</span>
        <span>القيم تستخدم زوج USD المباشر أولاً، ثم التحويل المتقاطع الموثوق عند الحاجة</span>
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
          {(smart.recommendations||["راجع الحوالات والديون المفتوحة اليوم."]).slice(0,4).map((task,index)=><button key={index} onClick={()=>navigate(index===0&&smart.finance?.overdueCount?"overdue-customers":"ai")}><i>{index+1}</i><span>{task}</span><b>‹</b></button>)}
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
      <button onClick={()=>navigate("reports-profits")}><span>📄</span><strong>تقرير سريع</strong></button>
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
  const [search,setSearch]=useState("");
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
    rateUpdatedAt:null,
    paymentStatus:"UNPAID"
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
      const customersResponse=await cachedGet("/customers");
      setList(Array.isArray(customersResponse.data)?customersResponse.data:[]);
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر تحميل العملاء");
    }
  }

  useEffect(()=>{
    load();
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
      await api.post("/customers",customerForm);
      setCustomerForm({customerNumber:"",name:"",phone:"",email:"",oldBalance:""});
      setError("✅ تم حفظ العميل بنجاح");
      setActivePanel("");
      await load();
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
    }catch(requestError){
      const existing=requestError.response?.data?.existingCustomer||null;
      setDuplicateCustomer(existing);
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

  const filtered=list.filter(customer=>
    `${customer.name} ${customer.phone||""}`.toLowerCase().includes(search.toLowerCase())
  );

  const customerActionFocus=activePanel==="transfer"||activePanel==="payment";

  return <>
    <h2>قائمة العملاء</h2>
    {error&&<div className="card customer-error">{error}</div>}
    {duplicateCustomer&&<div className="card duplicate-customer-alert">
      <div><strong>رقم الهاتف مسجل مسبقًا</strong><span>{duplicateCustomer.name} — {duplicateCustomer.phone||"بدون رقم"}</span></div>
      <button type="button" className="primary" onClick={()=>{setActivePanel("");setEditingCustomer(null);setDuplicateCustomer(null);open(duplicateCustomer.id)}}>فتح ملف العميل</button>
    </div>}

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
    </div>

    <div className="customer-toolbar card">
      <button onClick={()=>{setActivePanel("newCustomer");setEditingCustomer(null)}}>➕ إضافة عميل</button>
      <button onClick={()=>setActivePanel(activePanel==="transfer"?"":"transfer")}>💸 إضافة حوالة</button>
      <button onClick={()=>setActivePanel(activePanel==="payment"?"":"payment")}>💳 إضافة دفعة</button>
      <button
        className={activePanel==="list"?"active":""}
        onClick={()=>setActivePanel(activePanel==="list"?"":"list")}
      >
        📋 قائمة العملاء
      </button>
    </div>
    </>}


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

    {!customerActionFocus&&activePanel==="list"&&<>

    <div className="customer-list-panel card">
      <div className="customer-list-panel-header">
        <div>
          <h3>📋 قائمة العملاء</h3>
          <small>{filtered.length} من أصل {list.length} عميل</small>
        </div>
        <button type="button" onClick={()=>{setActivePanel("");setSearch("")}}>✕ إغلاق القائمة</button>
      </div>
      <input autoFocus className="customer-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="بحث باسم العميل أو رقم الهاتف"/>
    </div>

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
  const [syncingId,setSyncingId]=useState("");
  const [syncCenter,setSyncCenter]=useState(null);
  const syncingAll=false;
  const autoSyncBusy=useRef(false);

  async function load(){
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
  const [branches,setBranches]=useState([]);
  const [activeBranchId,setActiveBranchId]=useState(localStorage.getItem("alaboud_branch_id")||"");

  useEffect(()=>{
    if(!token)return;

    cachedGet("/auth/session").then(({data})=>{
      localStorage.setItem("afs_user",JSON.stringify(data.user));
      window.dispatchEvent(new CustomEvent("alaboud-live-session",{detail:data}));
    }).catch(()=>{});

    cachedGet("/company-profile").then(({data})=>setCompanyBrand(data)).catch(()=>{});
    cachedGet("/branches").then(({data})=>{setBranches(data);const selected=activeBranchId||data.find(x=>x.isMain)?.id||data[0]?.id||"";if(selected&&!activeBranchId){localStorage.setItem("alaboud_branch_id",selected);setActiveBranchId(selected)}}).catch(()=>{});
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
  const [saveToast,setSaveToast]=useState("");
  const [mobileMenuOpen,setMobileMenuOpen]=useState(
    typeof window!=="undefined" ? window.matchMedia("(max-width: 800px)").matches : false
  );

  useEffect(()=>{
    let timer;
    const showSaveToast=event=>{
      setSaveToast(event.detail?.message||"✅ تم الحفظ بنجاح");
      clearTimeout(timer);
      timer=setTimeout(()=>setSaveToast(""),3000);
    };
    window.addEventListener("alaboud-save-success",showSaveToast);
    return()=>{clearTimeout(timer);window.removeEventListener("alaboud-save-success",showSaveToast)};
  },[]);

  useEffect(()=>{
    if(token){
      cachedGet("/customer-alerts")
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
    content=<OverdueCustomers
      openCustomer={setCustomerId}
      onStatement={setStatementCustomerId}
      navigateCustomers={()=>navigate("customers")}
    />;
  }else if(["partners","company-balances","company-sync","company-connections","company-sync-logs"].includes(page)){
    content=<CompaniesList open={setPartnerId}/>;
  }else if(["transactions","transactions-unpaid","transactions-paid","transactions-overdue","transaction-payments"].includes(page)){
    content=<Transactions openInvoice={setInvoiceId}/>;
  }else if(page==="profits"||page==="monthly-report"||page==="reports-profits"){
    content=<ReportsProfits/>;
  }else if(page==="rates"){
    content=<ExchangeRates/>;
  }else if(page==="debts"){
    content=<GeneralDebts/>;
  }else if(page==="capital-overview"||page==="capital"){
    content=<CapitalOverview/>;
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
    ["customers","👥 العملاء"],
    ["overdue-customers",`⏰ العملاء المتأخرون${overdueCount?` (${overdueCount})`:""}`],
    ["partners","🏢 الشركات والربط الخارجي"],
    ["transactions","⇄ الحوالات"],
    ["expenses","🧾 المصروفات"],
    ["reports-profits","📊 التقارير والأرباح"],
    ["rates","💱 العملات وأسعار الصرف"],
    ["debts","📒 الدَّين العام"],
    ["capital-overview","⚖️ الميزانية"],
    ["ai-center","🧠 مركز القيادة الذكي"],
    ["settings","⚙️ الإعدادات والتنبيهات"]
  ];

  return <><AppLanguageBridge/>{saveToast&&<div className="global-save-toast" role="status">{saveToast}</div>}<div className={`app ${mobileMenuOpen?"mobile-menu-view":"mobile-page-view"}`}>
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
      {branches.length>0&&<label className="branch-switcher no-print"><span>🏢 الفرع النشط</span><select value={activeBranchId} onChange={event=>{localStorage.setItem("alaboud_branch_id",event.target.value);setActiveBranchId(event.target.value);window.location.reload()}}>{branches.map(branch=><option key={branch.id} value={branch.id}>{branch.name} ({branch.code})</option>)}</select></label>}
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
        <React.Suspense fallback={<div className="card" style={{textAlign:"center",padding:"2rem"}}>...جارٍ التحميل</div>}>
          {content}
        </React.Suspense>
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
      <button className={page.startsWith("transactions")||page==="transaction-payments"?"active":""} onClick={()=>navigate("transactions")}>
        <span>⇄</span><small>الحوالات</small>
      </button>
      <button className={page==="dashboard"?"active":""} onClick={()=>navigate("dashboard")}>
        <span>⌂</span><small>الرئيسية</small>
      </button>
      <button className={["reports-profits","profits","monthly-report"].includes(page)?"active":""} onClick={()=>navigate("reports-profits")}>
        <span>▥</span><small>التقارير</small>
      </button>
      <button onClick={()=>setMobileMenuOpen(true)}>
        <span>•••</span><small>المزيد</small>
      </button>
    </nav>
  </div></>;
}
