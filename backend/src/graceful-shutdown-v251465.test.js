"use strict";
const assert=require("assert");
const fs=require("fs");
const os=require("os");
const path=require("path");
const {spawn}=require("child_process");
const DatabaseService=require("./database/DatabaseService");
const {createGracefulShutdown}=require("./services/graceful-shutdown");

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function durableFlushWaitsForConfirmation(){
  let releaseSave;
  const saveGate=new Promise(resolve=>{releaseSave=resolve;});
  const adapter={
    mode:"test",
    async init(){},
    async load(){return {revision:0};},
    async save(){await saveGate;},
    async health(){return {ok:true};},
    async close(){}
  };
  const database=new DatabaseService({
    primaryAdapter:adapter,
    normalize:value=>value,
    emptyStore:()=>({revision:0}),
    logger:{log(){},warn(){},error(){}}
  });
  await database.init();
  const durableWrite=database.saveDurable({revision:1},{ownedSnapshot:true});
  let flushCompleted=false;
  const flush=database.flush({timeoutMs:500}).then(()=>{flushCompleted=true;});
  await wait(20);
  assert.strictEqual(flushCompleted,false,"shutdown flush must wait for saveDurable confirmation");
  releaseSave();
  await Promise.all([durableWrite,flush]);
  assert.strictEqual(flushCompleted,true);
}

async function phasesAreOrderedAndLogged(){
  const calls=[];
  const logs=[];
  const exits=[];
  const server={
    close(callback){calls.push("http");setTimeout(callback,5);},
    closeIdleConnections(){calls.push("idle");}
  };
  const lifecycle=createGracefulShutdown({
    getServer:()=>server,
    onShutdownStart:()=>calls.push("start"),
    flushStore:async({timeoutMs})=>{assert(timeoutMs>0);calls.push("database-flush");},
    stopTelemetry:async({timeoutMs})=>{assert(timeoutMs>0);calls.push("telemetry");},
    closeStore:async({timeoutMs,skipFlush})=>{assert(timeoutMs>0);assert.strictEqual(skipFlush,true);calls.push("database-close");},
    logger:{log:message=>logs.push(message),warn:message=>logs.push(message),error:message=>logs.push(message)},
    exit:code=>exits.push(code),
    totalTimeoutMs:300,
    httpDrainTimeoutMs:50,
    telemetryTimeoutMs:40,
    poolCloseTimeoutMs:40,
    exitReserveMs:20
  });
  const result=await lifecycle.shutdown("SIGTERM");
  assert.deepStrictEqual(calls.slice(0,5),["start","http","database-flush","telemetry","database-close"]);
  assert.strictEqual(result.exitCode,0);
  assert.deepStrictEqual(exits,[0]);
  assert(logs.some(line=>line.includes("Shutdown phase database-flush completed")));
  assert(logs.some(line=>line.includes("Shutdown phase database-close completed")));
  assert(logs.some(line=>line.includes("Graceful shutdown completed")));
}

async function hungDatabaseCannotExceedGlobalBudget(){
  const logs=[];
  const exits=[];
  let telemetryCalled=false;
  const startedAt=Date.now();
  const lifecycle=createGracefulShutdown({
    getServer:()=>({close:callback=>callback(),closeIdleConnections(){}}),
    flushStore:()=>new Promise(()=>{}),
    closeStore:async()=>{},
    stopTelemetry:async()=>{telemetryCalled=true;},
    logger:{log:message=>logs.push(message),warn:message=>logs.push(message),error:message=>logs.push(message)},
    exit:code=>exits.push(code),
    totalTimeoutMs:140,
    httpDrainTimeoutMs:15,
    telemetryTimeoutMs:20,
    poolCloseTimeoutMs:20,
    exitReserveMs:10
  });
  const result=await lifecycle.shutdown("SIGTERM");
  const elapsed=Date.now()-startedAt;
  assert(elapsed<250,`shutdown exceeded bounded test window: ${elapsed}ms`);
  assert.strictEqual(result.exitCode,1);
  assert.deepStrictEqual(exits,[1]);
  assert.strictEqual(telemetryCalled,true,"best-effort telemetry should use its reserved window");
  assert(logs.some(line=>line.includes("Shutdown phase database-flush failed")));
}

async function runtimeSigtermCompletesWithPhaseLogs(){
  // Windows terminates child processes immediately for child.kill("SIGTERM")
  // instead of delivering a POSIX signal to Node's process handler. The
  // platform-neutral lifecycle tests above still verify phase ordering,
  // durability, time budgets and exit codes; Cloud Build runs this runtime
  // signal check on Linux, matching Cloud Run production behavior.
  if(process.platform==="win32"){
    console.log("v25.14.65 runtime SIGTERM check skipped on Windows; Linux Cloud Build retains the runtime check");
    return;
  }
  const serverPath=path.join(__dirname,"server.js");
  try { require.resolve("express",{paths:[path.dirname(serverPath)]}); }
  catch {
    console.log("v25.14.65 runtime SIGTERM check skipped: dependencies are not installed");
    return;
  }
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),"alaboud-shutdown-v251465-"));
  const port=String(5300+(process.pid%500));
  const child=spawn(process.execPath,[serverPath],{
    env:{
      ...process.env,
      NODE_ENV:"test",
      PORT:port,
      DATA_DIR:dataDir,
      DATABASE_URL:"",
      JWT_SECRET:"shutdown-runtime-regression-secret-v251465"
    },
    stdio:["ignore","pipe","pipe"]
  });
  let output="";
  let signaledAt=0;
  try {
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error(`runtime SIGTERM check timed out\n${output}`)),12000);
      const inspect=chunk=>{
        output+=chunk.toString();
        if(!signaledAt&&output.includes("Database initialization completed")){
          signaledAt=Date.now();
          child.kill("SIGTERM");
        }
      };
      child.stdout.on("data",inspect);
      child.stderr.on("data",inspect);
      child.on("error",error=>{clearTimeout(timer);reject(error);});
      child.on("exit",(code,signal)=>{
        clearTimeout(timer);
        if(!signaledAt)return reject(new Error(`server exited before SIGTERM (code=${code}, signal=${signal})\n${output}`));
        if(code!==0)return reject(new Error(`server shutdown failed (code=${code}, signal=${signal})\n${output}`));
        resolve();
      });
    });
    const durationMs=Date.now()-signaledAt;
    assert(durationMs<8500,`runtime shutdown exceeded Cloud Run-safe budget: ${durationMs}ms`);
    const start=output.indexOf("SIGTERM received: flushing database writes");
    const http=output.indexOf("Shutdown phase http-drain completed",start);
    const databaseFlush=output.indexOf("Shutdown phase database-flush completed",http);
    const telemetry=output.indexOf("Shutdown phase telemetry completed",databaseFlush);
    const databaseClose=output.indexOf("Shutdown phase database-close completed",telemetry);
    const completed=output.indexOf("Graceful shutdown completed",databaseClose);
    assert(start>=0&&http>start&&databaseFlush>http&&telemetry>databaseFlush&&databaseClose>telemetry&&completed>databaseClose,`shutdown phase logs missing or out of order\n${output}`);
    console.log(`v25.14.65 runtime SIGTERM completed in ${durationMs}ms`);
  } finally {
    if(child.exitCode===null&&child.signalCode===null)child.kill("SIGKILL");
    fs.rmSync(dataDir,{recursive:true,force:true});
  }
}

(async()=>{
  await durableFlushWaitsForConfirmation();
  await phasesAreOrderedAndLogged();
  await hungDatabaseCannotExceedGlobalBudget();
  await runtimeSigtermCompletesWithPhaseLogs();
  console.log("v25.14.65 bounded graceful shutdown regression: OK");
})().catch(error=>{console.error(error);process.exit(1);});
