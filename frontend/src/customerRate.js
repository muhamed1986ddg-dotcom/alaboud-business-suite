export function authoritativeCustomerRate(transaction){
  const finalRate=Number(transaction?.finalRate);
  if(Number.isFinite(finalRate)&&finalRate>0)return finalRate;
  const customerRate=Number(transaction?.customerRate);
  if(Number.isFinite(customerRate)&&customerRate>0)return customerRate;
  const clientRate=Number(transaction?.clientRate);
  return Number.isFinite(clientRate)&&clientRate>0?clientRate:0;
}

export function latestCustomerRate(transactions=[]){
  return [...transactions]
    .map(transaction=>({transaction,rate:authoritativeCustomerRate(transaction)}))
    .filter(row=>row.rate>0)
    .sort((a,b)=>String(b.transaction?.transferDate||b.transaction?.createdAt||"").localeCompare(String(a.transaction?.transferDate||a.transaction?.createdAt||"")))[0]?.rate||0;
}
