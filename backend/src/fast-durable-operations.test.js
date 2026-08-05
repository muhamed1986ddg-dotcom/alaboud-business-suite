const fs=require('fs');
const adapter=fs.readFileSync(require.resolve('./database/adapters/PostgresStateAdapter'),'utf8');
const api=fs.readFileSync(require.resolve('../../frontend/src/api.js'),'utf8');
if(!adapter.includes('this.queueRelationalMirror(snapshot)'))throw new Error('relational mirror must run after canonical save');
if(adapter.includes('if (this.relationalMirrorEnabled) await this.projector.project(client, snapshot)'))throw new Error('mirror must not block interactive save');
if(!adapter.includes('PG_WRITE_RETRY_BUDGET_MS || 12000'))throw new Error('write retry budget missing');
if(!api.includes('config.timeout=method==="get"?30000:30000'))throw new Error('client timeout must match bounded backend writes');
console.log('Fast durable operations test passed');
