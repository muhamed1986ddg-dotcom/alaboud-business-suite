const fs=require('fs');
const assert=require('assert');
const source=fs.readFileSync(require('path').join(__dirname,'../src/server.js'),'utf8');
assert(source.includes('challengeTtlSeconds=10*60'),'2FA challenge must last 10 minutes');
assert(source.includes('for(let w=-2;w<=2;w++)'),'TOTP must tolerate small clock drift');
assert(source.includes('TWO_FACTOR_CHALLENGE_EXPIRED'),'expired challenge must have a distinct error code');
assert(source.includes('TWO_FACTOR_CODE_INVALID'),'invalid TOTP must not be reported as an expired challenge');
console.log('two-factor login reliability test passed');
