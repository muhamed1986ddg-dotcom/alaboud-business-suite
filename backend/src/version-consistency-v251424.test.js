const fs=require("fs"),path=require("path"),assert=require("assert");
const root=path.join(__dirname,"../..");
const expected="25.14.24";
const versionJs=fs.readFileSync(path.join(root,"frontend/src/version.js"),"utf8");
const api=fs.readFileSync(path.join(root,"frontend/src/api.js"),"utf8");
const prod=fs.readFileSync(path.join(root,"backend/src/production-readiness.js"),"utf8");
const gradle=fs.readFileSync(path.join(root,"app/build.gradle.kts"),"utf8");
assert(versionJs.includes(`v${expected}`));
assert(api.includes(`"${expected}"`));
assert(prod.includes(`"${expected}"`));
assert(gradle.includes(`versionName = "${expected}"`));
for(const f of ["package.json","frontend/package.json","backend/package.json"]){
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,f),"utf8")).version,expected);
}
console.log("version consistency v25.14.24: OK");
