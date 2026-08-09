const fs=require("fs"),path=require("path"),assert=require("assert");
const root=path.join(__dirname,"../.."); const expected="25.14.31";
for(const file of ["package.json","backend/package.json","frontend/package.json"])assert.equal(JSON.parse(fs.readFileSync(path.join(root,file),"utf8")).version,expected);
assert(fs.readFileSync(path.join(root,"frontend/src/version.js"),"utf8").includes("v25.14.31"));
assert(fs.readFileSync(path.join(root,"backend/src/production-readiness.js"),"utf8").includes('APP_VERSION = "25.14.31"'));
console.log("version consistency v25.14.31: OK");
