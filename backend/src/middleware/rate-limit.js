"use strict";

const crypto = require("crypto");

function createInMemoryRateLimiter({cleanupIntervalMs=10*60*1000}={}){
  const requestBuckets=new Map();
  const cleanup=setInterval(()=>{
    const current=Date.now();
    for(const [key,bucket] of requestBuckets){
      if(!bucket||current>bucket.reset)requestBuckets.delete(key);
    }
  },cleanupIntervalMs);
  cleanup.unref?.();

  function rateLimit(name,limit,windowMs){
    return (req,res,next)=>{
      const key=`${name}:${req.ip}`;
      const current=Date.now();
      let bucket=requestBuckets.get(key);
      if(!bucket||current>bucket.reset){
        bucket={count:0,reset:current+windowMs};
        requestBuckets.set(key,bucket);
      }
      bucket.count++;
      res.setHeader("RateLimit-Limit",limit);
      res.setHeader("RateLimit-Remaining",Math.max(0,limit-bucket.count));
      if(bucket.count>limit)return res.status(429).json({message:"طلبات كثيرة جدًا، حاول لاحقًا"});
      next();
    };
  }

  return {rateLimit};
}

const DEFAULT_SHARED_NAMES = [
  "login",
  "2fa",
  "account-verification-send",
  "account-verification-verify",
  "biometric",
  "register-company",
  "forgot-password",
  "reset-password",
  "backup",
];

function createHybridRateLimiter({getQuery,sharedNames=DEFAULT_SHARED_NAMES,cleanupIntervalMs=10*60*1000}={}){
  const memory=createInMemoryRateLimiter({cleanupIntervalMs});
  const shared=new Set(sharedNames||[]);
  let tableReady=null;
  let lastCleanupAt=0;

  function hashedBucketKey(name,ip){
    return crypto.createHash("sha256").update(`${name}:${String(ip||"")}`).digest("hex");
  }

  async function ensureTable(query){
    if(!tableReady){
      tableReady=Promise.resolve(query(
        `CREATE TABLE IF NOT EXISTS security_rate_limit_buckets (
           bucket_key TEXT NOT NULL,
           window_start BIGINT NOT NULL,
           expires_at TIMESTAMPTZ NOT NULL,
           request_count INTEGER NOT NULL DEFAULT 0,
           PRIMARY KEY (bucket_key, window_start)
         )`,
        [],
        {operation:"security-rate-limit-init",attempts:1,queryTimeoutMs:1500,recoveryBudgetMs:1500}
      )).catch(error=>{tableReady=null;throw error;});
    }
    return tableReady;
  }

  function rateLimit(name,limit,windowMs){
    const fallback=memory.rateLimit(name,limit,windowMs);
    if(!shared.has(name))return fallback;

    return async (req,res,next)=>{
      const query=typeof getQuery==="function"?getQuery():null;
      if(typeof query!=="function")return fallback(req,res,next);
      try{
        await ensureTable(query);
        const current=Date.now();
        const windowStart=Math.floor(current/windowMs)*windowMs;
        const expiresAt=new Date(windowStart+windowMs).toISOString();
        const key=hashedBucketKey(name,req.ip);
        const result=await query(
          `INSERT INTO security_rate_limit_buckets(bucket_key,window_start,expires_at,request_count)
           VALUES($1,$2,$3,1)
           ON CONFLICT(bucket_key,window_start)
           DO UPDATE SET request_count=security_rate_limit_buckets.request_count+1, expires_at=EXCLUDED.expires_at
           RETURNING request_count`,
          [key,windowStart,expiresAt],
          {operation:`security-rate-limit:${name}`,attempts:1,queryTimeoutMs:1200,recoveryBudgetMs:1200}
        );
        const count=Number(result?.rows?.[0]?.request_count||1);
        res.setHeader("RateLimit-Limit",limit);
        res.setHeader("RateLimit-Remaining",Math.max(0,limit-count));
        if(count>limit)return res.status(429).json({message:"طلبات كثيرة جدًا، حاول لاحقًا"});

        if(current-lastCleanupAt>cleanupIntervalMs){
          lastCleanupAt=current;
          Promise.resolve(query(
            `DELETE FROM security_rate_limit_buckets WHERE expires_at < NOW() - INTERVAL '1 hour'`,
            [],
            {operation:"security-rate-limit-cleanup",attempts:1,queryTimeoutMs:1000,recoveryBudgetMs:1000}
          )).catch(()=>undefined);
        }
        return next();
      }catch(_error){
        // Availability is more important than making auth depend on a limiter
        // table during a database incident. The per-instance limiter remains a
        // safe fallback while PostgreSQL recovers.
        return fallback(req,res,next);
      }
    };
  }

  return {rateLimit};
}

module.exports={createInMemoryRateLimiter,createHybridRateLimiter,DEFAULT_SHARED_NAMES};
