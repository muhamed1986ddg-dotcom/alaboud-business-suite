const fs=require("fs"),path=require("path"),assert=require("assert");
const root=path.resolve(__dirname,"../..");
const details=fs.readFileSync(path.join(root,"frontend/src/screens/CustomerDetails.jsx"),"utf8");
const customers=fs.readFileSync(path.join(root,"frontend/src/screens/Customers.jsx"),"utf8");
assert(details.includes("clearApiGetCache();"),"customer details must invalidate GET cache after old balance save");
assert(details.includes("updatedCustomer=response?.data||null"),"customer details must use PATCH response immediately");
assert(customers.includes("cachedGet,clearApiGetCache,isTransientReadFailure"),"customers screen must import cache invalidation");
assert((customers.match(/clearApiGetCache\(\);/g)||[]).length>=4,"customer mutations must invalidate cached financial/customer reads");
console.log("v25.14.45 old-account live refresh OK");
