"use strict";

function finite(value){const number=Number(value);return Number.isFinite(number)?number:0;}

function normalizeWhatsappNumber(value){
  const raw=String(value||"").trim();
  if(!raw)return "";
  const digits=raw.replace(/\D/g,"");
  if(digits.length<8||digits.length>15)return "";
  return `+${digits}`;
}

function hasFinancialActivity(store,customer,summary){
  if(Math.abs(finite(summary?.openingBalanceInitial??summary?.oldBalance))>=0.005)return true;
  const transactions=(Array.isArray(store?.transactions)?store.transactions:[])
    .filter(item=>item&&!item.isDeleted&&item.status!=="CANCELLED"&&item.customerId===customer.id);
  if(transactions.length)return true;
  const transactionIds=new Set(transactions.map(item=>item.id));
  return (Array.isArray(store?.payments)?store.payments:[]).some(item=>item&&!item.isDeleted&&(item.customerId===customer.id||transactionIds.has(item.transactionId)));
}

function selectMonthlyBalanceRecipients(store,{customerSummary}={}){
  if(typeof customerSummary!=="function")throw new TypeError("customerSummary is required");
  return (Array.isArray(store?.customers)?store.customers:[])
    .filter(customer=>customer&&!customer.isDeleted&&customer.active!==false)
    .map(customer=>({customer,summary:customerSummary(store,customer)}))
    .filter(({customer,summary})=>Math.abs(finite(summary.finalBalance))>=0.005&&hasFinancialActivity(store,customer,summary))
    .map(({customer,summary})=>({
      customerId:customer.id,
      name:String(summary.name||customer.name||"عميل"),
      whatsappNumber:normalizeWhatsappNumber(customer.whatsapp||customer.phone),
      balance:+finite(summary.finalBalance).toFixed(2),
      amount:+Math.abs(finite(summary.finalBalance)).toFixed(2),
      direction:finite(summary.finalBalance)>0?"CUSTOMER_OWES_US":"WE_OWE_CUSTOMER"
    }))
    .filter(recipient=>recipient.whatsappNumber);
}

function balanceDirectionText(direction){return direction==="CUSTOMER_OWES_US"?"المبلغ المستحق لنا":"المبلغ المستحق لكم";}

function monthlyBalanceMessage(recipient,date,template=""){
  const values={customerName:recipient.name,name:recipient.name,date:String(date||""),balance:recipient.amount.toFixed(2),balanceDirection:balanceDirectionText(recipient.direction)};
  const fallback="مرحباً {customerName}\n\nمجموع حسابكم حتى تاريخ {date}:\n{balance} CAD\n\n{balanceDirection}\n\nيرجى مراجعة الحساب، وشكراً.\nشركة العبود";
  return String(template||fallback).replace(/\{(customerName|name|date|balance|balanceDirection)\}/g,(_match,key)=>values[key]);
}

function monthlyBalanceDedupeKey(companyId,customerId,month){return `monthly-account-whatsapp:${companyId||"company"}:${month}:${customerId}`;}

function monthlyMessageSettings(settings={}){
  const day=Math.max(1,Math.min(28,Math.trunc(finite(settings.monthlyAccountMessageDay)||19)));
  const time=/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(settings.monthlyAccountMessageTime||""))?String(settings.monthlyAccountMessageTime):"09:00";
  return {enabled:Boolean(settings.monthlyAccountWhatsAppEnabled??settings.monthlyAccountMessagesEnabled),day,time};
}

function isScheduledRunDue(settings,local){
  const config=monthlyMessageSettings(settings);
  return config.enabled&&Number(local?.day)===config.day&&String(local?.time||"")>=config.time;
}

async function executeMonthlyAccountMessages({
  store,companyId,triggerType="SCHEDULED",force=false,local,customerSummary,mutateDurable,id,now,sendWhatsApp
}){
  if(!force&&!isScheduledRunDue(store.notificationSettings||{},local))return [];
  const month=local.date.slice(0,7),results=[];
  const recipients=selectMonthlyBalanceRecipients(store,{customerSummary});
  for(const recipient of recipients){
    const dedupeKey=monthlyBalanceDedupeKey(companyId,recipient.customerId,month);
    const messageText=monthlyBalanceMessage(recipient,local.date,store.notificationSettings?.monthlyAccountMessageTemplate);
    const claim=await mutateDurable(current=>{
      current.notificationActions ||= [];
      const existing=current.notificationActions.find(item=>item?.dedupeKey===dedupeKey&&["PENDING","SENT"].includes(item.deliveryStatus));
      if(existing){
        current.notificationActions.push({id:id(),customerId:recipient.customerId,customerName:recipient.name,whatsappNumber:recipient.whatsappNumber,action:"MONTHLY_BALANCE_MESSAGE",yearMonth:month,balance:recipient.balance,balanceDirection:recipient.direction,messageText,channel:"WHATSAPP",status:"SKIPPED_DUPLICATE",deliveryStatus:"SKIPPED_DUPLICATE",error:"DUPLICATE_IDEMPOTENCY",duplicateOf:existing.id,triggerType,createdAt:now(),sentAt:null,createdBy:triggerType==="MONTHLY_ACCOUNT"?"SYSTEM":"ADMIN"});
        return null;
      }
      const item={id:id(),customerId:recipient.customerId,customerName:recipient.name,whatsappNumber:recipient.whatsappNumber,action:"MONTHLY_BALANCE_MESSAGE",yearMonth:month,month,dedupeKey,balance:recipient.balance,amount:recipient.amount,balanceDirection:recipient.direction,direction:recipient.direction,messageText,channel:"WHATSAPP",status:"PENDING",deliveryStatus:"PENDING",provider:"twilio",providerMessageId:null,error:null,triggerType,createdAt:now(),sentAt:null,createdBy:triggerType==="MONTHLY_ACCOUNT"?"SYSTEM":"ADMIN"};
      current.notificationActions.push(item);return item;
    });
    if(!claim){results.push({customerId:recipient.customerId,status:"SKIPPED_DUPLICATE",reason:"DUPLICATE_IDEMPOTENCY"});continue;}
    let delivery;
    try{delivery=await sendWhatsApp({templateType:"MONTHLY_ACCOUNT",to:recipient.whatsappNumber,body:messageText,contentVariables:{"1":recipient.name,"2":local.date,"3":recipient.amount.toFixed(2),"4":balanceDirectionText(recipient.direction)}});}
    catch(error){delivery={ok:false,reason:String(error?.message||"DELIVERY_ERROR")};}
    await mutateDurable(current=>{
      const item=(current.notificationActions||[]).find(entry=>entry.id===claim.id);if(!item)return;
      item.status=item.deliveryStatus=delivery?.ok?"SENT":"FAILED";item.provider=delivery?.provider||null;item.providerMessageId=delivery?.providerMessageId||null;
      item.error=item.failureReason=delivery?.ok?null:String(delivery?.reason||"DELIVERY_FAILED");item.sentAt=delivery?.ok?now():null;item.updatedAt=now();
    });
    results.push({customerId:recipient.customerId,status:delivery?.ok?"SENT":"FAILED"});
  }
  return results;
}

function transferMessage(recipient,transaction){
  return `مرحباً ${recipient.name}\n\nتم تسجيل حوالة جديدة على حسابكم.\n\nمبلغ الحوالة:\n${finite(transaction.amount).toFixed(2)} ${String(transaction.currency||"CAD").toUpperCase()}\n\nمجموع حسابكم الحالي:\n${recipient.amount.toFixed(2)} CAD\n\n${balanceDirectionText(recipient.direction)}\n\nشركة العبود`;
}

function transferMessageDedupeKey(companyId,customerId,transactionId){return `transfer-created-whatsapp:${companyId}:${customerId}:${transactionId}`;}

async function executeTransferCreatedMessage({store,companyId,transactionId,customerSummary,mutateDurable,id,now,sendWhatsApp}){
  if(!store.notificationSettings?.automaticTransferWhatsAppEnabled)return {status:"DISABLED"};
  const transaction=(store.transactions||[]).find(item=>item?.id===transactionId&&!item.isDeleted);
  if(!transaction?.customerId)return {status:"NOT_APPLICABLE"};
  const customer=(store.customers||[]).find(item=>item?.id===transaction.customerId&&!item.isDeleted&&item.active!==false);
  if(!customer)return {status:"NOT_APPLICABLE"};
  const summary=customerSummary(store,customer),number=normalizeWhatsappNumber(customer.whatsapp||customer.phone);
  const balance=+finite(summary.finalBalance).toFixed(2),direction=balance>0?"CUSTOMER_OWES_US":"WE_OWE_CUSTOMER";
  const recipient={customerId:customer.id,name:String(summary.name||customer.name||"عميل"),whatsappNumber:number,balance,amount:+Math.abs(balance).toFixed(2),direction};
  const dedupeKey=transferMessageDedupeKey(companyId,customer.id,transaction.id),messageText=number?transferMessage(recipient,transaction):"";
  const claim=await mutateDurable(current=>{
    current.notificationActions||=[];
    if(current.notificationActions.some(item=>item?.dedupeKey===dedupeKey))return null;
    const status=number?"PENDING":"SKIPPED_NO_WHATSAPP";
    const item={id:id(),action:"TRANSFER_WHATSAPP_MESSAGE",dedupeKey,customerId:customer.id,customerName:recipient.name,whatsappNumber:number,triggerType:"TRANSFER_CREATED",transactionId:transaction.id,transferAmount:+finite(transaction.amount).toFixed(2),transferCurrency:String(transaction.currency||"CAD").toUpperCase(),balance,balanceDirection:direction,messageText,yearMonth:String(transaction.createdAt||now()).slice(0,7),channel:"WHATSAPP",status,deliveryStatus:status,provider:"twilio",providerMessageId:null,error:number?null:"NO_VALID_WHATSAPP",createdAt:now(),sentAt:null,createdBy:"SYSTEM"};
    current.notificationActions.push(item);return number?item:false;
  });
  if(claim===null)return {status:"SKIPPED_DUPLICATE"};
  if(claim===false)return {status:"SKIPPED_NO_WHATSAPP"};
  let delivery;try{delivery=await sendWhatsApp({templateType:"TRANSFER_CREATED",to:number,body:messageText,contentVariables:{"1":recipient.name,"2":finite(transaction.amount).toFixed(2),"3":String(transaction.currency||"CAD").toUpperCase(),"4":recipient.amount.toFixed(2),"5":balanceDirectionText(direction)}});}catch(error){delivery={ok:false,reason:String(error?.message||"DELIVERY_ERROR")};}
  await mutateDurable(current=>{const item=(current.notificationActions||[]).find(entry=>entry.id===claim.id);if(!item)return;item.status=item.deliveryStatus=delivery?.ok?"SENT":"FAILED";item.provider=delivery?.provider||null;item.providerMessageId=delivery?.providerMessageId||null;item.error=delivery?.ok?null:String(delivery?.reason||"DELIVERY_FAILED");item.sentAt=delivery?.ok?now():null;item.updatedAt=now();});
  return {status:delivery?.ok?"SENT":"FAILED",balance};
}

module.exports={normalizeWhatsappNumber,hasFinancialActivity,selectMonthlyBalanceRecipients,balanceDirectionText,monthlyBalanceMessage,monthlyBalanceDedupeKey,monthlyMessageSettings,isScheduledRunDue,executeMonthlyAccountMessages,transferMessage,transferMessageDedupeKey,executeTransferCreatedMessage};
