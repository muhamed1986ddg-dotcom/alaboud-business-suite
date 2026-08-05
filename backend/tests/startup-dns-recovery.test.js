"use strict";
const assert = require("assert");
const { isTransientDatabaseError, isRecoverableOperationalError } = require("../src/database/operational-error");

const dnsError = Object.assign(new Error("getaddrinfo ENOTFOUND dpg-example-a"), {
  code: "ENOTFOUND",
  errno: -3008,
  syscall: "getaddrinfo",
  hostname: "dpg-example-a"
});
assert.strictEqual(isTransientDatabaseError(dnsError), true);
assert.strictEqual(isRecoverableOperationalError(dnsError), true);

const wrapped = new Error("Database initialization failed");
wrapped.cause = dnsError;
assert.strictEqual(isRecoverableOperationalError(wrapped), true);

const programmingError = Object.assign(new Error("Unexpected token"), { code: "SYNTAX_ERROR" });
assert.strictEqual(isRecoverableOperationalError(programmingError), false);

console.log("startup DNS recovery classification: OK");
