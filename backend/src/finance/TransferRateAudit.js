"use strict";
function normalizeQuotedRateAudit(transaction,previous={},body={}){
  const apply=(canonicalKey,quotedKey,currencyKey,label)=>{
    const changed=body?.[canonicalKey]!==undefined&&Number(body[canonicalKey])!==Number(previous?.[canonicalKey]);
    const explicit=body?.[quotedKey]!==undefined||body?.[currencyKey]!==undefined;
    if(explicit){
      const quoted=Number(transaction[quotedKey]);
      const currency=String(transaction[currencyKey]||"CAD").trim().toUpperCase();
      if(!Number.isFinite(quoted)||quoted<=0||!/^[A-Z]{3}$/.test(currency))throw new Error(`بيانات ${label} الأصلي غير صحيحة`);
      transaction[quotedKey]=quoted;
      transaction[currencyKey]=currency;
    }else if(changed){
      transaction[quotedKey]=Number(transaction[canonicalKey]);
      transaction[currencyKey]="CAD";
    }
  };
  apply("costRate","costRateQuoted","costRateQuoteCurrency","سعر التكلفة");
  apply("finalRate","finalRateQuoted","finalRateQuoteCurrency","سعر العميل");
  return transaction;
}
module.exports={normalizeQuotedRateAudit};
