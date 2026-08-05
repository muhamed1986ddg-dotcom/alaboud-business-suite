const fs=require("fs");
const assert=require("assert");
const server=fs.readFileSync(__dirname+"/server.js","utf8");
assert(server.includes("authoritativeCustomerDebtCad"),"must use authoritative customer debt");
assert(server.includes("customerSummary(store,customer)"),"must use customerSummary source");
assert(server.includes("for(const row of partnerRows)"),"company debt must use partner rows only");
assert(server.includes("authoritativeReceivable=authoritativeCustomerReceivable+companyReceivable"),"total must equal customer plus company");
console.log("unified debt balance v25.4.9 test passed");
