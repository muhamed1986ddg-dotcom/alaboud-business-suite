"use strict";

const assert=require("assert");
const {runWithStaleRevisionRecovery,isStaleRevisionConflict}=require("./reliability/stale-revision-recovery");

function stale(){
  const error=new Error("Application state changed before this write could commit");
  error.code="STALE_STATE_REVISION";
  error.status=409;
  error.retryable=true;
  return error;
}

(async()=>{
  assert.equal(isStaleRevisionConflict(stale()),true);
  let executes=0;
  let reloads=0;
  const result=await runWithStaleRevisionRecovery({
    maxAttempts:5,
    baseDelayMs:0,
    execute:async()=>{
      executes+=1;
      if(executes<5)throw stale();
      return {ok:true};
    },
    reload:async()=>{reloads+=1;}
  });
  assert.deepStrictEqual(result,{ok:true});
  assert.equal(executes,5,"durable mutation must survive four consecutive revision conflicts");
  assert.equal(reloads,4,"every retry must reload authoritative PostgreSQL state first");

  let nonStaleExecutes=0;
  await assert.rejects(runWithStaleRevisionRecovery({
    maxAttempts:5,
    baseDelayMs:0,
    execute:async()=>{nonStaleExecutes+=1;throw Object.assign(new Error("validation"),{status:400});},
    reload:async()=>{throw new Error("must not reload");}
  }),/validation/);
  assert.equal(nonStaleExecutes,1,"non-stale errors must never be replayed");


  const fs=require("fs");
  const path=require("path");
  const server=fs.readFileSync(path.join(__dirname,"server.js"),"utf8");
  assert(server.includes("Partner sync failure metadata was not persisted"),"partner sync must preserve the original failure when diagnostic metadata conflicts");
  assert(server.includes("error.publicMessage||error.message"),"partner sync must prefer the safe public stale-revision message");

  console.log("stale revision recovery v25.14.86: OK");
})().catch(error=>{console.error(error);process.exit(1);});
