export function authoritativeCustomerRate(transaction){
  const finalRate=Number(transaction?.finalRate);
  if(Number.isFinite(finalRate)&&finalRate>0)return finalRate;
  const customerRate=Number(transaction?.customerRate);
  if(Number.isFinite(customerRate)&&customerRate>0)return customerRate;
  const clientRate=Number(transaction?.clientRate);
  return Number.isFinite(clientRate)&&clientRate>0?clientRate:0;
}
