const fs=require('fs');
const path=require('path');
const adapter=fs.readFileSync(path.join(__dirname,'adapters','PostgresStateAdapter.js'),'utf8');
const api=fs.readFileSync(path.join(__dirname,'..','..','..','frontend','src','api.js'),'utf8');
function assert(cond,msg){if(!cond)throw new Error(msg)}
assert(adapter.includes('waitForInteractiveWriteReady'),'missing bounded write readiness gate');
assert(adapter.includes('PG_INTERACTIVE_READY_TIMEOUT_MS'),'missing write readiness timeout');
assert(adapter.includes('withHardTimeout'),'missing client hard timeout guard');
assert(adapter.includes('"commit"'),'commit must be guarded by hard timeout');
assert(adapter.includes('"rollback"'),'rollback cleanup must be bounded');
assert(adapter.includes('client && !isTransientPostgresError(error)'),'broken clients must skip hanging rollback');
assert(api.includes('method==="get"?45000:30000'),'write requests must have bounded browser timeout');
assert(api.includes('{headers,timeout:3000,withCredentials:true}'),'ambiguous commit status verification must be bounded');
assert(api.includes('const delays=[500,1000,1500,2500,4000]'),'ambiguous commit verification must retry with bounded backoff');
assert(!api.includes('_alaboudWriteReplayCount'),'writes must not be replayed automatically');
console.log('Write readiness gate v25.14.19 test passed');
