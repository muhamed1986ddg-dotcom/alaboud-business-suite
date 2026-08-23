const finite=value=>Number.isFinite(Number(value))?Number(value):0;

export function treasuryAverageCostRows(balances=[]){
  return (Array.isArray(balances)?balances:[]).map(row=>({
    currency:String(row?.currency||"").toUpperCase(),
    balance:finite(row?.balance),
    averageCost:finite(row?.averageCost)
  }));
}

export function treasuryRealizedSummary(balances=[]){
  return (Array.isArray(balances)?balances:[]).reduce((summary,row)=>{
    const profit=finite(row?.realizedProfit);
    const loss=finite(row?.realizedLoss);
    const storedNet=Number(row?.realizedFx);
    summary.profit+=profit;
    summary.loss+=loss;
    summary.net+=Number.isFinite(storedNet)?storedNet:profit-loss;
    return summary;
  },{profit:0,loss:0,net:0,currency:"CAD"});
}
