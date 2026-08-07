import React,{useEffect,useState}from"react";import LoginShell from"./LoginShell";import DatabaseStatus from"./components/system/DatabaseStatus";import api,{cachedGet} from"./api";import {APP_VERSION} from"./version";import {Dashboard} from"./screens/Dashboard";
import{money,cad,openRegularWhatsApp,currencyFlag,flagOf,cleanConnectorMessage,EXCHANGE_CURRENCY_CATALOG,debtCurrencies,CurrencyFlag,rateTrend,confirmAction}from"./shared";

// شاشات مؤجّلة التحميل: تُحمَّل فقط عند فتحها فعليًا، لا مع كل شاشة أساسية.
// هذا يقلّل حجم التحميل الأولي للتطبيق بشكل كبير (خصوصًا على الهاتف).
const screenLoaders={
  exchangeRates:()=>import("./screens/ExchangeRates"),
  debts:()=>import("./screens/GeneralDebts"),
  partners:()=>import("./screens/Partners"),
  companies:()=>import("./screens/CompaniesList"),
  capital:()=>import("./screens/CapitalOverview"),
  reports:()=>import("./screens/ReportsProfits"),
  settings:()=>import("./screens/SettingsPanel"),
  ai:()=>import("./screens/AICommandCenter"),
  simple:()=>import("./screens/Simple"),
  customers:()=>import("./screens/Customers"),
  customerDetails:()=>import("./screens/CustomerDetails"),
  transactions:()=>import("./screens/Transactions")
};
const ExchangeRates=React.lazy(()=>screenLoaders.exchangeRates().then(m=>({default:m.ExchangeRates})));
const GeneralDebts=React.lazy(()=>screenLoaders.debts().then(m=>({default:m.GeneralDebts})));
const PartnerProfile=React.lazy(()=>screenLoaders.partners().then(m=>({default:m.PartnerProfile})));
const CompaniesList=React.lazy(()=>screenLoaders.companies().then(m=>({default:m.CompaniesList})));
const CapitalOverview=React.lazy(()=>screenLoaders.capital().then(m=>({default:m.CapitalOverview})));
const ReportsProfits=React.lazy(()=>screenLoaders.reports().then(m=>({default:m.ReportsProfits})));
const SettingsPanel=React.lazy(()=>screenLoaders.settings().then(m=>({default:m.SettingsPanel})));
const AICommandCenter=React.lazy(()=>screenLoaders.ai().then(m=>({default:m.AICommandCenter})));
const Simple=React.lazy(()=>screenLoaders.simple().then(m=>({default:m.Simple})));
const Customers=React.lazy(()=>screenLoaders.customers().then(m=>({default:m.Customers})));
const OverdueCustomers=React.lazy(()=>screenLoaders.customers().then(m=>({default:m.OverdueCustomers})));
const Customer=React.lazy(()=>screenLoaders.customerDetails().then(m=>({default:m.Customer})));
const Invoice=React.lazy(()=>screenLoaders.customerDetails().then(m=>({default:m.Invoice})));
const Statement=React.lazy(()=>screenLoaders.customerDetails().then(m=>({default:m.Statement})));
const Transactions=React.lazy(()=>screenLoaders.transactions().then(m=>({default:m.Transactions})));


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
    let language=localStorage.getItem("alaboud_language")||"ar";
    let english=language==="en";
    let scheduled=false;
    const pendingRoots=new Set();

    const translateElement=node=>{
      if(!node||node.nodeType!==Node.ELEMENT_NODE||node.matches?.("script,style"))return;
      node.childNodes.forEach(child=>{
        if(child.nodeType!==Node.TEXT_NODE)return;
        if(english){
          if(child.__alaboudArabicOriginal===undefined)child.__alaboudArabicOriginal=child.nodeValue;
          const translated=translateAppText(child.__alaboudArabicOriginal);
          if(child.nodeValue!==translated)child.nodeValue=translated;
        }else if(child.__alaboudArabicOriginal!==undefined&&child.nodeValue!==child.__alaboudArabicOriginal){
          child.nodeValue=child.__alaboudArabicOriginal;
        }
      });
      ["placeholder","title","aria-label"].forEach(attribute=>{
        if(!node.hasAttribute?.(attribute))return;
        const key=`alaboudOriginal${attribute.replace("-","")}`;
        if(english){
          if(node.dataset[key]===undefined)node.dataset[key]=node.getAttribute(attribute)||"";
          const translated=translateAppText(node.dataset[key]);
          if(node.getAttribute(attribute)!==translated)node.setAttribute(attribute,translated);
        }else if(node.dataset[key]!==undefined&&node.getAttribute(attribute)!==node.dataset[key]){
          node.setAttribute(attribute,node.dataset[key]);
        }
      });
    };

    const translateTree=root=>{
      if(!root)return;
      if(root.nodeType===Node.TEXT_NODE){translateElement(root.parentElement);return;}
      translateElement(root);
      root.querySelectorAll?.("*").forEach(translateElement);
    };

    const flush=()=>{
      scheduled=false;
      const roots=[...pendingRoots];
      pendingRoots.clear();
      roots.forEach(translateTree);
    };

    const schedule=root=>{
      pendingRoots.add(root||document.body);
      if(scheduled)return;
      scheduled=true;
      requestAnimationFrame(flush);
    };

    const applyLanguage=()=>{
      language=localStorage.getItem("alaboud_language")||"ar";
      english=language==="en";
      document.documentElement.lang=language;
      document.documentElement.dir=english?"ltr":"rtl";
      document.body.classList.toggle("app-language-en",english);
      schedule(document.body);
    };

    applyLanguage();
    const observer=new MutationObserver(records=>{
      records.forEach(record=>record.addedNodes.forEach(node=>schedule(node)));
    });
    observer.observe(document.body,{childList:true,subtree:true});
    window.addEventListener("alaboud-language-change",applyLanguage);
    return()=>{
      observer.disconnect();
      window.removeEventListener("alaboud-language-change",applyLanguage);
      pendingRoots.clear();
    };
  },[]);
  return null;
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
    if(!token)return;
    const refreshInventoryAlert=()=>cachedGet("/monthly-inventory").then(({data})=>{
      const alert=data?.alert||null;
      setInventoryAlert(alert&&["TOMORROW","DUE","OVERDUE"].includes(alert.status)?alert:null);
    }).catch(()=>{});
    refreshInventoryAlert();
    const timer=setInterval(refreshInventoryAlert,60*60*1000);
    return()=>clearInterval(timer);
  },[token,activeBranchId]);

  useEffect(()=>{
    const handleAuthExpired=()=>setToken(null);
    window.addEventListener("alaboud-auth-expired",handleAuthExpired);
    return()=>window.removeEventListener("alaboud-auth-expired",handleAuthExpired);
  },[]);
  const [page,setPage]=useState("dashboard");
  const [customerId,setCustomerId]=useState(null);
  const [customerTransferRequest,setCustomerTransferRequest]=useState(null);
  const [invoiceId,setInvoiceId]=useState(null);
  const [statementCustomerId,setStatementCustomerId]=useState(null);
  const [partnerId,setPartnerId]=useState(null);
  const [overdueCount,setOverdueCount]=useState(0);
  const [logoutConfirm,setLogoutConfirm]=useState(false);
  const [saveToast,setSaveToast]=useState(null);
  const [inventoryAlert,setInventoryAlert]=useState(null);
  const [mobileMenuOpen,setMobileMenuOpen]=useState(
    typeof window!=="undefined" ? window.matchMedia("(max-width: 800px)").matches : false
  );

  // Warm lazy chunks after the first screen is interactive. Navigation then opens without a full-page loading state.
  useEffect(()=>{
    const prefetch=()=>Promise.allSettled(Object.values(screenLoaders).map(load=>load()));
    if(typeof window!=="undefined"&&"requestIdleCallback" in window){
      const id=window.requestIdleCallback(prefetch,{timeout:3500});
      return()=>window.cancelIdleCallback?.(id);
    }
    const timer=setTimeout(prefetch,1200);
    return()=>clearTimeout(timer);
  },[]);

  useEffect(()=>{
    let timer;
    const showOperationToast=event=>{
      const message=String(event.detail?.message||"تمت العملية بنجاح");
      const type=event.detail?.type==="error"?"error":"success";
      setSaveToast({message,type});
      clearTimeout(timer);
      timer=setTimeout(()=>setSaveToast(null),type==="error"?4500:3000);
    };
    const showLegacySaveToast=event=>showOperationToast({detail:{message:event.detail?.message||"تم الحفظ بنجاح",type:"success"}});
    window.addEventListener("alaboud-operation-toast",showOperationToast);
    window.addEventListener("alaboud-save-success",showLegacySaveToast);
    return()=>{
      clearTimeout(timer);
      window.removeEventListener("alaboud-operation-toast",showOperationToast);
      window.removeEventListener("alaboud-save-success",showLegacySaveToast);
    };
  },[]);

  useEffect(()=>{
    if(!token||!["dashboard","customers","overdue-customers"].includes(page))return;
    cachedGet("/customer-alerts",{cacheTtl:2*60*1000})
      .then(response=>setOverdueCount(Number(response.data?.count||0)))
      .catch(()=>setOverdueCount(0));
  },[token,page]);

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
    return <LoginShell onLogin={()=>setToken(localStorage.getItem("afs_token"))}/>;
  }

  function navigate(nextPage){
    setPage(nextPage);
    setCustomerId(null);
    setInvoiceId(null);
    setStatementCustomerId(null);
    setPartnerId(null);
    if(typeof window!=="undefined"&&window.matchMedia("(max-width: 800px)").matches){
      setMobileMenuOpen(false);
      requestAnimationFrame(()=>{
        const scroller=document.querySelector("main.app-main-content");
        if(scroller&&typeof scroller.scrollTo==="function")scroller.scrollTo({top:0,behavior:"auto"});
      });
    }
  }

  let content;
  if(invoiceId){
    content=<Invoice transactionId={invoiceId} back={()=>setInvoiceId(null)}/>;
  }else if(statementCustomerId){
    content=<Statement customerId={statementCustomerId} back={()=>setStatementCustomerId(null)}/>;
  }else if(customerId){
    content=<Customer
      id={customerId}
      back={()=>setCustomerId(null)}
      onStatement={setStatementCustomerId}
      onAddTransfer={selectedCustomer=>{
        setCustomerTransferRequest({customerId:selectedCustomer.id,customerName:selectedCustomer.name,nonce:Date.now()});
        setCustomerId(null);
        setPage("customers");
      }}
    />;
  }else if(partnerId){
    content=<PartnerProfile id={partnerId} back={()=>setPartnerId(null)}/>;
  }else if(page==="dashboard"){
    content=<Dashboard navigate={navigate}/>;
  }else if(page==="customers"){
    content=<Customers
      open={setCustomerId}
      initialTransferRequest={customerTransferRequest}
      onTransferRequestHandled={()=>setCustomerTransferRequest(null)}
      onTransferSaved={savedCustomerId=>{
        setCustomerTransferRequest(null);
        setCustomerId(savedCustomerId);
      }}
    />;
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

  return <><AppLanguageBridge/><DatabaseStatus/>{saveToast&&<div className={`global-save-toast ${saveToast.type==="error"?"global-save-toast-error":"global-save-toast-success"}`} role={saveToast.type==="error"?"alert":"status"}>{saveToast.message}</div>}<div className={`app ${mobileMenuOpen?"mobile-menu-view":"mobile-page-view"} ${page==="dashboard"?"desktop-dashboard-layout":""}`}>
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
      {branches.length>0&&<label className="branch-switcher no-print"><span>🏢 الفرع النشط</span><select value={activeBranchId} onChange={event=>{localStorage.setItem("alaboud_branch_id",event.target.value);setActiveBranchId(event.target.value);window.dispatchEvent(new CustomEvent("alaboud-branch-changed",{detail:{branchId:event.target.value}}))}}>{branches.map(branch=><option key={branch.id} value={branch.id}>{branch.name} ({branch.code})</option>)}</select></label>}
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
      {inventoryAlert&&<button className={`global-inventory-alert global-inventory-alert--${String(inventoryAlert.status||"").toLowerCase()} no-print`} onClick={()=>navigate("reports-profits")}><span>📦</span><strong>{inventoryAlert.message}</strong><small>فتح الجرد الشهري</small></button>}
      <AppErrorBoundary key={`${page}-${customerId}-${invoiceId}-${statementCustomerId}-${partnerId}`}>
        <React.Suspense fallback={<div className="route-inline-loader" role="status"><span className="app-loading-spinner" aria-hidden="true"/><small>تحميل المحتوى…</small></div>}>
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
