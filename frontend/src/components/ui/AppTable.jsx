import React from "react";

export default function AppTable({columns=[],rows=[],rowKey="id",emptyText="لا توجد بيانات",className=""}){
  return <div className={`app-table-wrap ${className}`.trim()}>
    <table className="app-table">
      <thead><tr>{columns.map(column=><th key={column.key||column.label}>{column.label}</th>)}</tr></thead>
      <tbody>{rows.length?rows.map((row,index)=><tr key={typeof rowKey==="function"?rowKey(row,index):row[rowKey]??index}>
        {columns.map(column=><td key={column.key||column.label}>{column.render?column.render(row,index):row[column.key]}</td>)}
      </tr>):<tr><td colSpan={Math.max(columns.length,1)} className="app-table__empty">{emptyText}</td></tr>}</tbody>
    </table>
  </div>;
}
