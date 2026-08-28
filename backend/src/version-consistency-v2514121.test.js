"use strict";
const assert=require("assert/strict");
const fs=require("fs");
const path=require("path");
const root=path.resolve(__dirname,"../..");
const expected="25.14.121";
assert.equal(require(path.join(root,"package.json")).version,expected);
assert.equal(require(path.join(root,"backend/package.json")).version,expected);
assert.equal(require(path.join(root,"frontend/package.json")).version,expected);
assert.equal(require("./production-readiness").APP_VERSION,expected);
const gradle=fs.readFileSync(path.join(root,"app/build.gradle.kts"),"utf8");
assert(gradle.includes('versionName = "25.14.121"'));
assert(gradle.includes('versionCode = 2514121'));
assert(fs.readFileSync(path.join(root,"app/src/main/java/com/alaboud/businesssuite/MainActivity.kt"),"utf8").includes('CLIENT_VERSION = "25.14.121"'));
assert(fs.readFileSync(path.join(root,"frontend/src/api.js"),"utf8").includes('X-Alaboud-Client-Version"]="25.14.121"'));
assert(fs.readFileSync(path.join(root,"frontend/src/version.js"),"utf8").includes('v25.14.121'));
const workflowPath=path.join(root,".github/workflows/build-android-apk.yml");
if(fs.existsSync(workflowPath)){
  const workflow=fs.readFileSync(workflowPath,"utf8");
  assert(workflow.includes(":app:assembleRelease"));
  assert(!workflow.includes(":app:assembleDebug"));
  assert(workflow.includes("apksigner"));
}else{
  console.log("Android workflow check skipped: workflow is not included in the Docker build context");
}
const envExample=fs.readFileSync(path.join(root,".env.example"),"utf8");
assert(envExample.includes("PUBLIC_COMPANY_REGISTRATION=false"));
assert(!envExample.includes("PUBLIC_COMPANY_REGISTRATION_ENABLED="));
console.log("version consistency v25.14.121: OK");

