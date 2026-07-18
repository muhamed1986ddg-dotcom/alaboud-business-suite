const crypto = require('crypto');

const SCRYPT_PREFIX = 'scrypt$v1';
function hashPassword(password){
  const salt=crypto.randomBytes(16);
  const key=crypto.scryptSync(String(password),salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024});
  return `${SCRYPT_PREFIX}$${salt.toString('base64')}$${key.toString('base64')}`;
}
function verifyPassword(password, encoded){
  try{
    const [a,b,salt64,key64]=String(encoded||'').split('$');
    if(`${a}$${b}`!==SCRYPT_PREFIX) return false;
    const expected=Buffer.from(key64,'base64');
    const actual=crypto.scryptSync(String(password),Buffer.from(salt64,'base64'),expected.length,{N:16384,r:8,p:1,maxmem:64*1024*1024});
    return expected.length===actual.length&&crypto.timingSafeEqual(expected,actual);
  }catch{return false;}
}
function isScryptHash(v){return String(v||'').startsWith(`${SCRYPT_PREFIX}$`);}
function passwordPolicy(password){
  const p=String(password||'');
  const ok=p.length>=12&&/[a-z]/.test(p)&&/[A-Z]/.test(p)&&/\d/.test(p)&&/[^A-Za-z0-9]/.test(p);
  return {ok,message:'كلمة المرور يجب أن تكون 12 حرفًا على الأقل وتحتوي على حرف كبير وصغير ورقم ورمز'};
}
function encryptJson(value,password){
  const salt=crypto.randomBytes(16),iv=crypto.randomBytes(12);
  const key=crypto.scryptSync(String(password),salt,32,{N:32768,r:8,p:1,maxmem:128*1024*1024});
  const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  const plaintext=Buffer.from(JSON.stringify(value),'utf8');
  const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]);
  return {format:'ALABOUD_ENCRYPTED_BACKUP',version:1,kdf:'scrypt',cipher:'AES-256-GCM',salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:ciphertext.toString('base64')};
}
function decryptJson(payload,password){
  if(payload?.format!=='ALABOUD_ENCRYPTED_BACKUP') throw new Error('صيغة النسخة المشفرة غير صالحة');
  const key=crypto.scryptSync(String(password),Buffer.from(payload.salt,'base64'),32,{N:32768,r:8,p:1,maxmem:128*1024*1024});
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(payload.iv,'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag,'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload.data,'base64')),decipher.final()]).toString('utf8'));
}
function sha256(value){return crypto.createHash('sha256').update(String(value)).digest('hex');}
module.exports={hashPassword,verifyPassword,isScryptHash,passwordPolicy,encryptJson,decryptJson,sha256};
