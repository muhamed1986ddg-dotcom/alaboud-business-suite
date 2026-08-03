import React,{lazy,Suspense,useState} from "react";
import LoginShell from "./LoginShell";

const BusinessApp=lazy(()=>import("./App"));

export default function AppShell(){
  const [authenticated,setAuthenticated]=useState(()=>Boolean(localStorage.getItem("afs_token")));
  if(!authenticated){
    return <LoginShell onLogin={()=>setAuthenticated(Boolean(localStorage.getItem("afs_token")))}/>;
  }
  return <Suspense fallback={<div className="app-boot-loading" role="status">جاري تحميل البرنامج…</div>}>
    <BusinessApp/>
  </Suspense>;
}
