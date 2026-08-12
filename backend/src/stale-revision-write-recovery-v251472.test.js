"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const {isStaleRevisionConflict,runWithStaleRevisionRecovery}=require("./reliability/stale-revision-recovery");

const stale=()=>Object.assign(new Error("stale"),{code:"STALE_STATE_REVISION",status:409,retryable:true});

(async()=>{
  assert.strictEqual(isStaleRevisionConflict(stale()),true);
  assert.strictEqual(isStaleRevisionConflict({code:"STALE_STATE_REVISION",status:409,retryable:false}),false);

  let current={revision:1,balance:100};
  let executions=0;
  let reloads=0;
  const result=await runWithStaleRevisionRecovery({
    maxAttempts:3,
    execute:async()=>{
      executions+=1;
      const draft=structuredClone(current);
      draft.balance-=25;
      if(executions===1)throw stale();
      current=draft;
      return draft.balance;
    },
    reload:async()=>{reloads+=1;current={revision:2,balance:80};}
  });
  assert.strictEqual(result,55,"mutation must be rebuilt on the latest reloaded state");
  assert.strictEqual(executions,2);
  assert.strictEqual(reloads,1);

  let nonStaleExecutions=0;
  await assert.rejects(runWithStaleRevisionRecovery({
    execute:async()=>{nonStaleExecutions+=1;throw Object.assign(new Error("validation"),{status:400});},
    reload:async()=>{throw new Error("must not reload");}
  }),/validation/);
  assert.strictEqual(nonStaleExecutions,1,"business validation errors must never retry");

  let boundedExecutions=0;
  let boundedReloads=0;
  await assert.rejects(runWithStaleRevisionRecovery({
    maxAttempts:3,
    execute:async()=>{boundedExecutions+=1;throw stale();},
    reload:async()=>{boundedReloads+=1;}
  }),error=>error.code==="STALE_STATE_REVISION");
  assert.strictEqual(boundedExecutions,3,"revision retries must be bounded");
  assert.strictEqual(boundedReloads,2,"the final rejected attempt must not reload again");

  const root=path.resolve(__dirname,"../..");
  const store=fs.readFileSync(path.join(root,"backend/src/store.js"),"utf8");
  const server=fs.readFileSync(path.join(root,"backend/src/server.js"),"utf8");
  assert(store.includes("runWithStaleRevisionRecovery"),"durable mutations must use stale-revision recovery");
  assert(store.includes("structuredClone(rootStore)"),"each retry must rebuild a private draft from the current root store");
  assert(store.includes("await database.reload()"),"stale recovery must reload the authoritative PostgreSQL state");
  assert(store.includes("operationReceipt=requestOperation?.key"),"idempotency receipt must remain attached to retried writes");
  assert(!server.includes("setTimeout(runHourlyRateRefresh,60*1000)"),"test revisions must not write automatic rates one minute after startup");
  assert(server.includes("error?.publicMessage"),"payment conflicts must return the safe Arabic message");
  console.log("v25.14.72 stale revision write recovery regression: OK");
})().catch(error=>{console.error(error);process.exit(1);});
