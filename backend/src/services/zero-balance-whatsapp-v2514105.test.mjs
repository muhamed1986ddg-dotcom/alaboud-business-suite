import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
const require=createRequire(import.meta.url);
const {isZeroBalanceTransition,executeZeroBalanceMessage,zeroBalanceDedupeKey}=require("./zero-balance-whatsapp.js");
const {createTransferWhatsappDispatcher}=require("./transfer-whatsapp-dispatcher.js");

function fixture({enabled=true,phone="+15195550001",current=0}={}){return {notificationSettings:{zeroBalanceWhatsAppEnabled:enabled,automaticTransferWhatsAppEnabled:true},customers:[{id:"c1",name:"عميل",whatsapp:phone}],transactions:[{id:"tx1",customerId:"c1",amount:10,currency:"CAD"}],payments:[{id:"p1",amount:500}],notificationActions:[],monthlyInventories:[{id:"inv",finalInventory:9000}],capitalMovements:[{id:"cap",amount:100}],current};}
function deps(store,{previous=500,operationId="op1",sender=async()=>({ok:true,providerMessageId:"SM-ZERO"})}={}){let sequence=0;return {store,companyId:"co1",customerId:"c1",operationId,previousBalance:previous,customerSummary:()=>({name:"عميل",finalBalance:store.current}),mutateDurable:async fn=>fn(store),id:()=>`z-${++sequence}`,now:()=>"2026-08-20T12:00:00.000Z",sendWhatsApp:sender};}

test("cent-precise transition matrix sends only non-zero to zero",()=>{
  assert.equal(isZeroBalanceTransition(500,0),true);assert.equal(isZeroBalanceTransition(-500,0),true);
  assert.equal(isZeroBalanceTransition(0,0),false);assert.equal(isZeroBalanceTransition(500,100),false);assert.equal(isZeroBalanceTransition(-500,-100),false);
  assert.equal(isZeroBalanceTransition(0.004,0),false);assert.equal(isZeroBalanceTransition(0.01,0.004),true);
});

test("500 and -500 to zero send the approved ZERO_BALANCE message",async()=>{
  for(const previous of [500,-500]){const store=fixture();let body="",sentPayload;const result=await executeZeroBalanceMessage(deps(store,{previous,sender:async payload=>{body=payload.body;sentPayload=payload;return {ok:true};}}));assert.equal(result.status,"SENT");assert.match(body,/0\.00 CAD/);assert.match(body,/حسابكم الآن صفر/);assert.equal(sentPayload.templateType,"ZERO_BALANCE");assert.deepEqual(sentPayload.contentVariables,{"1":"عميل"});assert.equal(store.notificationActions[0].triggerType,"ZERO_BALANCE");assert.equal(store.notificationActions[0].previousBalance,previous);}
});

test("disabled setting and invalid WhatsApp do not send",async()=>{
  let sends=0;const sender=async()=>{sends+=1;return {ok:true};};
  assert.equal((await executeZeroBalanceMessage(deps(fixture({enabled:false}),{sender}))).status,"DISABLED");
  const invalid=fixture({phone:"12"});assert.equal((await executeZeroBalanceMessage(deps(invalid,{sender}))).status,"SKIPPED_NO_WHATSAPP");assert.equal(sends,0);
});

test("same operation is idempotent while a new settlement operation is allowed",async()=>{
  const store=fixture();let sends=0;const sender=async()=>{sends+=1;return {ok:true};};
  assert.equal((await executeZeroBalanceMessage(deps(store,{operationId:"op1",sender}))).status,"SENT");
  assert.equal((await executeZeroBalanceMessage(deps(store,{operationId:"op1",sender}))).status,"SKIPPED_DUPLICATE");
  assert.equal((await executeZeroBalanceMessage(deps(store,{operationId:"op2",sender}))).status,"SENT");assert.equal(sends,2);
  assert.notEqual(zeroBalanceDedupeKey("co1","c1","op1"),zeroBalanceDedupeKey("co1","c1","op2"));
});

test("Twilio failure changes only the shared message log",async()=>{
  const store=fixture(),financialBefore=JSON.stringify({...store,notificationActions:[]});
  const result=await executeZeroBalanceMessage(deps(store,{sender:async()=>({ok:false,reason:"TWILIO_DOWN"})}));
  assert.equal(result.status,"FAILED");assert.equal(store.notificationActions[0].error,"TWILIO_DOWN");assert.equal(JSON.stringify({...store,notificationActions:[]}),financialBefore);
  assert.equal(store.monthlyInventories[0].finalInventory,9000);assert.equal(store.capitalMovements[0].amount,100);
});

test("ZERO_BALANCE has priority over TRANSFER_CREATED for the same transaction",async()=>{
  const store=fixture();let transfers=0,zero=0;
  const dispatcher=createTransferWhatsappDispatcher({runWithTenant:async(_c,_b,fn)=>fn(),readStore:()=>store,mutateDurable:async fn=>fn(store),id:()=>"log",now:()=>"2026-08-20T12:00:00Z",customerSummary:()=>({name:"عميل",finalBalance:0}),executeZeroBalanceMessage:async options=>{zero+=1;return {status:"SENT",handled:true,options};},executeTransferCreatedMessage:async()=>{transfers+=1;return {status:"SENT"};},sendWhatsApp:async()=>({ok:true})});
  const result=await dispatcher.dispatch({companyId:"co1",branchId:"b1",transactionId:"tx1",previousBalance:500});assert.equal(result.status,"SENT");assert.equal(zero,1);assert.equal(transfers,0);
});

test("company and tenant scope are part of dispatch and idempotency",async()=>{
  const seen=[];const store=fixture();const dispatcher=createTransferWhatsappDispatcher({runWithTenant:async(company,branch,fn)=>{seen.push([company,branch]);return fn();},readStore:()=>store,mutateDurable:async fn=>fn(store),id:()=>"id",now:()=>"",customerSummary:()=>({finalBalance:100}),executeZeroBalanceMessage:async()=>({handled:false}),executeTransferCreatedMessage:async()=>({status:"SENT"}),sendWhatsApp:async()=>({ok:true})});
  await dispatcher.dispatch({companyId:"co1",branchId:"b1",transactionId:"tx1",previousBalance:500});assert.deepEqual(seen,[["co1","b1"]]);assert.notEqual(zeroBalanceDedupeKey("co1","c1","op"),zeroBalanceDedupeKey("co2","c1","op"));
});

test("official post-commit hooks cover transfer create/edit and payment create/edit/delete",()=>{
  const server=readFileSync(new URL("../server.js",import.meta.url),"utf8");
  assert.match(server,/previousBalance=previousCustomer\?customerSummary\(previousStore,previousCustomer\)\.finalBalance:0/);
  assert.ok((server.match(/dispatchZeroSafely/g)||[]).length>=5);
  assert.match(server,/TRANSACTION_EDIT:/);assert.match(server,/PAYMENT_EDIT:/);assert.match(server,/PAYMENT_DELETE:/);
});
