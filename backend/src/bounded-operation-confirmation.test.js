const fs=require("fs"),path=require("path"),assert=require("assert");
const api=fs.readFileSync(path.join(__dirname,"../../frontend/src/api.js"),"utf8");
assert(api.includes("يتم إجراء تحقق واحد فقط"));
assert(api.includes("timeout:2500"));
assert(!api.includes("checkReceipt([0,500,900,1400])"));
assert(!api.includes("finalCheck=await checkReceipt"));
assert(!api.includes("_alaboudWriteReplayCount"));
assert(api.includes("if(error?.response)return false"));
console.log("bounded operation confirmation regression: OK");
