"use strict";
const {normalizeWhatsappNumber}=require("./monthly-customer-balance-messages");
function finite(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function overdueMessage(recipient,template=""){
  const values={customerName:recipient.name,name:recipient.name,balance:recipient.amount.toFixed(2),days:String(recipient.days)};
  const fallback="مرحباً {customerName}\n\nنود تذكيركم بأن على حسابكم رصيداً متأخراً قدره:\n{balance} CAD\n\nمدة التأخير: {days} يوم\n\nيرجى مراجعة الحساب، وشكراً.\nشركة العبود";
  return String(template||fallback).replace(/\{(customerName|name|balance|days)\}/g,(_m,k)=>values[k]);
}
function isOverdueRunDue(settings={},local={}){
  if(!settings.overdueWhatsAppEnabled)return false;
  const time=/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(settings.overdueWhatsAppMessageTime||""))?String(settings.overdueWhatsAppMessageTime):"10:00";
  return String(local.time||"")>=time;
}
function selectOverdueRecipients(store,{customerSummary}={}){
  const minDays=Math.max(1,Math.round(finite(store.notificationSettings?.overdueDays)||7));
  return (store.customers||[]).filter(c=>c&&!c.isDeleted&&c.active!==false).map(c=>({customer:c,summary:customerSummary(store,c)}))
    .map(({customer,summary})=>({customerId:customer.id,name:String(summary.name||customer.name||"عميل"),whatsappNumber:normalizeWhatsappNumber(customer.whatsapp||customer.phone),balance:+finite(summary.finalBalance).toFixed(2),amount:+Math.abs(finite(summary.finalBalance)).toFixed(2),days:Math.max(0,Math.round(finite(summary.overdueDays)))}))
    .filter(r=>r.whatsappNumber&&r.balance>0&&r.days>=minDays);
}
async function executeOverdueMessages({store,companyId,local,customerSummary,mutateDurable,id,now,sendWhatsApp}){
  if(!isOverdueRunDue(store.notificationSettings||{},local))return [];
  const date=String(local.date||String(now()).slice(0,10)),results=[];
  for(const recipient of selectOverdueRecipients(store,{customerSummary})){
    const dedupeKey=`overdue-whatsapp:${companyId}:${date}:${recipient.customerId}`;
    const messageText=overdueMessage(recipient,store.notificationSettings?.overdueWhatsAppTemplate);
    const claim=await mutateDurable(current=>{
      current.notificationActions||=[];
      if(current.notificationActions.some(x=>x?.dedupeKey===dedupeKey&&["PENDING","SENT"].includes(x.deliveryStatus)))return null;
      const item={id:id(),action:"OVERDUE_WHATSAPP_MESSAGE",dedupeKey,customerId:recipient.customerId,customerName:recipient.name,whatsappNumber:recipient.whatsappNumber,triggerType:"OVERDUE_DAILY",balance:recipient.balance,days:recipient.days,messageText,channel:"WHATSAPP",status:"PENDING",deliveryStatus:"PENDING",provider:null,providerMessageId:null,error:null,createdAt:now(),sentAt:null,createdBy:"SYSTEM"};
      current.notificationActions.push(item);return item;
    });
    if(!claim){results.push({customerId:recipient.customerId,status:"SKIPPED_DUPLICATE"});continue;}
    let delivery;try{delivery=await sendWhatsApp({templateType:"OVERDUE",to:recipient.whatsappNumber,body:messageText,dedupeId:dedupeKey,contentVariables:{"1":recipient.name,"2":recipient.amount.toFixed(2),"3":String(recipient.days)}});}catch(error){delivery={ok:false,reason:String(error?.message||"DELIVERY_ERROR")};}
    await mutateDurable(current=>{const item=(current.notificationActions||[]).find(x=>x.id===claim.id);if(!item)return;item.status=item.deliveryStatus=delivery?.ok?"SENT":"FAILED";item.provider=delivery?.provider||null;item.providerMessageId=delivery?.providerMessageId||null;item.error=delivery?.ok?null:String(delivery?.reason||"DELIVERY_FAILED");item.sentAt=delivery?.ok?now():null;item.updatedAt=now();});
    results.push({customerId:recipient.customerId,status:delivery?.ok?"SENT":"FAILED"});
  }
  return results;
}
module.exports={overdueMessage,isOverdueRunDue,selectOverdueRecipients,executeOverdueMessages};
