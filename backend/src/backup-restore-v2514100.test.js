"use strict";

const assert=require("assert/strict");
const express=require("express");
const http=require("http");
const {createBackupEnvelope,verifyBackupEnvelope}=require("./production-readiness");
const {sendJsonAttachmentChunked}=require("./backup-response");
const {buildCompanyOperationalBackup,restoreCompanyOperationalBackup,COMPANY_OPERATIONAL_BACKUP_SCOPE}=require("./company-backup");
const {backupRestoreMaxBytes,validateBackupRestoreSchema,HARD_BACKUP_RESTORE_MAX_BYTES}=require("./backup-restore");

function listen(server){return new Promise((resolve,reject)=>server.listen(0,"127.0.0.1",error=>error?reject(error):resolve()));}
function close(server){return new Promise(resolve=>server.close(resolve));}
function request(options,body){
  return new Promise((resolve,reject)=>{
    const req=http.request(options,res=>{const chunks=[];res.on("data",chunk=>chunks.push(chunk));res.on("end",()=>resolve({status:res.statusCode,body:Buffer.concat(chunks)}));});
    req.on("error",reject);if(body)req.write(body);req.end();
  });
}

(async()=>{
  const source={
    companies:[{id:"c1",name:"Company"}],branches:[{id:"b1",companyId:"c1",name:"Main"}],
    customers:[{id:"customer-large",companyId:"c1",branchId:"b1",name:"Large",notes:"x".repeat(3*1024*1024)}],
    transactions:[],payments:[],expenses:[],capitalMovements:[],exchangeRates:[],generalDebts:[],generalDebtPayments:[],partners:[],partnerTransactions:[],partnerPayments:[],partnerSyncLogs:[],notificationActions:[],auditLogs:[],monthlyInventories:[],integrationLogs:[],companySettings:{c1:{}}
  };
  const payload=createBackupEnvelope({company:{id:"c1",name:"Company"},scope:COMPANY_OPERATIONAL_BACKUP_SCOPE,data:buildCompanyOperationalBackup(source,"c1")});
  const exportServer=http.createServer((_req,res)=>sendJsonAttachmentChunked(res,payload,"backup.json"));
  await listen(exportServer);
  const exported=await request({host:"127.0.0.1",port:exportServer.address().port,path:"/",method:"GET"});
  await close(exportServer);
  assert(exported.body.length>2*1024*1024,"fixture must exceed the normal JSON limit");

  const target=structuredClone(source);target.customers=[];
  const app=express();
  app.use("/restore",express.json({limit:backupRestoreMaxBytes({}),strict:true,type:"application/json"}));
  app.post("/restore",(req,res)=>{
    const schema=validateBackupRestoreSchema(req.body);
    if(!schema.ok)return res.status(400).json(schema);
    const integrity=verifyBackupEnvelope(req.body);
    if(!integrity.ok)return res.status(400).json(integrity);
    restoreCompanyOperationalBackup(target,"c1",req.body.data);
    res.json({ok:true});
  });
  const restoreServer=http.createServer(app);await listen(restoreServer);
  const restored=await request({host:"127.0.0.1",port:restoreServer.address().port,path:"/restore",method:"POST",headers:{"content-type":"application/json","content-length":exported.body.length}},exported.body);
  await close(restoreServer);
  assert.equal(restored.status,200);
  assert.equal(target.customers[0].notes.length,3*1024*1024);
  assert.equal(backupRestoreMaxBytes({BACKUP_RESTORE_MAX_BYTES:String(HARD_BACKUP_RESTORE_MAX_BYTES*2)}),HARD_BACKUP_RESTORE_MAX_BYTES,"configured limit must remain hard-bounded");
  assert.equal(validateBackupRestoreSchema({...payload,data:{branches:{}}}).ok,false,"invalid section schema must be rejected");
  console.log("v25.14.100 large backup export -> restore: OK");
})().catch(error=>{console.error(error);process.exitCode=1;});
