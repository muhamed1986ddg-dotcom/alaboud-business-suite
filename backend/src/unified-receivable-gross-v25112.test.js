const assert=require("assert");
const {calculateReceivableSummary}=require("./finance/ReceivableSummary");

const summary=calculateReceivableSummary({
  customerReceivable:68245.69,
  companyReceivable:72589.22,
  companyPayable:59550.19,
  manualReceivable:301,
  manualPayable:155.82
});
assert.equal(summary.receivable,141135.91,"comprehensive debt for us must include independent manual receivables");
assert.equal(summary.breakdown.manual,301,"manual debt remains visible as a separate component");
assert.equal(summary.breakdown.total,141135.91,"the headline must equal all included receivable components");
assert.equal(summary.payable,59706.01,"payable must include company and manual payables");
assert.equal(summary.net,81429.90,"net must be calculated from authoritative comprehensive totals");
console.log("numeric unified receivable test passed");
