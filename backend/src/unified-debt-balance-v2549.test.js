const assert=require("assert");
const {calculateReceivableSummary}=require("./finance/ReceivableSummary");
const result=calculateReceivableSummary({customerReceivable:100,companyReceivable:60,manualReceivable:25,companyPayable:20});
assert.equal(result.receivable,185,"total must equal customer plus company plus independent manual debt");
assert.equal(result.breakdown.manual,25,"manual debt must remain a separate visible component");
assert.equal(result.net,165,"net must subtract payables from the comprehensive receivable");
console.log("unified debt balance numeric test passed");
