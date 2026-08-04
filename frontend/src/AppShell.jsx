import React,{lazy,Suspense,useState} from "react";
import LoginShell from "./LoginShell";

const BusinessApp=lazy(()=>import("./App"));

export default function AppShell(){
  const [authenticated,setAuthenticated]=useState(()=>Boolean(localStorage.getItem("afs_token")));
  if(!authenticated){
    return <LoginShell onLogin={()=>setAuthenticated(Boolean(localStorage.getItem("afs_token")))}/>;
  }
  return <Suspense fallback={<div className="app-boot-loading" role="status"><span className="app-loading-spinner" aria-hidden="true"/><strong>جاري تحميل الصفحة…</strong><small>يتم تحميل الجزء المطلوب فقط</small></div>}>
    <BusinessApp/>
  </Suspense>;
}
