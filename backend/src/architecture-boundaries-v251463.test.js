"use strict";
const assert=require("assert");
const {createServiceReadinessGate}=require("./middleware/service-readiness");
const {createInMemoryRateLimiter}=require("./middleware/rate-limit");
const {createTelemetryLifecycle}=require("./services/telemetry-lifecycle");

function responseRecorder(){
  return {statusCode:200,headers:{},body:null,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;},setHeader(k,v){this.headers[k]=v;}};
}

{
  let nextCount=0;
  const gate=createServiceReadinessGate({getServiceState:()=>({serviceReady:false,startupAttempt:7})});
  const res=responseRecorder();
  gate({path:"/api/customers"},res,()=>nextCount++);
  assert.strictEqual(nextCount,0);
  assert.strictEqual(res.statusCode,503);
  assert.strictEqual(res.body.code,"SERVICE_STARTING_DATABASE_RETRY");
  assert.strictEqual(res.body.startupAttempt,7);
  const healthRes=responseRecorder();
  gate({path:"/api/health"},healthRes,()=>nextCount++);
  assert.strictEqual(nextCount,1);
}

{
  const {rateLimit}=createInMemoryRateLimiter({cleanupIntervalMs:60_000});
  const limit=rateLimit("test",2,60_000);
  let nextCount=0;
  const req={ip:"127.0.0.1"};
  const r1=responseRecorder(),r2=responseRecorder(),r3=responseRecorder();
  limit(req,r1,()=>nextCount++); limit(req,r2,()=>nextCount++); limit(req,r3,()=>nextCount++);
  assert.strictEqual(nextCount,2);
  assert.strictEqual(r3.statusCode,429);
  assert.strictEqual(r3.body.message,"طلبات كثيرة جدًا، حاول لاحقًا");
}

(async()=>{
  const calls=[];
  const writer={
    start(){calls.push("start");},
    cleanupRetention({days}){calls.push(`cleanup:${days}`);return Promise.resolve(true);},
    stop({timeoutMs}){calls.push(`stop:${timeoutMs}`);return Promise.resolve(0);}
  };
  const lifecycle=createTelemetryLifecycle({writer,initialCleanupDelayMs:5,cleanupIntervalMs:60_000});
  lifecycle.start();
  await new Promise(resolve=>setTimeout(resolve,20));
  await lifecycle.stop({timeoutMs:4000});
  assert(calls.includes("start"));
  assert(calls.includes("cleanup:90"));
  assert(calls.includes("stop:4000"));
  console.log("v25.14.63 architecture boundaries regression: OK");
})().catch(error=>{console.error(error);process.exit(1);});
