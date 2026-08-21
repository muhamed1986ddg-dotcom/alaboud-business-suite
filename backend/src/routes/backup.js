"use strict";

const LEGACY_BACKUP_ARRAYS=["customers","transactions","payments","expenses","capitalMovements","exchangeRates","generalDebts","generalDebtPayments","partners","partnerTransactions","partnerPayments","partnerSyncLogs","notificationActions","monthlyInventories"];

function registerBackupRoutes(app, {
  auth,
  requirePermission,
  readRootStore,
  readStore,
  buildCompanyOperationalBackup,
  createBackupEnvelope,
  COMPANY_OPERATIONAL_BACKUP_SCOPE,
  now,
  sendJsonAttachmentChunked,
  APP_VERSION,
  sha256,
  DEFAULT_IDLE_MS,
  IS_PROD,
  JWT_SECRET,
  rateLimit,
  passwordPolicy,
  encryptJson,
  mutateDurable,
  audit,
  id,
  verifyBackupEnvelope,
  isCompanyWideOperationalBackup,
  runWithTenant,
  restoreCompanyOperationalBackup,
  validateBackupRestoreSchema
}) {
  function companyBackupEnvelope(req){
    const root=readRootStore();
    const company=(root.companies||[]).find(item=>item.id===req.user.companyId);
    const data=buildCompanyOperationalBackup(root,req.user.companyId);
    return createBackupEnvelope({company:{id:req.user.companyId,name:company?.name||"",slug:company?.slug||""},scope:COMPANY_OPERATIONAL_BACKUP_SCOPE,data,createdAt:now()});
  }

  app.get("/api/backup", auth, requirePermission("admin.only"), async (req,res,next)=>{
    try{
      const payload=companyBackupEnvelope(req);
      const filename=`alaboud-company-backup-v${APP_VERSION}-${new Date().toISOString().replace(/[:.]/g,"-")}.json`;
      const result=await sendJsonAttachmentChunked(res,payload,filename);
      console.log("Company backup exported",{requestId:req.requestId,companyId:req.user.companyId,bytes:result.bytes,mode:"chunked"});
    }catch(error){
      console.error("Company backup export failed",{requestId:req.requestId,companyId:req.user?.companyId,error:error?.stack||error});
      if(!res.headersSent)return next(error);
      try{res.destroy(error)}catch(_error){}
    }
  });

  app.get("/api/security/status", auth, (req,res)=>{
    if(req.user.role!=="ADMIN")return res.status(403).json({message:"متاح للمدير فقط"});
    const store=readStore(); const logs=store.auditLogs||[]; let chainValid=true,prev="GENESIS";
    for(const item of logs){const copy={...item};delete copy.integrityHash;if(item.previousHash!==prev||sha256(JSON.stringify(copy))!==item.integrityHash){chainValid=false;break;}prev=item.integrityHash;}
    res.json({version:APP_VERSION,passwordHashing:"scrypt",sessionHours:+(DEFAULT_IDLE_MS/3600000).toFixed(2),httpsRequired:IS_PROD,auditIntegrity:chainValid,activeDevices:(store.devices||[]).filter(x=>x.active!==false).length,failedLogins24h:logs.filter(x=>x.action==="LOGIN_FAILED"&&Date.now()-new Date(x.createdAt).getTime()<86400000).length,securityScore:[IS_PROD,JWT_SECRET!=="LOCAL_TRIAL_CHANGE_ME_6_0",chainValid].filter(Boolean).length===3?95:78});
  });

  app.post("/api/backup/encrypted", auth, requirePermission("admin.only"), rateLimit("backup",10,60*60*1000),async (req,res)=>{
    const password=String(req.body?.password||"");const policy=passwordPolicy(password);if(!policy.ok)return res.status(400).json({message:policy.message});
    const payload=companyBackupEnvelope(req);const encrypted=encryptJson(payload,password);
    await mutateDurable(store=>audit(store,req.user.id,"EXPORT_ENCRYPTED","BACKUP",id(),{ip:req.ip,branchId:req.user.branchId,branchName:req.user.branchName}));
    res.setHeader("Content-Disposition",`attachment; filename="alaboud-secure-company-backup-v${APP_VERSION}-${Date.now()}.abs"`);res.json(encrypted);
  });

  app.post("/api/backup/restore", auth, requirePermission("admin.only"), rateLimit("backup-restore",5,60*60*1000), async (req,res)=>{
    try{
      const payload=req.body||{};
      const schema=validateBackupRestoreSchema(payload);if(!schema.ok)return res.status(400).json({message:schema.message});
      const verification=verifyBackupEnvelope(payload);if(!verification.ok)return res.status(400).json({message:verification.message});
      if(payload.company?.id && String(payload.company.id)!==String(req.user.companyId))return res.status(400).json({message:"هذه النسخة الاحتياطية تخص شركة أخرى ولا يمكن استعادتها في هذا الحساب"});
      if(isCompanyWideOperationalBackup(payload)){
        await runWithTenant(null,null,()=>mutateDurable(root=>{
          const result=restoreCompanyOperationalBackup(root,req.user.companyId,payload.data);
          audit(root,req.user.id,"RESTORE","BACKUP",id(),{companyId:req.user.companyId,branchId:req.user.branchId,branchName:req.user.branchName,sourceVersion:payload.version||"unknown",createdAt:payload.createdAt||null,scope:payload.scope?.kind||null,restoredBranches:result.branchCount,ip:req.ip});
        }));
        return res.json({message:"تمت استعادة النسخة التشغيلية لجميع فروع الشركة بنجاح"});
      }
      await mutateDurable(store=>{
        for(const key of LEGACY_BACKUP_ARRAYS){store[key]=Array.isArray(payload.data[key])?payload.data[key].map(row=>{const clean={...row};delete clean.companyId;return clean;}):[];}
        if(payload.data.notificationSettings&&typeof payload.data.notificationSettings==="object")store.notificationSettings={...payload.data.notificationSettings};
        audit(store,req.user.id,"RESTORE_LEGACY_BRANCH","BACKUP",id(),{sourceVersion:payload.version||"unknown",createdAt:payload.createdAt||null,ip:req.ip,branchId:req.user.branchId,branchName:req.user.branchName});
      });
      return res.json({message:"تمت استعادة النسخة القديمة للفرع الحالي بنجاح"});
    }catch(error){res.status(400).json({message:error.message||"تعذر استعادة النسخة الاحتياطية"});}
  });
}

module.exports={registerBackupRoutes};
