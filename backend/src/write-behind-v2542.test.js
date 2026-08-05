const assert=require("assert");
const DatabaseService=require("./database/DatabaseService");
let saves=0;let release;const gate=new Promise(r=>release=r);
const adapter={mode:"test",async init(){},async load(){return null},async save(){saves++;await gate},async health(){return {ok:true}},async close(){}};
(async()=>{const db=new DatabaseService({primaryAdapter:adapter,normalize:x=>x,emptyStore:()=>({n:0})});await db.init();db.replaceStore({n:1});const started=Date.now();const queued=db.queueSave();assert(queued.queued);assert(Date.now()-started<100,"queueSave must return immediately");db.replaceStore({n:2});db.queueSave();assert.equal(db.pendingSnapshot.n,2,"latest snapshot must replace stale one");release();await new Promise(r=>setTimeout(r,25));assert(saves>=1);console.log("write-behind v25.4.2 tests passed")})().catch(e=>{console.error(e);process.exit(1)});
