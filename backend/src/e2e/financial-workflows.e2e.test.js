"use strict";
const {spawn}=require("child_process");
const http=require("http");
const os=require("os");
const path=require("path");
const fs=require("fs");
const assert=require("assert/strict");
const crypto=require("crypto");

const port=5199;
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),"alaboud-e2e-"));
const child=spawn(process.execPath,[path.join(__dirname,"../server.js")],{env:{...process.env,PORT:String(port),DATA_DIR:dataDir,JWT_SECRET:"E2E_SECRET",NODE_ENV:"test"},stdio:["ignore","pipe","pipe"]});
function request(method,route,body,token){return new Promise((resolve,reject)=>{const data=body?JSON.stringify(body):"";const req=http.request({hostname:"127.0.0.1",port,path:route,method,headers:{"Content-Type":"application/json","X-Installation-ID":"e2e-installation",...(!["GET","HEAD","OPTIONS"].includes(method)?{"Idempotency-Key":crypto.randomUUID()}:{}),...(token?{Authorization:`Bearer ${token}`}:{})}},res=>{let out="";res.on("data",c=>out+=c);res.on("end",()=>{let parsed={};try{parsed=out?JSON.parse(out):{}}catch{parsed={raw:out}}resolve({status:res.statusCode,body:parsed})})});req.on("error",reject);if(data)req.write(data);req.end()})}
async function wait(){for(let i=0;i<50;i++){try{const r=await request("GET","/api/health");if([200,503].includes(r.status))return}catch{}await new Promise(r=>setTimeout(r,100))}throw new Error("server did not start")}
(async()=>{try{
 await wait();
 let r=await request("POST","/api/auth/login",{email:"admin@alaboud.local",password:"Admin123!ChangeMe"});assert.equal(r.status,200);const token=r.body.token;
 r=await request("POST","/api/auth/change-password",{currentPassword:"Admin123!ChangeMe",newPassword:"E2eOnly!251473"},token);assert.equal(r.status,200);
 r=await request("POST","/api/customers",{name:"عميل E2E",phone:"15195550999",oldBalance:25},token);assert.equal(r.status,201);const customer=r.body;
 r=await request("GET",`/api/customers?search=${encodeURIComponent("عميل E2E")}&page=1&pageSize=20&sort=balance-desc`,null,token);assert.equal(r.status,200);assert.ok(r.body.items.some(x=>x.id===customer.id),"read-after-write customer missing");
 r=await request("POST","/api/transactions",{customerId:customer.id,currency:"USD",amount:100,costRate:1.3,finalRate:1.4,transferFee:10,feeMethod:"PAID",transferDate:"2026-08-05"},token);assert.equal(r.status,201);const tx=r.body;assert.equal(tx.totalCustomerDue,150);assert.equal(tx.totalProfit,20);assert.equal(tx.beneficiaryReceives,100);
 r=await request("POST",`/api/customers/${customer.id}/payments`,{amount:50,paymentDate:"2026-08-05"},token);assert.equal(r.status,201);
 r=await request("GET","/api/customers/debt-summary",null,token);assert.equal(r.status,200);assert.equal(r.body.totalDebtCad,125);
 r=await request("PATCH",`/api/transactions/${tx.id}`,{finalRate:1.45},token);assert.equal(r.status,200);assert.equal(r.body.transferFee,10);assert.equal(r.body.totalCustomerDue,155);assert.equal(r.body.totalProfit,25);assert.equal(r.body.beneficiaryReceives,100);
 r=await request("POST","/api/general-debts",{type:"RECEIVABLE",partyName:"شركة E2E",amount:300,currency:"CAD"},token);assert.equal(r.status,201);const debt=r.body;
 r=await request("PATCH",`/api/general-debts/${debt.id}`,{amount:350},token);assert.equal(r.status,200);assert.equal(r.body.amount,350);
 r=await request("DELETE",`/api/general-debts/${debt.id}`,null,token);assert.equal(r.status,200);
 r=await request("POST","/api/auth/logout",{},token);assert.equal(r.status,200);
 r=await request("GET","/api/dashboard",null,token);assert.equal(r.status,401,"logged-out session must be rejected");
 console.log("E2E_FINANCIAL_WORKFLOWS_OK");
 }catch(error){console.error(error);process.exitCode=1}finally{child.kill();fs.rmSync(dataDir,{recursive:true,force:true});setTimeout(()=>process.exit(process.exitCode||0),100)}})();
