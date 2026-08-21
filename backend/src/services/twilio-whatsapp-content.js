"use strict";

const CONTENT_SID_ENV={
  MONTHLY_ACCOUNT:"TWILIO_WHATSAPP_MONTHLY_CONTENT_SID",
  TRANSFER_CREATED:"TWILIO_WHATSAPP_TRANSFER_CONTENT_SID",
  ZERO_BALANCE:"TWILIO_WHATSAPP_ZERO_BALANCE_CONTENT_SID"
};

function normalizeWhatsappAddress(value){
  const raw=String(value||"").trim().replace(/^whatsapp:/i,"");
  const digits=raw.replace(/\D/g,"");
  if(digits.length<8||digits.length>15)return "";
  return `whatsapp:+${digits}`;
}

function buildTwilioMessagePayload({channel,to,from,body,contentSid="",contentVariables=null}){
  const payload=new URLSearchParams(),isWhatsapp=channel==="WHATSAPP";
  const normalizedFrom=isWhatsapp?normalizeWhatsappAddress(from):String(from||"").trim();
  const normalizedTo=isWhatsapp?normalizeWhatsappAddress(to):String(to||"").trim();
  if(!normalizedFrom||!normalizedTo)return {ok:false,reason:"TWILIO_INVALID_ADDRESS"};
  payload.set("From",normalizedFrom);payload.set("To",normalizedTo);
  if(contentSid){payload.set("ContentSid",String(contentSid));payload.set("ContentVariables",JSON.stringify(contentVariables||{}));}
  else payload.set("Body",String(body||""));
  return {ok:true,payload};
}

async function sendAutomaticWhatsappTemplate({templateType,to,body,contentVariables,sendTwilioMessage,env=process.env}){
  const envName=CONTENT_SID_ENV[templateType],contentSid=String(envName?env[envName]||"":"").trim();
  if(!envName||!contentSid)return {ok:false,reason:"WHATSAPP_TEMPLATE_NOT_CONFIGURED",configurationError:true,templateType,envName:envName||null};
  return sendTwilioMessage({channel:"WHATSAPP",to,body,contentSid,contentVariables,requireTemplate:true});
}

module.exports={CONTENT_SID_ENV,normalizeWhatsappAddress,buildTwilioMessagePayload,sendAutomaticWhatsappTemplate};
