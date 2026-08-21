"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");
const root=path.resolve(__dirname,"../..");
const server=fs.readFileSync(path.join(root,"backend/src/server.js"),"utf8");
const capital=fs.readFileSync(path.join(root,"frontend/src/screens/CapitalOverview.jsx"),"utf8");
assert(server.includes("capitalByCurrency"),"capital overview must expose capitalByCurrency");
assert(server.includes("operatingOut"),"capital turnover must expose operating out");
assert(server.includes("operatingReturned"),"capital turnover must expose returned principal");
assert(server.includes("paidByTransactionThroughMonth"),"turnover must be grounded in allocated customer payments");
assert(server.includes("returnedRatio=due>0?Math.min(paid/due,1):0"),"returned principal must be capped at the transfer due");
assert(server.includes("row.operatingReturned/base"),"turnover rate must use returned operating principal over capital base");
assert(capital.includes("رأس المال الأصلي — آخر جرد معتمد"),"main capital card title must match the approved inventory-baseline label");
assert(capital.includes("💰 رأس المال حسب العملة"),"currency section title must be renamed");
for(const label of ["المضاف:","المسحوب:","رأس المال الحالي:","خرج للتشغيل:","عاد من التشغيل:","عالق ولم يعد:","دوران رأس المال:"]){
  assert(capital.includes(label),`missing capital detail label: ${label}`);
}
assert(capital.includes("لا تدخل إضافات أو سحوبات رأس المال (+/−) في حساب الدوران"),"UI must explain that owner capital IN/OUT is excluded from turnover");
console.log("capital turnover v25.14.85: OK");
