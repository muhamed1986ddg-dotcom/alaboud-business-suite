const fs=require("fs");const path=require("path");
const root=path.resolve(__dirname,"../..");const expected="25.14.50";
const checks=[
 ["package.json",JSON.parse(fs.readFileSync(path.join(root,"package.json"),"utf8")).version],
 ["backend/package.json",JSON.parse(fs.readFileSync(path.join(root,"backend/package.json"),"utf8")).version],
 ["frontend/package.json",JSON.parse(fs.readFileSync(path.join(root,"frontend/package.json"),"utf8")).version],
 ["production-readiness",require("./production-readiness").APP_VERSION]
];
for(const [name,value] of checks)if(value!==expected)throw new Error(`${name}: expected ${expected}, got ${value}`);
const frontend=fs.readFileSync(path.join(root,"frontend/src/version.js"),"utf8");if(!frontend.includes(expected))throw new Error("frontend version mismatch");
const android=fs.readFileSync(path.join(root,"app/build.gradle.kts"),"utf8");if(!android.includes(`versionName = "${expected}"`))throw new Error("android version mismatch");
console.log("version consistency v25.14.50: OK");
