import React from "react";

export default function AppSelect({label,error,hint,options=[],placeholder,className="",children,...props}){
  const id=props.id||React.useId();
  return <label className={`app-field ${className}`.trim()} htmlFor={id}>
    {label&&<span className="app-field__label">{label}</span>}
    <select {...props} id={id} className={`app-select ${props.className||""}`.trim()} aria-invalid={error?"true":"false"}>
      {placeholder!==undefined&&<option value="">{placeholder}</option>}
      {children||options.map(option=>typeof option==="string"?<option key={option} value={option}>{option}</option>:<option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
    {error?<small className="app-field__error">{error}</small>:hint&&<small className="app-field__hint">{hint}</small>}
  </label>;
}
