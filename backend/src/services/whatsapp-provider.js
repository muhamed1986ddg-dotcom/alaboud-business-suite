"use strict";

const META_TEMPLATE_ENV={MONTHLY_ACCOUNT:"META_WHATSAPP_MONTHLY_TEMPLATE",TRANSFER_CREATED:"META_WHATSAPP_TRANSFER_TEMPLATE",ZERO_BALANCE:"META_WHATSAPP_ZERO_BALANCE_TEMPLATE"};

function selectedWhatsappProvider(env=process.env){
  const provider=String(env.WHATSAPP_PROVIDER||"TWILIO").trim().toUpperCase();
  return provider==="META"||provider==="TWILIO"?provider:"";
}

function normalizeMetaWhatsappNumber(value){
  const digits=String(value||"").trim().replace(/^whatsapp:/i,"").replace(/\D/g,"");
  return digits.length>=8&&digits.length<=15?digits:"";
}

function buildMetaTemplatePayload({templateType,to,contentVariables,env=process.env}){
  const envName=META_TEMPLATE_ENV[templateType],templateName=String(envName?env[envName]||"":"").trim();
  if(!envName||!templateName)return {ok:false,reason:"META_WHATSAPP_TEMPLATE_NOT_CONFIGURED",configurationError:true,templateType,envName:envName||null};
  const normalizedTo=normalizeMetaWhatsappNumber(to);
  if(!normalizedTo)return {ok:false,reason:"META_WHATSAPP_INVALID_RECIPIENT"};
  const parameters=Object.keys(contentVariables||{}).sort((a,b)=>Number(a)-Number(b)).map(key=>({type:"text",text:String(contentVariables[key]??"")}));
  return {ok:true,payload:{messaging_product:"whatsapp",to:normalizedTo,type:"template",template:{name:templateName,language:{code:String(env.META_WHATSAPP_TEMPLATE_LANGUAGE||"ar").trim()||"ar"},components:[{type:"body",parameters}]}}};
}

async function sendMetaWhatsappTemplate({templateType,to,contentVariables,env=process.env,fetchImpl=globalThis.fetch,timeoutMs=10000,logger=console}){
  const accessToken=String(env.META_WHATSAPP_ACCESS_TOKEN||"").trim(),phoneNumberId=String(env.META_WHATSAPP_PHONE_NUMBER_ID||"").trim(),apiVersion=String(env.META_WHATSAPP_API_VERSION||"").trim();
  if(!accessToken||!phoneNumberId||!apiVersion)return {ok:false,provider:"META",reason:"META_WHATSAPP_NOT_CONFIGURED",configurationError:true};
  const built=buildMetaTemplatePayload({templateType,to,contentVariables,env});
  if(!built.ok)return {...built,provider:"META"};
  const endpoint=`https://graph.facebook.com/${encodeURIComponent(apiVersion)}/${encodeURIComponent(phoneNumberId)}/messages`;
  try{
    const response=await fetchImpl(endpoint,{method:"POST",headers:{Authorization:`Bearer ${accessToken}`,"Content-Type":"application/json"},body:JSON.stringify(built.payload),signal:AbortSignal.timeout(timeoutMs)});
    let result={};try{result=await response.json();}catch{}
    if(response.ok){const providerMessageId=result?.messages?.[0]?.id||null;return providerMessageId?{ok:true,provider:"META",providerMessageId}:{ok:false,provider:"META",reason:"META_INVALID_RESPONSE",status:response.status};}
    logger.error("Meta WhatsApp send failed:",response.status);
    return {ok:false,provider:"META",reason:"META_SEND_FAILED",status:response.status};
  }catch(error){
    const timeout=error?.name==="TimeoutError"||error?.name==="AbortError";
    logger.error("Meta WhatsApp request failed:",timeout?"timeout":"network error");
    return {ok:false,provider:"META",reason:timeout?"META_REQUEST_TIMEOUT":"META_NETWORK_ERROR"};
  }
}

function createWhatsappSender({env=process.env,sendTwilioTemplate,fetchImpl=globalThis.fetch,logger=console,timeoutMs=10000}={}){
  return async payload=>{
    const provider=selectedWhatsappProvider(env);
    if(provider==="META")return sendMetaWhatsappTemplate({...payload,env,fetchImpl,logger,timeoutMs});
    if(provider==="TWILIO"){
      if(typeof sendTwilioTemplate!=="function")return {ok:false,provider:"TWILIO",reason:"TWILIO_NOT_CONFIGURED",configurationError:true};
      return {...await sendTwilioTemplate(payload),provider:"TWILIO"};
    }
    return {ok:false,reason:"WHATSAPP_PROVIDER_INVALID",configurationError:true};
  };
}

function isWhatsappProviderConfigured(env=process.env){
  const provider=selectedWhatsappProvider(env);
  if(provider==="META")return Boolean(env.META_WHATSAPP_ACCESS_TOKEN&&env.META_WHATSAPP_PHONE_NUMBER_ID&&env.META_WHATSAPP_API_VERSION);
  if(provider==="TWILIO")return Boolean(env.TWILIO_ACCOUNT_SID&&env.TWILIO_AUTH_TOKEN&&env.TWILIO_WHATSAPP_FROM);
  return false;
}

module.exports={META_TEMPLATE_ENV,selectedWhatsappProvider,normalizeMetaWhatsappNumber,buildMetaTemplatePayload,sendMetaWhatsappTemplate,createWhatsappSender,isWhatsappProviderConfigured};
