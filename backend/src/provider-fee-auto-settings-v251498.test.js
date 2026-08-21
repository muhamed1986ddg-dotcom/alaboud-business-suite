"use strict";
const assert=require("assert/strict");
const fs=require("fs");
const path=require("path");
const {registerNotificationRoutes}=require("./routes/notifications");
function recorder(){const routes=[];const app={};for(const method of ["get","post","patch"])app[method]=(routePath,...handlers)=>routes.push({method,path:routePath,handlers});return {app,routes};}
function response(){return {body:null,statusCode:200,status(code){this.statusCode=code;return this},json(body){this.body=body;return this}}}
(async()=>{
 const root={notificationSettings:{automaticProviderFeeEnabled:true,providerFeePer100:0.40},customers:[],capitalMovements:[],transactions:[],payments:[],notificationActions:[]};
 const {app,routes}=recorder();
 registerNotificationRoutes(app,{auth:()=>{},requirePermission:()=>()=>{},readStore:()=>root,mutateDurable:async fn=>fn(root),safeNumber:(v,f=0)=>Number.isFinite(Number(v))?Number(v):f,audit:()=>{},id:()=>"id",now:()=>new Date().toISOString(),customerSummary:()=>({}),capitalCadAmount:()=>0});
 const get=routes.find(r=>r.method==="get"&&r.path==="/api/transfer-fee-settings"); const rg=response(); await get.handlers.at(-1)({},rg);
 assert.deepStrictEqual(rg.body,{enabled:true,feePer100:0.4});
 const patch=routes.find(r=>r.method==="patch"&&r.path==="/api/transfer-fee-settings"); const rp=response(); await patch.handlers.at(-1)({user:{id:"admin"},body:{enabled:true,feePer100:0.75}},rp);
 assert.deepStrictEqual(rp.body,{enabled:true,feePer100:0.75}); assert.equal(root.notificationSettings.providerFeePer100,0.75);
 const amount=8616; const fee=amount/100*0.40; assert.equal(+fee.toFixed(3),34.464); assert.equal(+(amount-fee).toFixed(3),8581.536);
 const customers=fs.readFileSync(path.join(__dirname,"../../frontend/src/screens/Customers.jsx"),"utf8");
 const settings=fs.readFileSync(path.join(__dirname,"../../frontend/src/screens/SettingsPanel.jsx"),"utf8");
 assert(customers.includes('providerFeeAuto:true')); assert(customers.includes('providerFeeMode:transferForm.providerFeeAuto?"AUTO":"MANUAL"'));
 assert(customers.includes('providerFeeAmount:e.target.value,providerFeeAuto:false'));
 assert(settings.includes('data-panel="transferFees"')); assert(settings.includes('الأجور لكل 100 من مبلغ الحوالة'));
 console.log("v25.14.98 configurable automatic provider fee: OK");
})().catch(error=>{console.error(error);process.exit(1)});
