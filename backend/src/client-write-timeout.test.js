const assert = require('assert');
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/api.js'),'utf8');
assert(source.includes('config.timeout=method==="get"?45000:12000'), 'write timeout must protect the UI from stalled requests');
assert(source.includes('X-Alaboud-Client-Version"]=\"25.14.75\"'), 'client version header must be current');
assert(source.includes('لم يصل تأكيد العملية خلال المهلة'), 'timeout message must not claim a definite save failure');
console.log('Client durable write timeout test passed');
