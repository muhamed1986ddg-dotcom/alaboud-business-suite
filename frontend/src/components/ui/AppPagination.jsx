import React from "react";
import AppButton from "./AppButton";
export default function AppPagination({page=1,totalPages=1,onChange,disabled=false}){
  if(totalPages<=1)return null;
  return <nav className="app-pagination" aria-label="ترقيم الصفحات">
    <AppButton type="button" disabled={disabled||page<=1} onClick={()=>onChange?.(page-1)}>السابق</AppButton>
    <span>صفحة {page} من {totalPages}</span>
    <AppButton type="button" disabled={disabled||page>=totalPages} onClick={()=>onChange?.(page+1)}>التالي</AppButton>
  </nav>;
}
