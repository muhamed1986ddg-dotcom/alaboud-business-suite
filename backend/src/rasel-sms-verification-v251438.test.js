const fs=require('fs'),assert=require('assert');
const server=fs.readFileSync(require.resolve('./server'),'utf8');
assert.match(server,/RASEL_API_KEY/);
assert.match(server,/https:\/\/raselsms\.com\/api\/v2\/messages\/send/);
assert.match(server,/phoneNumber/);
assert.match(server,/JSON\.stringify\(\{phoneNumber,message\}\)/);
assert.match(server,/sendRaselSms/);
console.log('rasel-sms-verification-v251438.test.js: OK');
