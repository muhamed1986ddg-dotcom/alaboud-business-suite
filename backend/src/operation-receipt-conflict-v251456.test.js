const fs=require('fs');
const path=require('path');
const assert=require('assert');
const src=fs.readFileSync(path.join(__dirname,'database/adapters/PostgresStateAdapter.js'),'utf8');
assert(src.includes('ON CONFLICT (scope_key,operation_key,method,path)'), 'receipt upsert must match production composite unique constraint');
assert(!src.includes('ON CONFLICT (operation_key)\n                 DO UPDATE SET status='), 'legacy receipt conflict target must be removed');
console.log('v25.14.56 operation receipt conflict guard: OK');
