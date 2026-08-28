const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'frontend/src/api.js'), 'utf8');
const currentVersion = require(path.join(root, 'package.json')).version;

assert(
  source.includes('config.timeout=method==="get"?45000:30000'),
  'write timeout must allow durable commits while remaining bounded'
);

assert(
  source.includes(`X-Alaboud-Client-Version"]="${currentVersion}"`),
  'client version header must match the current package version'
);

assert(source.includes('const delays=[500,1000,1500,2500,4000]'), 'ambiguous writes must use bounded confirmation backoff');
assert(source.includes('تعذر تأكيد حالة الدفعة حاليًا'), 'unknown confirmation must not claim a definite save failure');
assert(!source.includes('_alaboudWriteReplayCount'), 'financial writes must never be replayed automatically');

console.log('Client durable write timeout test passed');
