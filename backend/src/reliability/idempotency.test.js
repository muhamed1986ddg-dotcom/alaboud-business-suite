"use strict";
const assert=require("assert");
const {createIdempotencyMiddleware}=require("./idempotency");
function response(){const handlers={};return{statusCode:200,headers:{},body:null,setHeader(k,v){this.headers[k]=v},status(v){this.statusCode=v;return this},json(v){this.body=v;return this},on(name,fn){handlers[name]=fn},handlers};}
(function(){
  const middleware=createIdempotencyMiddleware({ttlMs:10000});
  const req={method:"POST",path:"/api/customers",user:{companyId:"c1"},get:(name)=>name==="Idempotency-Key"?"key-1":""};
  const first=response();let firstNext=false;middleware(req,first,()=>{firstNext=true});assert.equal(firstNext,true);first.status(201).json({id:"customer-1"});
  const second=response();let secondNext=false;middleware(req,second,()=>{secondNext=true});assert.equal(secondNext,false);assert.equal(second.statusCode,201);assert.deepEqual(second.body,{id:"customer-1"});assert.equal(second.headers["Idempotency-Replayed"],"true");
  const pendingReq={...req,path:"/api/payments",get:(name)=>name==="Idempotency-Key"?"key-2":""};middleware(pendingReq,response(),()=>{});const duplicate=response();middleware(pendingReq,duplicate,()=>{throw new Error("must not continue")});assert.equal(duplicate.statusCode,409);assert.equal(duplicate.body.code,"DUPLICATE_OPERATION_IN_PROGRESS");
  console.log("Idempotency reliability tests passed");
})();
