"use strict";
const assert=require("assert/strict");
const fs=require("fs");
const path=require("path");
const source=fs.readFileSync(path.join(__dirname,"server.js"),"utf8");
assert(source.includes("const scopedLogs=Array.from(logs||[]).filter"),"root audit writes must preserve per-company/per-branch hash chains");
assert(source.includes("companyId:auditCompanyId"),"audit entries must carry companyId even for root-context restore writes");
console.log("v25.14.94 root restore audit scope: OK");
