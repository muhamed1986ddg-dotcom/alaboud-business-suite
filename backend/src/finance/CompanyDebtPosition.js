"use strict";

const { money, moneyToNumber } = require("./Money");

function moneySafe(value){
  try{return money(value??0);}catch{return 0n;}
}
function positiveMoney(value){
  const amount=moneySafe(value);
  return amount>0n?amount:0n;
}
function sumMoney(rows){
  return rows.reduce((sum,item)=>sum+moneySafe(item?.amount),0n);
}
function externalCurrencies(partner){
  const multi=partner?.externalBalances&&typeof partner.externalBalances==="object"?partner.externalBalances:null;
  const currencies=new Set();
  if(multi){
    for(const [currency,value] of Object.entries(multi)){
      if(!currency||!value||typeof value!=="object")continue;
      if(positiveMoney(value.receivable)>0n||positiveMoney(value.payable)>0n||moneySafe(value.balance)!==0n){
        currencies.add(String(currency).toUpperCase());
      }
    }
  }
  if(currencies.size===0&&(positiveMoney(partner?.externalReceivable)>0n||positiveMoney(partner?.externalPayable)>0n||moneySafe(partner?.externalBalance)!==0n)){
    currencies.add(String(partner?.accountCurrency||"USD").toUpperCase());
  }
  return currencies;
}
function mirrorsExternalBalance(item,partnerId,currency){
  const sourceRef=String(item?.sourceRef||"").trim().toUpperCase();
  const canonical=`PARTNER_EXTERNAL:${String(partnerId).toUpperCase()}:${String(currency).toUpperCase()}`;
  return sourceRef===canonical||sourceRef===`EXTERNAL_BALANCE:${String(partnerId).toUpperCase()}:${String(currency).toUpperCase()}`;
}

function calculatePartnerDebtBuckets(store,partner){
  const partnerTransactions=(Array.isArray(store?.partnerTransactions)?store.partnerTransactions:[]).filter(item=>item&&!item.isDeleted);
  const partnerPayments=(Array.isArray(store?.partnerPayments)?store.partnerPayments:[]).filter(item=>item&&!item.isDeleted);
  const externalCurrencySet=externalCurrencies(partner);
  const allTransactions=partnerTransactions.filter(item=>item.partnerId===partner.id);
  const excludedTransactions=allTransactions.filter(item=>mirrorsExternalBalance(item,partner.id,item.currency||"CAD"));
  const excludedTransactionIds=new Set(excludedTransactions.map(item=>item.id).filter(Boolean));
  const transactions=allTransactions.filter(item=>!excludedTransactions.includes(item));
  const allPayments=partnerPayments.filter(item=>item.partnerId===partner.id);
  const payments=allPayments.filter(item=>!excludedTransactionIds.has(item.transactionId)&&!mirrorsExternalBalance(item,partner.id,item.currency||"CAD"));

  const reviewFlags=[];
  for(const currency of externalCurrencySet){
    if(transactions.some(item=>String(item.currency||"CAD").toUpperCase()===currency))reviewFlags.push({
      partnerId:partner.id,
      partnerName:partner.name||"",
      currency,
      reviewStatus:"FLAGGED",
      warning:"يوجد رصيد خارجي وحركات محلية للعملة نفسها دون مرجع مباشر يحدد إن كانا مستقلين"
    });
  }

  const localBuckets=[];
  const currencies=new Set([
    ...transactions.map(item=>String(item.currency||"CAD").toUpperCase()),
    ...payments.map(item=>String(item.currency||"CAD").toUpperCase())
  ]);
  for(const currency of currencies){
    const grossReceivable=sumMoney(transactions.filter(item=>item.type==="RECEIVABLE"&&String(item.currency||"CAD").toUpperCase()===currency));
    const grossPayable=sumMoney(transactions.filter(item=>item.type==="PAYABLE"&&String(item.currency||"CAD").toUpperCase()===currency));
    const received=sumMoney(payments.filter(item=>item.direction==="RECEIVED"&&String(item.currency||"CAD").toUpperCase()===currency));
    const paid=sumMoney(payments.filter(item=>item.direction==="PAID"&&String(item.currency||"CAD").toUpperCase()===currency));
    const net=grossReceivable-grossPayable-received+paid;
    if(net===0n)continue;
    localBuckets.push(Object.freeze({
      kind:"LOCAL",
      currency,
      receivable:net>0n?moneyToNumber(net):0,
      payable:net<0n?moneyToNumber(-net):0,
      net:moneyToNumber(net),
      grossReceivable:moneyToNumber(grossReceivable),
      grossPayable:moneyToNumber(grossPayable),
      received:moneyToNumber(received),
      paid:moneyToNumber(paid)
    }));
  }

  const externalBuckets=[];
  const multi=partner?.externalBalances&&typeof partner.externalBalances==="object"?partner.externalBalances:null;
  const entries=multi?Object.entries(multi).filter(([currency,value])=>currency&&value&&typeof value==="object"):[];
  if(entries.length){
    for(const [rawCurrency,value] of entries){
      const currency=String(rawCurrency||partner.accountCurrency||"USD").toUpperCase();
      let receivable=positiveMoney(value.receivable);
      let payable=positiveMoney(value.payable);
      if(receivable===0n&&payable===0n){
        const balance=moneySafe(value.balance);
        if(balance>0n)receivable=balance;
        if(balance<0n)payable=-balance;
      }
      if(receivable===0n&&payable===0n)continue;
      externalBuckets.push(Object.freeze({
        kind:"EXTERNAL",
        currency,
        receivable:moneyToNumber(receivable),
        payable:moneyToNumber(payable),
        net:moneyToNumber(receivable-payable)
      }));
    }
  }else{
    const currency=String(partner?.accountCurrency||"USD").toUpperCase();
    let receivable=positiveMoney(partner?.externalReceivable);
    let payable=positiveMoney(partner?.externalPayable);
    if(receivable===0n&&payable===0n){
      const balance=moneySafe(partner?.externalBalance);
      if(balance>0n)receivable=balance;
      if(balance<0n)payable=-balance;
    }
    if(receivable!==0n||payable!==0n)externalBuckets.push(Object.freeze({
      kind:"EXTERNAL",
      currency,
      receivable:moneyToNumber(receivable),
      payable:moneyToNumber(payable),
      net:moneyToNumber(receivable-payable)
    }));
  }

  return Object.freeze({
    partnerId:partner.id,
    partnerName:partner.name||"",
    localBuckets:Object.freeze(localBuckets),
    externalBuckets:Object.freeze(externalBuckets),
    excludedDuplicateCount:excludedTransactions.length+(allPayments.length-payments.length),
    reviewFlags:Object.freeze(reviewFlags)
  });
}

function aggregateDebtBuckets(position,{toTarget=(amount)=>Number(amount)||0}={}){
  const convert=(amount,currency)=>{
    const value=Number(amount);
    if(!Number.isFinite(value)||value<=0)return 0;
    const converted=Number(toTarget(value,currency));
    return Number.isFinite(converted)&&converted>0?converted:0;
  };
  let localReceivable=0,localPayable=0,externalReceivable=0,externalPayable=0;
  for(const bucket of position.localBuckets||[]){
    localReceivable+=convert(bucket.receivable,bucket.currency);
    localPayable+=convert(bucket.payable,bucket.currency);
  }
  for(const bucket of position.externalBuckets||[]){
    externalReceivable+=convert(bucket.receivable,bucket.currency);
    externalPayable+=convert(bucket.payable,bucket.currency);
  }
  const receivable=localReceivable+externalReceivable;
  const payable=localPayable+externalPayable;
  return Object.freeze({
    localReceivable,
    localPayable,
    externalReceivable,
    externalPayable,
    receivable,
    payable,
    net:receivable-payable
  });
}

function calculateCompanyDebtPosition(store,{toCad=(amount)=>Number(amount)||0}={}){
  const partners=(Array.isArray(store?.partners)?store.partners:[]).filter(item=>item&&!item.isDeleted);
  let companyReceivables=0;
  let companyLocalPayables=0;
  let partnerAssets=0;
  let partnerPayables=0;
  let excludedPartnerDuplicateCount=0;
  const partnerReviewFlags=[];
  const partnerPositions=[];
  for(const partner of partners){
    const buckets=calculatePartnerDebtBuckets(store,partner);
    const totals=aggregateDebtBuckets(buckets,{toTarget:toCad});
    companyReceivables+=totals.localReceivable;
    companyLocalPayables+=totals.localPayable;
    partnerAssets+=totals.externalReceivable;
    partnerPayables+=totals.externalPayable;
    excludedPartnerDuplicateCount+=buckets.excludedDuplicateCount;
    partnerReviewFlags.push(...buckets.reviewFlags);
    partnerPositions.push(Object.freeze({partnerId:partner.id,buckets,totals}));
  }
  return Object.freeze({
    receivable:companyReceivables+partnerAssets,
    payable:companyLocalPayables+partnerPayables,
    net:(companyReceivables+partnerAssets)-(companyLocalPayables+partnerPayables),
    companyReceivables,
    companyLocalPayables,
    partnerAssets,
    partnerPayables,
    excludedPartnerDuplicateCount,
    partnerReviewFlags:Object.freeze(partnerReviewFlags),
    partnerPositions:Object.freeze(partnerPositions)
  });
}

module.exports={
  externalCurrencies,
  mirrorsExternalBalance,
  calculatePartnerDebtBuckets,
  aggregateDebtBuckets,
  calculateCompanyDebtPosition
};
