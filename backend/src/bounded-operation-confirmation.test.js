const fs=require("fs"),path=require("path"),assert=require("assert");
const api=fs.readFileSync(path.join(__dirname,"../../frontend/src/api.js"),"utf8");
assert(api.includes("OPERATION_CONFIRMATION_DELAYS=[500,1000,1500,2500,4000]"));
assert(api.includes("timeout:5000"));
assert(api.includes('error.code="OPERATION_STATUS_UNKNOWN"'));
assert(api.includes("FAILED_OPERATION_STATUSES"));
assert(!api.includes("_alaboudWriteReplayCount"));
assert(api.includes("if(error?.response)return false"));
console.log("bounded operation confirmation regression: OK");
