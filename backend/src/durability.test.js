const assert = require('assert');
const fs = require('fs');
const path = require('path');
const DatabaseService = require('./database/DatabaseService');

async function testFlushReportsFailedPersistence(){
  let saves = 0;
  const adapter = {
    mode: 'failing-test',
    async init(){},
    async load(){ return { rows: [] }; },
    async save(){ saves += 1; throw new Error('simulated persistence failure'); },
    async health(){ return { ok: true, mode: this.mode }; },
    async close(){}
  };
  const database = new DatabaseService({
    primaryAdapter: adapter,
    normalize: (value)=>value || { rows: [] },
    emptyStore: ()=>({ rows: [] }),
    logger: { log(){}, error(){} }
  });
  await database.init();
  database.replaceStore({ rows: [{ id: 'x' }] });
  database.queueSave();
  await assert.rejects(()=>database.flush(), /simulated persistence failure/);
  assert.equal(saves, 1);
}

function testSensitiveRoutesUseDurableMutation(){
  const source = fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
  const required = [
    ['post','/api/customers'], ['patch','/api/customers/:id'], ['delete','/api/customers/:id'],
    ['post','/api/transactions'], ['patch','/api/transactions/:id'], ['delete','/api/transactions/:id'],
    ['post','/api/customers/:id/payments'], ['post','/api/transactions/:id/payments'],
    ['patch','/api/payments/:id'], ['delete','/api/payments/:id'],
    ['post','/api/general-debts'], ['post','/api/general-debts/:id/payments'], ['patch','/api/general-debts/:id'],
    ['post','/api/expenses'], ['delete','/api/expenses/:id'],
    ['post','/api/capital'], ['patch','/api/capital/:id'], ['delete','/api/capital/:id']
  ];
  for(const [method,route] of required){
    const marker = `app.${method}("${route}"`;
    const index = source.indexOf(marker);
    assert(index >= 0, `missing route ${method.toUpperCase()} ${route}`);
    const next = source.indexOf('\napp.', index + marker.length);
    const block = source.slice(index, next < 0 ? source.length : next);
    assert(block.includes('mutateDurable('), `${method.toUpperCase()} ${route} must use mutateDurable`);
    assert(!block.match(/(?<!Durable)mutate\(/), `${method.toUpperCase()} ${route} still uses non-durable mutate`);
  }
}

(async()=>{
  await testFlushReportsFailedPersistence();
  testSensitiveRoutesUseDurableMutation();
  console.log('Durability tests passed');
})().catch(error=>{console.error(error);process.exit(1)});
