"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createIdempotencyMiddleware } = require("./idempotency");
const { getOperationContext } = require("./operation-context");

function makeReq(key="op-1") {
  return {
    method: "POST",
    path: "/payments",
    user: { companyId: "company-1" },
    get(name) {
      const lower=String(name).toLowerCase();
      if(lower==="idempotency-key")return key;
      if(lower==="x-company-id")return "company-1";
      return "";
    }
  };
}
function makeRes(){
  return {
    statusCode:200, headers:{}, body:null, listeners:{},
    setHeader(k,v){this.headers[String(k).toLowerCase()]=v;},
    status(code){this.statusCode=code;return this;},
    json(body){this.body=body;return this;},
    on(name,fn){this.listeners[name]=fn;return this;}
  };
}

(async()=>{
  // A receipt already committed in PostgreSQL must be replayed without running
  // the mutation again, even after the Node process memory cache is empty.
  let nextCalled=false;
  const committedMiddleware=createIdempotencyMiddleware({
    getQuery:()=>async()=>({rows:[{response_body:{id:"payment-1",amount:100},app_revision:9,committed_at:new Date()}]})
  });
  const replayRes=makeRes();
  committedMiddleware(makeReq("persisted-key"),replayRes,()=>{nextCalled=true;});
  await new Promise(r=>setTimeout(r,25));
  assert.equal(nextCalled,false,"committed receipt must not rerun mutation");
  assert.equal(replayRes.statusCode,200);
  assert.equal(replayRes.body.id,"payment-1");
  assert.equal(replayRes.headers["idempotency-replayed"],"true");

  // A fresh request must expose the operation key through AsyncLocalStorage so
  // mutateDurable can persist the receipt in the same database transaction.
  let observed=null;
  const freshMiddleware=createIdempotencyMiddleware({getQuery:()=>async()=>({rows:[]})});
  const freshRes=makeRes();
  freshMiddleware(makeReq("fresh-key"),freshRes,()=>{observed=getOperationContext();});
  await new Promise(r=>setTimeout(r,25));
  assert.equal(observed?.key,"fresh-key");
  assert.equal(observed?.method,"POST");
  assert.equal(observed?.path,"/payments");

  const adapterSource=fs.readFileSync(path.join(__dirname,"../database/adapters/PostgresStateAdapter.js"),"utf8");
  assert(adapterSource.includes("CREATE TABLE IF NOT EXISTS operation_receipts"));
  assert(adapterSource.includes("INSERT INTO operation_receipts"));
  const appStatePos=adapterSource.indexOf("INSERT INTO app_state");
  const receiptPos=adapterSource.indexOf("INSERT INTO operation_receipts");
  const directCommitPos=adapterSource.indexOf('client.query("COMMIT")',appStatePos);
  const boundedCommitPos=adapterSource.indexOf('client.query({ text: "COMMIT"',appStatePos);
  const commitPos=[directCommitPos,boundedCommitPos].filter(pos=>pos>=0).sort((a,b)=>a-b)[0]??-1;
  assert(appStatePos>=0&&receiptPos>appStatePos&&commitPos>receiptPos,"receipt must be stored before the same COMMIT as app_state");

  const apiSource=fs.readFileSync(path.join(__dirname,"../../../frontend/src/api.js"),"utf8");
  assert(apiSource.includes("verifyCommittedOperation"));
  assert(apiSource.includes("جارٍ التحقق من نتيجة العملية"));
  assert(apiSource.includes("/api/operations/"));

  console.log("Commit confirmation & idempotency tests passed");
})().catch(error=>{console.error(error);process.exit(1);});
