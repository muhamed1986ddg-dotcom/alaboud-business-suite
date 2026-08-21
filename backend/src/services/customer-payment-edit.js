"use strict";

const { transactionFinancials } = require("../finance/TransactionFinancials");
const { assertBalancedEntry, markSoftDeleted } = require("../finance/FinancialIntegrity");
const { planGroupedCustomerPayment } = require("../finance/CustomerPaymentReallocation");

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function editGroupedCustomerPayment({store,payment,body,user,id,now,isAfterCustomerReset}) {
  const batchId=payment.paymentBatchId;
  const batchRows=(store.payments||[]).filter(item=>!item.isDeleted&&(
    (batchId&&item.paymentBatchId===batchId) || item.id===payment.id
  ));
  const receipt=batchRows.find(item=>item.recordType==="CUSTOMER_PAYMENT_RECEIPT")||payment;
  const previousAmount=+safeNumber(receipt.originalAmount,receipt.amount).toFixed(2);
  const requestedAmount=body.amount!==undefined?Number(body.amount):previousAmount;
  if(!Number.isFinite(requestedAmount)||requestedAmount<=0)throw new Error("مبلغ الدفعة غير صحيح");
  const amountChanged=Math.abs(requestedAmount-previousAmount)>0.001;

  if(!amountChanged){
    for(const item of batchRows){
      if(body.method!==undefined)item.method=body.method;
      if(body.notes!==undefined)item.notes=body.notes;
      if(body.reference!==undefined)item.reference=body.reference;
      if(body.paymentDate!==undefined)item.paymentDate=body.paymentDate;
      item.updatedAt=now();
      item.updatedBy=user.id;
    }
    return {
      updated:{...receipt,amount:previousAmount},
      auditData:{paymentBatchId:batchId,newData:{...receipt}}
    };
  }

  // Old legacy allocation batches have no canonical receipt row, so there is
  // no safe authoritative amount to rewrite in-place.
  if(receipt.recordType!=="CUSTOMER_PAYMENT_RECEIPT"){
    throw new Error("هذه دفعة قديمة موزعة ولا يمكن إعادة توزيع مبلغها تلقائيًا. احذفها وسجلها من جديد.");
  }

  const customer=(store.customers||[]).find(item=>item.id===receipt.customerId&&!item.isDeleted);
  if(!customer)throw new Error("العميل غير موجود");

  const oldData={
    ...receipt,
    amount:previousAmount,
    allocations:Array.isArray(receipt.allocations)?receipt.allocations.map(item=>({...item})):[]
  };
  const editTime=now();
  const effectiveBatchId=batchId||receipt.paymentBatchId||id();
  const effectiveMethod=body.method!==undefined?body.method:(receipt.method||"CASH");
  const effectiveNotes=body.notes!==undefined?body.notes:(receipt.notes||"");
  const effectiveReference=body.reference!==undefined?body.reference:(receipt.reference||"");
  const effectivePaymentDate=body.paymentDate!==undefined
    ?body.paymentDate
    :(receipt.paymentDate||new Date().toISOString().slice(0,10));

  // Undo only this receipt's opening-balance allocation before replanning it.
  const previousOldBalanceAllocation=Math.max(safeNumber(receipt.oldBalanceAllocation),0);
  const oldBalanceType=String(customer.oldBalanceType||"RECEIVABLE").toUpperCase()==="PAYABLE"?"PAYABLE":"RECEIVABLE";
  if(oldBalanceType==="RECEIVABLE"&&previousOldBalanceAllocation>0){
    const stored=Math.max(safeNumber(customer.oldBalance),0);
    const legacyPaid=Math.min(Math.max(safeNumber(customer.oldBalancePaid),0),stored);
    const current=Math.max(stored-legacyPaid,0);
    customer.oldBalance=+(current+previousOldBalanceAllocation).toFixed(2);
    customer.oldBalancePaid=0;
  }

  // Keep the old child allocations as soft-deleted audit history.
  const oldAllocationRows=batchRows.filter(item=>item.id!==receipt.id&&item.recordType!=="CUSTOMER_PAYMENT_RECEIPT");
  for(const item of oldAllocationRows){
    markSoftDeleted(item,{userId:user.id,reason:"إعادة توزيع بعد تعديل مبلغ الدفعة",at:editTime});
  }

  // Every OTHER active payment remains authoritative while this batch is rebuilt.
  const rows=(store.transactions||[])
    .filter(item=>item.customerId===customer.id&&!item.isDeleted&&item.status!=="CANCELLED"&&isAfterCustomerReset(item,customer,"transferDate"))
    .sort((a,b)=>String(a.transferDate||a.createdAt||"").localeCompare(String(b.transferDate||b.createdAt||"")))
    .map(transaction=>{
      const paid=(store.payments||[])
        .filter(item=>item.transactionId===transaction.id&&!item.isDeleted&&item.recordType!=="CUSTOMER_PAYMENT_RECEIPT"&&isAfterCustomerReset(item,customer,"paymentDate"))
        .reduce((sum,item)=>sum+safeNumber(item.amount),0);
      return {transaction,remaining:Math.max(transactionFinancials(transaction).totalCustomerDue-paid,0)};
    })
    .filter(row=>row.remaining>0.0001);

  const storedOldBalance=Math.max(safeNumber(customer.oldBalance),0);
  const legacyOldBalancePaid=Math.min(Math.max(safeNumber(customer.oldBalancePaid),0),storedOldBalance);
  const oldBalanceRemaining=oldBalanceType==="RECEIVABLE"?Math.max(storedOldBalance-legacyOldBalancePaid,0):0;
  if(oldBalanceType==="RECEIVABLE")customer.oldBalance=+oldBalanceRemaining.toFixed(2);
  else customer.oldBalance=+storedOldBalance.toFixed(2);
  customer.oldBalancePaid=0;

  const plan=planGroupedCustomerPayment(rows,requestedAmount,oldBalanceRemaining);
  const allocations=[];
  for(const planned of plan.allocations){
    const allocation={
      id:id(),transactionId:planned.transactionId,customerId:customer.id,amount:planned.amount,
      method:effectiveMethod,notes:effectiveNotes,reference:effectiveReference,paymentDate:effectivePaymentDate,
      date:receipt.date||editTime,receivedBy:receipt.receivedBy||user.id,isDeleted:false,
      allocationMode:"CUSTOMER_AUTO",recordType:"PAYMENT_ALLOCATION",paymentBatchId:effectiveBatchId,
      updatedAt:editTime,updatedBy:user.id
    };
    store.payments.push(allocation);
    allocations.push(allocation);
  }

  customer.oldBalance=plan.oldBalanceAfter;
  customer.oldBalancePaid=0;
  const allocatedToTransactions=allocations.reduce((sum,item)=>sum+safeNumber(item.amount),0);
  assertBalancedEntry([
    {account:"CUSTOMER_PAYMENT_RECEIPT",debit:+requestedAmount.toFixed(2)},
    {account:"TRANSFER_ALLOCATIONS",credit:+allocatedToTransactions.toFixed(2)},
    {account:"OLD_BALANCE_ALLOCATION",credit:+plan.oldBalanceAllocation.toFixed(2)}
  ]);

  receipt.paymentBatchId=effectiveBatchId;
  receipt.amount=+requestedAmount.toFixed(2);
  receipt.originalAmount=+requestedAmount.toFixed(2);
  receipt.oldBalanceAllocation=plan.oldBalanceAllocation;
  receipt.oldBalanceBefore=+oldBalanceRemaining.toFixed(2);
  receipt.oldBalanceAfter=plan.oldBalanceAfter;
  receipt.method=effectiveMethod;
  receipt.notes=effectiveNotes;
  receipt.reference=effectiveReference;
  receipt.paymentDate=effectivePaymentDate;
  receipt.allocations=allocations.map(item=>({transactionId:item.transactionId,amount:item.amount}));
  receipt.updatedAt=editTime;
  receipt.updatedBy=user.id;

  return {
    updated:{...receipt,amount:+requestedAmount.toFixed(2),isGroupedPayment:true},
    auditData:{
      paymentBatchId:effectiveBatchId,amountReallocated:true,oldData,newData:{...receipt},
      replacedAllocationIds:oldAllocationRows.map(item=>item.id),allocations:receipt.allocations
    }
  };
}

module.exports={editGroupedCustomerPayment};
