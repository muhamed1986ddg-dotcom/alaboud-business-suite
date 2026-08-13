import React,{lazy,Suspense,useEffect,useState} from "react";
import LoginShell from "./LoginShell";
import api from "./api";

const BusinessApp=lazy(()=>import("./App"));

export default function AppShell(){
  const [authState,setAuthState]=useState("checking");

  useEffect(()=>{
    let cancelled=false;
    api.get("/auth/session",{suppressToast:true})
      .then(({data})=>{
        if(cancelled)return;
        localStorage.setItem("afs_user",JSON.stringify(data.user));
        localStorage.setItem("afs_session_active","1");
        // If this was an old bearer session, auth middleware has now issued
        // the HttpOnly cookie. Remove the legacy JWT only after confirmation.
        localStorage.removeItem("afs_token");
        setAuthState(data.user?.mustChangePassword?"password-change-required":"authenticated");
      })
      .catch(()=>{if(!cancelled)setAuthState("anonymous");});
    const expired=()=>setAuthState("anonymous");
    window.addEventListener("alaboud-auth-expired",expired);
    return()=>{cancelled=true;window.removeEventListener("alaboud-auth-expired",expired);};
  },[]);

  if(authState==="checking"){
    return <div className="app-boot-loading" role="status"><span className="app-loading-spinner" aria-hidden="true"/><strong>تشغيل البرنامج…</strong><small>يتم التحقق من الجلسة الآمنة…</small></div>;
  }
  if(authState!=="authenticated"){
    return <LoginShell forcePasswordChange={authState==="password-change-required"} onLogin={()=>setAuthState("authenticated")}/>;
  }
  return <Suspense fallback={<div className="app-boot-loading" role="status"><span className="app-loading-spinner" aria-hidden="true"/><strong>تشغيل البرنامج…</strong><small>لحظات فقط</small></div>}>
    <BusinessApp onAuthExpired={()=>setAuthState("anonymous")}/>
  </Suspense>;
}
