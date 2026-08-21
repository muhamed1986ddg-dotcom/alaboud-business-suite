const INVALID_MESSAGE_VALUE=/^(undefined|null|nan)$/i;

export function normalizeWhatsAppPhone(phone){
  const digits=String(phone??"").replace(/\D/g,"").replace(/^00/,"");
  return digits.length>=7?digits:"";
}

export function cleanWhatsAppMessagePart(value){
  if(value===undefined||value===null)return "";
  const text=String(value).trim();
  return INVALID_MESSAGE_VALUE.test(text)?"":text;
}

export function compactWhatsAppLines(lines){
  return lines.map(cleanWhatsAppMessagePart).filter(Boolean).join("\n");
}

export function buildWhatsAppUrl(phone,message){
  const normalizedPhone=normalizeWhatsAppPhone(phone);
  if(!normalizedPhone)return "";
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(cleanWhatsAppMessagePart(message))}`;
}

export function openWhatsAppMessage(phone,message,windowObject=globalThis.window){
  const url=buildWhatsAppUrl(phone,message);
  if(!url)return {ok:false,reason:"INVALID_PHONE"};
  const userAgent=String(windowObject?.navigator?.userAgent||globalThis.navigator?.userAgent||"");
  if(/Android/i.test(userAgent)&&windowObject?.location?.assign){
    windowObject.location.assign(url);
    return {ok:true,url};
  }
  if(!windowObject?.open)return {ok:false,reason:"WINDOW_UNAVAILABLE"};
  windowObject.open(url,"_blank","noopener,noreferrer");
  return {ok:true,url};
}
