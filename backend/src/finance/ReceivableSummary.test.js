const assert=require("assert");
const {calculateReceivableSummary}=require("./ReceivableSummary");
const cases=[
  [{customerReceivable:10,companyReceivable:20},30],
  [{customerReceivable:"10.10",companyReceivable:"20.20",manualReceivable:999},30.30],
  [{customerReceivable:0,companyReceivable:0,manualReceivable:50},0],
  [{customerReceivable:68_245.69,companyReceivable:72_589.22},140_834.91]
];
for(const [input,expected] of cases)assert.equal(calculateReceivableSummary(input).receivable,expected);
console.log("ReceivableSummary numeric tests passed");

const payableCase=calculateReceivableSummary({customerReceivable:100,customerPayable:35,companyPayable:15,manualPayable:5});
assert.equal(payableCase.payable,55);
assert.equal(payableCase.net,45);
assert.equal(payableCase.breakdown.customerPayable,35);
