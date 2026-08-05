import React from "react";
export default function AppLoader({label="جاري التحميل...",inline=false}){
  return <div className={`app-loader ${inline?"app-loader--inline":""}`} role="status"><span className="app-loader__spinner" aria-hidden="true"/><span>{label}</span></div>;
}
