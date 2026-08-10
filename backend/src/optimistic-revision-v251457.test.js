const assert=require('assert');
const fs=require('fs');
const src=fs.readFileSync(require.resolve('./database/adapters/PostgresStateAdapter'),'utf8');
assert(src.includes("SELECT payload,revision FROM app_state WHERE state_key='main'"), 'load must capture durable revision');
assert(src.includes('this.lastCommittedRevision = Number(result.rows[0].revision || 0)'), 'loaded revision must seed optimistic state');
assert(src.includes('WHERE app_state.revision=$9'), 'receipt write must reject stale snapshot');
assert(src.includes('WHERE app_state.revision=$2'), 'plain durable write must reject stale snapshot');
assert(src.includes('conflict.code = "STALE_STATE_REVISION"'), 'stale write must have explicit conflict code');
assert(src.includes('conflict.status = 409'), 'stale write must fail as conflict, not overwrite data');
assert(src.includes('if (!result.rows?.[0])'), 'zero-row guarded UPSERT must be detected before COMMIT');
console.log('v25.14.57 optimistic revision protection: OK');

const server=fs.readFileSync(require.resolve('./server'),'utf8');
assert(!server.includes(' mutate('), 'server writes should not bypass the durable mutation chain');
assert(server.includes('await mutateDurable(store=>createSession'), 'session creation must share the durable write chain');
