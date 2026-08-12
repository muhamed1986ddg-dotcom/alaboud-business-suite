"use strict";

function isStaleRevisionConflict(error){
  return String(error?.code||"").toUpperCase()==="STALE_STATE_REVISION" && Number(error?.status||error?.statusCode||0)===409 && error?.retryable===true;
}

async function runWithStaleRevisionRecovery({execute,reload,maxAttempts=3,onRetry=()=>{}}){
  if(typeof execute!=="function"||typeof reload!=="function")throw new TypeError("execute and reload are required");
  const attempts=Math.max(1,Math.min(5,Number(maxAttempts)||1));
  for(let attempt=1;attempt<=attempts;attempt+=1){
    try{return await execute(attempt)}catch(error){
      if(!isStaleRevisionConflict(error)||attempt>=attempts)throw error;
      await reload({attempt,error});
      onRetry({attempt,error});
    }
  }
  throw new Error("stale revision recovery exhausted unexpectedly");
}

module.exports={isStaleRevisionConflict,runWithStaleRevisionRecovery};
