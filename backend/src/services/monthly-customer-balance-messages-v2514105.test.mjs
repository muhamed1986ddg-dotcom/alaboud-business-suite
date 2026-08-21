import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import test from "node:test";

const require=createRequire(import.meta.url);
const FinancialEngine=require("../finance/FinancialEngine.js");
const {selectMonthlyBalanceRecipients,monthlyBalanceDedupeKey,monthlyBalanceMessage,normalizeWhatsappNumber,monthlyMessageSettings,isScheduledRunDue,executeMonthlyAccountMessages}=require("./monthly-customer-balance-messages.js");
const transaction=(id,customerId,amount=100)=>({id,customerId,amount,costRate:1,finalRate:1,transferFee:0,status:"COMPLETED",transferDate:"2026-08-01",createdAt:"2026-08-01T10:00:00.000Z"});

test("only active customers with an official non-zero financial account and valid WhatsApp are selected",()=>{
  const store={customers:[
    {id:"due",name:"مدين",whatsapp:"+15195550001"},
    {id:"settled",name:"مسدد",whatsapp:"+15195550002"},
    {id:"listed",name:"اسم فقط",whatsapp:"+15195550003"},
    {id:"invalid-phone",name:"رقم خاطئ",whatsapp:"12"},
    {id:"inactive",name:"معطل",whatsapp:"+15195550005",active:false},
    {id:"payable",name:"له رصيد",phone:"+15195550004",oldBalance:40,oldBalanceType:"PAYABLE",openingBalanceInitial:40}
  ],transactions:[transaction("tx-due","due"),transaction("tx-settled","settled"),transaction("tx-invalid","invalid-phone"),transaction("tx-inactive","inactive")],payments:[{id:"pay",customerId:"settled",transactionId:"tx-settled",amount:100,paymentDate:"2026-08-02"}]};
  const recipients=selectMonthlyBalanceRecipients(store,{customerSummary:FinancialEngine.customerSummary});
  assert.deepEqual(recipients.map(item=>item.customerId),["due","payable"]);
  assert.equal(recipients[0].direction,"CUSTOMER_OWES_US");
  assert.equal(recipients[1].direction,"WE_OWE_CUSTOMER");
  assert.equal(normalizeWhatsappNumber("(519) 555-0004"),"+5195550004");
});

test("message uses the approved template values and never changes the official signed balance",()=>{
  const recipient={customerId:"c1",name:"عميل",amount:125.5,balance:-125.5,direction:"WE_OWE_CUSTOMER"};
  const message=monthlyBalanceMessage(recipient,"2026-08-19");
  assert.match(message,/125\.50 CAD/);assert.match(message,/المبلغ المستحق لكم/);assert.equal(recipient.balance,-125.5);
  assert.equal(monthlyBalanceMessage(recipient,"2026-08-19","{name}|{date}|{balance}|{balanceDirection}"),"عميل|2026-08-19|125.50|المبلغ المستحق لكم");
});

test("settings control day and time and default to disabled day 19",()=>{
  assert.deepEqual(monthlyMessageSettings({}),{enabled:false,day:19,time:"09:00"});
  assert.equal(isScheduledRunDue({monthlyAccountMessagesEnabled:false,monthlyAccountMessageDay:5,monthlyAccountMessageTime:"10:00"},{day:5,time:"10:01"}),false);
  assert.equal(isScheduledRunDue({monthlyAccountMessagesEnabled:true,monthlyAccountMessageDay:5,monthlyAccountMessageTime:"10:00"},{day:5,time:"09:59"}),false);
  assert.equal(isScheduledRunDue({monthlyAccountMessagesEnabled:true,monthlyAccountMessageDay:5,monthlyAccountMessageTime:"10:00"},{day:5,time:"10:00"}),true);
});

test("idempotency is company/customer/month scoped and a new month is allowed",()=>{
  assert.equal(monthlyBalanceDedupeKey("co","c1","2026-08"),monthlyBalanceDedupeKey("co","c1","2026-08"));
  assert.notEqual(monthlyBalanceDedupeKey("co","c1","2026-08"),monthlyBalanceDedupeKey("co","c1","2026-09"));
  assert.notEqual(monthlyBalanceDedupeKey("co1","c1","2026-08"),monthlyBalanceDedupeKey("co2","c1","2026-08"));
  const server=readFileSync(new URL("../server.js",import.meta.url),"utf8");
  const job=readFileSync(new URL("../routes/monthly-account-messages-job.js",import.meta.url),"utf8");
  const service=readFileSync(new URL("./monthly-customer-balance-messages.js",import.meta.url),"utf8");
  assert.match(server,/createWhatsappSender\(/);
  assert.match(server,/sendWhatsApp:sendWhatsAppMessage/);
  assert.match(service,/DUPLICATE_IDEMPOTENCY/);
  assert.match(job,/MONTHLY_ACCOUNT_MESSAGES_JOB_SECRET/);
  assert.match(job,/timingSafeEqual/);
  assert.doesNotMatch(server,/setInterval\(runMonthlyMessages/);
});

test("preview performs no delivery, one failure does not stop the batch, and rerun is idempotent",async()=>{
  const store={notificationSettings:{monthlyAccountMessagesEnabled:true,monthlyAccountMessageDay:19,monthlyAccountMessageTime:"09:00"},customers:[{id:"a",name:"A",whatsapp:"+15195550001",openingBalanceInitial:10},{id:"b",name:"B",whatsapp:"+15195550002",openingBalanceInitial:20}],transactions:[],payments:[],notificationActions:[]};
  const summary=(_store,customer)=>({...customer,finalBalance:customer.openingBalanceInitial});
  const preview=selectMonthlyBalanceRecipients(store,{customerSummary:summary});
  assert.equal(preview.length,2);
  let sequence=0;const payloads=[];
  const dependencies={store,companyId:"co",local:{date:"2026-08-19",day:19,time:"09:00"},customerSummary:summary,mutateDurable:async fn=>fn(store),id:()=>`id-${++sequence}`,now:()=>"2026-08-19T13:00:00.000Z",sendWhatsApp:async payload=>{payloads.push(payload);return payload.to.endsWith("1")?{ok:false,reason:"TEST_FAILURE"}:{ok:true,provider:"twilio",providerMessageId:"SM2"};}};
  const first=await executeMonthlyAccountMessages(dependencies);
  assert.deepEqual(first.map(item=>item.status),["FAILED","SENT"]);
  const second=await executeMonthlyAccountMessages(dependencies);
  assert.deepEqual(second.map(item=>item.status),["FAILED","SKIPPED_DUPLICATE"]);
  assert.equal(store.notificationActions.find(item=>item.customerId==="b"&&item.status==="SENT").providerMessageId,"SM2");
  assert.equal(store.notificationActions.some(item=>item.status==="SKIPPED_DUPLICATE"&&item.error==="DUPLICATE_IDEMPOTENCY"),true);
  assert.equal(payloads[0].templateType,"MONTHLY_ACCOUNT");assert.deepEqual(payloads[0].contentVariables,{"1":"A","2":"2026-08-19","3":"10.00","4":"المبلغ المستحق لنا"});
});
