import assert from "node:assert/strict";
import {createRequire} from "node:module";
import test from "node:test";

const require=createRequire(import.meta.url);
const {META_TEMPLATE_ENV,selectedWhatsappProvider,normalizeMetaWhatsappNumber,buildMetaTemplatePayload,sendMetaWhatsappTemplate,createWhatsappSender}=require("./whatsapp-provider.js");
const baseEnv={WHATSAPP_PROVIDER:"META",META_WHATSAPP_ACCESS_TOKEN:"test-token",META_WHATSAPP_PHONE_NUMBER_ID:"test-phone-id",META_WHATSAPP_API_VERSION:"v-test",META_WHATSAPP_MONTHLY_TEMPLATE:"monthly_account",META_WHATSAPP_TRANSFER_TEMPLATE:"transfer_created",META_WHATSAPP_ZERO_BALANCE_TEMPLATE:"zero_balance",META_WHATSAPP_TEMPLATE_LANGUAGE:"ar"};

test("provider selection is explicit and defaults safely to the existing Twilio provider",async()=>{
  assert.equal(selectedWhatsappProvider({WHATSAPP_PROVIDER:"meta"}),"META");
  assert.equal(selectedWhatsappProvider({WHATSAPP_PROVIDER:"TWILIO"}),"TWILIO");
  assert.equal(selectedWhatsappProvider({}),"TWILIO");
  assert.equal(selectedWhatsappProvider({WHATSAPP_PROVIDER:"unknown"}),"");
  let twilioCalls=0,metaCalls=0;
  const twilio=createWhatsappSender({env:{WHATSAPP_PROVIDER:"TWILIO"},sendTwilioTemplate:async()=>{twilioCalls+=1;return {ok:true,providerMessageId:"SM-test"};},fetchImpl:async()=>{metaCalls+=1;throw new Error("must not call Meta");}});
  assert.deepEqual(await twilio({}),{ok:true,providerMessageId:"SM-test",provider:"TWILIO"});
  assert.equal(twilioCalls,1);assert.equal(metaCalls,0);
});

test("all approved Meta templates use ordered text parameters and normalized recipients",()=>{
  assert.deepEqual(META_TEMPLATE_ENV,{MONTHLY_ACCOUNT:"META_WHATSAPP_MONTHLY_TEMPLATE",TRANSFER_CREATED:"META_WHATSAPP_TRANSFER_TEMPLATE",ZERO_BALANCE:"META_WHATSAPP_ZERO_BALANCE_TEMPLATE"});
  const cases=[
    ["MONTHLY_ACCOUNT",{"1":"Customer","2":"2026-08-20","3":"125.50","4":"due"},"monthly_account"],
    ["TRANSFER_CREATED",{"1":"Customer","2":"100.00","3":"USD","4":"25.00","5":"credit"},"transfer_created"],
    ["ZERO_BALANCE",{"1":"Customer"},"zero_balance"]
  ];
  for(const [templateType,variables,name] of cases){
    const built=buildMetaTemplatePayload({templateType,to:"whatsapp:+1 (519) 555-0001",contentVariables:variables,env:baseEnv});
    assert.equal(built.ok,true);assert.equal(built.payload.messaging_product,"whatsapp");assert.equal(built.payload.to,"15195550001");assert.equal(built.payload.type,"template");assert.equal(built.payload.template.name,name);assert.equal(built.payload.template.language.code,"ar");
    assert.deepEqual(built.payload.template.components[0].parameters,Object.values(variables).map(text=>({type:"text",text})));
  }
  assert.equal(normalizeMetaWhatsappNumber("12"),"");
});

test("Meta request uses Graph endpoint, Bearer auth, JSON payload, and returns messages[0].id",async()=>{
  let request;
  const result=await sendMetaWhatsappTemplate({templateType:"MONTHLY_ACCOUNT",to:"+15195550001",contentVariables:{"1":"Customer","2":"date","3":"1.00","4":"due"},env:baseEnv,fetchImpl:async(url,options)=>{request={url,options};return {ok:true,status:200,json:async()=>({messages:[{id:"wamid.test"}]})};},logger:{error(){}}});
  assert.equal(result.ok,true);assert.equal(result.provider,"META");assert.equal(result.providerMessageId,"wamid.test");assert.equal(request.url,"https://graph.facebook.com/v-test/test-phone-id/messages");assert.equal(request.options.headers.Authorization,"Bearer test-token");assert.equal(request.options.headers["Content-Type"],"application/json");assert.equal(JSON.parse(request.options.body).messaging_product,"whatsapp");
});

test("missing Meta settings and templates fail before any network request",async()=>{
  let calls=0;const fetchImpl=async()=>{calls+=1;throw new Error("unexpected");};
  assert.equal((await sendMetaWhatsappTemplate({templateType:"ZERO_BALANCE",to:"+15195550001",contentVariables:{"1":"Customer"},env:{...baseEnv,META_WHATSAPP_ACCESS_TOKEN:""},fetchImpl,logger:{error(){}}})).reason,"META_WHATSAPP_NOT_CONFIGURED");
  assert.equal((await sendMetaWhatsappTemplate({templateType:"ZERO_BALANCE",to:"+15195550001",contentVariables:{"1":"Customer"},env:{...baseEnv,META_WHATSAPP_ZERO_BALANCE_TEMPLATE:""},fetchImpl,logger:{error(){}}})).reason,"META_WHATSAPP_TEMPLATE_NOT_CONFIGURED");
  assert.equal(calls,0);
});

test("Meta 400/401/403/429/5xx and network timeout return failures without provider fallback",async()=>{
  for(const status of [400,401,403,429,500,503]){
    let twilioCalls=0;
    const sender=createWhatsappSender({env:baseEnv,sendTwilioTemplate:async()=>{twilioCalls+=1;return {ok:true};},fetchImpl:async()=>({ok:false,status,json:async()=>({error:{message:"redacted"}})}),logger:{error(){}}});
    const result=await sender({templateType:"ZERO_BALANCE",to:"+15195550001",contentVariables:{"1":"Customer"}});
    assert.equal(result.ok,false);assert.equal(result.status,status);assert.equal(result.reason,"META_SEND_FAILED");assert.equal(twilioCalls,0);
  }
  const timeout=new Error("timeout");timeout.name="TimeoutError";
  const result=await sendMetaWhatsappTemplate({templateType:"ZERO_BALANCE",to:"+15195550001",contentVariables:{"1":"Customer"},env:baseEnv,fetchImpl:async()=>{throw timeout;},logger:{error(){}}});
  assert.equal(result.ok,false);assert.equal(result.reason,"META_REQUEST_TIMEOUT");
});

test("test fixtures contain no credential-shaped production secrets",()=>{
  const source=JSON.stringify(baseEnv);
  assert.doesNotMatch(source,/EA[A-Za-z0-9]{30,}/);assert.doesNotMatch(source,/\b\d{15,}\b/);
});
