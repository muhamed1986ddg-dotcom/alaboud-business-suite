"use strict";
const fs=require("fs"),path=require("path"),assert=require("assert/strict");
const root=path.resolve(__dirname,"..");
const expected="25.14.62";
for(const f of ["package.json","backend/package.json","frontend/package.json"]){assert.equal(JSON.parse(fs.readFileSync(path.join(root,f),"utf8")).version,expected,`${f} version mismatch`)}
const forbidden=["backend/src/finance/","backend/src/store.js"];
if(process.env.V251462_CHANGED_FILES){for(const f of process.env.V251462_CHANGED_FILES.split(/\r?\n/).filter(Boolean))assert.ok(!forbidden.some(p=>f===p||f.startsWith(p)),`protected financial path changed: ${f}`)}
console.log("v25.14.62 release scope/version check: OK");
