const { spawn } = require("child_process");
const http = require("http");
const os = require("os");
const path = require("path");
const fs = require("fs");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "alaboud-v7-"));
const child = spawn(process.execPath,[path.join(__dirname,"server.js")],{
  env:{...process.env,PORT:"5099",DATA_DIR:dataDir,JWT_SECRET:"QA_SECRET"},
  stdio:["ignore","pipe","pipe"]
});

function request(method,route,body,token){
  return new Promise((resolve,reject)=>{
    const data=body?JSON.stringify(body):"";
    const req=http.request({
      hostname:"127.0.0.1",port:5099,path:route,method,
      headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})}
    },res=>{
      let output="";
      res.on("data",chunk=>output+=chunk);
      res.on("end",()=>{
        let parsed={};
        try{parsed=output?JSON.parse(output):{};}catch{parsed={raw:output};}
        resolve({status:res.statusCode,body:parsed});
      });
    });
    req.on("error",reject);
    if(data)req.write(data);
    req.end();
  });
}

function assert(condition,label,response){
  if(!condition)throw new Error(`${label}: ${JSON.stringify(response)}`);
}

setTimeout(async()=>{
  try{
    let r=await request("GET","/api/health");
    assert(r.status===200&&r.body.version==="18.4.0","health",r);

    r=await request("POST","/api/auth/login",{email:"admin@alaboud.local",password:"Admin123!"});
    assert(r.status===200&&r.body.token,"login",r);
    const token=r.body.token;

    r=await request("POST","/api/customers",{name:"عميل اختبار",phone:"15195550123"},token);
    assert(r.status===201&&r.body.id,"customer",r);
    const customerId=r.body.id;

    r=await request("POST","/api/transactions",{customerId,amount:1000,costRate:1.35,finalRate:1.38,transferFee:15,transferDate:"2026-07-13"},token);
    assert(r.status===201&&r.body.id,"transaction",r);
    const transactionId=r.body.id;

    r=await request("GET",`/api/transactions/${transactionId}/invoice`,null,token);
    assert(r.status===200,"invoice",r);

    r=await request("GET",`/api/customers/${customerId}/statement`,null,token);
    assert(r.status===200,"customer statement",r);

    r=await request("POST","/api/partners",{
      name:"شركة اختبار",contactName:"مسؤول",phone:"15195550000",whatsapp:"15195550000"
    },token);
    assert(r.status===201&&r.body.id,"partner",r);
    const partnerId=r.body.id;

    r=await request("POST",`/api/partners/${partnerId}/transactions`,{
      type:"RECEIVABLE",amount:500,currency:"CAD",date:"2026-07-13"
    },token);
    assert(r.status===201,"partner receivable",r);

    r=await request("POST",`/api/partners/${partnerId}/transactions`,{
      type:"PAYABLE",amount:200,currency:"CAD",date:"2026-07-13"
    },token);
    assert(r.status===201,"partner payable",r);

    r=await request("POST",`/api/partners/${partnerId}/payments`,{
      direction:"RECEIVED",amount:100,currency:"CAD",date:"2026-07-14"
    },token);
    assert(r.status===201,"partner payment",r);

    r=await request("GET",`/api/partners/${partnerId}`,null,token);
    assert(r.status===200&&r.body.totals.receivable===400&&r.body.totals.payable===200,"partner profile",r);

    r=await request("GET",`/api/partners/${partnerId}/statement`,null,token);
    assert(r.status===200&&r.body.rows.length===3,"partner statement",r);

    r=await request("GET","/api/partners",null,token);
    assert(r.status===200&&r.body.rows.length===1,"partners list",r);

    r=await request("GET","/api/dashboard",null,token);
    assert(r.status===200,"dashboard",r);

    console.log("SELFTEST_OK: v7 critical flows passed");
    child.kill();
    fs.rmSync(dataDir,{recursive:true,force:true});
    process.exit(0);
  }catch(error){
    console.error("SELFTEST_FAILED",error);
    child.kill();
    fs.rmSync(dataDir,{recursive:true,force:true});
    process.exit(1);
  }
},1200);
