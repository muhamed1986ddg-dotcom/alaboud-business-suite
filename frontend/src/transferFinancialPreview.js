function finite(value){
  const n=Number(value);
  return Number.isFinite(n)?n:0;
}

export function providerFeeRateCad(form={}){
  const transferCurrency=String(form.currency||"USD").toUpperCase();
  const feeCurrency=String(form.providerFeeCurrency||transferCurrency).toUpperCase();
  if(feeCurrency==="CAD")return 1;
  if(feeCurrency===transferCurrency)return Math.max(0,finite(form.costRate));
  return Math.max(0,finite(form.providerFeeRateCad));
}

export function transferFinancialPreview(form={}){
  const amount=Math.max(0,finite(form.amount));
  const costRate=Math.max(0,finite(form.costRate));
  const finalRate=Math.max(0,finite(form.finalRate));
  const feeMethod=String(form.feeMethod||"SPREAD").toUpperCase()==="PAID"?"PAID":"SPREAD";
  const customerFee=feeMethod==="PAID"?Math.max(0,finite(form.transferFee)):0;
  const exchangeProfit=amount*(finalRate-costRate);
  const providerFeeAmount=Math.max(0,finite(form.providerFeeAmount));
  const feeRate=providerFeeRateCad(form);
  const providerFeeCad=providerFeeAmount*feeRate;
  const grossProfitBeforeProviderFee=exchangeProfit+customerFee;
  const netProfit=grossProfitBeforeProviderFee-providerFeeCad;
  const totalCustomerDue=amount*finalRate+customerFee;
  return {
    exchangeProfit,
    customerFee,
    providerFeeAmount,
    providerFeeRateCad:feeRate,
    providerFeeCad,
    grossProfitBeforeProviderFee,
    netProfit,
    totalCustomerDue
  };
}
