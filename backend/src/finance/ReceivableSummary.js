"use strict";

function finite(value){
  const n=Number(value);
  return Number.isFinite(n)?n:0;
}
function money(value){return Math.round((finite(value)+Number.EPSILON)*100)/100;}
function calculateReceivableSummary({customerReceivable=0,companyReceivable=0,companyPayable=0,manualReceivable=0,manualPayable=0}={}){
  const customers=money(customerReceivable);
  const companies=money(companyReceivable);
  const companyDue=money(companyPayable);
  const manualForUs=money(manualReceivable);
  const manualOnUs=money(manualPayable);
  // Authoritative business KPI: customer balances + company balances only.
  // Manual rows stay visible for reconciliation and never inflate the headline KPI.
  const receivable=money(customers+companies);
  const payable=money(companyDue+manualOnUs);
  return Object.freeze({
    receivable,payable,net:money(receivable-payable),
    breakdown:Object.freeze({customers,companies,manual:manualForUs,companyPayable:companyDue,manualPayable:manualOnUs,total:receivable})
  });
}
module.exports={calculateReceivableSummary,money};
