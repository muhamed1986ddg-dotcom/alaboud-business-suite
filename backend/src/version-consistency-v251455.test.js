const fs=require('fs');
const path=require('path');
const assert=require('assert');
const root=path.resolve(__dirname,'../..');
const expected='25.14.55';
for(const file of ['package.json','backend/package.json','frontend/package.json']){
  const json=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
  assert.strictEqual(json.version,expected,`${file} version`);
}
assert.match(fs.readFileSync(path.join(root,'backend/src/production-readiness.js'),'utf8'),/25\.14\.55/);
assert.match(fs.readFileSync(path.join(root,'frontend/src/api.js'),'utf8'),/25\.14\.55/);
assert.match(fs.readFileSync(path.join(root,'app/build.gradle.kts'),'utf8'),/25\.14\.55/);
console.log('version consistency v25.14.55: OK');
