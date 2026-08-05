"use strict";
const assert = require("assert");
const DatabaseService = require("../src/database/DatabaseService");

let fallbackInitCalls = 0;
const transient = Object.assign(new Error("getaddrinfo ENOTFOUND private-db"), { code: "ENOTFOUND" });
const primary = {
  mode: "postgres",
  async init(){ throw transient; },
  async load(){ return null; }
};
const fallback = {
  mode: "json",
  async init(){ fallbackInitCalls += 1; },
  async load(){ return { customers: [] }; }
};
const service = new DatabaseService({
  primaryAdapter: primary,
  fallbackAdapter: fallback,
  normalize: value => value,
  emptyStore: () => ({})
});

service.init().then(
  () => { throw new Error("Expected primary initialization to fail"); },
  error => {
    assert.strictEqual(error.code, "ENOTFOUND");
    assert.strictEqual(fallbackInitCalls, 0, "JSON fallback must not become primary after PostgreSQL failure");
    console.log("database primary retry policy: OK");
  }
).catch(error => {
  console.error(error);
  process.exit(1);
});
