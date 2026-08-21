"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const server = fs.readFileSync(path.join(__dirname,"server.js"),"utf8");
const financeRoutes = fs.readFileSync(path.join(__dirname,"routes","finance-operations.js"),"utf8");
const financialSource = `${server}\n${financeRoutes}`;
assert(server.includes('const { assertBalancedEntry, markSoftDeleted } = require("./finance/FinancialIntegrity")'));
const requiredMarkers = [
  'account:"CUSTOMER_RECEIVABLE"',
  'account:"CUSTOMER_PAYMENT_RECEIPT"',
  'account:"TRANSFER_ALLOCATIONS"',
  'account:"DEBT_REMAINING_BEFORE"',
  'account:"EXPENSE_CAD"',
  'account:"CAPITAL_CAD"'
];
for(const marker of requiredMarkers) assert(financialSource.includes(marker),`missing financial integrity marker: ${marker}`);
assert(server.includes('feeMethod:financials.feeMethod'),"transactions must persist the canonical fee method");
assert(server.includes('beneficiaryReceives:financials.beneficiaryReceives'),"transactions must preserve the full beneficiary amount");
assert(!server.includes('feeMethod==="DEDUCT"?Math.max(amount-fee,0):amount'),"legacy fee deduction formula must not return");
assert(server.includes('account:"TRANSFER_FEE_REVENUE"'),"separately paid fees must balance against customer receivables");
assert(server.includes('const allowed=["currency","amount","costRate","finalRate","transferFee","feeMethod"'),"fee mode and paid amount must be editable");
const customerPaymentBlock=server.slice(server.indexOf('app.post("/api/customers/:id/payments"'),server.indexOf('app.post("/api/transactions/:id/payments"'));
assert(customerPaymentBlock.includes('assertBalancedEntry(['));
assert(customerPaymentBlock.includes('allocatedToTransactions'));
assert(customerPaymentBlock.includes('oldBalanceAllocation'));
console.log("v25.14.49 financial balance guard wiring: OK");
