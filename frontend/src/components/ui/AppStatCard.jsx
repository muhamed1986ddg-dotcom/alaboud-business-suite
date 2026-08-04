import React from "react";
export default function AppStatCard({label,value,hint,tone="default"}){
  return <article className={`app-stat-card app-stat-card--${tone}`}><span>{label}</span><strong>{value}</strong>{hint&&<small>{hint}</small>}</article>;
}
