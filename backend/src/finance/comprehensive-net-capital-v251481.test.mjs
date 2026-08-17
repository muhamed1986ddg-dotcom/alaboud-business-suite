import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {test} from "node:test";

const require=createRequire(import.meta.url);
const {calculateCapitalOverviewFinancials}=require("./CapitalOverviewFinancials.js");

test("comprehensive net capital includes customer and company net debt exactly once",()=>{
  const result=calculateCapitalOverviewFinancials({
    capitalContributions:36249.03,
    capitalWithdrawals:0,
    accumulatedProfit:14724.14,
    accumulatedExpenses:7184.43,
    profitDistributions:0,
    totalReceivables:147320.51,
    totalPayables:13933.08
  });

  assert.equal(result.realizedNetProfit,7539.71);
  assert.equal(result.equityNetCapital,43788.74);
  assert.equal(result.netDebt,133387.43);
  assert.equal(result.comprehensiveNetCapital,177176.17);
  assert.equal(result.netCapital,177176.17);
});

test("comprehensive net capital is composed only from the visible cent-rounded rows",()=>{
  const result=calculateCapitalOverviewFinancials({
    capitalContributions:36249.03,
    accumulatedProfit:14724.14,
    accumulatedExpenses:7184.43,
    totalReceivables:147320.51,
    totalPayables:13933.08
  });

  const visibleEquation=(
    result.capitalContributions
    - result.capitalWithdrawals
    + result.accumulatedProfit
    - result.accumulatedExpenses
    - result.profitDistributions
    + result.totalReceivables
    - result.totalPayables
  );
  assert.equal(Number(visibleEquation.toFixed(2)),result.comprehensiveNetCapital);
});
