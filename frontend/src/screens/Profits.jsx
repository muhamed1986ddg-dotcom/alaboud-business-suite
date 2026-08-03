import React,{useEffect,useRef,useState}from"react";
import api,{cachedGet} from"../api";
import {APP_VERSION} from"../version";
import {money,cad,openRegularWhatsApp,currencyFlag,flagOf,cleanConnectorMessage,EXCHANGE_CURRENCY_CATALOG,debtCurrencies,CurrencyFlag,rateTrend} from"../shared";

function Profits(){
  const [data,setData]=useState(null);
  const [filters,setFilters]=useState({from:"",to:""});
  const load=()=>cachedGet("/profits",{params:filters}).then(r=>setData(r.data));
  useEffect(()=>{load();},[]);
  if(!data)return <p>جاري تحميل الأرباح...</p>;
  return <>
    <h2>الأرباح</h2>
    <div className="card form">
      <input type="date" value={filters.from} onChange={e=>setFilters({...filters,from:e.target.value})}/>
      <input type="date" value={filters.to} onChange={e=>setFilters({...filters,to:e.target.value})}/>
      <button type="button" onClick={load}>عرض التقرير</button>
    </div>
    <div className="stats">
      <div className="card metric-card metric-count"><span>عدد الحوالات</span><strong>{data.transactionCount}</strong></div>
      <div className="card metric-card metric-profit"><span>ربح فرق السعر</span><strong>{money(data.exchangeProfit)}</strong></div>
      <div className="card metric-card metric-fees"><span>أجور الحوالات</span><strong>{money(data.transferFees)}</strong></div>
      <div className="card metric-card metric-total"><span>إجمالي الربح</span><strong>{money(data.grossProfit)}</strong></div>
      <div className="card metric-card metric-expense"><span>المصروفات</span><strong>{money(data.expenses)}</strong></div>
      <div className={`card final metric-card metric-net ${Number(data.netProfit||0)<0?"value-negative":"value-positive"}`}><span>صافي الربح</span><strong>{money(data.netProfit)}</strong></div>
    </div>
    <div className="card tablewrap">
      <h3>الأرباح الشهرية</h3>
      <table>
        <thead><tr><th>الشهر</th><th>فرق السعر</th><th>أجور الحوالات</th><th>إجمالي الربح</th><th>المصروفات</th><th>صافي الربح</th></tr></thead>
        <tbody>{data.monthly.map(x=><tr key={x.month}>
          <td>{x.month}</td>
          <td>{money(x.exchangeProfit)}</td>
          <td>{money(x.transferFees)}</td>
          <td>{money(x.grossProfit)}</td>
          <td>{money(x.expenses)}</td>
          <td className={`table-total-value ${Number(x.netProfit||0)<0?"value-negative":"value-positive"}`}><b>{money(x.netProfit)}</b></td>
        </tr>)}</tbody>
      </table>
    </div>
  </>;
}

export { Profits };
