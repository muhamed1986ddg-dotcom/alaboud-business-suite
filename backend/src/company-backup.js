"use strict";

const OPERATIONAL_BRANCH_ARRAYS = [
  "customers",
  "transactions",
  "payments",
  "expenses",
  "capitalMovements",
  "exchangeRates",
  "generalDebts",
  "generalDebtPayments",
  "partners",
  "partnerTransactions",
  "partnerPayments",
  "partnerSyncLogs",
  "notificationActions",
  "auditLogs",
  "monthlyInventories",
];

const OPERATIONAL_COMPANY_ARRAYS = ["integrationLogs"];

const COMPANY_OPERATIONAL_BACKUP_SCOPE = Object.freeze({
  kind: "COMPANY_OPERATIONAL_ALL_BRANCHES",
  allBranches: true,
  includesSecurityCredentials: false,
  excludes: ["users", "sessions", "devices", "apiKeys", "webhooks", "passwordHashes", "twoFactorSecrets"],
});

function cloneRows(rows){
  return Array.from(rows || []).map(item => ({ ...item }));
}

function companyRows(root, key, companyId){
  return cloneRows((root?.[key] || []).filter(item => item && String(item.companyId) === String(companyId)));
}

function buildCompanyOperationalBackup(root, companyId){
  const id = String(companyId || "").trim();
  if(!id) throw new Error("معرّف الشركة مطلوب لإنشاء النسخة الاحتياطية");

  const data = {
    branches: companyRows(root, "branches", id),
    companySettings: { ...(root?.companySettings?.[id] || {}) },
  };
  for(const key of OPERATIONAL_BRANCH_ARRAYS) data[key] = companyRows(root, key, id);
  for(const key of OPERATIONAL_COMPANY_ARRAYS) data[key] = companyRows(root, key, id);
  return data;
}

function validateCompanyOperationalBackup(data){
  if(!data || typeof data !== "object") return { ok:false, message:"بيانات النسخة الاحتياطية غير صالحة" };
  if(!Array.isArray(data.branches) || data.branches.length === 0){
    return { ok:false, message:"النسخة الاحتياطية الشاملة يجب أن تحتوي على فرع واحد على الأقل" };
  }

  const branchIds = new Set();
  for(const branch of data.branches){
    const branchId = String(branch?.id || "").trim();
    if(!branchId) return { ok:false, message:"يوجد فرع بدون معرّف صالح في النسخة الاحتياطية" };
    if(branchIds.has(branchId)) return { ok:false, message:"يوجد معرّف فرع مكرر في النسخة الاحتياطية" };
    branchIds.add(branchId);
  }

  for(const key of OPERATIONAL_BRANCH_ARRAYS){
    const rows = data[key];
    if(rows !== undefined && !Array.isArray(rows)){
      return { ok:false, message:`الحقل ${key} في النسخة الاحتياطية غير صالح` };
    }
    for(const row of rows || []){
      const branchId = String(row?.branchId || "").trim();
      if(branchId && !branchIds.has(branchId)){
        return { ok:false, message:`يوجد سجل في ${key} مرتبط بفرع غير موجود في النسخة الاحتياطية` };
      }
    }
  }

  for(const key of OPERATIONAL_COMPANY_ARRAYS){
    if(data[key] !== undefined && !Array.isArray(data[key])){
      return { ok:false, message:`الحقل ${key} في النسخة الاحتياطية غير صالح` };
    }
  }

  if(data.companySettings !== undefined && (!data.companySettings || Array.isArray(data.companySettings) || typeof data.companySettings !== "object")){
    return { ok:false, message:"إعدادات الشركة في النسخة الاحتياطية غير صالحة" };
  }

  return { ok:true };
}

function normalizeCompanyRows(rows, companyId){
  return cloneRows(rows).map(row => ({ ...row, companyId }));
}

function replaceCompanyRows(root, key, companyId, rows){
  const existing = Array.isArray(root[key]) ? root[key] : [];
  const otherCompanies = existing.filter(item => !item || String(item.companyId) !== String(companyId));
  root[key] = [...otherCompanies, ...normalizeCompanyRows(rows || [], companyId)];
}

function restoreCompanyOperationalBackup(root, companyId, data){
  const validation = validateCompanyOperationalBackup(data);
  if(!validation.ok) throw new Error(validation.message);

  const restoredBranchIds=new Set((data.branches||[]).map(branch=>String(branch.id)));
  const assignedBranchIds=new Set();
  for(const user of root.users||[]){
    if(!user||String(user.companyId)!==String(companyId))continue;
    for(const branchId of Array.isArray(user.branchIds)?user.branchIds:[]){
      if(branchId)assignedBranchIds.add(String(branchId));
    }
  }
  for(const branchId of assignedBranchIds){
    if(!restoredBranchIds.has(branchId)){
      throw new Error("هيكل الفروع في النسخة الاحتياطية لا يتوافق مع صلاحيات المستخدمين الحالية. حدّث صلاحيات الفروع أولًا أو استخدم نسخة أحدث.");
    }
  }

  replaceCompanyRows(root, "branches", companyId, data.branches);
  for(const key of OPERATIONAL_BRANCH_ARRAYS) replaceCompanyRows(root, key, companyId, data[key] || []);
  for(const key of OPERATIONAL_COMPANY_ARRAYS) replaceCompanyRows(root, key, companyId, data[key] || []);

  if(!root.companySettings || typeof root.companySettings !== "object" || Array.isArray(root.companySettings)) root.companySettings = {};
  root.companySettings[companyId] = { ...(data.companySettings || {}) };
  return { branchCount:data.branches.length };
}

function isCompanyWideOperationalBackup(payload){
  return payload?.scope?.kind === COMPANY_OPERATIONAL_BACKUP_SCOPE.kind && payload?.scope?.allBranches === true;
}

module.exports = {
  OPERATIONAL_BRANCH_ARRAYS,
  OPERATIONAL_COMPANY_ARRAYS,
  COMPANY_OPERATIONAL_BACKUP_SCOPE,
  buildCompanyOperationalBackup,
  validateCompanyOperationalBackup,
  restoreCompanyOperationalBackup,
  isCompanyWideOperationalBackup,
};
