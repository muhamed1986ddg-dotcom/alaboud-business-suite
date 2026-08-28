import test from"node:test";import assert from"node:assert/strict";
import svc from"./services/overdue-customer-messages.js";
const {executeOverdueMessages,FAILED_RETRY_COOLDOWN_MS}=svc;
function baseStore(){return {notificationSettings:{overdueWhatsAppEnabled:true,overdueFirstReminderDays:7,overdueSecondReminderEnabled:true,overdueSecondReminderDays:15,overdueWhatsAppMessageTime:"00:00",overdueWhatsAppTemplate:"FIRST {customerName}",overdueSecondWhatsAppTemplate:"SECOND {customerName}"},customers:[{id:"c1",name:"Blocked",phone:"+15190000001"},{id:"c2",name:"Next",phone:"+15190000002"}],notificationActions:[]};}
const summary=(_s,c)=>({name:c.name,finalBalance:100,overdueDays:10});
const id=()=>Math.random().toString(36).slice(2);
const mutate=store=>async fn=>fn(store);
test("recent FAILED customer is skipped so next customer can send",async()=>{
  const store=baseStore();
  store.notificationActions.push({id:"failed-1",action:"OVERDUE_WHATSAPP_MESSAGE",dedupeKey:"overdue-whatsapp:co:c1:2026-08-16:FIRST",customerId:"c1",deliveryStatus:"FAILED",updatedAt:"2026-08-26T20:00:00.000Z"});
  const sent=[];
  const results=await executeOverdueMessages({store,companyId:"co",local:{date:"2026-08-26",time:"20:05"},customerSummary:summary,mutateDurable:mutate(store),id,now:()=> "2026-08-26T20:05:00.000Z",sendWhatsApp:async p=>{sent.push(p.to);return {ok:true,provider:"LOCAL_BOT",providerMessageId:"m2"};}});
  assert.equal(sent.length,1);
  assert.match(sent[0],/15190000002$/);
  assert.ok(results.some(r=>r.customerId==="c1"&&r.status==="SKIPPED_RETRY_COOLDOWN"));
  assert.ok(results.some(r=>r.customerId==="c2"&&r.status==="SENT"));
});
test("FAILED customer becomes retryable after cooldown",async()=>{
  const store=baseStore();store.customers=[store.customers[0]];
  store.notificationActions.push({id:"failed-1",action:"OVERDUE_WHATSAPP_MESSAGE",dedupeKey:"overdue-whatsapp:co:c1:2026-08-16:FIRST",customerId:"c1",deliveryStatus:"FAILED",updatedAt:"2026-08-26T18:00:00.000Z"});
  let calls=0;
  const results=await executeOverdueMessages({store,companyId:"co",local:{date:"2026-08-26",time:"20:05"},customerSummary:summary,mutateDurable:mutate(store),id,now:()=> "2026-08-26T20:05:00.000Z",sendWhatsApp:async()=>{calls++;return {ok:true,provider:"LOCAL_BOT",providerMessageId:"retry"};}});
  assert.equal(FAILED_RETRY_COOLDOWN_MS,60*60*1000);assert.equal(calls,1);assert.ok(results.some(r=>r.customerId==="c1"&&r.status==="SENT"));
});
