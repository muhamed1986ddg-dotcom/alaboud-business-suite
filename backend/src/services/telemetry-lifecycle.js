"use strict";

function createTelemetryLifecycle({writer,logger=console,retentionDays=90,initialCleanupDelayMs=30*1000,cleanupIntervalMs=24*60*60*1000}){
  let initialCleanupTimer=null;
  let retentionTimer=null;

  const cleanup=()=>writer.cleanupRetention({days:retentionDays}).catch(error=>logger.warn?.("Telemetry retention cleanup failed:",error.message));

  function start(){
    writer.start();
    if(!initialCleanupTimer){
      initialCleanupTimer=setTimeout(()=>{initialCleanupTimer=null;void cleanup();},initialCleanupDelayMs);
      initialCleanupTimer.unref?.();
    }
    if(!retentionTimer){
      retentionTimer=setInterval(()=>{void cleanup();},cleanupIntervalMs);
      retentionTimer.unref?.();
    }
  }

  async function stop({timeoutMs=4000}={}){
    if(initialCleanupTimer){clearTimeout(initialCleanupTimer);initialCleanupTimer=null;}
    if(retentionTimer){clearInterval(retentionTimer);retentionTimer=null;}
    return writer.stop({timeoutMs});
  }

  return {start,stop,cleanupRetention:cleanup};
}

module.exports={createTelemetryLifecycle};
