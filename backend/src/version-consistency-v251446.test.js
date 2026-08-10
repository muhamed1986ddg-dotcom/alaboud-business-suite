const assert=require('assert');
const fs=require('fs');
const path=require('path');
const expected='25.14.46';
const root=path.resolve(__dirname,'../..');
for(const file of ['package.json','backend/package.json','frontend/package.json']){
  const pkg=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
  assert.equal(pkg.version,expected,`${file} version mismatch`);
}
assert(fs.readFileSync(path.join(root,'frontend/src/version.js'),'utf8').includes(expected));
assert(fs.readFileSync(path.join(root,'backend/src/production-readiness.js'),'utf8').includes(expected));
console.log('version consistency v25.14.46: OK');
