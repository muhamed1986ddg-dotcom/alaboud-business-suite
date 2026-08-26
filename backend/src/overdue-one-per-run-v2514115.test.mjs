import test from "node:test";
import assert from "node:assert/strict";
import {executeOverdueMessages} from "./services/overdue-customer-messages.js";

test("v25.14.115 sends at most one overdue WhatsApp reminder per run", async()=>{
  const store={
    notificationSettings:{
      overdueWhatsAppEnabled:true,
      overdueFirstReminderDays:7,
      overdueSecondReminderEnabled:true,
      overdueSecondReminderDays:15,
      overdueWhatsAppMessageTime:"10:00"
    },
    customers:[
      {id:"c1",name:"One",phone:"+15190000001",active:true},
      {id:"c2",name:"Two",phone:"+15190000002",active:true},
      {id:"c3",name:"Three",phone:"+15190000003",active:true}
    ],
    notificationActions:[]
  };
  const summaries={
    c1:{name:"One",finalBalance:100,overdueDays:10},
    c2:{name:"Two",finalBalance:200,overdueDays:11},
    c3:{name:"Three",finalBalance:300,overdueDays:12}
  };
  let seq=0,sends=0;
  const result=await executeOverdueMessages({
    store,companyId:"co",local:{date:"2026-08-26",time:"18:30"},
    customerSummary:(_s,c)=>summaries[c.id],
    mutateDurable:async fn=>fn(store),
    id:()=>`id-${++seq}`,
    now:()=>"2026-08-26T22:30:00.000Z",
    sendWhatsApp:async()=>{sends++;return {ok:true,provider:"LOCAL_BOT",providerMessageId:`m-${sends}`};}
  });
  assert.equal(sends,1);
  assert.equal(result.length,1);
  assert.equal(result[0].status,"SENT");
  assert.equal(store.notificationActions.filter(x=>x.deliveryStatus==="SENT").length,1);
});
