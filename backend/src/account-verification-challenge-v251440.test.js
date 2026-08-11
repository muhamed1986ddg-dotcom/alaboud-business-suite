const assert=require('assert');
const fs=require('fs');
const path=require('path');
const server=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
assert.match(server,/challengeTargetChanged=\(challengeChannel==="EMAIL"&&emailChanged\)\|\|\(\(challengeChannel==="SMS"\|\|challengeChannel==="WHATSAPP"\)&&phoneChanged\)/);
assert.match(server,/if\(challengeTargetChanged\)delete user\.accountVerificationChallenge/);
assert.doesNotMatch(server,/if\(phone!==previousPhone\)user\.phoneVerifiedAt=null;\n\s*delete user\.accountVerificationChallenge;/);
console.log('account-verification-challenge-v251440.test.js: OK');
