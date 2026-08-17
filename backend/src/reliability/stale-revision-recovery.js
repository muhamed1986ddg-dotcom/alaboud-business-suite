"use strict";

function isStaleRevisionConflict(error){
  return String(error?.code||"").toUpperCase()==="STALE_STATE_REVISION" && Number(error?.status||error?.statusCode||0)===409 && error?.retryable===true;
}

async function runWithStaleRevisionRecovery({execute,reload,maxAttempts=5,onRetry=()=>{},baseDelayMs=40,maxDelayMs=320}){
  if(typeof execute!=="function"||typeof reload!=="function")throw new TypeError("execute and reload are required");
  const attempts=Math.max(1,Math.min(8,Number(maxAttempts)||1));
  const baseDelay=Math.max(0,Number(baseDelayMs)||0);
  const maxDelay=Math.max(baseDelay,Number(maxDelayMs)||baseDelay);
  for(let attempt=1;attempt<=attempts;attempt+=1){
    try{return await execute(attempt)}catch(error){
      if(!isStaleRevisionConflict(error)||attempt>=attempts)throw error;
      await reload({attempt,error});
      onRetry({attempt,error});
      // Multiple Cloud Run requests/revisions can discover the same stale revision
      // at nearly the same time. A small randomized backoff after reloading the
      // authoritative PostgreSQL state prevents every retry from colliding again.
      if(baseDelay>0){
        const exponential=Math.min(maxDelay,baseDelay*(2**(attempt-1)));
        const jitter=Math.floor(Math.random()*Math.max(1,Math.floor(exponential/2)));
        await new Promise(resolve=>setTimeout(resolve,exponential+jitter));
      }
    }
  }
  throw new Error("stale revision recovery exhausted unexpectedly");
}

module.exports={isStaleRevisionConflict,runWithStaleRevisionRecovery};
