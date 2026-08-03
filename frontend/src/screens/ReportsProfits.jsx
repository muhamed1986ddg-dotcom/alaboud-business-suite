import React,{useEffect,useState}from"react";
import {cachedGet} from"../api";
import {money} from"../shared";

function ReportsProfits(){
  const [activeTab,setActiveTab]=useState("summary");
  const [month,setMonth]=useState(new Date().toISOString().slice(0,7));
  const [filters,setFilters]=useState({from:"",to:""});
  const [profits,setProfits]=useState(null);
  const [monthly,setMonthly]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");

  async function loadProfits(){
    setLoading(true);setError("");
    try{
      const response=await cachedGet("/profits",{params:filters});
      setProfits(response.data);
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر تحميل تقرير الأرباح");
    }finally{setLoading(false);}
  }

  async function loadMonthly(){
    setLoading(true);setError("");
    try{
      const response=await cachedGet("/monthly-report",{params:{month}});
      setMonthly(response.data);
    }catch(requestError){
      setError(requestError.response?.data?.message||"تعذر تحميل التقرير الشهري");
    }finally{setLoading(false);}
  }

  useEffect(()=>{loadProfits();},[]);
  useEffect(()=>{if(activeTab==="monthly"&&!monthly)loadMonthly();},[activeTab]);

  const summary=monthly?.summary;
  const totalProfit=profits?.grossProfit??summary?.grossProfit??0;
  const expenses=profits?.expenses??summary?.expenses??0;
  const netProfit=profits?.netProfit??summary?.netProfit??0;
  const transferFees=profits?.transferFees??summary?.feesTotal??0;
  const exchangeProfit=profits?.exchangeProfit??summary?.exchangeProfit??0;
  const transactionCount=profits?.transactionCount??summary?.transferCount??0;

  return <>
    <div className="page-title-row">
      <div>
        <h2>📊 التقارير والأرباح</h2>
        <p>ملخص مالي وتقارير شهرية دون تكرار تفاصيل العملاء أو الحوالات.</p>
      </div>
      <button className="no-print" onClick={()=>window.print()}>طباعة / حفظ PDF</button>
    </div>

    <div className="card unified-page-tabs no-print">
      <button className={activeTab==="summary"?"active":""} onClick={()=>setActiveTab("summary")}>📈 ملخص الأرباح</button>
      <button className={activeTab==="monthly"?"active":""} onClick={()=>setActiveTab("monthly")}>📅 التقرير الشهري</button>
    </div>

    {error&&<div className="card customer-error">{error}</div>}

    {activeTab==="summary"&&<>
      <div className="card form no-print">
        <label>من</label>
        <input type="date" value={filters.from} onChange={e=>setFilters({...filters,from:e.target.value})}/>
        <label>إلى</label>
        <input type="date" value={filters.to} onChange={e=>setFilters({...filters,to:e.target.value})}/>
        <button type="button" onClick={loadProfits}>عرض التقرير</button>
      </div>

      {loading&&!profits?<p>جاري تحميل الأرباح...</p>:<>
        <div className="stats">
          <div className="card metric-card metric-count"><span>عدد الحوالات</span><strong>{transactionCount}</strong></div>
          <div className="card metric-card metric-profit"><span>ربح فرق السعر</span><strong>{money(exchangeProfit)}</strong></div>
          <div className="card metric-card metric-fees"><span>أجور الحوالات</span><strong>{money(transferFees)}</strong></div>
          <div className="card metric-card metric-total"><span>إجمالي الربح</span><strong>{money(totalProfit)}</strong></div>
          <div className="card metric-card metric-expense"><span>المصروفات</span><strong>{money(expenses)}</strong></div>
          <div className={`card final metric-card metric-net ${Number(netProfit||0)<0?"value-negative":"value-positive"}`}><span>صافي الربح</span><strong>{money(netProfit)}</strong></div>
        </div>

        <div className="card tablewrap">
          <h3>الأرباح الشهرية</h3>
          <table>
            <thead><tr><th>الشهر</th><th>فرق السعر</th><th>أجور الحوالات</th><th>إجمالي الربح</th><th>المصروفات</th><th>صافي الربح</th></tr></thead>
            <tbody>{profits?.monthly?.length?profits.monthly.map(x=><tr key={x.month}>
              <td>{x.month}</td>
              <td>{money(x.exchangeProfit)}</td>
              <td>{money(x.transferFees)}</td>
              <td>{money(x.grossProfit)}</td>
              <td>{money(x.expenses)}</td>
              <td className={`table-total-value ${Number(x.netProfit||0)<0?"value-negative":"value-positive"}`}><b>{money(x.netProfit)}</b></td>
            </tr>):<tr><td colSpan="6">لا توجد بيانات للفترة المحددة.</td></tr>}</tbody>
          </table>
        </div>
      </>}
    </>}

    {activeTab==="monthly"&&<>
      <div className="card form no-print">
        <label>الشهر</label>
        <input type="month" value={month} onChange={e=>setMonth(e.target.value)}/>
        <button onClick={loadMonthly}>عرض التقرير</button>
      </div>

      {loading&&!monthly?<p>جاري تحميل التقرير...</p>:monthly&&<>
        <div className="stats">
          <div className="card transfer-total-card"><span>إجمالي الحوالات</span><strong>{money(summary.transferTotal)}</strong></div>
          <div className="card"><span>عدد الحوالات</span><strong>{summary.transferCount}</strong></div>
          <div className="card"><span>متوسط الحوالة</span><strong>{money(summary.averageTransfer)}</strong></div>
          <div className="card"><span>أكبر حوالة</span><strong>{money(summary.largestTransfer)}</strong></div>
          <div className="card"><span>أصغر حوالة</span><strong>{money(summary.smallestTransfer)}</strong></div>
        </div>

        <div className="stats">
          <div className="card"><span>أجور الحوالات</span><strong>{money(summary.feesTotal)}</strong></div>
          <div className="card"><span>ربح فرق السعر</span><strong>{money(summary.exchangeProfit)}</strong></div>
          <div className="card"><span>إجمالي الربح</span><strong>{money(summary.grossProfit)}</strong></div>
          <div className="card payable-card"><span>المصروفات</span><strong>{money(summary.expenses)}</strong></div>
          <div className={`card final metric-card metric-net ${Number(summary.netProfit||0)<0?"value-negative":"value-positive"}`}><span>صافي الربح</span><strong>{money(summary.netProfit)}</strong></div>
        </div>

        <div className="stats">
          <div className="card"><span>الدفعات المستلمة</span><strong>{money(summary.paymentsReceived)}</strong></div>
          <div className="card receivable-card"><span>إضافات رأس المال</span><strong>{money(summary.capitalIn)}</strong></div>
          <div className="card payable-card"><span>سحوبات رأس المال</span><strong>{money(summary.capitalOut)}</strong></div>
          <div className="card"><span>صافي حركة رأس المال</span><strong>{money(summary.netCapitalMovement)}</strong></div>
        </div>

        <div className="card tablewrap">
          <h3>الحركة اليومية خلال الشهر</h3>
          <table>
            <thead><tr><th>التاريخ</th><th>عدد الحوالات</th><th>قيمة الحوالات</th><th>الربح</th></tr></thead>
            <tbody>{monthly.daily?.length?monthly.daily.map(row=><tr key={row.date}>
              <td>{row.date}</td><td>{row.count}</td><td>{money(row.total)}</td><td>{money(row.profit)}</td>
            </tr>):<tr><td colSpan="4">لا توجد حوالات في هذا الشهر.</td></tr>}</tbody>
          </table>
        </div>
      </>}
    </>}
  </>;
}

export {ReportsProfits};
