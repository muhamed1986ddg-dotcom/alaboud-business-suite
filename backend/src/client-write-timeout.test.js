const assert = require('assert');
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/api.js'),'utf8');
assert(source.includes('config.timeout=method==="get"?30000:30000'), 'write timeout must allow backend recovery retries to complete');
assert(source.includes('X-Alaboud-Client-Version"]=\"25.4.0\"'), 'client version header must be current');
assert(source.includes('تحقق من الاتصال وحالة العملية قبل إعادة المحاولة'), 'timeout message must not claim a definite save failure');
console.log('Client durable write timeout test passed');
