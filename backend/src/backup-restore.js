"use strict";

const DEFAULT_BACKUP_RESTORE_MAX_BYTES = 32 * 1024 * 1024;
const MIN_BACKUP_RESTORE_MAX_BYTES = 3 * 1024 * 1024;
const HARD_BACKUP_RESTORE_MAX_BYTES = 64 * 1024 * 1024;
const MAX_BACKUP_RECORDS = 250000;
const ARRAY_SECTIONS = Object.freeze([
  "branches", "customers", "transactions", "payments", "expenses", "capitalMovements",
  "exchangeRates", "generalDebts", "generalDebtPayments", "partners", "partnerTransactions",
  "partnerPayments", "partnerSyncLogs", "notificationActions", "auditLogs", "monthlyInventories",
  "integrationLogs"
]);

function backupRestoreMaxBytes(env = process.env){
  const configured=Number(env.BACKUP_RESTORE_MAX_BYTES);
  if(!Number.isFinite(configured))return DEFAULT_BACKUP_RESTORE_MAX_BYTES;
  return Math.min(HARD_BACKUP_RESTORE_MAX_BYTES,Math.max(MIN_BACKUP_RESTORE_MAX_BYTES,Math.trunc(configured)));
}

function isPlainObject(value){
  if(!value||typeof value!=="object"||Array.isArray(value))return false;
  const prototype=Object.getPrototypeOf(value);
  return prototype===Object.prototype||prototype===null;
}

function validateBackupRestoreSchema(payload){
  if(!isPlainObject(payload)||payload.format!=="ALABOUD_BACKUP")return {ok:false,message:"Invalid backup envelope"};
  if(typeof payload.version!=="string"||payload.version.length<1||payload.version.length>40)return {ok:false,message:"Invalid backup version"};
  if(typeof payload.createdAt!=="string"||!Number.isFinite(Date.parse(payload.createdAt)))return {ok:false,message:"Invalid backup creation time"};
  if(!isPlainObject(payload.data)||!isPlainObject(payload.integrity))return {ok:false,message:"Invalid backup data schema"};
  if(payload.integrity.algorithm!=="SHA-256"||typeof payload.integrity.checksum!=="string"||!/^[a-f0-9]{64}$/i.test(payload.integrity.checksum))return {ok:false,message:"Invalid backup integrity schema"};
  if(payload.company!==null&&payload.company!==undefined&&!isPlainObject(payload.company))return {ok:false,message:"Invalid backup company schema"};
  if(payload.scope!==undefined&&!isPlainObject(payload.scope))return {ok:false,message:"Invalid backup scope schema"};
  let records=0;
  for(const section of ARRAY_SECTIONS){
    if(payload.data[section]===undefined)continue;
    if(!Array.isArray(payload.data[section]))return {ok:false,message:`Invalid backup section: ${section}`};
    records+=payload.data[section].length;
    if(records>MAX_BACKUP_RECORDS)return {ok:false,message:"Backup contains too many records"};
  }
  if(payload.data.companySettings!==undefined&&!isPlainObject(payload.data.companySettings))return {ok:false,message:"Invalid company settings schema"};
  if(payload.data.notificationSettings!==undefined&&!isPlainObject(payload.data.notificationSettings))return {ok:false,message:"Invalid notification settings schema"};
  return {ok:true,records};
}

module.exports={DEFAULT_BACKUP_RESTORE_MAX_BYTES,HARD_BACKUP_RESTORE_MAX_BYTES,MAX_BACKUP_RECORDS,backupRestoreMaxBytes,validateBackupRestoreSchema};
