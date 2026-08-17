"use strict";

function finite(value){
  const n=Number(value);
  return Number.isFinite(n)?n:0;
}
function money(value){return Math.round((finite(value)+Number.EPSILON)*100)/100;}
function calculateReceivableSummary({customerReceivable=0,customerPayable=0,companyReceivable=0,companyPayable=0,manualReceivable=0,manualPayable=0}={}){
  const customers=money(customerReceivable);
  const customerDue=money(customerPayable);
  const companies=money(companyReceivable);
  const companyDue=money(companyPayable);
  const manualForUs=money(manualReceivable);
  const manualOnUs=money(manualPayable);
  // The comprehensive KPI includes both manual directions symmetrically. Any
  // manual row that directly mirrors an official source must be filtered by
  // DebtLinking before reaching this pure arithmetic function.
  const receivable=money(customers+companies+manualForUs);
  const payable=money(customerDue+companyDue+manualOnUs);
  return Object.freeze({
    receivable,payable,net:money(receivable-payable),
    breakdown:Object.freeze({customers,customerPayable:customerDue,companies,manual:manualForUs,companyPayable:companyDue,manualPayable:manualOnUs,total:receivable})
  });
}
module.exports={calculateReceivableSummary,money};
