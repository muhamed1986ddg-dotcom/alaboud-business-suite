import React,{useEffect,useMemo,useState}from"react";
import {cachedGet} from"../api";
import {money} from"../shared";
import {AppButton,AppCard,AppInput,AppLoader,AppStatCard,AppTable,AppToolbar} from"../components/ui";

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
    try{const response=await cachedGet("/profits",{params:filters});setProfits(response.data);}
    catch(requestError){setError(requestError.response?.data?.message||"تعذر تحميل تقرير الأرباح");}
    finally{setLoading(false);}
  }
  async function loadMonthly(){
    setLoading(true);setError("");
    try{const response=await cachedGet("/monthly-report",{params:{month}});setMonthly(response.data);}
    catch(requestError){setError(requestError.response?.data?.message||"تعذر تحميل التقرير الشهري");}
    finally{setLoading(false);}
  }

  useEffect(()=>{loadProfits();},[]);
  useEffect(()=>{if(activeTab==="monthly"&&!monthly)loadMonthly();},[activeTab]);

  const summary=monthly?.summary||{};
  const overview={
    transactionCount:profits?.transactionCount??summary.transferCount??0,
    exchangeProfit:profits?.exchangeProfit??summary.exchangeProfit??0,
    transferFees:profits?.transferFees??summary.feesTotal??0,
    grossProfit:profits?.grossProfit??summary.grossProfit??0,
    expenses:profits?.expenses??summary.expenses??0,
    netProfit:profits?.netProfit??summary.netProfit??0,
  };

  const monthlyColumns=useMemo(()=>[
    {key:"month",label:"الشهر"},
    {key:"exchangeProfit",label:"فرق السعر",render:row=>money(row.exchangeProfit)},
    {key:"transferFees",label:"أجور الحوالات",render:row=>money(row.transferFees)},
    {key:"grossProfit",label:"إجمالي الربح",render:row=>money(row.grossProfit)},
    {key:"expenses",label:"المصروفات",render:row=>money(row.expenses)},
    {key:"netProfit",label:"صافي الربح",render:row=><strong className={Number(row.netProfit||0)<0?"value-negative":"value-positive"}>{money(row.netProfit)}</strong>},
  ],[]);
  const dailyColumns=useMemo(()=>[
    {key:"date",label:"التاريخ"},
    {key:"count",label:"عدد الحوالات"},
    {key:"total",label:"قيمة الحوالات",render:row=>money(row.total)},
    {key:"profit",label:"الربح",render:row=>money(row.profit)},
  ],[]);

  return <div className="ui-page-stack">
    <div className="page-title-row">
      <div><h2>📊 التقارير والأرباح</h2><p>ملخص مالي وتقارير شهرية دون تكرار تفاصيل العملاء أو الحوالات.</p></div>
      <AppButton className="no-print" onClick={()=>window.print()}>طباعة / حفظ PDF</AppButton>
    </div>

    <AppToolbar className="no-print" actions={<AppButton onClick={()=>window.print()}>🖨️ طباعة</AppButton>}>
      <AppButton variant={activeTab==="summary"?"primary":"secondary"} onClick={()=>setActiveTab("summary")}>📈 ملخص الأرباح</AppButton>
      <AppButton variant={activeTab==="monthly"?"primary":"secondary"} onClick={()=>setActiveTab("monthly")}>📅 التقرير الشهري</AppButton>
    </AppToolbar>

    {error&&<AppCard className="customer-error">{error}</AppCard>}

    {activeTab==="summary"&&<>
      <AppCard className="no-print" title="تصفية تقرير الأرباح">
        <div className="ui-form-grid">
          <AppInput label="من" type="date" value={filters.from} onChange={event=>setFilters({...filters,from:event.target.value})}/>
          <AppInput label="إلى" type="date" value={filters.to} onChange={event=>setFilters({...filters,to:event.target.value})}/>
          <AppButton variant="primary" busy={loading} onClick={loadProfits}>عرض التقرير</AppButton>
        </div>
      </AppCard>

      {loading&&!profits?<AppLoader label="جاري تحميل الأرباح..."/>:<>
        <div className="ui-stat-grid">
          <AppStatCard label="عدد الحوالات" value={overview.transactionCount} tone="info"/>
          <AppStatCard label="ربح فرق السعر" value={money(overview.exchangeProfit)} tone="success"/>
          <AppStatCard label="أجور الحوالات" value={money(overview.transferFees)} tone="info"/>
          <AppStatCard label="إجمالي الربح" value={money(overview.grossProfit)} tone="success"/>
          <AppStatCard label="المصروفات" value={money(overview.expenses)} tone="danger"/>
          <AppStatCard label="صافي الربح" value={money(overview.netProfit)} tone={Number(overview.netProfit)<0?"danger":"success"}/>
        </div>
        <AppCard title="الأرباح الشهرية"><AppTable columns={monthlyColumns} rows={profits?.monthly||[]} rowKey="month" emptyText="لا توجد بيانات للفترة المحددة."/></AppCard>
      </>}
    </>}

    {activeTab==="monthly"&&<>
      <AppCard className="no-print" title="اختيار الشهر">
        <div className="ui-form-grid">
          <AppInput label="الشهر" type="month" value={month} onChange={event=>setMonth(event.target.value)}/>
          <AppButton variant="primary" busy={loading} onClick={loadMonthly}>عرض التقرير</AppButton>
        </div>
      </AppCard>

      {loading&&!monthly?<AppLoader label="جاري تحميل التقرير..."/>:monthly&&<>
        <div className="ui-stat-grid">
          <AppStatCard label="إجمالي الحوالات" value={money(summary.transferTotal)}/>
          <AppStatCard label="عدد الحوالات" value={summary.transferCount||0} tone="info"/>
          <AppStatCard label="متوسط الحوالة" value={money(summary.averageTransfer)}/>
          <AppStatCard label="أكبر حوالة" value={money(summary.largestTransfer)} tone="success"/>
          <AppStatCard label="أصغر حوالة" value={money(summary.smallestTransfer)}/>
          <AppStatCard label="أجور الحوالات" value={money(summary.feesTotal)} tone="info"/>
          <AppStatCard label="ربح فرق السعر" value={money(summary.exchangeProfit)} tone="success"/>
          <AppStatCard label="إجمالي الربح" value={money(summary.grossProfit)} tone="success"/>
          <AppStatCard label="المصروفات" value={money(summary.expenses)} tone="danger"/>
          <AppStatCard label="صافي الربح" value={money(summary.netProfit)} tone={Number(summary.netProfit||0)<0?"danger":"success"}/>
          <AppStatCard label="الدفعات المستلمة" value={money(summary.paymentsReceived)}/>
          <AppStatCard label="إضافات رأس المال" value={money(summary.capitalIn)} tone="success"/>
          <AppStatCard label="سحوبات رأس المال" value={money(summary.capitalOut)} tone="danger"/>
          <AppStatCard label="صافي حركة رأس المال" value={money(summary.netCapitalMovement)}/>
        </div>
        <AppCard title="الحركة اليومية خلال الشهر"><AppTable columns={dailyColumns} rows={monthly.daily||[]} rowKey="date" emptyText="لا توجد حوالات في هذا الشهر."/></AppCard>
      </>}
    </>}
  </div>;
}

export {ReportsProfits};
