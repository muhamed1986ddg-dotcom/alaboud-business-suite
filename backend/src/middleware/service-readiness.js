"use strict";

function createServiceReadinessGate({getServiceState,publicApiPaths=["/api/health","/api/openapi.json","/api/docs"]}){
  const allowed=new Set(publicApiPaths);
  return (req,res,next)=>{
    const state=getServiceState();
    const requestPath=String(req.path||"");
    if(state.serviceReady || !requestPath.startsWith("/api/") || allowed.has(requestPath)) return next();
    return res.status(503).json({
      message:"الخدمة تعيد الاتصال بقاعدة البيانات حاليًا. يرجى المحاولة بعد لحظات.",
      code:"SERVICE_STARTING_DATABASE_RETRY",
      retryable:true,
      startupAttempt:state.startupAttempt
    });
  };
}

module.exports={createServiceReadinessGate};
