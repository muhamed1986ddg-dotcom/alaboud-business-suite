import test from"node:test";import assert from"node:assert/strict";
import svc from"./services/overdue-customer-messages.js";
const {executeOverdueMessages}=svc;
function makeStore(){
  return {
    notificationSettings:{
      overdueWhatsAppEnabled:true,overdueFirstReminderDays:7,
      overdueSecondReminderEnabled:true,overdueSecondReminderDays:15,
      overdueWhatsAppMessageTime:"00:00",
      overdueWhatsAppTemplate:"FIRST {customerName} {balance} {days}",
      overdueSecondWhatsAppTemplate:"SECOND {customerName} {balance} {days}"
    },
    customers:[
      {id:"c1",name:"One",phone:"+15190000001"},
      {id:"c2",name:"Two",phone:"+15190000002"}
    ],
    notificationActions:[]
  };
}
const customerSummary=(_store,c)=>({name:c.name,finalBalance:100,overdueDays:15});
const id=()=>Math.random().toString(36).slice(2);
const mutateDurable=store=>async fn=>fn(store);

test("v25.14.115 sends at most one overdue customer per run",async()=>{
  const store=makeStore(),sent=[];
  const results=await executeOverdueMessages({
    store,companyId:"co",local:{date:"2026-08-26",time:"20:00"},
    customerSummary,mutateDurable:mutateDurable(store),id,
    now:()=> "2026-08-26T20:00:00.000Z",
    sendWhatsApp:async payload=>{sent.push(payload);return {ok:true,provider:"LOCAL_BOT",providerMessageId:"m1"};}
  });
  assert.equal(sent.length,1);
  assert.equal(results.filter(x=>x.status==="SENT").length,1);
});

test("v25.14.115 blocks same-day SECOND reminder",async()=>{
  const store=makeStore();
  store.notificationActions.push({
    id:"a1",dedupeKey:"overdue-whatsapp:co:c1:2026-08-11:FIRST",
    customerId:"c1",deliveryStatus:"SENT",sentAt:"2026-08-26T19:00:00.000Z"
  });
  let sent=[];
  const results=await executeOverdueMessages({
    store,companyId:"co",local:{date:"2026-08-26",time:"20:00"},
    customerSummary,mutateDurable:mutateDurable(store),id,
    now:()=> "2026-08-26T20:00:00.000Z",
    sendWhatsApp:async payload=>{sent.push(payload);return {ok:true,provider:"LOCAL_BOT",providerMessageId:"m2"};}
  });
  assert.ok(!results.some(x=>x.customerId==="c1"&&x.reminderStage==="SECOND"&&x.status==="SENT"));
  assert.equal(sent.length,1);
});
