const fs=require('fs');const path=require('path');const assert=require('assert');
const src=fs.readFileSync(path.join(__dirname,'database/adapters/PostgresStateAdapter.js'),'utf8');
assert(src.includes('this.writePool = this.createPool("write")'));
assert(src.includes('poolRole: "write"'));
assert(src.includes('resetWritePool'));
assert(src.includes('RELATIONAL_MIRROR_ENABLED || "false"'));
assert(src.includes('currentPool !== pool'));
console.log('write pool isolation v25.14.28: OK');
