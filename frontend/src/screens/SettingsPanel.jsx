import React,{useEffect,useRef,useState}from"react";
import api,{cachedGet} from"../api";
import {APP_VERSION} from"../version";
import {money,cad,openRegularWhatsApp,currencyFlag,flagOf,cleanConnectorMessage,EXCHANGE_CURRENCY_CATALOG,debtCurrencies,CurrencyFlag,rateTrend,confirmAction} from"../shared";

function NotificationSettings({embedded=false}){
  const [settings,setSettings]=useState({overdueDays:7,lowCashLimit:5000,whatsappTemplate:""});
  const [message,setMessage]=useState("");

  useEffect(()=>{
    cachedGet("/notification-settings").then(response=>setSettings(response.data));
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



function BranchManagement(){
  const [branches,setBranches]=useState([]),[form,setForm]=useState({name:"",code:"",address:"",phone:"",currency:"CAD"}),[message,setMessage]=useState("");
  const load=()=>cachedGet("/branches").then(r=>setBranches(r.data)).catch(()=>{});useEffect(()=>{load()},[]);
  async function create(event){event.preventDefault();setMessage("");try{await api.post("/branches",form);setForm({name:"",code:"",address:"",phone:"",currency:"CAD"});setMessage("تم إنشاء الفرع بنجاح");load()}catch(error){setMessage(error.response?.data?.message||"تعذر إنشاء الفرع")}}
  return <article data-panel="branches" className="settings-card settings-wide-card"><div className="settings-card-title"><span>🏢</span><h3>إدارة الفروع</h3></div><p className="settings-help">أنشئ الفروع واعرض مؤشرات كل فرع. يمكن تغيير الفرع النشط من القائمة الجانبية.</p>{message&&<div className="settings-message">{message}</div>}<form className="branch-create-form" onSubmit={create}><input placeholder="اسم الفرع" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/><input placeholder="الرمز مثل WINDSOR" value={form.code} onChange={e=>setForm({...form,code:e.target.value.toUpperCase()})} required/><input placeholder="العنوان" value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/><input placeholder="الهاتف" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/><button className="settings-primary-button">إضافة فرع</button></form><div className="branch-grid">{branches.map(branch=><div className="branch-card" key={branch.id}><div><strong>{branch.name}</strong><small>{branch.code}{branch.isMain?" • الفرع الرئيسي":""}</small></div><div className="branch-metrics"><span>العملاء <b>{branch.metrics?.customers||0}</b></span><span>الحوالات <b>{branch.metrics?.transactions||0}</b></span><span>المصروفات <b>{money(branch.metrics?.expensesCad||0)} CAD</b></span></div></div>)}</div></article>
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
  const [activePanel,setActivePanel]=useState("");
  const biometricAvailable=Boolean(typeof window!=="undefined"&&(window.AlAboudNative||navigator.userAgent.includes("AlAboudMobile")));

  useEffect(()=>{
    cachedGet("/company-profile").then(({data})=>setCompanyProfile(data)).catch(()=>{});
    if(savedUser.role==="ADMIN"){cachedGet("/users").then(({data})=>setUsers(data)).catch(()=>{});cachedGet("/devices").then(({data})=>setDevices(data)).catch(()=>{})}
  },[]);

  function chooseCompanyLogo(event){
    const file=event.target.files?.[0];
    if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>{
      const image=new Image();
      image.onload=()=>{const size=Math.min(640,Math.max(image.width,image.height));const scale=size/Math.max(image.width,image.height);const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height);setCompanyProfile(current=>({...current,logoDataUrl:canvas.toDataURL("image/webp",.88)}));setMessage("تم اختيار الشعار؛ اضغط حفظ لتثبيته");};
      image.onerror=()=>setMessage("تعذر قراءة ملف الشعار");image.src=String(reader.result||"");
    };
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
      const response=await cachedGet("/health");
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
      const response=await cachedGet("/backup",{responseType:"blob"});
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
    if(!await confirmAction({title:"استعادة نسخة احتياطية",message:"سيتم استبدال بيانات هذه الشركة بمحتوى النسخة الاحتياطية. هل تريد المتابعة؟",confirmText:"استعادة النسخة",tone:"warning"}))return;
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

    <div className="settings-launch-grid" aria-label="أقسام الإعدادات">
      {savedUser.role==="ADMIN"&&<button type="button" onClick={()=>setActivePanel("branches")}><span>🏢</span><strong>إدارة الفروع</strong><small>الفروع ومؤشراتها</small></button>}
      <button type="button" onClick={()=>setActivePanel("security")}><span>🔐</span><strong>الأمان وتسجيل الدخول</strong><small>Authenticator والبصمة أو الوجه</small></button>
      <button type="button" onClick={()=>setActivePanel("backup")}><span>💾</span><strong>النسخ الاحتياطي</strong><small>إنشاء نسخة أو استعادتها</small></button>
      <button type="button" onClick={()=>setActivePanel("appearance")}><span>🎨</span><strong>المظهر والخط</strong><small>اللغة والحجم والتباين</small></button>
      <button type="button" onClick={()=>setActivePanel("notifications")}><span>🔔</span><strong>الإشعارات وواتساب</strong><small>التأخير وقوالب الرسائل</small></button>
      <button type="button" onClick={()=>setActivePanel("company")}><span>🏢</span><strong>بيانات الشركة</strong><small>الاسم والشعار والهاتف</small></button>
      <button type="button" onClick={()=>setActivePanel("accounts")}><span>👤</span><strong>إنشاء حساب</strong><small>إضافة مستخدم جديد</small></button>
      {savedUser.role==="ADMIN"&&<button type="button" onClick={()=>setActivePanel("users")}><span>👥</span><strong>المستخدمون والصلاحيات</strong><small>الأدوار والتفعيل</small></button>}
      {savedUser.role==="ADMIN"&&<button type="button" onClick={()=>setActivePanel("devices")}><span>💻</span><strong>الأجهزة والتراخيص</strong><small>الأجهزة النشطة</small></button>}
      <button type="button" onClick={()=>setActivePanel("password")}><span>🔑</span><strong>تغيير كلمة السر</strong><small>تحديث كلمة المرور</small></button>
      <button type="button" onClick={()=>setActivePanel("legal")}><span>📄</span><strong>الخصوصية والشروط</strong><small>سياسات الاستخدام</small></button>
      <button type="button" onClick={()=>setActivePanel("support")}><span>🛟</span><strong>الدعم الفني</strong><small>التواصل ورقم الإصدار</small></button>
      <button type="button" onClick={()=>setActivePanel("updates")}><span>⬆️</span><strong>التحديثات</strong><small>التحقق من الإصدار</small></button>
    </div>

    {activePanel&&<div className="settings-modal-backdrop" role="dialog" aria-modal="true" onMouseDown={event=>{if(event.target===event.currentTarget)setActivePanel("")}}>
      <div className="settings-modal-shell" data-active-panel={activePanel}>
        <button type="button" className="settings-modal-close" onClick={()=>setActivePanel("")} aria-label="إغلاق">✕</button>
        <div className="settings-grid">
    {savedUser.role==="ADMIN"&&<BranchManagement/>}
    <article data-panel="security" className="settings-card security-access-card"><div className="settings-card-title"><span>🔐</span><h3>حماية تسجيل الدخول</h3></div><p className="settings-help">التحقق بخطوتين بواسطة Google Authenticator أو Microsoft Authenticator.</p>{twoFactorInfo.enabled?<button type="button" className="danger" onClick={disableTwoFactor}>تعطيل التحقق بخطوتين</button>:<>{!twoFactorInfo.secret?<button type="button" className="settings-primary-button" onClick={beginTwoFactor}>بدء التفعيل</button>:<div className="two-factor-setup"><label>المفتاح السري<input readOnly value={twoFactorInfo.secret}/></label><small>انسخ المفتاح إلى تطبيق Authenticator.</small><label>رمز التحقق<input inputMode="numeric" maxLength="6" value={twoFactorInfo.code} onChange={e=>setTwoFactorInfo({...twoFactorInfo,code:e.target.value.replace(/\D/g,"").slice(0,6)})}/></label><button type="button" disabled={twoFactorInfo.code.length!==6} onClick={enableTwoFactor}>تأكيد التفعيل</button></div>}</>}<div className="biometric-settings-block"><div><strong>👆 الدخول بالبصمة أو الوجه</strong><small>{biometricAvailable?(biometricEnabled?"مفعّل على هذا الهاتف":"غير مفعّل على هذا الهاتف"):"متاح داخل تطبيق الهاتف فقط"}</small></div>{biometricAvailable&&(biometricEnabled?<button type="button" className="danger" onClick={disableBiometric}>تعطيل البصمة أو الوجه</button>:<button type="button" className="settings-primary-button" onClick={enableBiometric}>تفعيل البصمة أو الوجه</button>)}</div><p className="security-note">بعد التفعيل، سيظهر زر الدخول بالبصمة أو الوجه في شاشة تسجيل الدخول.</p></article>


      <article data-panel="backup" className="settings-card settings-backup-card">
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

      <article data-panel="appearance" className="settings-card">
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

      <article data-panel="notifications" className="settings-card settings-alerts-embedded">
        <div className="settings-card-title"><span>🔔</span><h3>إعدادات التنبيهات وواتساب</h3></div>
        <NotificationSettings embedded />
      </article>

      <article data-panel="company" className="settings-card company-branding-settings">
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

      <article data-panel="accounts" className="settings-card">
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

      {savedUser.role==="ADMIN"&&<article data-panel="users" className="settings-card settings-wide-card">
        <div className="settings-card-title"><span>👥</span><h3>إدارة المستخدمين والصلاحيات</h3></div>
        <div className="admin-list">{users.map(user=><div className="admin-row" key={user.id}><div><strong>{user.name}</strong><small>{user.email} • آخر دخول: {user.lastLoginAt?new Date(user.lastLoginAt).toLocaleString("ar-CA"):"لم يدخل بعد"}</small></div><select value={user.role} onChange={async e=>{const {data}=await api.patch(`/users/${user.id}`,{role:e.target.value});setUsers(list=>list.map(x=>x.id===data.id?{...x,...data}:x))}}><option value="ADMIN">مسؤول كامل</option><option value="MANAGER">مدير</option><option value="USER">مستخدم</option><option value="VIEWER">مشاهدة فقط</option></select><button type="button" className={user.active?"danger-soft":"success-soft"} onClick={async()=>{const {data}=await api.patch(`/users/${user.id}`,{active:!user.active});setUsers(list=>list.map(x=>x.id===data.id?{...x,...data}:x))}}>{user.active?"تعطيل":"تفعيل"}</button></div>)}</div>
      </article>}

      {savedUser.role==="ADMIN"&&<article data-panel="devices" className="settings-card settings-wide-card">
        <div className="settings-card-title"><span>💻</span><h3>الأجهزة والتراخيص</h3></div>
        <p className="settings-help">يُسجل كل تثبيت بمعرّف فريد ونوع الجهاز والإصدار وآخر اتصال.</p>
        <div className="admin-list">{devices.length?devices.map(device=><div className="admin-row" key={device.id}><div><strong>{device.deviceName||"جهاز"}</strong><small>{device.appVersion||"17.0.1"} • {device.platform?.slice(0,70)}<br/>آخر اتصال: {device.lastSeenAt?new Date(device.lastSeenAt).toLocaleString("ar-CA"):"—"}</small></div><button type="button" className={device.active!==false?"danger-soft":"success-soft"} onClick={async()=>{const {data}=await api.patch(`/devices/${device.id}`,{active:device.active===false});setDevices(list=>list.map(x=>x.id===data.id?data:x))}}>{device.active!==false?"تعطيل الجهاز":"إعادة التفعيل"}</button></div>):<p className="settings-help">ستظهر الأجهزة هنا بعد أول تسجيل دخول بالإصدار الجديد.</p>}</div>
      </article>}

      <article data-panel="legal" className="settings-card settings-wide-card">
        <div className="settings-card-title"><span>📄</span><h3>سياسة الخصوصية وشروط الاستخدام</h3></div>
        <details><summary>سياسة الخصوصية</summary><p className="settings-help">يجمع النظام معلومات الحساب ومعرّف التثبيت ونوع الجهاز وإصدار التطبيق وتاريخ أول وآخر استخدام لأغراض الأمان وإدارة التراخيص فقط. لا تُباع البيانات ولا تُشارك مع جهات خارجية، ولا تُخزن كلمات المرور بصورتها الأصلية.</p></details>
        <details><summary>شروط الاستخدام</summary><p className="settings-help">الاستخدام مخصص للأجهزة والحسابات المصرح بها. يمنع نسخ البرنامج أو إعادة بيعه أو تجاوز الحماية دون إذن. المستخدم مسؤول عن صحة البيانات والنسخ الاحتياطية والالتزام بالقوانين المحلية.</p></details>
        <small>آخر تحديث: 18 يوليو 2026 — الإصدار القانوني 1.0</small>
      </article>

      <article data-panel="password" className="settings-card">
        <div className="settings-card-title"><span>🔐</span><h3>تغيير كلمة السر</h3></div>
        <form className="settings-form-modern" onSubmit={changePassword}>
          <input type="password" value={passwordForm.currentPassword} onChange={e=>setPasswordForm({...passwordForm,currentPassword:e.target.value})} placeholder="كلمة المرور الحالية" required/>
          <input type="password" value={passwordForm.newPassword} onChange={e=>setPasswordForm({...passwordForm,newPassword:e.target.value})} placeholder="كلمة المرور الجديدة" required/>
          <input type="password" value={passwordForm.confirmPassword} onChange={e=>setPasswordForm({...passwordForm,confirmPassword:e.target.value})} placeholder="تأكيد كلمة المرور الجديدة" required/>
          <button>تغيير كلمة السر</button>
        </form>
      </article>

      <article data-panel="support" className="settings-card">
        <div className="settings-card-title"><span>🛟</span><h3>الدعم الفني</h3></div>
        <p className="settings-help">عند حدوث مشكلة، أرسل صورة الخطأ ورقم الإصدار الظاهر في البرنامج.</p>
        <div className="support-actions">
          <a href="mailto:support@alaboud.local?subject=ALABOUD%20Business%20Suite%20Support">✉️ البريد الفني</a>
          <button type="button" onClick={()=>navigator.clipboard?.writeText(APP_VERSION).then(()=>setMessage("تم نسخ رقم الإصدار"))}>📋 نسخ رقم الإصدار</button>
        </div>
      </article>

      <article data-panel="updates" className="settings-card settings-updates-card">
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
      </div>
    </div>}
  </section>;
}


export { SettingsPanel };
