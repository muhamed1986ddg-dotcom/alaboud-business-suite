const finite=value=>Number.isFinite(Number(value))?Number(value):0;

export function treasuryAverageCostRows(balances=[]){
  return (Array.isArray(balances)?balances:[]).map(row=>({
    currency:String(row?.currency||"").toUpperCase(),
    balance:finite(row?.balance),
    averageCost:finite(row?.averageCost)
  }));
}

export function treasuryRealizedSummary(period={}){
  return {
    profit:finite(period?.realizedProfit),
    loss:finite(period?.realizedLoss),
    net:finite(period?.realizedFx),
    currency:"CAD"
  };
}

export function formatTreasuryInventoryPeriod(period={}){
  const format=value=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||"")))return "";
    return new Intl.DateTimeFormat("ar",{day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(`${value}T00:00:00Z`));
  };
  const start=format(period.start??period.periodStart);
  const end=format(period.end??period.periodEnd);
  return start&&end?`${start} — ${end}`:"";
}
