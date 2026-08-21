import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
const require=createRequire(import.meta.url);
const {CONTENT_SID_ENV,normalizeWhatsappAddress,buildTwilioMessagePayload,sendAutomaticWhatsappTemplate}=require("./twilio-whatsapp-content.js");

test("automatic types map to the required Twilio ContentSid environment variables",async()=>{
  assert.deepEqual(CONTENT_SID_ENV,{MONTHLY_ACCOUNT:"TWILIO_WHATSAPP_MONTHLY_CONTENT_SID",TRANSFER_CREATED:"TWILIO_WHATSAPP_TRANSFER_CONTENT_SID",ZERO_BALANCE:"TWILIO_WHATSAPP_ZERO_BALANCE_CONTENT_SID"});
  const env={TWILIO_WHATSAPP_MONTHLY_CONTENT_SID:"HX_MONTHLY",TWILIO_WHATSAPP_TRANSFER_CONTENT_SID:"HX_TRANSFER",TWILIO_WHATSAPP_ZERO_BALANCE_CONTENT_SID:"HX_ZERO"};
  for(const [type,sid] of [["MONTHLY_ACCOUNT","HX_MONTHLY"],["TRANSFER_CREATED","HX_TRANSFER"],["ZERO_BALANCE","HX_ZERO"]]){let request;const result=await sendAutomaticWhatsappTemplate({templateType:type,to:"+15195550001",body:"fallback",contentVariables:{"1":"value"},env,sendTwilioMessage:async payload=>{request=payload;return {ok:true};}});assert.equal(result.ok,true);assert.equal(request.contentSid,sid);assert.deepEqual(request.contentVariables,{"1":"value"});assert.equal(request.requireTemplate,true);}
});

test("missing ContentSid fails before Twilio and never falls back to Body",async()=>{
  let calls=0;const result=await sendAutomaticWhatsappTemplate({templateType:"MONTHLY_ACCOUNT",to:"+15195550001",body:"must not send",contentVariables:{},env:{},sendTwilioMessage:async()=>{calls+=1;return {ok:true};}});
  assert.equal(calls,0);assert.equal(result.ok,false);assert.equal(result.reason,"WHATSAPP_TEMPLATE_NOT_CONFIGURED");assert.equal(result.configurationError,true);
});

test("Twilio payload uses ContentSid/ContentVariables and normalized whatsapp From/To without Body",()=>{
  const built=buildTwilioMessagePayload({channel:"WHATSAPP",from:"+14155238886",to:"(519) 555-0001",body:"free form",contentSid:"HX_TEMPLATE",contentVariables:{"1":"عميل"}});
  assert.equal(built.ok,true);assert.equal(built.payload.get("From"),"whatsapp:+14155238886");assert.equal(built.payload.get("To"),"whatsapp:+5195550001");assert.equal(built.payload.get("ContentSid"),"HX_TEMPLATE");assert.deepEqual(JSON.parse(built.payload.get("ContentVariables")),{"1":"عميل"});assert.equal(built.payload.has("Body"),false);
  assert.equal(normalizeWhatsappAddress("whatsapp:+15195550001"),"whatsapp:+15195550001");
});

test("source contains no real Twilio token, sender number or Content SID",()=>{
  const files=["../server.js","./twilio-whatsapp-content.js","./monthly-customer-balance-messages.js","./zero-balance-whatsapp.js"].map(path=>readFileSync(new URL(path,import.meta.url),"utf8")).join("\n");
  assert.doesNotMatch(files,/AC[0-9a-f]{32}/i);assert.doesNotMatch(files,/HX[0-9a-f]{32}/i);assert.doesNotMatch(files,/SK[0-9a-f]{32}/i);assert.match(files,/TWILIO_WHATSAPP_FROM/);
});
