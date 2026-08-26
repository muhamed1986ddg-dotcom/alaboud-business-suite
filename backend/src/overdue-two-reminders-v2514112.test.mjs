import test from"node:test";import assert from"node:assert/strict";import svc from"./services/overdue-customer-messages.js";
test("v25.14.112 reminder defaults",()=>{assert.deepEqual(svc.reminderConfig({}),{first:7,second:15,secondEnabled:true});assert.equal(svc.cycleStartDate("2026-08-16",15),"2026-08-01");assert.equal(svc.cycleStartDate("2026-08-08",7),"2026-08-01");});
