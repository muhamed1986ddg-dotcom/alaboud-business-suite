"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const FinancialEngine = require("./finance/FinancialEngine");

// Regression: a payment created after an account reset on the same calendar day
// must count as an active payment even though paymentDate itself resolves to midnight.
const resetAt = "2026-08-10T05:00:00.000Z";
const customer = {
  id: "c1",
  name: "Test",
  accountResetAt: resetAt,
  openingBalanceUpdatedAt: "2026-08-10T05:10:00.000Z",
  oldBalance: 5100,
  oldBalanceType: "RECEIVABLE",
  openingBalanceInitial: 9100,
  oldBalancePaid: 0
};
const store = {
  customers: [customer],
  transactions: [
    {id:"old-tx",customerId:"c1",transferDate:"2026-08-02",createdAt:"2026-08-02T12:00:00.000Z",status:"UNPAID",totalCustomerDue:16600}
  ],
  payments: [
    {id:"receipt",customerId:"c1",transactionId:null,recordType:"CUSTOMER_PAYMENT_RECEIPT",amount:4000,originalAmount:4000,paymentDate:"2026-08-10",date:"2026-08-10T05:30:00.000Z",isDeleted:false}
  ]
};
const summary = FinancialEngine.customerSummary(store, customer);
assert.equal(summary.oldBalanceRemaining, 5100, "opening balance must reflect the 4000 deduction");
assert.equal(summary.totalPaid, 4000, "same-day post-reset receipt must be counted as paid");
assert.equal(summary.finalBalance, 5100, "final balance must be reduced from 9100 to 5100");
assert.equal(summary.totalTransactions, 9100, "pre-reset transfers must stay archived while the opening account remains active");

// The customer payment route must never allocate a new payment to archived pre-reset transfers.
const server = fs.readFileSync(path.join(__dirname,"server.js"),"utf8");
const routeStart = server.indexOf('app.post("/api/customers/:id/payments"');
const routeEnd = server.indexOf('app.post("/api/transactions/:id/payments"', routeStart);
const route = server.slice(routeStart, routeEnd);
assert(route.includes('isAfterCustomerReset(item,customer,"transferDate")'), "customer payment allocation must ignore pre-reset transfers");
assert(route.includes('isAfterCustomerReset(payment,customer,"paymentDate")'), "payment allocation totals must ignore pre-reset payment rows");

console.log("v25.14.47 customer payment deduction after reset: OK");
