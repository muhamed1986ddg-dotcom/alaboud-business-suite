"use strict";
const {normalizeWhatsappNumber}=require("./monthly-customer-balance-messages");
function finite(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function overdueMessage(recipient,template="",stage="FIRST"){
  const values={customerName:recipient.name,name:recipient.name,balance:recipient.amount.toFixed(2),days:String(recipient.days)};
  const fallbackFirst="مرحباً {customerName}\n\nنود تذكيركم بأن على حسابكم رصيداً متأخراً قدره:\n{balance} CAD\n\nمدة التأخير: {days} يوم\n\nيرجى مراجعة الحساب، وشكراً.\nأبو إسلام";
  const fallbackSecond="مرحباً {customerName}\n\nهذا تذكير ثانٍ بوجود رصيد متأخر على حسابكم قدره:\n{balance} CAD\n\nمدة التأخير الحالية: {days} يوم\n\nنرجو مراجعة الحساب عند أقرب فرصة، وشكراً.\nأبو إسلام";
  return String(template||(stage==="SECOND"?fallbackSecond:fallbackFirst)).replace(/\{(customerName|name|balance|days)\}/g,(_m,k)=>values[k]);
}
function isOverdueRunDue(settings={},local={}){
  if(!settings.overdueWhatsAppEnabled)return false;
  const time=/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(settings.overdueWhatsAppMessageTime||""))?String(settings.overdueWhatsAppMessageTime):"10:00";
  return String(local.time||"")>=time;
}
function reminderConfig(settings={}){
  const first=Math.max(1,Math.min(365,Math.round(finite(settings.overdueFirstReminderDays)||finite(settings.overdueDays)||7)));
  const second=Math.max(first+1,Math.min(365,Math.round(finite(settings.overdueSecondReminderDays)||15)));
  return {first,second,secondEnabled:settings.overdueSecondReminderEnabled!==false};
}
function cycleStartDate(localDate,days){
  const value=String(localDate||"");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return `days-${Math.max(0,Math.round(finite(days)))}`;
  const date=new Date(`${value}T00:00:00Z`);date.setUTCDate(date.getUTCDate()-Math.max(0,Math.round(finite(days))));
  return date.toISOString().slice(0,10);
}
function selectOverdueRecipients(store,{customerSummary}={}){
  const {first}=reminderConfig(store.notificationSettings||{});
  return (store.customers||[]).filter(c=>c&&!c.isDeleted&&c.active!==false).map(c=>({customer:c,summary:customerSummary(store,c)}))
    .map(({customer,summary})=>({customerId:customer.id,name:String(summary.name||customer.name||"عميل"),whatsappNumber:normalizeWhatsappNumber(customer.whatsapp||customer.phone),balance:+finite(summary.finalBalance).toFixed(2),amount:+Math.abs(finite(summary.finalBalance)).toFixed(2),days:Math.max(0,Math.round(finite(summary.overdueDays)))}))
    .filter(r=>r.whatsappNumber&&r.balance>0&&r.days>=first);
}
function sentOrPending(actions,key){return actions.some(x=>x?.dedupeKey===key&&["PENDING","SENT"].includes(x.deliveryStatus));}
function wasSent(actions,key){return actions.some(x=>x?.dedupeKey===key&&x.deliveryStatus==="SENT");}
async function executeOverdueMessages({store,companyId,local,customerSummary,mutateDurable,id,now,sendWhatsApp}){
  if(!isOverdueRunDue(store.notificationSettings||{},local))return [];
  const settings=store.notificationSettings||{},cfg=reminderConfig(settings),date=String(local.date||String(now()).slice(0,10)),results=[];
  for(const recipient of selectOverdueRecipients(store,{customerSummary})){
    const cycle=cycleStartDate(date,recipient.days),firstKey=`overdue-whatsapp:${companyId}:${recipient.customerId}:${cycle}:FIRST`,secondKey=`overdue-whatsapp:${companyId}:${recipient.customerId}:${cycle}:SECOND`;
    const actions=Array.isArray(store.notificationActions)?store.notificationActions:[];
    let stage=null,dedupeKey=null,template="";
    if(recipient.days>=cfg.first&&!sentOrPending(actions,firstKey)){stage="FIRST";dedupeKey=firstKey;template=settings.overdueWhatsAppTemplate;}
    else if(cfg.secondEnabled&&recipient.days>=cfg.second&&wasSent(actions,firstKey)&&!sentOrPending(actions,secondKey)){stage="SECOND";dedupeKey=secondKey;template=settings.overdueSecondWhatsAppTemplate||settings.overdueWhatsAppTemplate;}
    else{results.push({customerId:recipient.customerId,status:"SKIPPED_DUPLICATE"});continue;}
    const messageText=overdueMessage(recipient,template,stage);
    const claim=await mutateDurable(current=>{current.notificationActions||=[];if(sentOrPending(current.notificationActions,dedupeKey))return null;const item={id:id(),action:"OVERDUE_WHATSAPP_MESSAGE",dedupeKey,reminderStage:stage,customerId:recipient.customerId,customerName:recipient.name,whatsappNumber:recipient.whatsappNumber,triggerType:stage==="SECOND"?"OVERDUE_SECOND_REMINDER":"OVERDUE_FIRST_REMINDER",balance:recipient.balance,days:recipient.days,messageText,channel:"WHATSAPP",status:"PENDING",deliveryStatus:"PENDING",provider:null,providerMessageId:null,error:null,createdAt:now(),sentAt:null,createdBy:"SYSTEM"};current.notificationActions.push(item);return item;});
    if(!claim){results.push({customerId:recipient.customerId,status:"SKIPPED_DUPLICATE"});continue;}
    let delivery;try{delivery=await sendWhatsApp({templateType:"OVERDUE",to:recipient.whatsappNumber,body:messageText,dedupeId:dedupeKey,contentVariables:{"1":recipient.name,"2":recipient.amount.toFixed(2),"3":String(recipient.days)}});}catch(error){delivery={ok:false,reason:String(error?.message||"DELIVERY_ERROR")};}
    await mutateDurable(current=>{const item=(current.notificationActions||[]).find(x=>x.id===claim.id);if(!item)return;item.status=item.deliveryStatus=delivery?.ok?"SENT":"FAILED";item.provider=delivery?.provider||null;item.providerMessageId=delivery?.providerMessageId||null;item.error=delivery?.ok?null:String(delivery?.reason||"DELIVERY_FAILED");item.sentAt=delivery?.ok?now():null;item.updatedAt=now();});
    results.push({customerId:recipient.customerId,status:delivery?.ok?"SENT":"FAILED",reminderStage:stage});
  }
  return results;
}
module.exports={overdueMessage,isOverdueRunDue,reminderConfig,cycleStartDate,selectOverdueRecipients,executeOverdueMessages};
