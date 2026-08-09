const assert=require('assert');const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..','..');
const pkg=require(path.join(root,'package.json'));const fpkg=require(path.join(root,'frontend','package.json'));const bpkg=require(path.join(root,'backend','package.json'));
assert.strictEqual(pkg.version,'25.14.36');assert.strictEqual(fpkg.version,'25.14.36');assert.strictEqual(bpkg.version,'25.14.36');
assert.match(fs.readFileSync(path.join(root,'backend','src','production-readiness.js'),'utf8'),/25\.14\.36/);
assert.match(fs.readFileSync(path.join(root,'frontend','src','version.js'),'utf8'),/25\.14\.36/);
assert.match(fs.readFileSync(path.join(root,'app','build.gradle.kts'),'utf8'),/versionName = "25\.14\.36"/);
console.log('version-consistency-v251436.test.js: OK');
