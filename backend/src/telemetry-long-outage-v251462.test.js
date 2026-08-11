"use strict";
const assert=require("assert/strict");
const {createTelemetryWriter}=require("./telemetry-writer");

(async()=>{
  let databaseUp=false;
  const persisted=[];
  const query=async(sql,values)=>{
    if(!databaseUp)throw new Error("SIMULATED_POSTGRES_OUTAGE");
    if(/^INSERT INTO integration_logs/i.test(sql)){
      const width=11;
      for(let i=0;i<values.length;i+=width)persisted.push({id:values[i],companyId:values[i+1]});
      return {rowCount:values.length/width};
    }
    if(/^INSERT INTO api_key_activity/i.test(sql))return {rowCount:values.length/7};
    return {rowCount:0};
  };
  const writer=createTelemetryWriter({getQuery:()=>query,maxQueue:50,batchSize:10,flushIntervalMs:3600000,logger:{warn(){}}});
  for(let i=0;i<500;i++)writer.enqueue("integration_log",{id:`evt-${i}`,companyId:"company-outage",requestId:`r-${i}`,method:"GET",path:"/api/test",statusCode:200,durationMs:1,createdAt:new Date().toISOString()});
  let h=writer.health();
  assert.equal(h.queueDepth,50,"queue must remain bounded during a long outage");
  assert.equal(h.telemetryDropped,450,"oldest-first drops must account for overflow");
  assert.equal(await writer.flush(),0,"flush must not remove events while database is unavailable");
  h=writer.health();
  assert.equal(h.queueDepth,50,"failed batch must remain queued");
  assert.match(h.lastFlushError,/SIMULATED_POSTGRES_OUTAGE/);
  databaseUp=true;
  for(let i=0;i<10;i++)await writer.flush();
  h=writer.health();
  assert.equal(h.queueDepth,0,"queue must self-recover after database returns");
  assert.equal(h.telemetryFlushed,50);
  assert.equal(h.lastFlushError,null);
  assert.deepEqual(persisted.map(x=>x.id),Array.from({length:50},(_,i)=>`evt-${450+i}`),"oldest-first must retain the newest bounded window");
  console.log("v25.14.62 telemetry long-outage recovery: OK");
})().catch(error=>{console.error(error);process.exit(1)});
