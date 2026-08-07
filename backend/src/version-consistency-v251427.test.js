const fs=require("fs"),path=require("path"),assert=require("assert");
const root=path.join(__dirname,"../.."), expected="25.14.27";
assert(fs.readFileSync(path.join(root,"frontend/src/version.js"),"utf8").includes(`v${expected}`));
assert(fs.readFileSync(path.join(root,"frontend/src/api.js"),"utf8").includes(`"${expected}"`));
assert(fs.readFileSync(path.join(root,"backend/src/production-readiness.js"),"utf8").includes(`"${expected}"`));
for(const f of ["package.json","frontend/package.json","backend/package.json"])
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,f),"utf8")).version,expected);
console.log("version consistency v25.14.27: OK");
