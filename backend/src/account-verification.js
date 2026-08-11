const crypto=require('crypto');

function normalizeChannel(value){
  const channel=String(value||'').trim().toUpperCase();
  return ['EMAIL','SMS','WHATSAPP'].includes(channel)?channel:'';
}
function normalizeEmail(value){return String(value||'').trim().toLowerCase().slice(0,254)}
function normalizePhone(value){
  const raw=String(value||'').trim();
  if(!raw)return '';
  const cleaned=raw.replace(/[^\d+]/g,'');
  if(cleaned.startsWith('+'))return `+${cleaned.slice(1).replace(/\D/g,'')}`.slice(0,18);
  return cleaned.replace(/\D/g,'').slice(0,17);
}
function maskEmail(value){
  const email=normalizeEmail(value);const [name='',domain='']=email.split('@');
  if(!domain)return email;
  return `${name.slice(0,2)}${name.length>2?'***':''}@${domain}`;
}
function maskPhone(value){const phone=normalizePhone(value);return phone.length>4?`${phone.slice(0,3)}••••${phone.slice(-3)}`:phone}
function codeHash({userId,channel,target,code,secret}){
  return crypto.createHmac('sha256',String(secret)).update(`${userId}|${channel}|${target}|${code}`).digest('hex');
}
function safeEqualHex(a,b){
  try{const aa=Buffer.from(String(a||''),'hex'),bb=Buffer.from(String(b||''),'hex');return aa.length===bb.length&&aa.length>0&&crypto.timingSafeEqual(aa,bb)}catch{return false}
}
module.exports={normalizeChannel,normalizeEmail,normalizePhone,maskEmail,maskPhone,codeHash,safeEqualHex};
