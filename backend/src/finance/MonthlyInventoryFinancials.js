"use strict";

const { money, moneyToNumber, roundedDivide } = require("./Money");
const { partitionManualDebts } = require("./DebtLinking");
const { calculateCompanyDebtPosition, externalCurrencies, mirrorsExternalBalance } = require("./CompanyDebtPosition");

function finite(value){
  const n=Number(value);
  return Number.isFinite(n)?n:0;
}

function moneySafe(value){
  try{return money(value??0);}catch{return 0n;}
}

function positiveMoney(value){
  const amount=moneySafe(value);
  return amount>0n?amount:0n;
}

function centMoney(value){
  const scaled=typeof value==="bigint"?value:moneySafe(value);
  return roundedDivide(scaled,100n)*100n;
}

function calculateNetCapital({capitalContributions=0,capitalWithdrawals=0,realizedNetProfit=0,profitDistributions=0}={}){
  return moneyToNumber(
    moneySafe(capitalContributions)
    - moneySafe(capitalWithdrawals)
    + moneySafe(realizedNetProfit)
    - moneySafe(profitDistributions)
  );
}

function calculateInventorySnapshot({
  netCapital=0,
  vaultCash=0,
  partnerAssets=0,
  customerReceivables=0,
  companyReceivables=0,
  manualReceivables=0,
  customerPayables=0,
  companyPayables=0,
  manualPayables=0
}={}){
  const normalized={
    netCapital:centMoney(netCapital),
    vaultCash:centMoney(positiveMoney(vaultCash)),
    partnerAssets:centMoney(positiveMoney(partnerAssets)),
    customerReceivables:centMoney(positiveMoney(customerReceivables)),
    companyReceivables:centMoney(positiveMoney(companyReceivables)),
    manualReceivables:centMoney(positiveMoney(manualReceivables)),
    customerPayables:centMoney(positiveMoney(customerPayables)),
    companyPayables:centMoney(positiveMoney(companyPayables)),
    manualPayables:centMoney(positiveMoney(manualPayables))
  };
  const totalAssets=(
    normalized.vaultCash
    + normalized.partnerAssets
    + normalized.customerReceivables
    + normalized.companyReceivables
    + normalized.manualReceivables
  );
  const totalLiabilities=(
    normalized.customerPayables
    + normalized.companyPayables
    + normalized.manualPayables
  );
  const finalValue=totalAssets-totalLiabilities;
  const inventoryDifference=finalValue-normalized.netCapital;
  return Object.freeze({
    currency:"CAD",
    netCapital:moneyToNumber(normalized.netCapital),
    vaultCash:moneyToNumber(normalized.vaultCash),
    partnerAssets:moneyToNumber(normalized.partnerAssets),
    customerReceivables:moneyToNumber(normalized.customerReceivables),
    companyReceivables:moneyToNumber(normalized.companyReceivables),
    manualReceivables:moneyToNumber(normalized.manualReceivables),
    customerPayables:moneyToNumber(normalized.customerPayables),
    companyPayables:moneyToNumber(normalized.companyPayables),
    manualPayables:moneyToNumber(normalized.manualPayables),
    totalAssets:moneyToNumber(totalAssets),
    totalLiabilities:moneyToNumber(totalLiabilities),
    finalValue:moneyToNumber(finalValue),
    inventoryDifference:moneyToNumber(inventoryDifference)
  });
}

function calculateInventoryPosition(store,{toCad,customerBalances={}}={}){
  if(typeof toCad!=="function")throw new TypeError("toCad is required");
  const addCad=(total,amount,currency="CAD")=>{
    const positive=positiveMoney(amount);
    if(positive===0n)return total;
    return total+moneySafe(toCad(moneyToNumber(positive),currency));
  };
  const remainingScaled=(total,paid)=>total>paid?total-paid:0n;

  // One authoritative company-debt formula for Companies, General Debts,
  // Capital Overview and Monthly Inventory. Local RECEIVABLE/PAYABLE movements
  // are netted per partner + currency before classification, exactly once.
  const companyPosition=calculateCompanyDebtPosition(store,{toCad});

  const debts=(Array.isArray(store?.generalDebts)?store.generalDebts:[]).filter(item=>item&&!item.isDeleted);
  const manualDebtPartition=partitionManualDebts(store,debts);
  const debtPayments=(Array.isArray(store?.generalDebtPayments)?store.generalDebtPayments:[]).filter(item=>item&&!item.isDeleted);
  const paidByDebt=new Map();
  for(const payment of debtPayments){
    paidByDebt.set(payment.debtId,(paidByDebt.get(payment.debtId)||0n)+moneySafe(payment.amount));
  }
  let manualReceivables=0n;
  let manualPayables=0n;
  for(const debt of manualDebtPartition.included){
    const remaining=remainingScaled(positiveMoney(debt.amount),paidByDebt.get(debt.id)||0n);
    const currency=String(debt.currency||"CAD").toUpperCase();
    if(debt.type==="RECEIVABLE")manualReceivables=addCad(manualReceivables,moneyToNumber(remaining),currency);
    if(debt.type==="PAYABLE")manualPayables=addCad(manualPayables,moneyToNumber(remaining),currency);
  }

  return Object.freeze({
    partnerAssets:companyPosition.partnerAssets,
    customerReceivables:moneyToNumber(positiveMoney(customerBalances.receivable)),
    companyReceivables:companyPosition.companyReceivables,
    manualReceivables:moneyToNumber(manualReceivables),
    customerPayables:moneyToNumber(positiveMoney(customerBalances.payable)),
    companyPayables:companyPosition.companyLocalPayables+companyPosition.partnerPayables,
    manualPayables:moneyToNumber(manualPayables),
    companyLocalPayables:companyPosition.companyLocalPayables,
    partnerPayables:companyPosition.partnerPayables,
    excludedManualDuplicateCount:manualDebtPartition.linkedDuplicates.length,
    manualDebtReviewFlags:manualDebtPartition.reviewFlags,
    excludedPartnerDuplicateCount:companyPosition.excludedPartnerDuplicateCount,
    partnerReviewFlags:companyPosition.partnerReviewFlags
  });
}

function calculateInventoryPayables(store,{toCad}){
  if(typeof toCad!=="function")throw new TypeError("toCad is required");
  const companyPosition=calculateCompanyDebtPosition(store,{toCad});
  const companyLocal=companyPosition.companyLocalPayables;
  const companyExternal=companyPosition.partnerPayables;

  const generalDebts=partitionManualDebts(store,store?.generalDebts).included.filter(item=>item.type==="PAYABLE");
  const debtPayments=(Array.isArray(store?.generalDebtPayments)?store.generalDebtPayments:[]).filter(item=>item&&!item.isDeleted);
  const paidByDebt=new Map();
  for(const payment of debtPayments)paidByDebt.set(payment.debtId,(paidByDebt.get(payment.debtId)||0)+finite(payment.amount));
  let manual=0;
  for(const debt of generalDebts){
    const remaining=Math.max(finite(debt.amount)-finite(paidByDebt.get(debt.id)),0);
    manual+=toCad(remaining,debt.currency||"CAD");
  }

  return {companyLocal,companyExternal,manual,total:companyLocal+companyExternal+manual};
}

function calculateInventoryMonthProfit(store,{month,transactionFinancials}){
  if(typeof transactionFinancials!=="function")throw new TypeError("transactionFinancials is required");
  const transactions=(Array.isArray(store?.transactions)?store.transactions:[])
    .filter(item=>item&&!item.isDeleted&&item.status!=="CANCELLED"&&String(item.transferDate||item.createdAt||"").slice(0,7)===month);
  const expenses=(Array.isArray(store?.expenses)?store.expenses:[])
    .filter(item=>item&&!item.isDeleted&&String(item.date||item.createdAt||"").slice(0,7)===month);
  const grossProfit=transactions.reduce((sum,item)=>sum+finite(transactionFinancials(item).totalProfit),0);
  const totalExpenses=expenses.reduce((sum,item)=>sum+finite(item.cadAmount??item.amount),0);
  return {grossProfit,expenses:totalExpenses,netProfit:grossProfit-totalExpenses};
}

module.exports={
  calculateNetCapital,
  calculateInventorySnapshot,
  calculateInventoryPosition,
  calculateInventoryPayables,
  calculateInventoryMonthProfit,
  externalCurrencies,
  mirrorsExternalBalance
};
