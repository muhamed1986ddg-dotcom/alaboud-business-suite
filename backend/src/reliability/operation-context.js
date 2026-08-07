"use strict";

const { AsyncLocalStorage } = require("async_hooks");

const operationContext = new AsyncLocalStorage();

function runWithOperationContext(value, fn) {
  return operationContext.run(value || null, fn);
}

function getOperationContext() {
  return operationContext.getStore() || null;
}

module.exports = { runWithOperationContext, getOperationContext };
