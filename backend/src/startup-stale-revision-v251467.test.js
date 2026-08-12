"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const DatabaseService = require("./database/DatabaseService");
const { isRecoverableOperationalError } = require("./database/operational-error");

function staleRevisionError(){
  const error = new Error("Application state changed before this write could commit");
  error.code = "STALE_STATE_REVISION";
  error.status = 409;
  error.retryable = true;
  return error;
}

async function run(){
  assert.strictEqual(isRecoverableOperationalError(staleRevisionError()),true,"startup revision conflict must be recoverable");

  let persisted={marker:"initial"};
  let loadCount=0;
  let rejectNextSave=false;
  const adapter={
    mode:"test-postgres",
    async init(){},
    async load(){loadCount+=1;return structuredClone(persisted);},
    async save(snapshot){
      if(rejectNextSave){rejectNextSave=false;throw staleRevisionError();}
      persisted=structuredClone(snapshot);
    },
    async health(){return {ok:true};},
    async close(){}
  };
  const database=new DatabaseService({
    primaryAdapter:adapter,
    normalize:value=>value&&typeof value==="object"?value:{},
    emptyStore:()=>({}),
    logger:{log(){},warn(){},error(){}}
  });

  assert.deepStrictEqual(await database.init(),{marker:"initial"});
  persisted={marker:"newer-cloud-run-revision"};
  rejectNextSave=true;
  await assert.rejects(database.saveDurable({marker:"stale-startup-write"}),error=>error.code==="STALE_STATE_REVISION");
  assert.strictEqual(database.lastPersistError?.code,"STALE_STATE_REVISION");

  const reloaded=await database.reload();
  assert.deepStrictEqual(reloaded,{marker:"newer-cloud-run-revision"},"retry must reload the latest PostgreSQL state");
  assert.strictEqual(loadCount,2,"database state must be loaded again after the conflict");
  assert.strictEqual(database.lastPersistError,null,"successful reload must clear the stale startup error");

  const server=fs.readFileSync(path.join(__dirname,"server.js"),"utf8");
  assert(server.includes("initStore({reload:startupAttempt>1})"),"startup retry must request a fresh database state");
  assert(server.includes("while(!shuttingDown&&!serviceReady)"),"startup retry loop must remain active until ready");

  console.log("v25.14.67 startup stale-revision recovery regression: OK");
}

run().catch(error=>{
  console.error(error);
  process.exitCode=1;
});
