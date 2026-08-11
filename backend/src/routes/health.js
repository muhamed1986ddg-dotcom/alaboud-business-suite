"use strict";
function registerHealthRoutes(app,{databaseHealth,productionReadiness,getServiceState,nativeRepositories,telemetryHealth,now,version,openApiDocument,docsHtml}){
  app.get("/api/health",async(_req,res)=>{
    const database=await databaseHealth();
    const readiness=productionReadiness();
    const state=getServiceState();
    const ok=state.serviceReady&&database.ok&&readiness.ok;
    res.status(ok?200:503).json({ok,version,serviceReady:state.serviceReady,startupAttempt:state.startupAttempt,startupError:state.startupError||null,database,readiness,nativeRepositories:nativeRepositories.health(),telemetry:telemetryHealth?telemetryHealth():null,time:now()});
  });
  app.get("/api/openapi.json",(_req,res)=>res.json(openApiDocument()));
  app.get("/api/docs",(_req,res)=>res.type("html").send(docsHtml()));
}
module.exports={registerHealthRoutes};
