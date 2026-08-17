"use strict";

const { money, moneyToNumber, roundedDivide } = require("./Money");

// Money is stored at four decimal places, while the accounting statement is
// displayed in CAD cents. Convert every displayed component to integer cents
// before composing totals so the visible equations always reconcile exactly.
const MONEY_UNITS_PER_CENT = 100n;

function toCents(value){
  return roundedDivide(money(value??0),MONEY_UNITS_PER_CENT);
}

function centsToNumber(value){
  return moneyToNumber(value*MONEY_UNITS_PER_CENT);
}

function calculateCapitalOverviewFinancials({
  capitalContributions=0,
  capitalWithdrawals=0,
  accumulatedProfit=0,
  accumulatedExpenses=0,
  profitDistributions=0,
  totalReceivables=0,
  totalPayables=0,
  monthlyProfit=0,
  monthlyExpenses=0
}={}){
  const contributions=toCents(capitalContributions);
  const withdrawals=toCents(capitalWithdrawals);
  const grossProfit=toCents(accumulatedProfit);
  const expenses=toCents(accumulatedExpenses);
  const distributions=toCents(profitDistributions);
  const receivables=toCents(totalReceivables);
  const payables=toCents(totalPayables);
  const monthProfit=toCents(monthlyProfit);
  const monthExpenses=toCents(monthlyExpenses);

  const realizedNetProfit=grossProfit-expenses;
  const capitalBalance=contributions-withdrawals;
  const equityNetCapital=capitalBalance+realizedNetProfit-distributions;
  const netDebt=receivables-payables;
  // The product's primary "net capital" indicator is the comprehensive
  // operating position used by the legacy capital overview: equity plus the
  // net amount owed by customers and companies. Keep equity separate so the
  // monthly inventory reconciliation can still compare like with like.
  const comprehensiveNetCapital=equityNetCapital+netDebt;
  const monthlyNet=monthProfit-monthExpenses;

  return Object.freeze({
    capitalContributions:centsToNumber(contributions),
    capitalWithdrawals:centsToNumber(withdrawals),
    capitalBalance:centsToNumber(capitalBalance),
    accumulatedProfit:centsToNumber(grossProfit),
    accumulatedExpenses:centsToNumber(expenses),
    realizedNetProfit:centsToNumber(realizedNetProfit),
    profitDistributions:centsToNumber(distributions),
    equityNetCapital:centsToNumber(equityNetCapital),
    comprehensiveNetCapital:centsToNumber(comprehensiveNetCapital),
    netCapital:centsToNumber(comprehensiveNetCapital),
    totalReceivables:centsToNumber(receivables),
    totalPayables:centsToNumber(payables),
    netDebt:centsToNumber(netDebt),
    monthlyProfit:centsToNumber(monthProfit),
    monthlyExpenses:centsToNumber(monthExpenses),
    monthlyNet:centsToNumber(monthlyNet)
  });
}

module.exports={
  calculateCapitalOverviewFinancials,
  toCents,
  centsToNumber
};
