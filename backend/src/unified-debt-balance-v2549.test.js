const assert=require("assert");
const {calculateReceivableSummary}=require("./finance/ReceivableSummary");
const result=calculateReceivableSummary({customerReceivable:100,companyReceivable:60,manualReceivable:25,companyPayable:20});
assert.equal(result.receivable,160,"total must equal customer plus company");
assert.equal(result.breakdown.manual,25,"manual debt is reconciliation-only");
assert.equal(result.net,140,"net must subtract payables");
console.log("unified debt balance numeric test passed");
