const fs=require('fs');
const assert=require('assert');
const source=fs.readFileSync(__dirname+'/api.js','utf8');
assert(source.includes('sanitizeOperationalMessage'),'operational message sanitizer missing');
assert(source.includes('Connection')===false || source.includes('TRANSIENT_DATABASE_TEXT'),'technical errors need mapping');
assert(source.includes('DATABASE_TEMPORARILY_UNAVAILABLE'),'retryable database code missing');
assert(source.includes('alaboud-database-status'),'database recovery event missing');
console.log('Frontend operational error mapping test passed');
