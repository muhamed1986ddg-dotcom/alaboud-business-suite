"use strict";
const assert=require("assert/strict");
const fs=require("fs");
const path=require("path");
const {registerOrganizationRoutes}=require("./routes/organization");
const {registerFinanceOperationsRoutes}=require("./routes/finance-operations");
const {registerBackupRoutes}=require("./routes/backup");

function routeRecorder(){
  const routes=[];
  const app={};
  for(const method of ["get","post","put","patch","delete"]){
    app[method]=(routePath,...handlers)=>{routes.push(`${method.toUpperCase()} ${routePath}`);return app;};
  }
  return {app,routes};
}
function noop(){}
const common={
  auth:noop,requirePermission:()=>noop,readStore:noop,readRootStore:noop,branchSummary:noop,mutateDurable:noop,
  createBranch:noop,now:noop,audit:noop,passwordPolicy:noop,hashPassword:noop,id:noop,revokeUserSessions:noop,
  revokeBiometricForUser:noop,requireIdempotencyKey:noop,branchSafeRead:noop,nativeRepositories:{expenses:{},capitalMovements:{}},
  paginate:noop,assertBalancedEntry:noop,currencyConversion:noop,safeNumber:noop,buildCompanyOperationalBackup:noop,
  createBackupEnvelope:noop,COMPANY_OPERATIONAL_BACKUP_SCOPE:{},sendJsonAttachmentChunked:noop,APP_VERSION:"25.14.100",
  sha256:noop,DEFAULT_IDLE_MS:1,IS_PROD:false,JWT_SECRET:"test",rateLimit:()=>noop,encryptJson:noop,
  verifyBackupEnvelope:noop,isCompanyWideOperationalBackup:noop,runWithTenant:noop,restoreCompanyOperationalBackup:noop,
  validateBackupRestoreSchema:()=>({ok:true})
};

{
  const {app,routes}=routeRecorder();
  registerOrganizationRoutes(app,common);
  for(const expected of ["GET /api/branches","PATCH /api/company-profile","POST /api/users","GET /api/devices","GET /api/audit-logs"]){assert(routes.includes(expected),expected);}
}
{
  const {app,routes}=routeRecorder();
  registerFinanceOperationsRoutes(app,common);
  for(const expected of ["GET /api/expenses","POST /api/expenses","GET /api/capital","PATCH /api/capital/:id"]){assert(routes.includes(expected),expected);}
}
{
  const {app,routes}=routeRecorder();
  registerBackupRoutes(app,common);
  for(const expected of ["GET /api/backup","POST /api/backup/encrypted","POST /api/backup/restore","GET /api/security/status"]){assert(routes.includes(expected),expected);}
}

const serverPath=path.join(__dirname,"server.js");
const server=fs.readFileSync(serverPath,"utf8");
assert(server.includes("registerOrganizationRoutes(app"));
assert(server.includes("registerFinanceOperationsRoutes(app"));
assert(server.includes("registerBackupRoutes(app"));
assert(!server.includes('app.get("/api/backup"'));
assert(!server.includes('app.get("/api/expenses"'));
assert(!server.includes('app.get("/api/branches"'));
const lines=server.split(/\r?\n/).length;
assert(lines<6000,`server.js should remain below 6000 lines after modularization; got ${lines}`);
console.log(`v25.14.100 route modularization: OK (${lines} server lines)`);
