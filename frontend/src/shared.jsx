// shared.jsx
// -----------
// دوال ومكوّنات مشتركة تُستخدم في App.jsx (الشاشات الأساسية) وفي
// LazyScreens.jsx (الشاشات المؤجّلة). فُصلت هنا لتفادي التكرار ولضمان
// مصدر واحد للحقيقة بعد تقسيم الملف لتسريع التحميل الأولي على الهاتف.
import React from "react";
import {createRoot} from "react-dom/client";
import {AppButton,AppModal} from "./components/ui";
import {openWhatsAppMessage} from "./whatsapp";

export function CurrencyFlag({code,className=""}){
  const normalized=String(code||"").toUpperCase();
  const supported=["CAD","USD","EUR","GBP","AED","TRY","SYP","SAR","JOD"];
  const goldCodes=["XAU24","XAU22","XAU21","XAU18"];
  if(goldCodes.includes(normalized)){
    return <span className={`gold-rate-icon ${className}`} aria-label="gold">🪙</span>;
  }
  if(supported.includes(normalized)){
    return <img
      className={`currency-flag-image ${normalized==="SYP"?"syria-new-flag":""} ${className}`}
      src={`/currency-flags/${normalized.toLowerCase()}.svg`}
      alt={`${normalized} flag`}
    />;
  }
  return <span className={className}>🏳️</span>;
}

export const money = n => Number(n || 0).toFixed(2);
export const cad = n => `${money(n)} CAD`;

export function openRegularWhatsApp(phone, message) {
  return openWhatsAppMessage(phone,message).ok;
}

export const currencyFlag = code => String(code || "").toUpperCase();

export const flagOf = code => {
  const normalized = String(code || "").toUpperCase();
  return ({ USD: "🇺🇸", CAD: "🇨🇦", EUR: "🇪🇺", TRY: "🇹🇷", SYP: "🇸🇾", SAR: "🇸🇦", JOD: "🇯🇴", GBP: "🇬🇧", AED: "🇦🇪" })[normalized] || "🏳️";
};

export const cleanConnectorMessage = value => {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "تعذر إكمال العملية";
  const technical = /chromium-launched|authenticated-landing|after-credentials|after-otp|login-page|account-page|failure:|https?:\/\/jd\d+/i;
  if (technical.test(text)) {
    if (/authenticator|رمز التحقق|otp/i.test(text)) return "تعذر تسجيل الدخول إلى جاد. أدخل رمز Google Authenticator جديدًا ثم أعد المحاولة.";
    if (/كلمة المرور|اسم المستخدم|credentials/i.test(text)) return "تعذر تسجيل الدخول إلى جاد. تحقق من اسم المستخدم وكلمة المرور.";
    return "تعذر تحديث بيانات جاد. افتح سجل الربط فقط عند الحاجة للتشخيص.";
  }
  return text.length > 260 ? `${text.slice(0, 257)}...` : text;
};

export const EXCHANGE_CURRENCY_CATALOG = [
  { code: "USD", name: "دولار أمريكي", flag: "🇺🇸" }, { code: "CAD", name: "دولار كندي", flag: "🇨🇦" },
  { code: "EUR", name: "يورو", flag: "🇪🇺" }, { code: "TRY", name: "ليرة تركية", flag: "🇹🇷" },
  { code: "SYP", name: "ليرة سورية", flag: "🇸🇾" }, { code: "SAR", name: "ريال سعودي", flag: "🇸🇦" },
  { code: "JOD", name: "دينار أردني", flag: "🇯🇴" }, { code: "GBP", name: "جنيه إسترليني", flag: "🇬🇧" },
  { code: "AED", name: "درهم إماراتي", flag: "🇦🇪" }, { code: "LBP", name: "ليرة لبنانية", flag: "🇱🇧" },
  { code: "EGP", name: "جنيه مصري", flag: "🇪🇬" }, { code: "IQD", name: "دينار عراقي", flag: "🇮🇶" },
  { code: "KWD", name: "دينار كويتي", flag: "🇰🇼" }, { code: "QAR", name: "ريال قطري", flag: "🇶🇦" },
  { code: "BHD", name: "دينار بحريني", flag: "🇧🇭" }, { code: "OMR", name: "ريال عُماني", flag: "🇴🇲" },
  { code: "CHF", name: "فرنك سويسري", flag: "🇨🇭" }, { code: "AUD", name: "دولار أسترالي", flag: "🇦🇺" },
  { code: "NZD", name: "دولار نيوزيلندي", flag: "🇳🇿" }, { code: "CNY", name: "يوان صيني", flag: "🇨🇳" },
  { code: "JPY", name: "ين ياباني", flag: "🇯🇵" }, { code: "INR", name: "روبية هندية", flag: "🇮🇳" },
  { code: "SEK", name: "كرونة سويدية", flag: "🇸🇪" }, { code: "NOK", name: "كرونة نرويجية", flag: "🇳🇴" }
];

export const debtCurrencies = [
  { code: "USD", flag: "🇺🇸", name: "دولار أمريكي", symbol: "$" },
  { code: "CAD", flag: "🇨🇦", name: "دولار كندي", symbol: "$" },
  { code: "EUR", flag: "🇪🇺", name: "يورو", symbol: "€" },
  { code: "TRY", flag: "🇹🇷", name: "ليرة تركية", symbol: "₺" },
  { code: "SYP", flag: "🇸🇾", name: "ليرة سورية", symbol: "ل.س" },
  { code: "SAR", flag: "🇸🇦", name: "ريال سعودي", symbol: "ر.س" },
  { code: "JOD", flag: "🇯🇴", name: "دينار أردني", symbol: "د.أ" }
];

export function rateTrend(rate, history = []) {
  const pairHistory = history
    .filter(item => item.baseCurrency === rate.baseCurrency && item.quoteCurrency === rate.quoteCurrency)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const previous = pairHistory.find(item => item.id !== rate.id);
  if (!previous) return { type: "new", symbol: "●", label: "جديد" };
  const currentValue = Number(rate.sellRate || rate.buyRate || 0);
  const previousValue = Number(previous.sellRate || previous.buyRate || 0);
  if (currentValue > previousValue) return { type: "up", symbol: "▲", label: "صعود" };
  if (currentValue < previousValue) return { type: "down", symbol: "▼", label: "نزول" };
  return { type: "same", symbol: "→", label: "ثابت" };
}

export function revealAppEditorNow(selector,doc=globalThis.document){
  const target=doc?.querySelector?.(selector);
  if(target?.scrollIntoView){
    target.scrollIntoView({behavior:"smooth",block:"start",inline:"nearest"});
    return true;
  }
  const appScroller=doc?.querySelector?.("main.app-main-content");
  if(appScroller?.scrollTo){
    appScroller.scrollTo({top:0,behavior:"smooth"});
    return true;
  }
  globalThis.scrollTo?.({top:0,behavior:"smooth"});
  return false;
}

// On phones the application content is its own scroll container. Calling
// window.scrollTo() therefore leaves an editor rendered above the visible
// card and makes the Edit button look broken. Wait for React to render the
// editor, then reveal it inside the actual application scroll container.
export function revealAppEditor(selector){
  const reveal=()=>revealAppEditorNow(selector);
  if(typeof globalThis.requestAnimationFrame==="function"){
    globalThis.requestAnimationFrame(()=>globalThis.requestAnimationFrame(reveal));
  }else{
    globalThis.setTimeout?.(reveal,0);
  }
}



export function confirmAction({
  title="تأكيد العملية",
  message="هل تريد المتابعة؟",
  confirmText="تأكيد",
  cancelText="إلغاء",
  tone="danger"
}={}){
  return new Promise(resolve=>{
    const host=document.createElement("div");
    host.className="imperative-confirm-host";
    document.body.appendChild(host);
    const root=createRoot(host);
    let settled=false;
    const finish=(value)=>{
      if(settled)return;
      settled=true;
      root.unmount();
      host.remove();
      resolve(value);
    };
    function ConfirmView(){
      return <AppModal
        open
        title={title}
        onClose={()=>finish(false)}
        actions={<>
          <AppButton type="button" variant="secondary" onClick={()=>finish(false)}>{cancelText}</AppButton>
          <AppButton type="button" variant={tone==="danger"?"danger":"primary"} onClick={()=>finish(true)} autoFocus>{confirmText}</AppButton>
        </>}
      >
        <p className="unified-confirm-message">{message}</p>
      </AppModal>;
    }
    root.render(<ConfirmView/>);
  });
}
