import React,{useEffect,useRef,useState}from"react";
import api,{cachedGet} from"../api";
import {APP_VERSION} from"../version";
import {money,cad,openRegularWhatsApp,currencyFlag,flagOf,cleanConnectorMessage,EXCHANGE_CURRENCY_CATALOG,debtCurrencies,CurrencyFlag,rateTrend} from"../shared";
import AppTable from"../components/ui/AppTable";

function MonthlyReport(){
  const [month,setMonth]=useState(new Date().toISOString().slice(0,7));
  const [data,setData]=useState(null);
  const [error,setError]=useState("");

  async function load(){
    setError("");
    try{
      const response=await cachedGet("/monthly-report",{params:{month}});
      setData(response.data);
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر تحميل التقرير الشهري");
    }
  }

  useEffect(()=>{load();},[month]);

  if(!data)return <><h2>التقرير الشهري</h2>{error?<div className="card customer-error">{error}</div>:<p>جاري التحميل...</p>}</>;

  const s=data.summary;

  return <>
    <div className="page-title-row">
      <h2>التقرير الشهري — {data.month}</h2>
      <button className="no-print" onClick={()=>window.print()}>طباعة / حفظ PDF</button>
    </div>

    <div className="card form no-print">
      <label>الشهر</label>
      <input type="month" value={month} onChange={e=>setMonth(e.target.value)}/>
      <button onClick={load}>عرض التقرير</button>
    </div>

    {error&&<div className="card customer-error">{error}</div>}

    <div className="stats">
      <div className="card transfer-total-card"><span>إجمالي الحوالات</span><strong>{money(s.transferTotal)}</strong></div>
      <div className="card"><span>عدد الحوالات</span><strong>{s.transferCount}</strong></div>
      <div className="card"><span>متوسط الحوالة</span><strong>{money(s.averageTransfer)}</strong></div>
      <div className="card"><span>أكبر حوالة</span><strong>{money(s.largestTransfer)}</strong></div>
      <div className="card"><span>أصغر حوالة</span><strong>{money(s.smallestTransfer)}</strong></div>
    </div>

    <div className="stats">
      <div className="card"><span>أجور الحوالات</span><strong>{money(s.feesTotal)}</strong></div>
      <div className="card"><span>إجمالي الربح</span><strong>{money(s.grossProfit)}</strong></div>
      <div className="card payable-card"><span>المصروفات</span><strong>{money(s.expenses)}</strong></div>
      <div className={`card final metric-card metric-net ${Number(s.netProfit||0)<0?"value-negative":"value-positive"}`}><span>صافي الربح</span><strong>{money(s.netProfit)}</strong></div>
    </div>

    <div className="stats">
      <div className="card"><span>الدفعات المستلمة</span><strong>{money(s.paymentsReceived)}</strong></div>
      <div className="card receivable-card"><span>إضافات رأس المال</span><strong>{money(s.capitalIn)}</strong></div>
      <div className="card payable-card"><span>سحوبات رأس المال</span><strong>{money(s.capitalOut)}</strong></div>
      <div className="card"><span>صافي حركة رأس المال</span><strong>{money(s.netCapitalMovement)}</strong></div>
    </div>

    <div className="card">
      <h3>الحركة اليومية خلال الشهر</h3>
      <AppTable
        rows={data.daily}
        rowKey="date"
        emptyText="لا توجد حوالات في هذا الشهر."
        columns={[
          {key:"date",label:"التاريخ"},
          {key:"count",label:"عدد الحوالات"},
          {key:"total",label:"قيمة الحوالات",render:row=>money(row.total)},
          {key:"profit",label:"الربح",render:row=>money(row.profit)},
        ]}
      />
    </div>

    <div className="card">
      <h3>أكثر العملاء تعاملًا خلال الشهر</h3>
      <AppTable
        rows={data.topCustomers}
        rowKey="customerId"
        emptyText="لا توجد بيانات."
        columns={[
          {key:"customerName",label:"العميل"},
          {key:"total",label:"إجمالي الحوالات",render:row=>money(row.total)},
        ]}
      />
    </div>

    <div className="card">
      <h3>تفاصيل حوالات الشهر</h3>
      <AppTable
        rows={data.transactions}
        rowKey="id"
        emptyText="لا توجد حوالات."
        columns={[
          {key:"number",label:"الرقم",render:item=>item.number||item.id},
          {key:"date",label:"التاريخ",render:item=>item.transferDate||String(item.createdAt||"").slice(0,10)},
          {key:"amount",label:"المبلغ",render:item=>money(item.amount)},
          {key:"transferFee",label:"أجور الحوالة",render:item=>money(item.transferFee)},
          {key:"totalProfit",label:"الربح",render:item=>money(item.totalProfit)},
        ]}
      />
    </div>
  </>;
}

export { MonthlyReport };
