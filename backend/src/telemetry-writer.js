"use strict";
const crypto=require("crypto");

function createTelemetryWriter({getQuery,logger=console,maxQueue=Number(process.env.TELEMETRY_QUEUE_MAX||5000),batchSize=Number(process.env.TELEMETRY_BATCH_SIZE||200),flushIntervalMs=Number(process.env.TELEMETRY_FLUSH_INTERVAL_MS||10000)}){
  const queue=[];
  const metrics={telemetryQueued:0,telemetryFlushed:0,telemetryDropped:0,lastFlushError:null,lastFlushAt:null,queueDepth:0};
  let timer=null,flushing=null,stopped=false;
  const syncDepth=()=>{metrics.queueDepth=queue.length;};
  function enqueue(type,payload){
    try{
      const event={id:payload?.id||crypto.randomUUID(),type,payload:{...payload}};
      if(queue.length>=maxQueue){queue.shift();metrics.telemetryDropped+=1;}
      queue.push(event);metrics.telemetryQueued+=1;syncDepth();return true;
    }catch(error){metrics.telemetryDropped+=1;metrics.lastFlushError=String(error?.message||error);return false;}
  }
  async function insertBatch(query,batch){
    const integration=batch.filter(x=>x.type==="integration_log").map(x=>x.payload);
    const activity=batch.filter(x=>x.type==="api_key_activity").map(x=>x.payload);
    if(integration.length){
      const values=[];const rows=integration.map((x,i)=>{const n=i*11;values.push(x.id,x.companyId,x.requestId||null,x.method||null,x.path||null,Number(x.statusCode||0),Number(x.durationMs||0),x.authType||null,x.actorId||null,x.ip||null,x.createdAt||new Date().toISOString());return `($${n+1},$${n+2},$${n+3},$${n+4},$${n+5},$${n+6},$${n+7},$${n+8},$${n+9},$${n+10},$${n+11})`;});
      await query(`INSERT INTO integration_logs (id,company_id,request_id,method,path,status_code,duration_ms,auth_type,actor_id,ip,created_at) VALUES ${rows.join(",")}`,values);
    }
    if(activity.length){
      const values=[];const rows=activity.map((x,i)=>{const n=i*7;values.push(x.id,x.companyId,x.apiKeyId,x.ip||null,x.userAgent||null,x.usedAt||new Date().toISOString(),Number(x.usageDelta||1));return `($${n+1},$${n+2},$${n+3},$${n+4},$${n+5},$${n+6},$${n+7})`;});
      await query(`INSERT INTO api_key_activity (id,company_id,api_key_id,ip,user_agent,used_at,usage_delta) VALUES ${rows.join(",")}`,values);
    }
  }
  async function flush(){
    if(flushing)return flushing;
    if(!queue.length)return 0;
    flushing=(async()=>{
      const query=getQuery?.();if(typeof query!=="function")throw new Error("TELEMETRY_DATABASE_QUERY_UNAVAILABLE");
      const batch=queue.slice(0,batchSize);
      await insertBatch(query,batch);
      queue.splice(0,batch.length);metrics.telemetryFlushed+=batch.length;metrics.lastFlushError=null;metrics.lastFlushAt=new Date().toISOString();syncDepth();return batch.length;
    })().catch(error=>{metrics.lastFlushError=String(error?.message||error);logger.warn?.("Telemetry flush failed; core operation remains unaffected:",metrics.lastFlushError);return 0;}).finally(()=>{flushing=null;});
    return flushing;
  }
  function start(){if(timer||stopped)return;timer=setInterval(()=>{try{void flush();}catch(error){metrics.lastFlushError=String(error?.message||error);}},flushIntervalMs);timer.unref?.();}
  async function stop({timeoutMs=4000}={}){stopped=true;if(timer){clearInterval(timer);timer=null;}const deadline=Date.now()+timeoutMs;do{if(!queue.length)break;await Promise.race([flush(),new Promise(resolve=>setTimeout(resolve,Math.max(1,Math.min(250,deadline-Date.now()))))]);}while(queue.length&&Date.now()<deadline);return queue.length;}
  async function cleanupRetention({days=90}={}){const query=getQuery?.();if(typeof query!=="function")return false;await query("DELETE FROM integration_logs WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')",[days]);await query("DELETE FROM api_key_activity WHERE used_at < NOW() - ($1::int * INTERVAL '1 day')",[days]);return true;}
  function health(){syncDepth();return {...metrics,maxQueue,batchSize,flushIntervalMs};}
  return {enqueue,flush,start,stop,cleanupRetention,health};
}
module.exports={createTelemetryWriter};
