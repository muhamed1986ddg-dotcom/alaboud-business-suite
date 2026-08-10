import React,{useEffect,useRef,useState} from "react";
import api from "./api";
export default function LoginShell({onLogin}){
  const [mode,setMode]=useState("login");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [form,setForm]=useState({ownerName:"",companyName:"",email:"",phone:"",password:"",confirmPassword:""});
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [accepted,setAccepted]=useState(localStorage.getItem("alaboud_legal_acceptance_v1")==="yes");
  const [twoFactor,setTwoFactor]=useState({required:false,challenge:"",code:"",expiresAt:0});
  const [twoFactorSeconds,setTwoFactorSeconds]=useState(0);
  const resetParams=new URLSearchParams(window.location.search);
  const [recovery,setRecovery]=useState({identifier:"",email:resetParams.get("email")||"",token:resetParams.get("token")||"",newPassword:"",confirmPassword:"",message:""});
  const nativeBiometric=typeof window!=="undefined"&&window.AlAboudNative?.requestBiometricLogin;
  const biometricEnabled=Boolean(nativeBiometric&&window.AlAboudNative?.isBiometricEnabled?.());
  const biometricPrompted=useRef(false);
  async function saveSession(data){
    // The web session is held by an HttpOnly cookie. Never persist the JWT in
    // JavaScript-readable storage. The lightweight marker contains no secret
    // and is only used to avoid flashing the login screen during reloads.
    localStorage.removeItem("afs_token");
    localStorage.setItem("afs_session_active","1");
    localStorage.setItem("afs_user",JSON.stringify(data.user));
    // On Android, bind this account to the device biometric vault. First login
    // asks for biometric/face/device confirmation; later logins refresh the
    // server token without storing the account password.
    try{
      const native=window.AlAboudNative;
      if(native?.requestBiometricLogin){
        const response=await api.post("/auth/biometric-token");
        const userJson=JSON.stringify(data.user);
        if(native.isBiometricEnabled?.()) native.saveBiometricToken?.(response.data.token,userJson);
        else native.enableBiometricLogin?.(response.data.token,userJson);
      }
    }catch{}
    onLogin();
  }
  async function submitLogin(e){
    e.preventDefault();setError(""); if(!accepted){setError("يجب الموافقة على سياسة الخصوصية وشروط الاستخدام");return}
    localStorage.setItem("alaboud_legal_acceptance_v1","yes");setBusy(true);
    try{const {data}=await api.post("/auth/login",{email,password});if(data.twoFactorRequired){const ttl=Math.max(60,Number(data.challengeExpiresIn)||600);setTwoFactor({required:true,challenge:data.challenge,code:"",expiresAt:Date.now()+ttl*1000});setTwoFactorSeconds(ttl);return}await saveSession(data)}
    catch(error){setError(error.response?.data?.message||"فشل تسجيل الدخول")}finally{setBusy(false)}
  }
  async function submitTwoFactor(e){
    e.preventDefault();setBusy(true);setError("");
    try{const {data}=await api.post("/auth/2fa/verify",{challenge:twoFactor.challenge,code:twoFactor.code});await saveSession(data)}
    catch(error){
      const code=error.response?.data?.code;
      setError(error.response?.data?.message||"رمز التحقق غير صحيح");
      if(code==="TWO_FACTOR_CODE_INVALID")setTwoFactor(current=>({...current,code:""}));
      if(code==="TWO_FACTOR_CHALLENGE_EXPIRED"||code==="TWO_FACTOR_CHALLENGE_INVALID")setTwoFactorSeconds(0);
    }finally{setBusy(false)}
  }
  async function renewTwoFactorChallenge(){
    setBusy(true);setError("");
    try{
      const {data}=await api.post("/auth/login",{email,password});
      if(!data.twoFactorRequired) return await saveSession(data);
      const ttl=Math.max(60,Number(data.challengeExpiresIn)||600);
      setTwoFactor({required:true,challenge:data.challenge,code:"",expiresAt:Date.now()+ttl*1000});
      setTwoFactorSeconds(ttl);
    }catch(error){setError(error.response?.data?.message||"تعذر تجديد جلسة التحقق")}finally{setBusy(false)}
  }
  useEffect(()=>{const handler=async event=>{try{setBusy(true);const {data}=await api.post("/auth/biometric-login",{token:event.detail?.token});await saveSession(data)}catch(error){setError(error.response?.data?.message||"تعذر الدخول بالبصمة أو الوجه")}finally{setBusy(false)}};window.addEventListener("alaboud-biometric-token",handler);return()=>window.removeEventListener("alaboud-biometric-token",handler)},[]);
  useEffect(()=>{
    if(mode!=="login"||!biometricEnabled||biometricPrompted.current)return;
    biometricPrompted.current=true;
    const timer=setTimeout(()=>window.AlAboudNative?.requestBiometricLogin?.(),250);
    return()=>clearTimeout(timer);
  },[mode,biometricEnabled]);
  useEffect(()=>{
    if(!twoFactor.required||!twoFactor.expiresAt){setTwoFactorSeconds(0);return;}
    const update=()=>setTwoFactorSeconds(Math.max(0,Math.ceil((twoFactor.expiresAt-Date.now())/1000)));
    update();const timer=setInterval(update,1000);return()=>clearInterval(timer);
  },[twoFactor.required,twoFactor.expiresAt]);
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
  if(twoFactor.required){const minutes=String(Math.floor(twoFactorSeconds/60)).padStart(2,"0"),seconds=String(twoFactorSeconds%60).padStart(2,"0");return <div className="login"><form className="panel public-account-panel" onSubmit={submitTwoFactor}><img className="login-company-logo" src="/alaboud-company-logo.webp" alt="شركة العبود التجارية"/><h1>التحقق بخطوتين</h1><p>أدخل الرمز الحالي المكوّن من 6 أرقام من تطبيق Authenticator.</p><div className={`two-factor-timer ${twoFactorSeconds<60?"expiring":""}`}>{twoFactorSeconds>0?`مهلة جلسة التحقق ${minutes}:${seconds}`:"انتهت مهلة جلسة التحقق"}</div><input inputMode="numeric" autoComplete="one-time-code" maxLength="6" value={twoFactor.code} onChange={e=>setTwoFactor({...twoFactor,code:e.target.value.replace(/\D/g,"").slice(0,6)})} placeholder="000000" required disabled={twoFactorSeconds===0}/>{error&&<div className="error">{error}</div>}{twoFactorSeconds>0?<button disabled={busy||twoFactor.code.length!==6}>{busy?"جاري التحقق...":"تحقق ودخول"}</button>:<button type="button" disabled={busy} onClick={renewTwoFactorChallenge}>{busy?"جاري التجديد...":"طلب جلسة تحقق جديدة"}</button>}<button type="button" className="account-mode-button" onClick={()=>{setTwoFactor({required:false,challenge:"",code:"",expiresAt:0});setTwoFactorSeconds(0);setError("")}}>العودة</button></form></div>;}
  return <div className="login"><form className="panel public-account-panel" onSubmit={mode==="login"?submitLogin:submitRegister}><img className="login-company-logo" src="/alaboud-company-logo.webp" alt="شركة العبود التجارية"/><h1>{mode==="login"?"تسجيل الدخول":"إنشاء حساب شركة جديد"}</h1><p className="login-company-en">ALABOUD BUSINESS SUITE</p>{mode==="login"?<><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="البريد الإلكتروني" required/><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="كلمة المرور" required/></>:<><input value={form.ownerName} onChange={e=>setForm({...form,ownerName:e.target.value})} placeholder="اسم صاحب الحساب" required/><input value={form.companyName} onChange={e=>setForm({...form,companyName:e.target.value})} placeholder="اسم الشركة" required/><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="البريد الإلكتروني" required/><input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="رقم الهاتف"/><input type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="كلمة المرور — 12 حرفًا قوية" required/><input type="password" value={form.confirmPassword} onChange={e=>setForm({...form,confirmPassword:e.target.value})} placeholder="تأكيد كلمة المرور" required/></>}<label className="legal-consent"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span>أوافق على سياسة الخصوصية وشروط الاستخدام</span></label>{error&&<div className="error">{error}</div>}<button disabled={busy}>{busy?"جاري التنفيذ...":mode==="login"?"تسجيل الدخول":"إنشاء الحساب والدخول"}</button>{mode==="login"&&biometricEnabled&&<button className="biometric-login-button" type="button" onClick={()=>window.AlAboudNative.requestBiometricLogin()}>👆 الدخول بالبصمة أو الوجه</button>}<button className="account-mode-button" type="button" onClick={()=>{setMode(mode==="login"?"register":"login");setError("")}}>{mode==="login"?"مستخدم جديد؟ إنشاء حساب شركة":"لدي حساب بالفعل — تسجيل الدخول"}</button></form></div>
}


