import React,{useEffect,useMemo,useRef,useState}from"react";
import api from"../api";

const NAV_COMMANDS=[
  {page:"dashboard",words:["الرئيسية","الصفحة الرئيسية","افتح الرئيسية","لوحة التحكم"]},
  {page:"customers",words:["العملاء","افتح العملاء","قائمة العملاء"]},
  {page:"overdue-customers",words:["العملاء المتأخرين","العملاء المتأخرون","المتأخرين","افتح المتأخرين"]},
  {page:"transactions",words:["الحوالات","افتح الحوالات","التحويلات"]},
  {page:"treasury",words:["الخزنة","افتح الخزنة"]},
  {page:"reports-profits",words:["التقارير","الأرباح","افتح التقارير"]},
  {page:"rates",words:["أسعار الصرف","الاسعار","الأسعار","العملات"]},
  {page:"debts",words:["الديون","الدين العام","الدَّين العام"]},
  {page:"companies",words:["الشركات","افتح الشركات"]},
  {page:"capital-overview",words:["رأس المال","راس المال"]},
  {page:"expenses",words:["المصروفات","افتح المصروفات"]},
  {page:"settings",words:["الإعدادات","الاعدادات","افتح الإعدادات"]},
  {page:"ai-center",words:["الذكاء الاصطناعي","مركز القيادة","افتح الذكاء الاصطناعي"]}
];

function normalizeArabic(value){
  return String(value||"")
    .trim()
    .toLowerCase()
    .replace(/[إأآ]/g,"ا")
    .replace(/ى/g,"ي")
    .replace(/ة/g,"ه")
    .replace(/[ًٌٍَُِّْـ]/g,"")
    .replace(/[؟?!،,.]/g," ")
    .replace(/\s+/g," ");
}
function extractCustomerQuery(text){
  const normalized=String(text||"").trim();
  const patterns=[
    /(?:افتح|اعرض|ابحث عن)\s+(?:حساب\s+)?(?:العميل|عميل)\s+(.+)$/i,
    /(?:كم\s+)?(?:رصيد|حساب)\s+(?:العميل|عميل)\s+(.+)$/i,
    /(?:العميل|عميل)\s+(.+)$/i
  ];
  for(const pattern of patterns){
    const match=normalized.match(pattern);
    if(match?.[1])return match[1].trim();
  }
  return "";
}
function isBalanceQuery(text){
  const value=normalizeArabic(text);
  return value.includes("رصيد")||value.includes("كم حساب")||value.includes("حساب العميل");
}
function isFinancialWrite(text){
  const value=normalizeArabic(text);
  return ["اضف حواله","اضافه حواله","سجل دفعه","اضف دفعه","تصفير","صفر الحساب","احذف العميل","عدل العميل"].some(term=>value.includes(term));
}


const PAGE_ALIASES=[
["dashboard",["الرئيسية","لوحة التحكم"]],["customers",["العملاء","قائمة العملاء"]],
["overdue-customers",["المتأخرين","العملاء المتأخرين","العملاء المتأخرون"]],
["transactions",["الحوالات","التحويلات"]],["debts",["الديون","الدين العام"]],
["treasury",["الخزنة"]],["companies",["الشركات","أرصدة الشركات"]],
["expenses",["المصروفات","المصاريف"]],["capital-overview",["رأس المال","راس المال"]],
["rates",["أسعار الصرف","اسعار الصرف","العملات"]],["reports-profits",["التقارير","الأرباح"]],
["settings",["الإعدادات","الاعدادات"]],["ai-center",["الذكاء الاصطناعي","مركز القيادة"]]
];
function wantsCurrentCustomerBalance(t){const n=normalizeArabic(t);return n.includes("رصيد هذا العميل")||n.includes("حساب هذا العميل")}
function wantsLatestTransfer(t){const n=normalizeArabic(t);return n.includes("اخر حواله")||n.includes("احدث حواله")}
function wantsOverdue(t){const n=normalizeArabic(t);return n.includes("اعرض المتاخرين")||n.includes("افتح المتاخرين")||n.includes("العملاء المتاخرين")}
function wantsRateRefresh(t){const n=normalizeArabic(t);return n.includes("تحديث اسعار الصرف")||n.includes("حدث اسعار الصرف")||n.includes("تحديث العملات")}
function wantsWhatsAppReminder(t){const n=normalizeArabic(t);return(n.includes("واتساب")||n.includes("واتس"))&&(n.includes("تذكير")||n.includes("الحساب")||n.includes("الرصيد"))}

export function VoiceCommandAssistant({navigate,onOpenCustomer,currentCustomerId,onOpenWhatsAppReminder,onRefreshRates}){
  const [open,setOpen]=useState(false);
  const [listening,setListening]=useState(false);
  const [transcript,setTranscript]=useState("");
  const [message,setMessage]=useState("");
  const [supported,setSupported]=useState(true);
  const recognitionRef=useRef(null);

  const Recognition=useMemo(()=>{
    if(typeof window==="undefined")return null;
    return window.SpeechRecognition||window.webkitSpeechRecognition||null;
  },[]);

  useEffect(()=>{
    setSupported(Boolean(Recognition));
    return()=>{try{recognitionRef.current?.abort?.();}catch{}};
  },[Recognition]);

  async function findCustomer(query){
    const {data}=await api.get("/customers",{params:{page:1,pageSize:10,sort:"name",search:query}});
    const rows=Array.isArray(data?.items)?data.items:Array.isArray(data)?data:[];
    if(!rows.length)return null;
    const target=normalizeArabic(query);
    return rows.find(item=>normalizeArabic(item.name)===target)||rows[0];
  }

  async function executeCommand(rawText){
    const raw=String(rawText||"").trim();
    const text=normalizeArabic(raw);
    if(!text)return setMessage("لم أسمع أمرًا واضحًا.");
    if(wantsOverdue(raw)){navigate("overdue-customers");setOpen(false);return;}
    if(wantsRateRefresh(raw)){if(typeof onRefreshRates==="function"){setMessage("جارٍ تجهيز تحديث أسعار الصرف…");await onRefreshRates();}else{navigate("rates");setMessage("فتحت أسعار الصرف للمراجعة والتحديث.");}setOpen(false);return;}
    if(wantsCurrentCustomerBalance(raw)){
      if(!currentCustomerId){setMessage("افتح حساب العميل أولًا ثم قل: اعرض رصيد هذا العميل.");return;}
      try{const {data}=await api.get(`/customers/${currentCustomerId}`);const c=data?.customer||data;const b=Number(c?.finalBalance??c?.balance??c?.due??NaN);setMessage(Number.isFinite(b)?`رصيد ${c?.name||"العميل"}: ${b.toFixed(2)} CAD`:"تعذر قراءة رصيد العميل الحالي.");}catch(e){setMessage(e.response?.data?.message||"تعذر قراءة رصيد العميل الحالي.");}return;
    }
    if(wantsLatestTransfer(raw)){
      if(!currentCustomerId){navigate("transactions");setMessage("فتحت الحوالات. افتح عميلًا أولًا لعرض آخر حوالة له.");setOpen(false);return;}
      try{const {data}=await api.get("/transactions",{params:{customerId:currentCustomerId,page:1,pageSize:1,sort:"-date"}});const rows=Array.isArray(data?.items)?data.items:Array.isArray(data)?data:[];const tx=rows[0];if(!tx){setMessage("لا توجد حوالات لهذا العميل.");return;}navigate("transactions");setMessage(`آخر حوالة: ${tx.amount??""} ${tx.currency??""}`.trim());setOpen(false);}catch(e){setMessage(e.response?.data?.message||"تعذر قراءة آخر حوالة.");}return;
    }
    if(wantsWhatsAppReminder(raw)){
      if(!currentCustomerId){setMessage("افتح حساب العميل المطلوب أولًا ثم اطلب إرسال تذكير واتساب.");return;}
      if(typeof onOpenWhatsAppReminder==="function"){onOpenWhatsAppReminder(currentCustomerId);setMessage("تم تجهيز تذكير واتساب. راجع الاسم والرقم والرصيد والنص ثم أكد الإرسال.");setOpen(false);}else{onOpenCustomer(currentCustomerId);setMessage("تم فتح العميل. راجع رسالة واتساب قبل الإرسال.");setOpen(false);}return;
    }
    const alias=PAGE_ALIASES.find(([,xs])=>xs.some(x=>text.includes(normalizeArabic(x))));
    if(alias&&(text.includes("افتح")||text.includes("اعرض")||text.includes("اذهب"))){navigate(alias[0]);setOpen(false);return;}

    if(isFinancialWrite(raw)){
      setMessage("الأوامر المالية لا تُنفذ صوتيًا في هذه المرحلة. افتح العملية من الشاشة وراجعها قبل الحفظ.");
      return;
    }

    const customerQuery=extractCustomerQuery(raw);
    if(customerQuery){
      setMessage("جارٍ البحث عن العميل…");
      try{
        const customer=await findCustomer(customerQuery);
        if(!customer){setMessage(`لم أجد عميلاً باسم «${customerQuery}».`);return;}
        if(isBalanceQuery(raw)){
          const balance=Number(customer.finalBalance??customer.balance??customer.due??NaN);
          if(Number.isFinite(balance)){
            setMessage(`رصيد ${customer.name}: ${balance.toFixed(2)} CAD`);
            return;
          }
        }
        onOpenCustomer(customer.id);
        setMessage(`تم فتح حساب ${customer.name}.`);
        setOpen(false);
      }catch(error){
        setMessage(error.response?.data?.message||"تعذر البحث عن العميل الآن.");
      }
      return;
    }

    const match=NAV_COMMANDS.find(command=>command.words.some(word=>text.includes(normalizeArabic(word))));
    if(match){
      navigate(match.page);
      setMessage("تم تنفيذ الأمر.");
      setOpen(false);
      return;
    }

    setMessage("لم أفهم الأمر. جرّب: «افتح العملاء»، «اعرض المتأخرين»، «افتح الخزنة»، أو «افتح العميل محمد».");
  }

  function startListening(){
    if(!Recognition){
      setSupported(false);
      setOpen(true);
      setMessage("التعرّف الصوتي غير مدعوم في هذا المتصفح. جرّب Chrome على الهاتف أو الكمبيوتر.");
      return;
    }
    try{
      recognitionRef.current?.abort?.();
      const recognition=new Recognition();
      recognition.lang="ar-SA";
      recognition.continuous=false;
      recognition.interimResults=true;
      recognition.maxAlternatives=1;
      recognitionRef.current=recognition;
      setTranscript("");
      setMessage("أتحدث الآن…");
      setListening(true);
      setOpen(true);
      recognition.onresult=event=>{
        let current="";
        for(let i=event.resultIndex;i<event.results.length;i+=1)current+=event.results[i][0]?.transcript||"";
        setTranscript(current);
        if(event.results[event.results.length-1]?.isFinal)void executeCommand(current);
      };
      recognition.onerror=event=>{
        setListening(false);
        const code=String(event.error||"");
        setMessage(code==="not-allowed"?"اسمح للبرنامج باستخدام الميكروفون من إعدادات المتصفح.":"تعذر التعرف على الصوت. حاول مرة أخرى.");
      };
      recognition.onend=()=>setListening(false);
      recognition.start();
    }catch{
      setListening(false);
      setMessage("تعذر تشغيل الميكروفون. تحقق من إذن الميكروفون.");
    }
  }

  return <>
    <button
      type="button"
      className={`voice-command-floating no-print ${listening?"is-listening":""}`}
      onClick={()=>listening?recognitionRef.current?.stop?.():startListening()}
      title="الأوامر الصوتية"
      aria-label="تشغيل الأوامر الصوتية"
    >
      <span>{listening?"◉":"🎙️"}</span><b>صوت</b>
    </button>
    {open&&<div className="voice-command-panel no-print" role="dialog" aria-label="الأوامر الصوتية">
      <div className="voice-command-panel-head">
        <div><strong>الأوامر الصوتية</strong><small>مرحلة آمنة: تنقل، بحث، وعرض معلومات فقط.</small></div>
        <button type="button" onClick={()=>{recognitionRef.current?.abort?.();setOpen(false);setListening(false)}} aria-label="إغلاق">×</button>
      </div>
      <div className={`voice-command-mic ${listening?"active":""}`}><span>🎙️</span><b>{listening?"أستمع…":"جاهز"}</b></div>
      {transcript&&<div className="voice-command-transcript"><small>سمعت:</small><strong>{transcript}</strong></div>}
      {message&&<div className="voice-command-message">{message}</div>}
      <div className="voice-command-examples">
        <small>أمثلة:</small>
        <span>«افتح العملاء»</span><span>«اعرض العملاء المتأخرين»</span><span>«افتح الخزنة»</span><span>«افتح العميل محمد»</span><span>«اعرض رصيد هذا العميل»</span><span>«افتح آخر حوالة»</span><span>«اعرض المتأخرين»</span><span>«تحديث أسعار الصرف»</span><span>«أرسل واتساب تذكير بالحساب»</span><span>«كم رصيد العميل أحمد؟»</span>
      </div>
      <button type="button" className="voice-command-listen-button" disabled={!supported||listening} onClick={startListening}>{listening?"جارٍ الاستماع…":"🎙️ تحدث الآن"}</button>
      {!supported&&<small className="voice-command-warning">المتصفح الحالي لا يدعم Web Speech API.</small>}
    </div>}
  </>;
}

export {normalizeArabic,extractCustomerQuery,isBalanceQuery,isFinancialWrite};
