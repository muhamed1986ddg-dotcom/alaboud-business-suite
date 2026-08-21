"use strict";

const {money}=require("../finance/Money");
const {normalizeWhatsappNumber}=require("./monthly-customer-balance-messages");

function balanceAtCent(value){const number=Number(value);return Number.isFinite(number)?money(number.toFixed(2)):0n;}
function isZeroBalance(value){return balanceAtCent(value)===0n;}
function isZeroBalanceTransition(previousBalance,currentBalance){return !isZeroBalance(previousBalance)&&isZeroBalance(currentBalance);}
function zeroBalanceDedupeKey(companyId,customerId,operationId){return `zero-balance-whatsapp:${companyId}:${customerId}:${operationId}`;}
function zeroBalanceMessage(customerName){return `مرحباً ${customerName}\n\nتم تسوية حسابكم بالكامل.\n\nرصيد حسابكم الحالي:\n0.00 CAD\n\nحسابكم الآن صفر.\n\nشكراً لكم.\nشركة العبود`;}

async function executeZeroBalanceMessage({store,companyId,customerId,operationId,transactionId=null,previousBalance,customerSummary,mutateDurable,id,now,sendWhatsApp}){
  if(!store.notificationSettings?.zeroBalanceWhatsAppEnabled)return {status:"DISABLED",handled:false};
  const customer=(store.customers||[]).find(item=>item?.id===customerId&&!item.isDeleted&&item.active!==false);
  if(!customer)return {status:"NOT_APPLICABLE",handled:false};
  const summary=customerSummary(store,customer),currentBalance=Number(summary.finalBalance||0);
  if(!isZeroBalanceTransition(previousBalance,currentBalance))return {status:"NOT_ZERO_TRANSITION",handled:false,currentBalance};
  const whatsappNumber=normalizeWhatsappNumber(customer.whatsapp||customer.phone),dedupeKey=zeroBalanceDedupeKey(companyId,customer.id,operationId),messageText=zeroBalanceMessage(String(summary.name||customer.name||"عميل"));
  const claim=await mutateDurable(current=>{
    current.notificationActions||=[];
    if(current.notificationActions.some(item=>item?.dedupeKey===dedupeKey))return null;
    const status=whatsappNumber?"PENDING":"SKIPPED_NO_WHATSAPP";
    const item={id:id(),action:"ZERO_BALANCE_WHATSAPP_MESSAGE",dedupeKey,customerId:customer.id,customerName:String(summary.name||customer.name||"عميل"),whatsappNumber,triggerType:"ZERO_BALANCE",operationId,transactionId,previousBalance:+Number(previousBalance||0).toFixed(2),balance:0,balanceDirection:null,messageText,yearMonth:String(now()).slice(0,7),channel:"WHATSAPP",status,deliveryStatus:status,provider:"twilio",providerMessageId:null,error:whatsappNumber?null:"NO_VALID_WHATSAPP",createdAt:now(),sentAt:null,createdBy:"SYSTEM"};
    current.notificationActions.push(item);return whatsappNumber?item:false;
  });
  if(claim===null)return {status:"SKIPPED_DUPLICATE",handled:true};
  if(claim===false)return {status:"SKIPPED_NO_WHATSAPP",handled:true};
  let delivery;try{delivery=await sendWhatsApp({templateType:"ZERO_BALANCE",to:whatsappNumber,body:messageText,contentVariables:{"1":String(summary.name||customer.name||"عميل")}});}catch(error){delivery={ok:false,reason:String(error?.message||"DELIVERY_ERROR")};}
  await mutateDurable(current=>{const item=(current.notificationActions||[]).find(entry=>entry.id===claim.id);if(!item)return;item.status=item.deliveryStatus=delivery?.ok?"SENT":"FAILED";item.provider=delivery?.provider||null;item.providerMessageId=delivery?.providerMessageId||null;item.error=delivery?.ok?null:String(delivery?.reason||"DELIVERY_FAILED");item.sentAt=delivery?.ok?now():null;item.updatedAt=now();});
  return {status:delivery?.ok?"SENT":"FAILED",handled:true,currentBalance:0};
}

module.exports={balanceAtCent,isZeroBalance,isZeroBalanceTransition,zeroBalanceDedupeKey,zeroBalanceMessage,executeZeroBalanceMessage};
