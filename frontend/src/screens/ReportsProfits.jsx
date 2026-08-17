import React,{useEffect,useMemo,useState}from"react";
import api,{cachedGet} from"../api";
import {money,confirmAction} from"../shared";
import {AppButton,AppCard,AppInput,AppLoader,AppModal,AppStatCard,AppTable,AppToolbar} from"../components/ui";

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
  const [usdInventoryOpen,setUsdInventoryOpen]=useState(false);
  const [usdCadRate,setUsdCadRate]=useState(null);

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
    try{const response=await api.get("/monthly-inventory");setInventory(response.data);setInventoryDay(response.data?.scheduleDay||20);}
    catch(requestError){setError(requestError.response?.data?.message||"تعذر تحميل الجرد الشهري");}
    finally{setInventoryBusy(false);}
  }
  async function loadUsdCadRate(){
    try{
      const response=await cachedGet("/exchange-rates");
      const rows=Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data?.rows)
          ? response.data.rows
          : Array.isArray(response.data?.data)
            ? response.data.data
            : [];

      const rateRow=rows
        .filter(row=>String(row.baseCurrency||"").toUpperCase()==="USD"&&String(row.quoteCurrency||"").toUpperCase()==="CAD")
        .sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")))[0];

      const rate=Number(rateRow?.sellRate||rateRow?.buyRate||0);
      setUsdCadRate(Number.isFinite(rate)&&rate>0?rate:null);
    }catch{
      setUsdCadRate(null);
    }
  }

  async function saveInventoryDay(){
    setInventoryBusy(true);setError("");setInventoryNotice("");
    try{const response=await api.patch("/monthly-inventory/settings",{day:Number(inventoryDay)});setInventoryNotice(response.data?.message||"تم حفظ يوم الجرد");await loadInventory();}
    catch(requestError){setError(requestError.response?.data?.message||"تعذر حفظ يوم الجرد");}
    finally{setInventoryBusy(false);}
  }
  async function closeInventory(){
    if(vaultCash===""||!Number.isFinite(Number(vaultCash))||Number(vaultCash)<0){setError("أدخل قيمة الكاش في الخزنة أولًا");return;}
    if(!await confirmAction({title:"تأكيد إغلاق الجرد",message:"سيتم تثبيت أرقام الجرد لهذا الشهر ولن تتغير لاحقًا. هل تريد المتابعة؟",confirmText:"تثبيت الجرد",tone:"warning"}))return;
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
  const inventoryCurrent=inventory?.current||{};
  const enteredVaultCash=Number.isFinite(Number(vaultCash))?Math.max(0,Number(vaultCash)):0;
  const previewTotalAssets=(
    Number(inventoryCurrent.partnerAssets||0)
    + Number(inventoryCurrent.customerReceivables||0)
    + Number(inventoryCurrent.companyReceivables||0)
    + Number(inventoryCurrent.manualReceivables||0)
    + enteredVaultCash
  );
  const previewTotalLiabilities=(
    Number(inventoryCurrent.customerPayables||0)
    + Number(inventoryCurrent.companyPayables||0)
    + Number(inventoryCurrent.manualPayables||0)
  );
  const previewFinalValue=previewTotalAssets-previewTotalLiabilities;
  const previewInventoryDifference=previewFinalValue-Number(inventoryCurrent.netCapital||0);
  const previewFinalValueUsd=
    Number.isFinite(Number(usdCadRate))&&Number(usdCadRate)>0
      ? previewFinalValue/Number(usdCadRate)
      : null;

  const monthlyColumns=useMemo(()=>[
    {key:"month",label:"الشهر"},
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
          <AppStatCard label="أجور الحوالات" value={money(overview.transferFees)} tone="success"/>
          <AppStatCard label="إجمالي الربح" value={money(overview.grossProfit)} tone="success"/>
          <AppStatCard label="المصروفات" value={money(overview.expenses)} tone="danger"/>
          <AppStatCard label="صافي الربح" value={money(overview.netProfit)} tone={Number(overview.netProfit)<0?"danger":"success"}/>
        </div>
        <AppCard className="profits-monthly-table-card" title="الأرباح الشهرية"><AppTable columns={monthlyColumns} rows={profits?.monthly||[]} rowKey="month" emptyText="لا توجد بيانات للفترة المحددة."/></AppCard>
        <div className="profits-mobile-cards">{(profits?.monthly||[]).length?(profits?.monthly||[]).map(row=><article className="transaction-mobile-card profit-mobile-card" key={`profit-mobile-${row.month}`}><header className="transaction-mobile-card__head"><div><strong>{row.month}</strong><small>الأرباح الشهرية</small></div></header><div className="transaction-mobile-card__grid"><div><span>الشهر</span><strong>{row.month}</strong></div><div><span>أجور الحوالات</span><strong>{money(row.transferFees)}</strong></div><div><span>إجمالي الربح</span><strong>{money(row.grossProfit)}</strong></div><div><span>المصروفات</span><strong>{money(row.expenses)}</strong></div><div className="transaction-mobile-card__total"><span>صافي الربح</span><strong className={Number(row.netProfit||0)<0?"value-negative":"value-positive"}>{money(row.netProfit)}</strong></div></div></article>):<div className="transaction-mobile-empty">لا توجد بيانات للفترة المحددة.</div>}</div>
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
          <AppStatCard label="أجور الحوالات" value={money(summary.feesTotal)} tone="success"/>
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
        <div className="inventory-refresh-row"><span>يقارن الجرد صافي الأصول الفعلية بحقوق الملكية، ويعرض فرق المطابقة دون دمجه تلقائيًا.</span><AppButton variant="secondary" busy={inventoryBusy} onClick={loadInventory}>↻ تحديث الجرد</AppButton></div>
        <div className="ui-form-grid inventory-settings-grid">
          <AppInput label="يوم الجرد" type="number" min="1" max="28" value={inventoryDay} onChange={event=>setInventoryDay(event.target.value)}/>
          <AppButton variant="secondary" busy={inventoryBusy} onClick={saveInventoryDay}>حفظ يوم الجرد</AppButton>
        </div>
        <small>سيظهر تنبيه قبل الموعد بيوم، ويوم الجرد، وبعد التأخير حتى يتم تثبيت جرد الشهر.</small>
      </AppCard>

      {inventoryBusy&&!inventory?<AppLoader label="جاري تحميل الجرد..."/>:!inventory?<AppCard className="customer-error"><strong>تعذر عرض الجرد الشهري.</strong><AppButton variant="secondary" onClick={loadInventory}>إعادة المحاولة</AppButton></AppCard>:<>
        <AppCard title={`جرد ${inventory.alert?.month||new Date().toISOString().slice(0,7)}`}>
          <div className="inventory-breakdown inventory-breakdown--simple">
            <div className="inventory-net-capital"><span>💎 صافي رأس المال — حقوق الملكية</span><strong>{money(inventoryCurrent.netCapital)} CAD</strong></div>
            <div><span>🏦 أرصدة الشركاء الخارجية</span><strong>{money(inventoryCurrent.partnerAssets)} CAD</strong></div>
            <div><span>👤 ذمم العملاء لنا</span><strong>{money(inventoryCurrent.customerReceivables)} CAD</strong></div>
            <div><span>🏢 ذمم الشركات لنا</span><strong>{money(inventoryCurrent.companyReceivables)} CAD</strong></div>
            <div><span>📝 الذمم اليدوية لنا</span><strong>{money(inventoryCurrent.manualReceivables)} CAD</strong></div>
            <div className="inventory-vault-input"><span>💵 الكاش الموجود في الخزنة</span><AppInput type="number" min="0" step="0.01" value={vaultCash} onChange={event=>setVaultCash(event.target.value)} placeholder="أدخل قيمة الكاش يدويًا"/></div>
            <div><span>إجمالي الأصول</span><strong>{money(previewTotalAssets)} CAD</strong></div>
            <div><span>👤 ذمم العملاء علينا</span><strong>{money(inventoryCurrent.customerPayables)} CAD</strong></div>
            <div><span>🏢 ذمم الشركات علينا</span><strong>{money(inventoryCurrent.companyPayables)} CAD</strong></div>
            <div><span>📝 الذمم اليدوية علينا</span><strong>{money(inventoryCurrent.manualPayables)} CAD</strong></div>
            <div><span>إجمالي الالتزامات</span><strong>{money(previewTotalLiabilities)} CAD</strong></div>
            <div className="inventory-final">
  <span>= قيمة الجرد / صافي الأصول</span>
  <strong>{money(previewFinalValue)} CAD</strong>
  <AppButton
    type="button"
    variant="secondary"
    onClick={async()=>{
      await loadUsdCadRate();
      setUsdInventoryOpen(true);
    }}
  >
    🇺🇸 عرض بالدولار الأمريكي
  </AppButton>
</div>
{usdInventoryOpen&&
  <AppModal
    open
    title="🇺🇸 صافي الأصول بالدولار الأمريكي"
    onClose={()=>setUsdInventoryOpen(false)}
  >
    <div className="inventory-usd-display">
      <p>القيمة الأساسية</p>
      <strong>{money(previewFinalValue)} CAD</strong>

      {previewFinalValueUsd!==null?<>
        <p>سعر التحويل: 1 USD = {Number(usdCadRate).toLocaleString("en-CA",{maximumFractionDigits:6})} CAD</p>
        <h2>{money(previewFinalValueUsd)} USD</h2>
        <small>هذه القيمة للعرض فقط ولا تُحفظ في الجرد ولا تؤثر على رأس المال أو الديون أو الأرباح.</small>
      </>:<p className="customer-error">لا يوجد سعر USD/CAD صالح حاليًا. حدّث أسعار الصرف ثم أعد المحاولة.</p>}
    </div>
  </AppModal>
}
            <div className={`inventory-difference ${Math.abs(previewInventoryDifference)<0.005?"inventory-difference--balanced":"inventory-difference--warning"}`}><span>⚖️ فرق المطابقة الرقابي</span><strong>{previewInventoryDifference>=0?"+":""}{money(previewInventoryDifference)} CAD</strong></div>
          </div>
          <small>فرق المطابقة مؤشر للمراجعة فقط؛ لا يُضاف إلى رأس المال ولا يُطرح من الجرد تلقائيًا.</small>
          {Number(inventoryCurrent.excludedManualDuplicateCount||0)>0&&<p className="customer-success">تم استبعاد {inventoryCurrent.excludedManualDuplicateCount} من الذمم اليدوية لارتباطها مباشرةً بمصدر رسمي محسوب.</p>}
          {Number(inventoryCurrent.excludedPartnerDuplicateCount||0)>0&&<p className="customer-success">تم استبعاد {inventoryCurrent.excludedPartnerDuplicateCount} من حركات الشركات لارتباطها مباشرةً بالرصيد الخارجي نفسه.</p>}
          {(inventoryCurrent.manualDebtReviewFlags||[]).some(item=>item.reviewStatus==="FLAGGED")&&<p className="customer-error">توجد ذمم يدوية قد تتشابه بالاسم مع حسابات رسمية. بقيت محسوبة ولم تُعدّل، وتحتاج مراجعة وربطاً مباشراً.</p>}
          {(inventoryCurrent.partnerReviewFlags||[]).length>0&&<p className="customer-error">توجد شركات لها رصيد خارجي وحركات محلية للعملة نفسها دون مرجع يثبت إن كانا مستقلين. راجعها قبل تثبيت الجرد.</p>}
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
                  <div><span>صافي رأس المال</span><strong>{money(row.netCapital)}</strong></div><div><span>الكاش في الخزنة</span><strong>{money(row.vaultCash)}</strong></div>
                  {row.totalAssets!==undefined&&<div><span>إجمالي الأصول</span><strong>{money(row.totalAssets)}</strong></div>}
                  {row.totalLiabilities!==undefined&&<div><span>إجمالي الالتزامات</span><strong>{money(row.totalLiabilities)}</strong></div>}
                  {row.inventoryDifference!==undefined&&<div className="transaction-mobile-card__total"><span>فرق المطابقة الرقابي</span><strong className={Math.abs(Number(row.inventoryDifference||0))<0.005?"value-positive":"value-negative"}>{Number(row.inventoryDifference||0)>=0?"+":""}{money(row.inventoryDifference)}</strong></div>}
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
