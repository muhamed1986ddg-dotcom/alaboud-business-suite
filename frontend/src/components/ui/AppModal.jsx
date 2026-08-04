import React from "react";

export default function AppModal({open,title,children,onClose,actions=null,size="md",busy=false,closeOnBackdrop=true}){
  React.useEffect(()=>{
    if(!open)return undefined;
    const onKey=(event)=>{if(event.key==="Escape"&&!busy)onClose?.();};
    const previous=document.body.style.overflow;
    document.addEventListener("keydown",onKey);
    document.body.classList.add("app-modal-open");
    document.body.style.overflow="hidden";
    return()=>{
      document.removeEventListener("keydown",onKey);
      document.body.classList.remove("app-modal-open");
      document.body.style.overflow=previous||"";
    };
  },[open,busy,onClose]);
  if(!open)return null;
  return <div className="app-modal-backdrop" role="presentation" onMouseDown={(event)=>{
    if(closeOnBackdrop&&!busy&&event.target===event.currentTarget)onClose?.();
  }}>
    <section className={`app-modal app-modal--${size}`} role="dialog" aria-modal="true" aria-label={title||"نافذة"}>
      <header className="app-modal__header">
        <h3>{title}</h3>
        <button type="button" className="app-modal__close" onClick={()=>!busy&&onClose?.()} disabled={busy} aria-label="إغلاق">×</button>
      </header>
      <div className="app-modal__body">{children}</div>
      {actions&&<footer className="app-modal__actions">{actions}</footer>}
    </section>
  </div>;
}
