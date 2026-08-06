import React,{useEffect,useRef,useState}from"react";
import api,{sanitizeOperationalMessage}from"../../api";

function normalizeHealth(payload={},fallbackMessage=""){
  const database=payload.database||{};
  if(database.ok===true){
    return {status:"connected",message:"",lastConnectedAt:database.lastConnectedAt||null};
  }
  const reconnecting=database.connectionState==="reconnecting"||database.connectionState==="connecting";
  return {
    status:reconnecting?"reconnecting":"offline",
    message:sanitizeOperationalMessage(database.lastConnectionError||payload.startupError||fallbackMessage,"تتم إعادة الاتصال تلقائيًا"),
    lastConnectedAt:database.lastConnectedAt||null
  };
}

export default function DatabaseStatus(){
  const[state,setState]=useState({status:"connected",message:"",lastConnectedAt:null});
  const failureCount=useRef(0);
  useEffect(()=>{
    let active=true;
    let timer=null;
    const update=detail=>{if(active)setState(previous=>({...previous,...detail}))};
    const schedule=delay=>{if(active){clearTimeout(timer);timer=setTimeout(check,delay)}};
    const onEvent=event=>{
      failureCount.current+=1;
      update(event.detail||{status:"reconnecting",message:"جارٍ إعادة الاتصال بقاعدة البيانات"});
      schedule(3000);
    };
    const check=async()=>{
      try{
        const response=await api.get("/health",{timeout:10000,suppressToast:true,validateStatus:status=>status===200||status===503});
        const next=normalizeHealth(response.data||{});
        if(next.status==="connected")failureCount.current=0;else failureCount.current+=1;
        update(next);
        schedule(next.status==="connected"?45000:Math.min(15000,3000+(failureCount.current*2000)));
      }catch(error){
        failureCount.current+=1;
        const payload=error.response?.data||{};
        update(normalizeHealth(payload,error.message));
        schedule(Math.min(15000,3000+(failureCount.current*2000)));
      }
    };
    window.addEventListener("alaboud-database-status",onEvent);
    check();
    return()=>{active=false;clearTimeout(timer);window.removeEventListener("alaboud-database-status",onEvent)};
  },[]);
  if(state.status==="connected")return null;
  const lastConnected=state.lastConnectedAt?new Date(state.lastConnectedAt).toLocaleTimeString("ar",{hour:"2-digit",minute:"2-digit"}):"";
  return <div className={`database-status-banner database-status-${state.status}`} role="status" aria-live="polite">
    <span>{state.status==="offline"?"🔴":"🟡"}</span>
    <strong>{state.status==="offline"?"قاعدة البيانات غير متصلة":"جارٍ إعادة الاتصال"}</strong>
    <small>{state.message}{lastConnected?` — آخر اتصال ناجح ${lastConnected}`:""}</small>
  </div>;
}

export {normalizeHealth};
