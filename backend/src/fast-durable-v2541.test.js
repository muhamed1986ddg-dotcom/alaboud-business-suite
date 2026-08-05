const fs=require("fs");const assert=require("assert");
const store=fs.readFileSync(__dirname+"/store.js","utf8");
const db=fs.readFileSync(__dirname+"/database/DatabaseService.js","utf8");
assert(store.includes("database.queueSave()"),"interactive mutations must enqueue persistence");
assert(!store.includes("await writeStoreDurable(rootStore)"),"interactive mutations must not wait for database confirmation");
assert(db.includes("startWriteBehindWorker"),"write-behind worker must exist");
assert(db.includes("persistedRevision"),"queue must track durable progress");
console.log("instant write-behind v25.4.2 tests passed");
