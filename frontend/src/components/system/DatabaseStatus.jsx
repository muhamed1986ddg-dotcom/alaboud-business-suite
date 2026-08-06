import React,{useEffect,useState}from"react";
import api from"../../api";

export default function DatabaseStatus(){
  const[state,setState]=useState({status:"connected",message:""});
  useEffect(()=>{
    let active=true;
    const update=detail=>{if(active)setState(detail)};
    const onEvent=event=>update(event.detail||{status:"reconnecting",message:"جارٍ إعادة الاتصال بقاعدة البيانات"});
    window.addEventListener("alaboud-database-status",onEvent);
    const check=async()=>{
      try{
        const response=await api.get("/health",{timeout:8000,suppressToast:true});
        const db=response.data?.database||{};
        update({status:response.data?.ok?"connected":(db.connectionState||"reconnecting"),message:response.data?.ok?"":(db.lastConnectionError||response.data?.startupError||"جارٍ إعادة الاتصال بقاعدة البيانات")});
      }catch(error){
        update({status:"offline",message:error.response?.data?.message||"تعذر الاتصال بقاعدة البيانات"});
      }
    };
    check();
    const timer=setInterval(check,45000);
    return()=>{active=false;clearInterval(timer);window.removeEventListener("alaboud-database-status",onEvent)};
  },[]);
  if(state.status==="connected")return null;
  return <div className={`database-status-banner database-status-${state.status}`} role="status">
    <span>{state.status==="offline"?"🔴":"🟡"}</span>
    <strong>{state.status==="offline"?"قاعدة البيانات غير متصلة":"جارٍ إعادة الاتصال"}</strong>
    <small>{state.message}</small>
  </div>;
}
