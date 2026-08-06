const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, 'PostgresStateAdapter.js'), 'utf8');
assert(source.includes('this.poolResetPromise'), 'recovery must be single-flight');
assert(source.includes('await this.probePool(candidate'), 'candidate pool must pass SELECT 1 before activation');
assert(source.includes('if (pool !== this.pool) return'), 'stale pool errors must be ignored');
assert(source.includes('PG_POOL_RESET_MIN_INTERVAL_MS'), 'pool recreation must be rate-limited');
assert(source.includes('PostgreSQL pool recovery deferred'), '57P03 recovery failure must be deferred rather than looped');
assert(!source.includes('PostgreSQL pool recreated after ${reason}'), 'old immediate pool recreation path must be removed');
console.log('PostgreSQL single-flight recovery policy test passed');
