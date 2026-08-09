const assert=require("assert");
const fs=require("fs");
const path=require("path");
const root=path.join(__dirname,"../..");
assert(fs.readFileSync(path.join(root,"frontend/src/version.js"),"utf8").includes("v25.14.32"));
assert(fs.readFileSync(path.join(root,"backend/src/production-readiness.js"),"utf8").includes('APP_VERSION = "25.14.32"'));
assert(fs.readFileSync(path.join(root,"app/src/main/java/com/alaboud/businesssuite/MainActivity.kt"),"utf8").includes("AlAboudMobile/25.14.32"));
console.log("version consistency v25.14.32: OK");
