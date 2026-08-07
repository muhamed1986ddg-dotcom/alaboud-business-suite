import React,{useEffect,useMemo,useState}from"react";
import api,{cachedGet} from"../api";
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
  const [inventory,setInventory]=useState(null);
  const [inventoryDay,setInventoryDay]=useState(20);
  const [vaultCash,setVaultCash]=useState("");
  const [inventoryNotes,setInventoryNotes]=useState("");
  const [inventoryBusy,setInventoryBusy]=useState(false);
  const [inventoryNotice,setInventoryNotice]=useState("");

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


  async function loadInventory(){
    setInventoryBusy(true);setError("");
    try{const response=await cachedGet("/monthly-inventory");setInventory(response.data);setInventoryDay(response.data?.scheduleDay||20);}
    catch(requestError){setError(requestError.response?.data?.message||"تعذر تحميل الجرد الشهري");}
    finally{setInventoryBusy(false);}
  }
  async function saveInventoryDay(){
    setInventoryBusy(true);setError("");setInventoryNotice("");
    try{const response=await api.patch("/monthly-inventory/settings",{day:Number(inventoryDay)});setInventoryNotice(response.data?.message||"تم حفظ يوم الجرد");await loadInventory();}
    catch(requestError){setError(requestError.response?.data?.message||"تعذر حفظ يوم الجرد");}
    finally{setInventoryBusy(false);}
  }
  async function closeInventory(){
    if(vaultCash===""||!Number.isFinite(Number(vaultCash))||Number(vaultCash)<0){setError("أدخل قيمة الكاش في الخزنة أولًا");return;}
    if(!window.confirm("سيتم تثبيت أرقام الجرد لهذا الشهر ولن تتغير لاحقًا. هل تريد المتابعة؟"))return;
    setInventoryBusy(true);setError("");setInventoryNotice("");
    try{const response=await api.post("/monthly-inventory/close",{vaultCash:Number(vaultCash),notes:inventoryNotes});setInventoryNotice(response.data?.message||"تم تثبيت الجرد");setVaultCash("");setInventoryNotes("");await loadInventory();}
    catch(requestError){setError(requestError.response?.data?.message||"تعذر تثبيت الجرد الشهري");}
    finally{setInventoryBusy(false);}
  }

  useEffect(()=>{loadProfits();},[]);
  useEffect(()=>{if(activeTab==="monthly"&&!monthly)loadMonthly();if(activeTab==="inventory"&&!inventory)loadInventory();},[activeTab]);

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
      <AppButton variant={activeTab==="inventory"?"primary":"secondary"} onClick={()=>setActiveTab("inventory")}>📦 الجرد الشهري</AppButton>
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
        <AppCard className="profits-monthly-table-card" title="الأرباح الشهرية"><AppTable columns={monthlyColumns} rows={profits?.monthly||[]} rowKey="month" emptyText="لا توجد بيانات للفترة المحددة."/></AppCard>
        <div className="profits-mobile-cards">{(profits?.monthly||[]).length?(profits?.monthly||[]).map(row=><article className="transaction-mobile-card profit-mobile-card" key={`profit-mobile-${row.month}`}><header className="transaction-mobile-card__head"><div><strong>{row.month}</strong><small>الأرباح الشهرية</small></div></header><div className="transaction-mobile-card__grid"><div><span>الشهر</span><strong>{row.month}</strong></div><div><span>فرق السعر</span><strong>{money(row.exchangeProfit)}</strong></div><div><span>أجور الحوالات</span><strong>{money(row.transferFees)}</strong></div><div><span>إجمالي الربح</span><strong>{money(row.grossProfit)}</strong></div><div><span>المصروفات</span><strong>{money(row.expenses)}</strong></div><div className="transaction-mobile-card__total"><span>صافي الربح</span><strong className={Number(row.netProfit||0)<0?"value-negative":"value-positive"}>{money(row.netProfit)}</strong></div></div></article>):<div className="transaction-mobile-empty">لا توجد بيانات للفترة المحددة.</div>}</div>
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


    {activeTab==="inventory"&&<>
      {inventory?.alert&&<AppCard className={`inventory-alert inventory-alert--${String(inventory.alert.status||"").toLowerCase()}`} title="تنبيه الجرد الشهري">
        <div className="inventory-alert-line"><strong>{inventory.alert.message}</strong><span>اليوم المحدد: {inventory.alert.day} من كل شهر</span></div>
      </AppCard>}

      <AppCard className="no-print" title="موعد الجرد الشهري">
        <div className="ui-form-grid inventory-settings-grid">
          <AppInput label="يوم الجرد" type="number" min="1" max="28" value={inventoryDay} onChange={event=>setInventoryDay(event.target.value)}/>
          <AppButton variant="secondary" busy={inventoryBusy} onClick={saveInventoryDay}>حفظ يوم الجرد</AppButton>
        </div>
        <small>سيظهر تنبيه قبل الموعد بيوم، ويوم الجرد، وبعد التأخير حتى يتم تثبيت جرد الشهر.</small>
      </AppCard>

      {inventoryBusy&&!inventory?<AppLoader label="جاري تحميل الجرد..."/>:inventory&&<>
        <AppCard title={`جرد ${inventory.alert?.month||new Date().toISOString().slice(0,7)}`}>
          <div className="inventory-breakdown">
            <div><span>إجمالي النقد</span><strong>{money(inventory.current?.totalCash)}</strong></div>
            <div><span>+ أرصدة الشركات</span><strong>{money(inventory.current?.companyBalances)}</strong></div>
            <div><span>+ ديون العملاء لنا</span><strong>{money(inventory.current?.customerReceivable)}</strong></div>
            <div><span>+ ديون الشركات لنا</span><strong>{money(inventory.current?.companyReceivable)}</strong></div>
            <div><span>- الديون علينا</span><strong>{money(inventory.current?.debtsPayable)}</strong></div>
            <div className="inventory-vault-input"><span>+ الكاش في الخزنة</span><AppInput type="number" min="0" step="0.01" value={vaultCash} onChange={event=>setVaultCash(event.target.value)} placeholder="أدخل قيمة الكاش يدويًا"/></div>
            <div className="inventory-final"><span>= قيمة الجرد النهائية</span><strong>{money(Number(inventory.current?.finalValue||0)+Number(vaultCash||0))}</strong></div>
          </div>
          <div className="inventory-notes"><AppInput label="ملاحظات الجرد (اختياري)" value={inventoryNotes} onChange={event=>setInventoryNotes(event.target.value)} placeholder="أي ملاحظة على الكاش أو الجرد"/></div>
          {inventory.current?.missingRates?.length>0&&<p className="customer-error">ينقص سعر تحويل: {inventory.current.missingRates.join("، ")}</p>}
          <AppButton variant="primary" busy={inventoryBusy} disabled={inventory.alert?.status==="DONE"} onClick={closeInventory}>{inventory.alert?.status==="DONE"?"✅ تم تثبيت جرد هذا الشهر":"📌 تثبيت جرد الشهر"}</AppButton>
          {inventoryNotice&&<p className="customer-success">{inventoryNotice}</p>}
        </AppCard>

        <AppCard title="أرشيف الجرد الشهري">
          <div className="inventory-history">
            {(inventory.rows||[]).length?(inventory.rows||[]).map((row,index)=>{
              const previous=(inventory.rows||[])[index+1];
              const diff=previous?Number(row.finalValue||0)-Number(previous.finalValue||0):null;
              return <article className="transaction-mobile-card inventory-history-card" key={row.id||row.month}>
                <header className="transaction-mobile-card__head"><div><strong>{row.month}</strong><small>{row.inventoryDate||row.fixedAt?.slice?.(0,10)||""}</small></div><b>{money(row.finalValue)}</b></header>
                <div className="transaction-mobile-card__grid">
                  <div><span>إجمالي النقد</span><strong>{money(row.totalCash)}</strong></div><div><span>أرصدة الشركات</span><strong>{money(row.companyBalances)}</strong></div>
                  <div><span>ديون العملاء لنا</span><strong>{money(row.customerReceivable)}</strong></div><div><span>ديون الشركات لنا</span><strong>{money(row.companyReceivable)}</strong></div>
                  <div><span>الديون علينا</span><strong>{money(row.debtsPayable)}</strong></div><div><span>الكاش في الخزنة</span><strong>{money(row.vaultCash)}</strong></div>
                  {diff!==null&&<div className="transaction-mobile-card__total"><span>الفرق عن الشهر السابق</span><strong className={diff<0?"value-negative":"value-positive"}>{diff>=0?"+":""}{money(diff)}</strong></div>}
                </div>
                {row.notes&&<p className="inventory-row-notes">{row.notes}</p>}
              </article>;
            }):<div className="transaction-mobile-empty">لا يوجد جرد شهري مثبت حتى الآن.</div>}
          </div>
        </AppCard>
      </>}
    </>}

  </div>;
}

export {ReportsProfits};
