export function addVaultCurrency(balances={},currency=""){
  const code=String(currency||"").trim().toUpperCase();
  if(!/^[A-Z]{3}$/.test(code)||Object.prototype.hasOwnProperty.call(balances,code))return balances;
  return {...balances,[code]:""};
}

export function removeVaultCurrency(balances={},currency=""){
  const code=String(currency||"").trim().toUpperCase();
  if(!Object.prototype.hasOwnProperty.call(balances,code))return balances;
  const next={...balances};
  delete next[code];
  return next;
}

export function availableVaultCurrencies(supported=[],balances={}){
  return [...new Set(supported.map(code=>String(code||"").trim().toUpperCase()).filter(code=>/^[A-Z]{3}$/.test(code)))]
    .filter(code=>!Object.prototype.hasOwnProperty.call(balances,code));
}

export function savedVaultCurrencies(vaultCashByCurrency={}){
  if(!vaultCashByCurrency||typeof vaultCashByCurrency!=="object"||Array.isArray(vaultCashByCurrency))return [];
  return Object.entries(vaultCashByCurrency)
    .filter(([code])=>/^[A-Z]{3}$/.test(String(code||"").toUpperCase()))
    .map(([currency,amount])=>({currency:String(currency).toUpperCase(),amount:Number(amount||0)}));
}

export function buildVaultCashRows(balances={},exchangeRates={}){
  return Object.keys(balances).map(currency=>{
    const amount=Number(balances[currency]||0);
    const rate=currency==="CAD"?{factor:1,convertedCad:amount}:exchangeRates?.[currency];
    const factor=Number(rate?.factor);
    const convertedCad=amount===0?0:(Number.isFinite(factor)&&factor>0?Math.round(amount*factor*100)/100:null);
    return {currency,amount,rate,convertedCad};
  });
}

export function vaultCashCadTotal(rows=[]){
  return Math.round(rows.reduce((sum,row)=>sum+(row.convertedCad===null?0:Number(row.convertedCad||0)),0)*100)/100;
}
