import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {test} from "node:test";

const require=createRequire(import.meta.url);
const {calculateCapitalOverviewFinancials}=require("./CapitalOverviewFinancials.js");
const {calculateInventorySnapshot}=require("./MonthlyInventoryFinancials.js");

test("the displayed receivable equation reconciles to the cent",()=>{
  const result=calculateCapitalOverviewFinancials({
    totalReceivables:146629.496,
    totalPayables:13933.084
  });

  assert.equal(result.totalReceivables,146629.50);
  assert.equal(result.totalPayables,13933.08);
  assert.equal(result.netDebt,132696.42);
  assert.equal(result.netDebt,Number((result.totalReceivables-result.totalPayables).toFixed(2)));
});

test("the displayed capital equation uses the independently visible components",()=>{
  const result=calculateCapitalOverviewFinancials({
    capitalContributions:36249.03,
    capitalWithdrawals:0,
    accumulatedProfit:14684.22,
    accumulatedExpenses:7184.43,
    profitDistributions:0
  });

  assert.equal(result.realizedNetProfit,7499.79);
  assert.equal(result.netCapital,43748.82);
  assert.equal(
    result.netCapital,
    Number((result.capitalContributions-result.capitalWithdrawals+result.realizedNetProfit-result.profitDistributions).toFixed(2))
  );
});

test("final inventory rounds statement components before calculating the control difference",()=>{
  const result=calculateInventorySnapshot({
    netCapital:43748.82,
    vaultCash:1000,
    partnerAssets:145629.496,
    customerPayables:13933.084
  });

  assert.equal(result.totalAssets,146629.50);
  assert.equal(result.totalLiabilities,13933.08);
  assert.equal(result.finalValue,132696.42);
  assert.equal(result.inventoryDifference,88947.60);
});

test("a legacy stored inventory can be normalized for display without changing source data",()=>{
  const legacy={
    netCapital:43748.82,
    vaultCash:1000,
    partnerAssets:145629.496,
    customerPayables:13933.084,
    finalValue:132696.411,
    inventoryDifference:88947.591
  };
  const normalized=calculateInventorySnapshot(legacy);

  assert.equal(legacy.finalValue,132696.411);
  assert.equal(normalized.finalValue,132696.42);
  assert.equal(normalized.inventoryDifference,88947.60);
});
