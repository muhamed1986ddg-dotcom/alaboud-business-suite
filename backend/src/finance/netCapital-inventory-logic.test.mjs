import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
const require = createRequire(import.meta.url);
const {
  calculateNetCapital,
  calculateInventorySnapshot
} = require("./MonthlyInventoryFinancials.js");

const equity = {
  capitalContributions: 1000,
  capitalWithdrawals: 100,
  realizedNetProfit: 250,
  profitDistributions: 50,
  // Deliberately present: realizedNetProfit is already net of this expense,
  // so the expense must not be deducted for a second time.
  expensesAlreadyIncludedInNetProfit: 125
};

test("netCapital follows the approved equity equation without deducting expenses twice", () => {
  const result = calculateNetCapital(equity);

  assert.equal(result, 1100);
});

test("finalValue is net assets and inventoryDifference is a separate control value", () => {
  const inventory = {
    vaultCash: 400,
    partnerAssets: 300,
    customerReceivables: 250,
    companyReceivables: 100,
    manualReceivables: 50,
    customerPayables: 80,
    companyPayables: 40,
    manualPayables: 30
  };

  const expectedFinalValue = (
    inventory.vaultCash
    + inventory.partnerAssets
    + inventory.customerReceivables
    + inventory.companyReceivables
    + inventory.manualReceivables
    - inventory.customerPayables
    - inventory.companyPayables
    - inventory.manualPayables
  );
  const expectedInventoryDifference = expectedFinalValue - 1100;

  const result = calculateInventorySnapshot({
    netCapital: calculateNetCapital(equity),
    ...inventory
  });

  assert.deepEqual(
    {
      finalValue: result.finalValue,
      inventoryDifference: result.inventoryDifference
    },
    {
      finalValue: expectedFinalValue,
      inventoryDifference: expectedInventoryDifference
    }
  );
});
