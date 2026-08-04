import React from "react";

export default function AppButton({variant="secondary",busy=false,busyText="جاري التنفيذ...",children,className="",disabled,...props}){
  return <button {...props} className={`app-button app-button--${variant} ${className}`.trim()} disabled={disabled||busy} aria-busy={busy?"true":"false"}>
    {busy?<><span className="app-button__spinner" aria-hidden="true"/>{busyText}</>:children}
  </button>;
}
