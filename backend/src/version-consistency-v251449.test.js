"use strict";
const assert=require("assert"),fs=require("fs"),path=require("path");
const root=path.resolve(__dirname,"../.."); const expected="25.14.49";
for(const file of ["package.json","backend/package.json","frontend/package.json"]){const data=JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));assert.equal(data.version,expected,file);}
assert(fs.readFileSync(path.join(root,"backend/src/production-readiness.js"),"utf8").includes(`APP_VERSION = "${expected}"`));
assert(fs.readFileSync(path.join(root,"frontend/src/api.js"),"utf8").includes(`X-Alaboud-Client-Version"]="${expected}"`));
assert(fs.readFileSync(path.join(root,"frontend/src/version.js"),"utf8").includes(`v${expected}`));
assert(fs.readFileSync(path.join(root,"app/build.gradle.kts"),"utf8").includes(`versionName = "${expected}"`));
console.log("version consistency v25.14.49: OK");
