const assert=require("assert");
const {calculateReceivableSummary}=require("./finance/ReceivableSummary");

const summary=calculateReceivableSummary({
  customerReceivable:68245.69,
  companyReceivable:72589.22,
  companyPayable:59550.19,
  manualReceivable:301,
  manualPayable:155.82
});
assert.equal(summary.receivable,140834.91,"debt for us must equal customers + companies only");
assert.equal(summary.breakdown.manual,301,"manual debt remains visible for reconciliation");
assert.equal(summary.breakdown.total,140834.91,"manual receivable must not inflate headline debt");
assert.equal(summary.payable,59706.01,"payable must include company and manual payables");
assert.equal(summary.net,81128.90,"net must be calculated from authoritative totals");
console.log("numeric unified receivable test passed");
