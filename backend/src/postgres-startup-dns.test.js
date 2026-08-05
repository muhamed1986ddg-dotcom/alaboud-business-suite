const assert = require('assert');
const PostgresStateAdapter = require('./database/adapters/PostgresStateAdapter');

const transient = PostgresStateAdapter.isTransientPostgresError;
assert.strictEqual(transient(Object.assign(new Error('getaddrinfo ENOTFOUND dpg-example-a'), { code: 'ENOTFOUND' })), true);
assert.strictEqual(transient(Object.assign(new Error('getaddrinfo EAI_AGAIN dpg-example-a'), { code: 'EAI_AGAIN' })), true);
assert.strictEqual(transient(Object.assign(new Error('database system is in recovery mode'), { code: '57P03' })), true);
assert.strictEqual(transient(Object.assign(new Error('syntax error at or near SELECT'), { code: '42601' })), false);
console.log('POSTGRES_STARTUP_DNS_TEST_OK');
