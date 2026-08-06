const crypto = require("crypto");

const APP_VERSION = "25.14.1";
const BACKUP_FORMAT = "ALABOUD_BACKUP";

function stableStringify(value){
  if(value === null || typeof value !== "object") return JSON.stringify(value);
  if(Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function checksum(value){
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function createBackupEnvelope({ company, data, createdAt = new Date().toISOString() }){
  const core = {
    format: BACKUP_FORMAT,
    version: APP_VERSION,
    createdAt,
    company: company || null,
    data: data || {}
  };
  return { ...core, integrity: { algorithm: "SHA-256", checksum: checksum(core) } };
}

function verifyBackupEnvelope(payload){
  if(!payload || payload.format !== BACKUP_FORMAT || !payload.data || typeof payload.data !== "object"){
    return { ok:false, message:"ملف النسخة الاحتياطية غير صالح" };
  }
  if(!payload.integrity?.checksum){
    return { ok:false, message:"النسخة الاحتياطية لا تحتوي على بصمة سلامة" };
  }
  const core = {
    format: payload.format,
    version: payload.version,
    createdAt: payload.createdAt,
    company: payload.company || null,
    data: payload.data
  };
  const expected = checksum(core);
  const supplied = String(payload.integrity.checksum);
  const valid = expected.length === supplied.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
  return valid ? { ok:true } : { ok:false, message:"فشل التحقق من سلامة النسخة الاحتياطية" };
}

function productionReadiness(env = process.env){
  const issues = [];
  if(env.NODE_ENV === "production"){
    if(!env.JWT_SECRET || env.JWT_SECRET.length < 32) issues.push("JWT_SECRET must be at least 32 characters");
    if(!env.DATABASE_URL) issues.push("DATABASE_URL is required in production");
    if(!env.CORS_ORIGIN) issues.push("CORS_ORIGIN should be configured in production");
  }
  return {
    ok: issues.length === 0,
    version: APP_VERSION,
    environment: env.NODE_ENV || "development",
    issues
  };
}

module.exports = {
  APP_VERSION,
  BACKUP_FORMAT,
  stableStringify,
  checksum,
  createBackupEnvelope,
  verifyBackupEnvelope,
  productionReadiness
};
