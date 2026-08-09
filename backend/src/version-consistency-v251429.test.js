const fs=require("fs"),path=require("path"),assert=require("assert");
const root=path.join(__dirname,"../.."); const expected="25.14.29";
assert.equal(require(path.join(root,"package.json")).version,expected);
assert.equal(require(path.join(root,"backend/package.json")).version,expected);
assert.equal(require(path.join(root,"frontend/package.json")).version,expected);
assert(fs.readFileSync(path.join(root,"frontend/src/version.js"),"utf8").includes("v25.14.29"));
console.log("version consistency v25.14.29: OK");
