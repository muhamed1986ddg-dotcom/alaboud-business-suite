const fs=require("fs");
const assert=require("assert");
const server=fs.readFileSync(require.resolve("./server"),"utf8");
assert.match(server,/https:\/\/raselsms\.com\/api\/v1\/messages\/send/);
assert.match(server,/JSON\.stringify\(\{phoneNumber,message\}\)/);
assert.match(server,/"X-API-Key":apiKey/);
assert.doesNotMatch(server,/api\/v2\/messages\/send/);
console.log("v25.14.52 Rasel SMS v1 contract: OK");
