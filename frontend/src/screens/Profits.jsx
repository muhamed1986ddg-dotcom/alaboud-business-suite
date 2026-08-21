import React,{useEffect,useRef,useState}from"react";
import api,{cachedGet} from"../api";
import {APP_VERSION} from"../version";
import {money,cad,openRegularWhatsApp,currencyFlag,flagOf,cleanConnectorMessage,EXCHANGE_CURRENCY_CATALOG,debtCurrencies,CurrencyFlag,rateTrend} from"../shared";
import AppTable from"../components/ui/AppTable";

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
      <div className="card metric-card metric-fees"><span>ربح فرق السعر</span><strong>{money(data.exchangeProfit)}</strong></div>
      <div className="card metric-card metric-fees"><span>أجور العميل</span><strong>{money(data.customerFees)}</strong></div>
      <div className="card metric-card metric-expense"><span>أجور دهب/جاد والشركات</span><strong>{money(data.providerFees)}</strong></div>
      <div className="card metric-card metric-total"><span>ربح الحوالات بعد الأجور</span><strong>{money(data.grossProfit)}</strong></div>
      <div className="card metric-card metric-expense"><span>المصروفات العامة</span><strong>{money(data.expenses)}</strong></div>
      <div className={`card final metric-card metric-net ${Number(data.netProfit||0)<0?"value-negative":"value-positive"}`}><span>صافي الربح</span><strong>{money(data.netProfit)}</strong></div>
    </div>
    <div className="card">
      <h3>الأرباح الشهرية</h3>
      <AppTable
        rows={data.monthly}
        rowKey="month"
        emptyText="لا توجد بيانات أرباح ضمن الفترة المحددة."
        columns={[
          {key:"month",label:"الشهر"},
          {key:"exchangeProfit",label:"ربح فرق السعر",render:row=>money(row.exchangeProfit)},
          {key:"customerFees",label:"أجور العميل",render:row=>money(row.customerFees)},
          {key:"providerFees",label:"أجور الشركات",render:row=>money(row.providerFees)},
          {key:"grossProfit",label:"ربح الحوالات بعد الأجور",render:row=>money(row.grossProfit)},
          {key:"expenses",label:"المصروفات العامة",render:row=>money(row.expenses)},
          {key:"netProfit",label:"صافي الربح",render:row=><b className={`table-total-value ${Number(row.netProfit||0)<0?"value-negative":"value-positive"}`}>{money(row.netProfit)}</b>},
        ]}
      />
    </div>
  </>;
}

export { Profits };
