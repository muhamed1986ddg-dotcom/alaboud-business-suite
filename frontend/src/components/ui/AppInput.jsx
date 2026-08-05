import React from "react";

export default function AppInput({label,error,hint,className="",...props}){
  const id=props.id||React.useId();
  return <label className={`app-field ${className}`.trim()} htmlFor={id}>
    {label&&<span className="app-field__label">{label}</span>}
    <input {...props} id={id} className={`app-input ${props.className||""}`.trim()} aria-invalid={error?"true":"false"}/>
    {error?<small className="app-field__error">{error}</small>:hint&&<small className="app-field__hint">{hint}</small>}
  </label>;
}
