import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const {registerMonthlyAccountMessagesJob}=require("./monthly-account-messages-job.js");

function setup(){
  let route,current=null;const calls=[];
  const app={post:(_path,handler)=>{route=handler;}};
  const stores={b1:{notificationSettings:{}},b2:{notificationSettings:{}}};
  const run=registerMonthlyAccountMessagesJob(app,{crypto:require("node:crypto"),readRootStore:()=>({branches:[{id:"b1",companyId:"co1"},{id:"b2",companyId:"co2"}]}),readStore:()=>stores[current],runWithTenant:async(_company,branch,callback)=>{const previous=current;current=branch;try{return await callback();}finally{current=previous;}},mutateDurable:async fn=>fn(stores[current]),id:()=>"id",now:()=>"2026-08-19T12:00:00Z",customerSummary:()=>({}),inventoryLocalDate:()=>({date:"2026-08-19",day:19,time:"12:00"}),isScheduledRunDue:()=>true,executeMonthlyAccountMessages:async options=>{calls.push({companyId:options.companyId,store:options.store});return [];},sendWhatsApp:async()=>({ok:true}),isServiceReady:()=>true});
  return {route,run,calls,stores};
}

test("scheduler endpoint rejects an unauthorized request",async()=>{
  const {route}=setup();const previous=process.env.MONTHLY_ACCOUNT_MESSAGES_JOB_SECRET;process.env.MONTHLY_ACCOUNT_MESSAGES_JOB_SECRET="test-secret";
  const res={statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};
  try{await route({headers:{}},res);assert.equal(res.statusCode,401);}finally{if(previous===undefined)delete process.env.MONTHLY_ACCOUNT_MESSAGES_JOB_SECRET;else process.env.MONTHLY_ACCOUNT_MESSAGES_JOB_SECRET=previous;}
});

test("manual tenant filter cannot read another company or branch",async()=>{
  const {run,calls,stores}=setup();const result=await run({companyId:"co1",branchId:"b1",force:true,triggerType:"MANUAL"});
  assert.equal(result.eligibleTenantCount,1);assert.deepEqual(calls,[{companyId:"co1",store:stores.b1}]);
});

test("job returns NOT_SCHEDULED_TIME when no tenant is due",async()=>{
  const {route}=setup();const previous=process.env.MONTHLY_ACCOUNT_MESSAGES_JOB_SECRET;process.env.MONTHLY_ACCOUNT_MESSAGES_JOB_SECRET="test-secret";
  const res={statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};
  const app={post:(_path,handler)=>{app.handler=handler;}};
  registerMonthlyAccountMessagesJob(app,{crypto:require("node:crypto"),readRootStore:()=>({branches:[{id:"b",companyId:"co"}]}),readStore:()=>({notificationSettings:{}}),runWithTenant:async(_c,_b,fn)=>fn(),mutateDurable:async fn=>fn({}),id:()=>"id",now:()=>"",customerSummary:()=>({}),inventoryLocalDate:()=>({day:1,time:"00:00",date:"2026-08-01"}),isScheduledRunDue:()=>false,executeMonthlyAccountMessages:async()=>{throw new Error("must not run");},sendWhatsApp:async()=>({ok:true}),isServiceReady:()=>true});
  try{await app.handler({headers:{"x-alaboud-job-secret":"test-secret"}},res);assert.deepEqual(res.body,{skipped:true,reason:"NOT_SCHEDULED_TIME",sent:0,failed:0,skippedDuplicates:0});}finally{if(previous===undefined)delete process.env.MONTHLY_ACCOUNT_MESSAGES_JOB_SECRET;else process.env.MONTHLY_ACCOUNT_MESSAGES_JOB_SECRET=previous;}
});
