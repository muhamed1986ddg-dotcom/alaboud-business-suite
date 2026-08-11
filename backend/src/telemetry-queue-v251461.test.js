"use strict";
const assert=require("assert");
const {createTelemetryWriter}=require("./telemetry-writer");
(async()=>{
 const calls=[];const query=async(sql,values)=>{calls.push({sql,values});return {rows:[]};};
 const writer=createTelemetryWriter({getQuery:()=>query,maxQueue:3,batchSize:10,flushIntervalMs:60000,logger:{warn(){}}});
 await Promise.all(Array.from({length:5},(_,i)=>Promise.resolve().then(()=>writer.enqueue("integration_log",{id:`e${i}`,companyId:"c",createdAt:new Date().toISOString()}))));
 let h=writer.health();assert.equal(h.queueDepth,3);assert.equal(h.telemetryQueued,5);assert.equal(h.telemetryDropped,2);
 await writer.flush();h=writer.health();assert.equal(h.telemetryFlushed,3);assert.equal(h.queueDepth,0);assert.equal(h.lastFlushError,null);
 assert(calls.some(x=>x.sql.startsWith("INSERT INTO integration_logs")));
 const broken=createTelemetryWriter({getQuery:()=>async()=>{throw new Error("db down")},maxQueue:3,batchSize:3,logger:{warn(){}}});
 broken.enqueue("integration_log",{id:"x",companyId:"c"});await broken.flush();assert.equal(broken.health().queueDepth,1);assert.equal(broken.health().telemetryFlushed,0);assert(broken.health().lastFlushError);
 console.log("v25.14.61 telemetry queue/concurrency regression: OK");
})().catch(e=>{console.error(e);process.exit(1)});
