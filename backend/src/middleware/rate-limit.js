"use strict";

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

module.exports={createInMemoryRateLimiter};
