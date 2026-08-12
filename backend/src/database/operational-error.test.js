"use strict";
const assert = require("assert");
const { isTransientDatabaseError, isRecoverableOperationalError } = require("./operational-error");

assert.equal(isTransientDatabaseError({ code: "57P03" }), true);
assert.equal(isTransientDatabaseError({ code: "DATABASE_TEMPORARILY_UNAVAILABLE", status: 503 }), true);
assert.equal(isRecoverableOperationalError({ status: 503, code: "DATABASE_TEMPORARILY_UNAVAILABLE" }), true);
assert.equal(isTransientDatabaseError({ message: "Connection terminated unexpectedly" }), true);
assert.equal(isTransientDatabaseError({ cause: { code: "08006" } }), true);
assert.equal(isRecoverableOperationalError({ status: 503, message: "temporary outage" }), true);
assert.equal(isRecoverableOperationalError({ status: 409, code: "STALE_STATE_REVISION", retryable: true }), true);
assert.equal(isRecoverableOperationalError({ status: 409, code: "STALE_STATE_REVISION", retryable: false }), false);
assert.equal(isRecoverableOperationalError({ status: 500, code: "PROGRAMMER_ERROR" }), false);
console.log("Operational database error classification tests passed");
