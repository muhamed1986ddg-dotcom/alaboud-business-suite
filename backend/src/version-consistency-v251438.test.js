const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'../..');
assert.strictEqual(require(path.join(root,'package.json')).version,'25.14.38');
assert.strictEqual(require(path.join(root,'frontend/package.json')).version,'25.14.38');
assert.strictEqual(require(path.join(root,'backend/package.json')).version,'25.14.38');
assert.match(fs.readFileSync(path.join(root,'frontend/src/version.js'),'utf8'),/v25\.14\.38/);
assert.match(fs.readFileSync(path.join(root,'backend/src/production-readiness.js'),'utf8'),/25\.14\.38/);
console.log('version consistency v25.14.38: OK');
