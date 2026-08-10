const fs=require("fs"),path=require("path"),assert=require("assert");
const root=path.resolve(__dirname,"../..");const expected="25.14.51";
for(const rel of ["package.json","backend/package.json","frontend/package.json"]){const data=JSON.parse(fs.readFileSync(path.join(root,rel),"utf8"));assert.equal(data.version,expected,`${rel} version`);}
assert(fs.readFileSync(path.join(root,"backend/src/production-readiness.js"),"utf8").includes(`APP_VERSION = "${expected}"`));
assert(fs.readFileSync(path.join(root,"frontend/src/version.js"),"utf8").includes(`v${expected}`));
assert(fs.readFileSync(path.join(root,"frontend/src/api.js"),"utf8").includes(`X-Alaboud-Client-Version"]="${expected}"`));
assert(fs.readFileSync(path.join(root,"app/build.gradle.kts"),"utf8").includes(`versionName = "${expected}"`));
assert(fs.readFileSync(path.join(root,"app/src/main/java/com/alaboud/businesssuite/MainActivity.kt"),"utf8").includes(`AlAboudMobile/${expected}`));
console.log("version consistency v25.14.51: OK");
