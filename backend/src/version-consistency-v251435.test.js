const assert=require("assert");
const fs=require("fs");
const path=require("path");
const root=path.resolve(__dirname,"../..");
const expected="25.14.35";
for(const rel of ["package.json","backend/package.json","frontend/package.json"]){
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,rel),"utf8")).version,expected,rel);
}
assert(fs.readFileSync(path.join(root,"backend/src/production-readiness.js"),"utf8").includes(`APP_VERSION = "${expected}"`));
assert(fs.readFileSync(path.join(root,"frontend/src/version.js"),"utf8").includes(expected));
assert(fs.readFileSync(path.join(root,"app/build.gradle.kts"),"utf8").includes(`versionName = "${expected}"`));
console.log("v25.14.35 version consistency passed");
