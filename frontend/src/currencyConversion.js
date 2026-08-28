function rateTimestamp(rate={}){
  return String(rate.effectiveAt||rate.sourceDate||rate.updatedAt||rate.createdAt||"");
}

function usableRate(rate={}){
  const sell=Number(rate.sellRate);
  if(Number.isFinite(sell)&&sell>0)return sell;
  const buy=Number(rate.buyRate);
  return Number.isFinite(buy)&&buy>0?buy:0;
}

export function latestCurrencyGraph(rows=[]){
  const latest=new Map();
  for(const rate of Array.from(rows||[]).filter(Boolean).sort((a,b)=>rateTimestamp(b).localeCompare(rateTimestamp(a)))){
    const base=String(rate.baseCurrency||"").trim().toUpperCase();
    const quote=String(rate.quoteCurrency||"").trim().toUpperCase();
    if(!base||!quote||base===quote)continue;
    const key=`${base}_${quote}`;
    if(!latest.has(key))latest.set(key,rate);
  }
  const graph=new Map();
  const add=(from,to,factor,updatedAt,source)=>{
    if(!Number.isFinite(factor)||factor<=0)return;
    if(!graph.has(from))graph.set(from,[]);
    graph.get(from).push({to,factor,updatedAt,source});
  };
  for(const rate of latest.values()){
    const base=String(rate.baseCurrency||"").trim().toUpperCase();
    const quote=String(rate.quoteCurrency||"").trim().toUpperCase();
    const factor=usableRate(rate);
    if(factor<=0)continue;
    const updatedAt=rateTimestamp(rate)||null;
    const source=rate.source||rate.rateSource||null;
    add(base,quote,factor,updatedAt,source);
    add(quote,base,1/factor,updatedAt,source);
  }
  return graph;
}

export function resolveCurrencyConversion(rows,fromCurrency,toCurrency="CAD"){
  const from=String(fromCurrency||"CAD").trim().toUpperCase();
  const to=String(toCurrency||"CAD").trim().toUpperCase();
  if(from===to)return {factor:1,path:[from],updatedAt:null,source:"IDENTITY"};
  const graph=latestCurrencyGraph(rows);
  const queue=[{currency:from,factor:1,path:[from],updatedAt:null,sources:[]}];
  const seen=new Set([from]);
  while(queue.length){
    const current=queue.shift();
    for(const edge of graph.get(current.currency)||[]){
      if(seen.has(edge.to))continue;
      const next={
        currency:edge.to,
        factor:current.factor*edge.factor,
        path:[...current.path,edge.to],
        updatedAt:edge.updatedAt||current.updatedAt,
        sources:[...current.sources,edge.source].filter(Boolean)
      };
      if(edge.to===to)return {factor:next.factor,path:next.path,updatedAt:next.updatedAt,source:next.sources.join(" → ")||null};
      seen.add(edge.to);
      queue.push(next);
    }
  }
  return null;
}

export function cadPerCurrency(rows,currency){
  return Number(resolveCurrencyConversion(rows,currency,"CAD")?.factor||0);
}

export function quotedRateFromCanonical(rows,canonicalCadRate,quoteCurrency){
  const canonical=Number(canonicalCadRate||0);
  const cadPerQuote=cadPerCurrency(rows,quoteCurrency);
  return canonical>0&&cadPerQuote>0?canonical/cadPerQuote:0;
}
