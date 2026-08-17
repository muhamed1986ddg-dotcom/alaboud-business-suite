"use strict";
const assert=require("assert");const fs=require("fs");const path=require("path");
const root=path.resolve(__dirname,"../..");const expected="25.14.88";
for(const rel of ["package.json","backend/package.json","frontend/package.json"]){assert.equal(JSON.parse(fs.readFileSync(path.join(root,rel),"utf8")).version,expected,`${rel} version mismatch`);}
assert(fs.readFileSync(path.join(root,"app/build.gradle.kts"),"utf8").includes('versionName = "25.14.88"'));
assert(fs.readFileSync(path.join(root,"app/src/main/java/com/alaboud/businesssuite/MainActivity.kt"),"utf8").includes('CLIENT_VERSION = "25.14.88"'));
assert(fs.readFileSync(path.join(root,"frontend/src/api.js"),"utf8").includes('X-Alaboud-Client-Version"]="25.14.88"'));
console.log("version consistency v25.14.88: OK");
