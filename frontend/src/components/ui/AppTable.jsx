import React from "react";
import AppLoader from "./AppLoader";
import AppEmptyState from "./AppEmptyState";

export default function AppTable({columns=[],rows=[],rowKey="id",emptyText="لا توجد بيانات",loading=false,loadingText="جاري تحميل البيانات...",className="",compact=false,caption}){
  if(loading)return <div className={`app-table-wrap ${className}`.trim()}><AppLoader label={loadingText}/></div>;
  if(!rows.length)return <div className={`app-table-wrap ${className}`.trim()}><AppEmptyState title={emptyText}/></div>;
  return <div className={`app-table-wrap ${compact?"app-table-wrap--compact":""} ${className}`.trim()}>
    <table className="app-table">
      {caption&&<caption>{caption}</caption>}
      <thead><tr>{columns.map(column=><th key={column.key||column.label} scope="col">{column.label}</th>)}</tr></thead>
      <tbody>{rows.map((row,index)=><tr key={typeof rowKey==="function"?rowKey(row,index):row[rowKey]??index}>
        {columns.map(column=><td key={column.key||column.label} data-label={column.label}>{column.render?column.render(row,index):row[column.key]}</td>)}
      </tr>)}</tbody>
    </table>
  </div>;
}
