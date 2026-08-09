const assert = require("assert");
const FinancialEngine = require("./finance/FinancialEngine");
assert.strictEqual(typeof FinancialEngine.customerBalanceTotals, "function");

const fs = require("fs");
const path = require("path");
const server = fs.readFileSync(path.join(__dirname,"server.js"),"utf8");
assert.match(server,/const\s*\{\s*customerBalanceTotals\s*\}\s*=\s*FinancialEngine;/,
  "server.js must bind customerBalanceTotals from FinancialEngine before capital/inventory routes use it");
console.log("customerBalanceTotals binding v25.14.37: OK");
