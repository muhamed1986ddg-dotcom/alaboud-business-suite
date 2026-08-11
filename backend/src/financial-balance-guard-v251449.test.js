"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const server = fs.readFileSync(path.join(__dirname,"server.js"),"utf8");
assert(server.includes('const { assertBalancedEntry, markSoftDeleted } = require("./finance/FinancialIntegrity")'));
const requiredMarkers = [
  'account:"CUSTOMER_RECEIVABLE"',
  'account:"CUSTOMER_PAYMENT_RECEIPT"',
  'account:"TRANSFER_ALLOCATIONS"',
  'account:"DEBT_REMAINING_BEFORE"',
  'account:"EXPENSE_CAD"',
  'account:"CAPITAL_CAD"'
];
for(const marker of requiredMarkers) assert(server.includes(marker),`missing financial integrity marker: ${marker}`);
const customerPaymentBlock=server.slice(server.indexOf('app.post("/api/customers/:id/payments"'),server.indexOf('app.post("/api/transactions/:id/payments"'));
assert(customerPaymentBlock.includes('assertBalancedEntry(['));
assert(customerPaymentBlock.includes('allocatedToTransactions'));
assert(customerPaymentBlock.includes('oldBalanceAllocation'));
console.log("v25.14.49 financial balance guard wiring: OK");
