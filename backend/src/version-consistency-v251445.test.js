const fs=require("fs"),path=require("path"),assert=require("assert");
const root=path.resolve(__dirname,"../..");
const expected="25.14.45";
const files=["package.json","frontend/package.json","backend/package.json"];
for(const f of files){const p=JSON.parse(fs.readFileSync(path.join(root,f),"utf8"));assert.equal(p.version,expected,`${f} version`)}
assert(fs.readFileSync(path.join(root,"frontend/src/version.js"),"utf8").includes(expected));
assert(fs.readFileSync(path.join(root,"backend/src/production-readiness.js"),"utf8").includes(expected));
assert(fs.readFileSync(path.join(root,"frontend/src/api.js"),"utf8").includes(expected));
assert(fs.readFileSync(path.join(root,"app/build.gradle.kts"),"utf8").includes(expected));
assert(fs.readFileSync(path.join(root,"app/src/main/java/com/alaboud/businesssuite/MainActivity.kt"),"utf8").includes(expected));
console.log("version consistency v25.14.45: OK");
