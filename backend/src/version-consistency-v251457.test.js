const assert=require('assert');
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'../..');
const expected='25.14.64';
const checks=[
 ['package.json',JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version],
 ['backend/package.json',JSON.parse(fs.readFileSync(path.join(root,'backend/package.json'),'utf8')).version],
 ['frontend/package.json',JSON.parse(fs.readFileSync(path.join(root,'frontend/package.json'),'utf8')).version],
 ['production-readiness',require('./production-readiness').APP_VERSION]
];
for(const [name,value] of checks) assert.strictEqual(value,expected,`${name} version mismatch`);
assert(fs.readFileSync(path.join(root,'frontend/src/api.js'),'utf8').includes(`X-Alaboud-Client-Version"]="${expected}"`),'client header mismatch');
const gradle=fs.readFileSync(path.join(root,'app/build.gradle.kts'),'utf8');
assert(gradle.includes(`versionName = "${expected}"`),'Android versionName mismatch');
assert(gradle.includes('versionCode = 251464'),'Android versionCode mismatch');
assert(fs.readFileSync(path.join(root,'app/src/main/java/com/alaboud/businesssuite/MainActivity.kt'),'utf8').includes(`AlAboudMobile/${expected}`),'Android user-agent mismatch');
console.log('version consistency v25.14.64: OK');
