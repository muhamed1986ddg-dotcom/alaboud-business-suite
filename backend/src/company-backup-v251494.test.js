"use strict";

const assert = require("assert/strict");
const {
  COMPANY_OPERATIONAL_BACKUP_SCOPE,
  buildCompanyOperationalBackup,
  validateCompanyOperationalBackup,
  restoreCompanyOperationalBackup,
} = require("./company-backup");

const root = {
  companies:[{id:"c1",name:"A"},{id:"c2",name:"B"}],
  branches:[
    {id:"b1",companyId:"c1",name:"Main"},
    {id:"b2",companyId:"c1",name:"Second"},
    {id:"b9",companyId:"c2",name:"Other"},
  ],
  customers:[
    {id:"u1",companyId:"c1",branchId:"b1",name:"One"},
    {id:"u2",companyId:"c1",branchId:"b2",name:"Two"},
    {id:"u9",companyId:"c2",branchId:"b9",name:"Other"},
  ],
  transactions:[], payments:[], expenses:[], capitalMovements:[], exchangeRates:[], generalDebts:[], generalDebtPayments:[],
  partners:[], partnerTransactions:[], partnerPayments:[], partnerSyncLogs:[], notificationActions:[], auditLogs:[], monthlyInventories:[], integrationLogs:[],
  companySettings:{c1:{overdueDays:9},c2:{overdueDays:4}},
  users:[{id:"secret-user",companyId:"c1",branchIds:["b1"],passwordHash:"must-not-export"}],
  sessions:[{id:"secret-session",companyId:"c1"}], apiKeys:[{id:"secret-api",companyId:"c1"}],
};

const data = buildCompanyOperationalBackup(root,"c1");
assert.equal(COMPANY_OPERATIONAL_BACKUP_SCOPE.allBranches,true);
assert.equal(data.branches.length,2,"all company branches must be exported");
assert.equal(data.customers.length,2,"records from every company branch must be exported");
assert(!("users" in data),"plain operational backup must not export users/password hashes");
assert(!("sessions" in data),"plain operational backup must not export sessions");
assert(!("apiKeys" in data),"plain operational backup must not export API keys");
assert.equal(validateCompanyOperationalBackup(data).ok,true);

const restored = structuredClone(root);
restored.customers = restored.customers.filter(row=>row.companyId!=="c1");
restoreCompanyOperationalBackup(restored,"c1",data);
assert.equal(restored.customers.filter(row=>row.companyId==="c1").length,2);
assert.equal(restored.customers.find(row=>row.id==="u2").branchId,"b2");
assert.equal(restored.customers.find(row=>row.id==="u9").companyId,"c2","other companies must not be changed");
assert.equal(restored.companySettings.c1.overdueDays,9);
assert.equal(restored.users.find(row=>row.id==="secret-user").passwordHash,"must-not-export","security identity records remain untouched");

const invalid = structuredClone(data);
invalid.customers.push({id:"bad",branchId:"missing"});
assert.equal(validateCompanyOperationalBackup(invalid).ok,false,"orphan branch records must be rejected");

const incompatible=structuredClone(data);
incompatible.branches=incompatible.branches.filter(branch=>branch.id!=="b1");
for(const key of ["customers","transactions","payments","expenses","capitalMovements","exchangeRates","generalDebts","generalDebtPayments","partners","partnerTransactions","partnerPayments","partnerSyncLogs","notificationActions","auditLogs","monthlyInventories"]){
  incompatible[key]=(incompatible[key]||[]).filter(row=>row.branchId!=="b1");
}
assert.throws(()=>restoreCompanyOperationalBackup(structuredClone(root),"c1",incompatible),/صلاحيات المستخدمين الحالية/,"restore must not strand users on removed branches");

console.log("v25.14.94 company-wide operational backup: OK");
