import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
const require=createRequire(import.meta.url);
const {executeTransferCreatedMessage,transferMessageDedupeKey}=require("./monthly-customer-balance-messages.js");

function fixture({enabled=true,whatsapp="+15195550001"}={}){
  return {notificationSettings:{automaticTransferWhatsAppEnabled:enabled},customers:[{id:"c1",name:"عميل",whatsapp}],transactions:[{id:"tx1",customerId:"c1",amount:1000,currency:"USD",totalCustomerDue:1382.6,createdAt:"2026-08-20T12:00:00.000Z"}],payments:[],notificationActions:[],monthlyInventories:[],capitalMovements:[],expenses:[],generalDebts:[]};
}
function dependencies(store,sendWhatsApp){let sequence=0;return {store,companyId:"co1",transactionId:"tx1",customerSummary:()=>({name:"عميل",finalBalance:1382.6}),mutateDurable:async mutate=>mutate(store),id:()=>`log-${++sequence}`,now:()=>"2026-08-20T12:01:00.000Z",sendWhatsApp};}

test("a committed new transfer sends once with its post-transfer official balance",async()=>{
  const store=fixture();let sent=0,body="",templatePayload;
  const deps=dependencies(store,async payload=>{sent+=1;body=payload.body;templatePayload=payload;return {ok:true,providerMessageId:"SM1"};});
  const first=await executeTransferCreatedMessage(deps),second=await executeTransferCreatedMessage(deps);
  assert.equal(first.status,"SENT");assert.equal(second.status,"SKIPPED_DUPLICATE");assert.equal(sent,1);
  assert.match(body,/1000\.00 USD/);assert.match(body,/1382\.60 CAD/);assert.match(body,/المبلغ المستحق لنا/);
  assert.equal(templatePayload.templateType,"TRANSFER_CREATED");assert.deepEqual(templatePayload.contentVariables,{"1":"عميل","2":"1000.00","3":"USD","4":"1382.60","5":"المبلغ المستحق لنا"});
  const log=store.notificationActions[0];assert.equal(log.transactionId,"tx1");assert.equal(log.triggerType,"TRANSFER_CREATED");assert.equal(log.providerMessageId,"SM1");
  assert.equal(log.dedupeKey,transferMessageDedupeKey("co1","c1","tx1"));
});

test("disabled setting and missing WhatsApp never send or fail the transfer",async()=>{
  let sends=0;const sender=async()=>{sends+=1;return {ok:true};};
  assert.equal((await executeTransferCreatedMessage(dependencies(fixture({enabled:false}),sender))).status,"DISABLED");
  const noPhone=fixture({whatsapp:"invalid"});assert.equal((await executeTransferCreatedMessage(dependencies(noPhone,sender))).status,"SKIPPED_NO_WHATSAPP");
  assert.equal(sends,0);assert.equal(noPhone.notificationActions[0].status,"SKIPPED_NO_WHATSAPP");
});

test("WhatsApp failure changes only its log and never rolls back financial data",async()=>{
  const store=fixture(),financialBefore=JSON.stringify({...store,notificationActions:[]});
  const result=await executeTransferCreatedMessage(dependencies(store,async()=>({ok:false,reason:"PROVIDER_DOWN"})));
  assert.equal(result.status,"FAILED");assert.equal(store.notificationActions[0].error,"PROVIDER_DOWN");
  assert.equal(JSON.stringify({...store,notificationActions:[]}),financialBefore);
});

test("delivery runs only after the durable create commit and never on edit",()=>{
  const server=readFileSync(new URL("../server.js",import.meta.url),"utf8");
  assert.equal((server.match(/transferWhatsAppDispatcher\.dispatchSafely/g)||[]).length,1);
  const commitAt=server.indexOf("const tx=await mutateDurable"),dispatchAt=server.indexOf("transferWhatsAppDispatcher.dispatchSafely"),responseAt=server.indexOf("res.status(201).json(tx)");
  assert(commitAt>=0&&dispatchAt>commitAt&&responseAt>dispatchAt);
});
