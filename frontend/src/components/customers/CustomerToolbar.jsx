import React from "react";
import {cad} from "../../shared";

export function CustomerToolbar({activePanel,onSelect,totalDebt}){
  return <div className="customer-toolbar customer-primary-toolbar card">
    <button onClick={()=>onSelect("newCustomer")}>➕ إضافة عميل</button>
    <button onClick={()=>onSelect(activePanel==="transfer"?"":"transfer")}>💸 إضافة حوالة</button>
    <button onClick={()=>onSelect(activePanel==="payment"?"":"payment")}>💳 إضافة دفعة</button>
    <button className={activePanel==="list"?"active":""} onClick={()=>onSelect(activePanel==="list"?"":"list")}>📋 قائمة العملاء</button>
    <div className="customer-toolbar-debt" aria-label="إجمالي دين العملاء">
      <span>💰 إجمالي دين العملاء</span>
      <strong>{cad(totalDebt)}</strong>
    </div>
  </div>;
}

export function CustomerListControls({search,onSearch,sortMode,onSort}){
  return <div className="customer-list-controls">
    <input autoFocus className="customer-search" value={search} onChange={event=>onSearch(event.target.value)} placeholder="بحث باسم العميل أو رقم الهاتف"/>
    <label className="customer-sort-control">
      <span>ترتيب العملاء</span>
      <select value={sortMode} onChange={event=>onSort(event.target.value)} aria-label="ترتيب قائمة العملاء">
        <option value="name-asc">الاسم: أ ← ي</option>
        <option value="name-desc">الاسم: ي ← أ</option>
        <option value="balance-desc">أعلى رصيد</option>
        <option value="last-transfer">آخر حوالة</option>
        <option value="newest">أحدث عميل</option>
        <option value="oldest">أقدم عميل</option>
        <option value="overdue-desc">الأكثر تأخرًا</option>
      </select>
    </label>
  </div>;
}
