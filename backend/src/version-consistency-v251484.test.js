const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "../..");
const expected = "25.14.87";
for (const rel of ["package.json","backend/package.json","frontend/package.json"]) {
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(root,rel),"utf8")).version,expected,rel+" version mismatch");
}
assert.strictEqual(require("./production-readiness").APP_VERSION,expected,"production runtime version mismatch");
assert(fs.readFileSync(path.join(root,"frontend/src/api.js"),"utf8").includes('X-Alaboud-Client-Version"]="'+expected+'"'),"client header mismatch");
const gradle=fs.readFileSync(path.join(root,"app/build.gradle.kts"),"utf8");
assert(gradle.includes('versionName = "25.14.87"'),"Android versionName mismatch");
assert(gradle.includes('versionCode = 251486'),"Android versionCode mismatch");
assert(fs.readFileSync(path.join(root,"app/src/main/java/com/alaboud/businesssuite/MainActivity.kt"),"utf8").includes('CLIENT_VERSION = "25.14.87"'),"Android client version mismatch");
console.log("version consistency v25.14.87: OK");
