const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..','..');
const db=fs.readFileSync(path.join(__dirname,'database','DatabaseService.js'),'utf8');
const store=fs.readFileSync(path.join(__dirname,'store.js'),'utf8');
const adapter=fs.readFileSync(path.join(__dirname,'database','adapters','PostgresStateAdapter.js'),'utf8');
const api=fs.readFileSync(path.join(root,'frontend','src','api.js'),'utf8');
function assert(value,message){if(!value)throw new Error(message)}
assert(db.includes('saveDurable(nextStore)'), 'DatabaseService must expose direct durable save');
assert(store.includes('await database.saveDurable(rootStore)'), 'store durable writes must bypass background flush queue');
assert(!adapter.slice(adapter.indexOf('async save(snapshot'),adapter.indexOf('async query(text')).includes('client.query("BEGIN")'), 'interactive save must not use explicit transaction');
assert(adapter.includes('const payload = JSON.stringify(snapshot)'), 'snapshot should serialize once per save');
assert(api.includes('config.timeout=method==="get"?30000:15000'), 'write timeout must be 15 seconds');
console.log('fast durable v25.4.1 tests passed');
