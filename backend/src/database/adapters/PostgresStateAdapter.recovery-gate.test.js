const fs=require('fs');
const assert=require('assert');
const source=fs.readFileSync(__dirname+'/PostgresStateAdapter.js','utf8');
assert(source.includes('async waitForRecovery(operation = "query")'),'recovery gate must exist');
assert(source.includes('if (this.poolResetPromise)'),'concurrent requests must share recovery');
assert(source.includes('const activePool = await this.waitForRecovery(operation);'),'queries must wait for recovery');
assert(source.includes('const activePool = await this.waitForRecovery("write");'),'writes must wait for recovery');
assert(source.includes('this.mirrorPendingSnapshot = next'),'mirror snapshot must survive transient disconnection');
console.log('PostgreSQL recovery gate test passed');
