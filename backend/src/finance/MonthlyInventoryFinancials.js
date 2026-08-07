"use strict";

function finite(value){
  const n=Number(value);
  return Number.isFinite(n)?n:0;
}

function calculateInventoryPayables(store,{toCad}){
  if(typeof toCad!=="function")throw new TypeError("toCad is required");
  const partners=Array.isArray(store?.partners)?store.partners:[];
  const partnerTransactions=(Array.isArray(store?.partnerTransactions)?store.partnerTransactions:[]).filter(item=>item&&!item.isDeleted);
  const partnerPayments=(Array.isArray(store?.partnerPayments)?store.partnerPayments:[]).filter(item=>item&&!item.isDeleted);

  let companyLocal=0;
  for(const partner of partners){
    const txs=partnerTransactions.filter(item=>item.partnerId===partner.id);
    const pays=partnerPayments.filter(item=>item.partnerId===partner.id);
    const currencies=new Set([...txs.map(item=>String(item.currency||"CAD").toUpperCase()),...pays.map(item=>String(item.currency||"CAD").toUpperCase())]);
    for(const currency of currencies){
      const payable=txs.filter(item=>item.type==="PAYABLE"&&String(item.currency||"CAD").toUpperCase()===currency).reduce((sum,item)=>sum+finite(item.amount),0);
      const paid=pays.filter(item=>item.direction==="PAID"&&String(item.currency||"CAD").toUpperCase()===currency).reduce((sum,item)=>sum+finite(item.amount),0);
      companyLocal+=toCad(Math.max(payable-paid,0),currency);
    }
  }

  let companyExternal=0;
  for(const partner of partners){
    const multi=partner.externalBalances&&typeof partner.externalBalances==="object"?partner.externalBalances:null;
    const entries=multi?Object.entries(multi).filter(([currency,value])=>currency&&value&&typeof value==="object"):[];
    if(entries.length){
      for(const [currency,value] of entries)companyExternal+=toCad(Math.max(finite(value.payable),0),currency);
      continue;
    }
    const currency=String(partner.accountCurrency||"USD").toUpperCase();
    const explicitPayable=Math.max(finite(partner.externalPayable),0);
    if(explicitPayable>0)companyExternal+=toCad(explicitPayable,currency);
    else if(finite(partner.externalBalance)<0)companyExternal+=toCad(Math.abs(finite(partner.externalBalance)),currency);
  }

  const generalDebts=(Array.isArray(store?.generalDebts)?store.generalDebts:[]).filter(item=>item&&!item.isDeleted&&item.type==="PAYABLE");
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

module.exports={calculateInventoryPayables,calculateInventoryMonthProfit};
