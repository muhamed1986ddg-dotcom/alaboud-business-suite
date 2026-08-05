import React from "react";
export default function AppEmptyState({icon="📭",title="لا توجد بيانات",description,action}){
  return <div className="app-empty-state"><span className="app-empty-state__icon" aria-hidden="true">{icon}</span><strong>{title}</strong>{description&&<p>{description}</p>}{action&&<div>{action}</div>}</div>;
}
