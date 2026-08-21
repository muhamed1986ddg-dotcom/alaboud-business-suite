"use strict";

const assert=require("assert/strict");
const {createHybridRateLimiter}=require("./middleware/rate-limit");

async function runMiddleware(middleware,req){
  return new Promise((resolve,reject)=>{
    const headers={};
    const res={
      statusCode:200,
      body:null,
      setHeader:(key,value)=>{headers[key]=value;},
      status(code){this.statusCode=code;return this;},
      json(body){this.body=body;resolve({next:false,res:this,headers});return this;},
    };
    Promise.resolve(middleware(req,res,()=>resolve({next:true,res,headers}))).catch(reject);
  });
}

(async()=>{
  const buckets=new Map();
  const query=async(sql,params)=>{
    if(sql.includes("CREATE TABLE"))return {rows:[]};
    if(sql.includes("INSERT INTO security_rate_limit_buckets")){
      const mapKey=`${params[0]}:${params[1]}`;
      const count=(buckets.get(mapKey)||0)+1;
      buckets.set(mapKey,count);
      return {rows:[{request_count:count}]};
    }
    return {rows:[]};
  };
  const {rateLimit}=createHybridRateLimiter({getQuery:()=>query,sharedNames:["login"],cleanupIntervalMs:60_000});
  const middleware=rateLimit("login",2,60_000);
  assert.equal((await runMiddleware(middleware,{ip:"203.0.113.5"})).next,true);
  assert.equal((await runMiddleware(middleware,{ip:"203.0.113.5"})).next,true);
  const blocked=await runMiddleware(middleware,{ip:"203.0.113.5"});
  assert.equal(blocked.next,false);
  assert.equal(blocked.res.statusCode,429);
  console.log("v25.14.94 shared sensitive rate limiting: OK");
})().catch(error=>{console.error(error);process.exitCode=1;});
