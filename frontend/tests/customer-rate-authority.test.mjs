import assert from "node:assert/strict";
import {authoritativeCustomerRate,latestCustomerRate} from "../src/customerRate.js";

assert.equal(authoritativeCustomerRate({finalRate:1.47,customerRate:12.6654}),1.47,"finalRate must be authoritative");
assert.equal(authoritativeCustomerRate({customerRate:1.48}),1.48,"legacy customerRate remains supported");
assert.equal(authoritativeCustomerRate({clientRate:1.49}),1.49,"legacy clientRate remains supported");
assert.equal(latestCustomerRate([
  {transferDate:"2026-07-20",finalRate:1.46},
  {transferDate:"2026-07-21",finalRate:1.47,customerRate:12.6654}
]),1.47,"summary must show the latest actual customer rate");
console.log("customer rate authority tests passed");
