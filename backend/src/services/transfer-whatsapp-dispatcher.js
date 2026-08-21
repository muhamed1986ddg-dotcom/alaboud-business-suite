"use strict";

function createTransferWhatsappDispatcher({runWithTenant,readStore,mutateDurable,id,now,customerSummary,executeTransferCreatedMessage,executeZeroBalanceMessage,sendWhatsApp,logger=console}){
  const dispatchZero=payload=>runWithTenant(payload.companyId,payload.branchId,()=>executeZeroBalanceMessage({...payload,store:readStore(),customerSummary,mutateDurable,id,now,sendWhatsApp}));
  const dispatch=payload=>runWithTenant(payload.companyId,payload.branchId,async()=>{const store=readStore(),transaction=(store.transactions||[]).find(item=>item?.id===payload.transactionId);const zero=await executeZeroBalanceMessage({...payload,customerId:transaction?.customerId,operationId:payload.transactionId,store,customerSummary,mutateDurable,id,now,sendWhatsApp});return zero.handled?zero:executeTransferCreatedMessage({store,companyId:payload.companyId,transactionId:payload.transactionId,customerSummary,mutateDurable,id,now,sendWhatsApp});});
  const dispatchSafely=async payload=>{try{return await dispatch(payload);}catch(error){logger.error("Transfer WhatsApp delivery failed after commit:",error?.message||error);return {status:"FAILED",error:String(error?.message||error)};}};
  const dispatchZeroSafely=async payload=>{try{return await dispatchZero(payload);}catch(error){logger.error("Zero-balance WhatsApp delivery failed after commit:",error?.message||error);return {status:"FAILED",error:String(error?.message||error)};}};
  return {dispatch,dispatchSafely,dispatchZero,dispatchZeroSafely};
}

module.exports={createTransferWhatsappDispatcher};
