import assert from "node:assert/strict";
import {authoritativeCustomerRate} from "../src/customerRate.js";

assert.equal(authoritativeCustomerRate({finalRate:1.47,customerRate:12.6654}),1.47,"finalRate must be authoritative");
assert.equal(authoritativeCustomerRate({customerRate:1.48}),1.48,"legacy customerRate remains supported");
assert.equal(authoritativeCustomerRate({clientRate:1.49}),1.49,"legacy clientRate remains supported");
const rows=[{amount:100,finalRate:1.47,customerRate:12.6654},{amount:200,finalRate:1.50,customerRate:9.99}];
const cad=rows.reduce((sum,row)=>sum+row.amount*authoritativeCustomerRate(row),0);
assert.equal(cad,447,"each row must use its own actual transfer rate; no averaging");
console.log("customer rate authority tests passed");
