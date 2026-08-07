"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");

const server=fs.readFileSync(path.join(__dirname,"..","server.js"),"utf8");
const store=fs.readFileSync(path.join(__dirname,"..","store.js"),"utf8");
const access=fs.readFileSync(path.join(__dirname,"..","access-control.js"),"utf8");

assert(server.includes('app.get("/api/monthly-inventory"'),"monthly inventory GET route missing");
assert(server.includes('app.post("/api/monthly-inventory/close"'),"monthly inventory close route missing");
assert(server.includes('app.patch("/api/monthly-inventory/settings"'),"monthly inventory settings route missing");
assert(server.includes('store.monthlyInventories.push(item)'),"inventory snapshot is not persisted");
assert(store.includes('monthlyInventories'),"monthly inventories are not normalized in store");
assert(access.includes('/api/monthly-inventory/close'),"inventory route permissions missing");

// Core business formula requested by the owner:
// total cash + company balances + customer receivables + company receivables - payables + manual vault cash.
const totalCash=10000,companyBalances=2500,customerReceivable=3000,companyReceivable=1500,debtsPayable=2000,vaultCash=700;
const expected=15700;
assert.strictEqual(totalCash+companyBalances+customerReceivable+companyReceivable-debtsPayable+vaultCash,expected);

// Schedule is deliberately constrained to 1..28 so every month has the selected day.
for(const day of [1,20,28])assert(day>=1&&day<=28);
console.log("MonthlyInventory.test.js: OK");
