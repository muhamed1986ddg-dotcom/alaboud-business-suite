import React,{useEffect,useMemo,useState}from"react";
import api,{cachedGet} from"../api";
import {money,confirmAction} from"../shared";
import {AppButton,AppCard,AppInput,AppLoader,AppModal,AppStatCard,AppTable,AppToolbar} from"../components/ui";
import {addVaultCurrency,availableVaultCurrencies,buildVaultCashRows,removeVaultCurrency,savedVaultCurrencies} from"../inventoryVaultCurrencies";

const DEFAULT_VAULT_CURRENCIES=["CAD","USD","EUR","GBP","SAR","AED","TRY","SYP"];
const CURRENCY_FLAGS={CAD:"🇨🇦",USD:"🇺🇸",EUR:"🇪🇺",GBP:"🇬🇧",SAR:"🇸🇦",AED:"🇦🇪",TRY:"🇹🇷",SYP:"🇸🇾"};

function ReportsProfits(){
  const [activeTab,setActiveTab]=useState("summary");
  const [month,setMonth]=useState(new Date().toISOString().slice(0,7));
  const [filters,setFilters]=useState({from:"",to:""});
  const [profits,setProfits]=useState(null);
  const [monthly,setMonthly]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [inventory,setInventory]=useState(null);
  const [inventoryPreview,setInventoryPreview]=useState(null);
  const [inventoryDay,setInventoryDay]=useState(20);
  const [vaultCashByCurrency,setVaultCashByCurrency]=useState({});
  const [vaultCurrencyPickerOpen,setVaultCurrencyPickerOpen]=useState(false);
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
    try{const response=await api.get("/monthly-inventory");setInventory(response.data);setInventoryPreview(response.data?.current||null);setInventoryDay(response.data?.scheduleDay||20);}
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
    const invalidCurrency=Object.entries(vaultCashByCurrency).find(([,value])=>value!==""&&(!Number.isFinite(Number(value))||Number(value)<0));
    if(invalidCurrency){setError(`أدخل قيمة صحيحة لرصيد ${invalidCurrency[0]}`);return;}
    if(vaultCashMissingRates.length){setError(`ينقص سعر تحويل رصيد الخزنة: ${vaultCashMissingRates.join("، ")}`);return;}
    if(!await confirmAction({title:"تأكيد إغلاق الجرد",message:"سيتم تثبيت أرقام الجرد لهذا الشهر ولن تتغير لاحقًا. هل تريد المتابعة؟",confirmText:"تثبيت الجرد",tone:"warning"}))return;
    setInventoryBusy(true);setError("");setInventoryNotice("");
    try{const response=await api.post("/monthly-inventory/close",{vaultCashByCurrency,notes:inventoryNotes});setInventoryNotice(response.data?.message||"تم تثبيت الجرد");setVaultCashByCurrency({});setVaultCurrencyPickerOpen(false);setInventoryNotes("");await loadInventory();}
    catch(requestError){setError(requestError.response?.data?.message||"تعذر تثبيت الجرد الشهري");}
    finally{setInventoryBusy(false);}
  }

  useEffect(()=>{loadProfits();},[]);
  useEffect(()=>{if(activeTab==="monthly"&&!monthly)loadMonthly();if(activeTab==="inventory"&&!inventory)loadInventory();},[activeTab]);
  useEffect(()=>{
    if(activeTab!=="inventory"||!inventory)return undefined;
    let active=true;
    const timer=setTimeout(async()=>{
      try{
        const response=await api.post("/monthly-inventory/preview",{vaultCashByCurrency});
        if(active)setInventoryPreview(response.data);
      }catch(requestError){
        if(active)setError(requestError.response?.data?.message||"تعذر تحديث معاينة الجرد");
      }
    },200);
    return()=>{active=false;clearTimeout(timer)};
  },[activeTab,inventory,vaultCashByCurrency]);

  const summary=monthly?.summary||{};
  const overview={
    transactionCount:profits?.transactionCount??summary.transferCount??0,
    exchangeProfit:profits?.exchangeProfit??summary.exchangeProfit??0,
    customerFees:profits?.customerFees??summary.customerFeesTotal??0,
    providerFees:profits?.providerFees??summary.providerFeesTotal??0,
    grossProfitBeforeProviderFees:profits?.grossProfitBeforeProviderFees??summary.grossProfitBeforeProviderFees??0,
    grossProfit:profits?.grossProfit??summary.grossProfit??0,
    expenses:profits?.expenses??summary.expenses??0,
    netProfit:profits?.netProfit??summary.netProfit??0,
  };
  const inventoryCurrent=inventory?.current||{};
  const inventoryDisplay=inventoryPreview||inventoryCurrent;
  const vaultCashCurrencies=useMemo(()=>[...new Set([...DEFAULT_VAULT_CURRENCIES,...(Array.isArray(inventory?.vaultCashCurrencies)?inventory.vaultCashCurrencies:[])])],[inventory?.vaultCashCurrencies]);
  const vaultCashRows=buildVaultCashRows(vaultCashByCurrency,inventoryCurrent.vaultCashExchangeRates);
  const availableVaultCurrencyOptions=availableVaultCurrencies(vaultCashCurrencies,vaultCashByCurrency);
  const vaultCashMissingRates=vaultCashRows.filter(row=>row.amount>0&&row.convertedCad===null).map(row=>row.currency);

  async function deleteVaultCurrency(currency){
    if(Number(vaultCashByCurrency[currency]||0)>0&&!await confirmAction({title:"حذف عملة من الخزنة",message:`رصيد ${currency} أكبر من صفر. هل تريد حذفه من النموذج؟`,confirmText:"حذف",tone:"warning"}))return;
    setVaultCashByCurrency(current=>removeVaultCurrency(current,currency));
  }
  const officialFinalInventory=Number(inventoryDisplay.finalInventory??inventoryDisplay.finalValue??0);
  const previewFinalValueUsd=
    Number.isFinite(Number(usdCadRate))&&Number(usdCadRate)>0
      ? officialFinalInventory/Number(usdCadRate)
      : null;

  const monthlyColumns=useMemo(()=>[
    {key:"month",label:"الشهر"},
    {key:"exchangeProfit",label:"ربح فرق السعر",render:row=>money(row.exchangeProfit)},
    {key:"customerFees",label:"أجور العميل",render:row=>money(row.customerFees)},
    {key:"providerFees",label:"أجور الشركات",render:row=>money(row.providerFees)},
    {key:"grossProfit",label:"ربح الحوالات بعد الأجور",render:row=>money(row.grossProfit)},
    {key:"expenses",label:"المصروفات العامة",render:row=>money(row.expenses)},
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
          <AppStatCard label="أجور مأخوذة من العملاء" value={money(overview.customerFees)} tone="success"/>
          <AppStatCard label="أجور دهب/جاد والشركات" value={money(overview.providerFees)} tone="danger"/>
          <AppStatCard label="ربح الحوالات بعد أجور الشركات" value={money(overview.grossProfit)} tone={Number(overview.grossProfit)<0?"danger":"success"}/>
          <AppStatCard label="المصروفات العامة" value={money(overview.expenses)} tone="danger"/>
          <AppStatCard label="صافي الربح" value={money(overview.netProfit)} tone={Number(overview.netProfit)<0?"danger":"success"}/>
        </div>
        <AppCard className="profits-monthly-table-card" title="الأرباح الشهرية"><AppTable columns={monthlyColumns} rows={profits?.monthly||[]} rowKey="month" emptyText="لا توجد بيانات للفترة المحددة."/></AppCard>
        <div className="profits-mobile-cards">{(profits?.monthly||[]).length?(profits?.monthly||[]).map(row=><article className="transaction-mobile-card profit-mobile-card" key={`profit-mobile-${row.month}`}><header className="transaction-mobile-card__head"><div><strong>{row.month}</strong><small>الأرباح الشهرية</small></div></header><div className="transaction-mobile-card__grid"><div><span>ربح فرق السعر</span><strong>{money(row.exchangeProfit)}</strong></div><div><span>أجور العميل</span><strong>{money(row.customerFees)}</strong></div><div><span>أجور الشركات</span><strong>- {money(row.providerFees)}</strong></div><div><span>ربح الحوالات بعد الأجور</span><strong>{money(row.grossProfit)}</strong></div><div><span>المصروفات العامة</span><strong>{money(row.expenses)}</strong></div><div className="transaction-mobile-card__total"><span>صافي الربح</span><strong className={Number(row.netProfit||0)<0?"value-negative":"value-positive"}>{money(row.netProfit)}</strong></div></div></article>):<div className="transaction-mobile-empty">لا توجد بيانات للفترة المحددة.</div>}</div>
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
          <AppStatCard label="ربح فرق السعر" value={money(summary.exchangeProfit)} tone="success"/>
          <AppStatCard label="أجور مأخوذة من العملاء" value={money(summary.customerFeesTotal)} tone="success"/>
          <AppStatCard label="أجور دهب/جاد والشركات" value={money(summary.providerFeesTotal)} tone="danger"/>
          <AppStatCard label="ربح الحوالات بعد أجور الشركات" value={money(summary.grossProfit)} tone={Number(summary.grossProfit||0)<0?"danger":"success"}/>
          <AppStatCard label="المصروفات العامة" value={money(summary.expenses)} tone="danger"/>
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
          <div className="inventory-primary-grid">
            <div className="inventory-primary-card"><span>🏢 صافي الشركات</span><strong>{money(inventoryDisplay.netCompanies)} CAD</strong></div>
            <div className="inventory-primary-card"><span>👤 صافي ديون العملاء</span><strong>{money(inventoryDisplay.netCustomers)} CAD</strong></div>
            <div className="inventory-primary-card inventory-primary-card--info"><span>📈 صافي الأرباح</span><strong>{money(inventoryDisplay.netProfit)} CAD</strong><small>للعرض فقط — لا يُضاف مرة ثانية إلى الجرد النهائي.</small></div>
            <div className="inventory-primary-card inventory-primary-card--vault">
              <div className="inventory-vault-heading"><span>💵 الكاش في الخزنة</span><strong>{money(inventoryDisplay.vaultCash)} CAD</strong></div>
              {vaultCashRows.length?<div className="inventory-vault-grid">
                {vaultCashRows.map(row=><div className="inventory-vault-currency" key={row.currency}>
                  <span><b>{CURRENCY_FLAGS[row.currency]||"💱"}</b><strong>{row.currency}</strong></span>
                  <input type="number" inputMode="decimal" min="0" step="0.01" value={vaultCashByCurrency[row.currency]||""} onChange={event=>setVaultCashByCurrency(current=>({...current,[row.currency]:event.target.value}))} placeholder="0.00"/>
                  <small>{row.currency==="CAD"
                    ?`${money(row.amount)} CAD`
                    :row.convertedCad===null
                      ?"سعر التحويل إلى CAD غير متوفر"
                      :`${money(row.amount)} ${row.currency} ≈ ${money(row.convertedCad)} CAD`}</small>
                  <button type="button" className="inventory-vault-remove" onClick={()=>deleteVaultCurrency(row.currency)}>حذف</button>
                </div>)}
              </div>:<div className="inventory-vault-empty">لم تتم إضافة أي عملة إلى الخزنة</div>}
              <div className="inventory-vault-add">
                <button type="button" onClick={()=>setVaultCurrencyPickerOpen(open=>!open)}>＋ إضافة عملة</button>
                {vaultCurrencyPickerOpen&&<select value="" onChange={event=>{if(!event.target.value)return;setVaultCashByCurrency(current=>addVaultCurrency(current,event.target.value));setVaultCurrencyPickerOpen(false)}}>
                  <option value="">اختر العملة</option>
                  {availableVaultCurrencyOptions.map(currency=><option value={currency} key={currency}>{CURRENCY_FLAGS[currency]||"💱"} {currency}</option>)}
                </select>}
                {vaultCurrencyPickerOpen&&!availableVaultCurrencyOptions.length&&<small>تمت إضافة جميع العملات المدعومة.</small>}
              </div>
              <small className="inventory-vault-note">الإجمالي المحول إلى CAD أعلاه هو القيمة الوحيدة التي تدخل في الجرد.</small>
            </div>
          </div>
          <div className="inventory-final-card">
  <span>الجرد النهائي</span>
  <strong>{money(officialFinalInventory)} CAD</strong>
  {Math.abs(Number(inventoryDisplay.netManualDebts||0))>=0.005&&<small>تسويات/ذمم أخرى: {money(inventoryDisplay.netManualDebts)} CAD</small>}
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
      <strong>{money(officialFinalInventory)} CAD</strong>

      {previewFinalValueUsd!==null?<>
        <p>سعر التحويل: 1 USD = {Number(usdCadRate).toLocaleString("en-CA",{maximumFractionDigits:6})} CAD</p>
        <h2>{money(previewFinalValueUsd)} USD</h2>
        <small>هذه القيمة للعرض فقط ولا تُحفظ في الجرد ولا تؤثر على رأس المال أو الديون أو الأرباح.</small>
      </>:<p className="customer-error">لا يوجد سعر USD/CAD صالح حاليًا. حدّث أسعار الصرف ثم أعد المحاولة.</p>}
    </div>
  </AppModal>
}
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
                  <div><span>صافي رأس المال</span><strong>{money(row.netCapital)}</strong></div><div><span>الكاش في الخزنة</span><strong>{money(row.vaultCash)} CAD</strong></div>
                  {row.totalAssets!==undefined&&<div><span>إجمالي الأصول</span><strong>{money(row.totalAssets)}</strong></div>}
                  {row.totalLiabilities!==undefined&&<div><span>إجمالي الالتزامات</span><strong>{money(row.totalLiabilities)}</strong></div>}
                  {row.inventoryDifference!==undefined&&<div className="transaction-mobile-card__total"><span>فرق المطابقة الرقابي</span><strong className={Math.abs(Number(row.inventoryDifference||0))<0.005?"value-positive":"value-negative"}>{Number(row.inventoryDifference||0)>=0?"+":""}{money(row.inventoryDifference)}</strong></div>}
                  {diff!==null&&<div className="transaction-mobile-card__total"><span>الفرق عن الشهر السابق</span><strong className={diff<0?"value-negative":"value-positive"}>{diff>=0?"+":""}{money(diff)}</strong></div>}
                </div>
                {row.vaultCashByCurrency&&<div className="inventory-vault-history-grid">
                  {savedVaultCurrencies(row.vaultCashByCurrency).map(({currency,amount})=>{
                    const converted=row.vaultCashExchangeRates?.[currency]?.convertedCad;
                    return <span key={currency}><b>{CURRENCY_FLAGS[currency]||"💱"} {currency}</b><strong>{money(amount)} {currency}{currency!=="CAD"&&Number.isFinite(Number(converted))?` ≈ ${money(converted)} CAD`:""}</strong></span>;
                  })}
                </div>}
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
