const {spawn}=require("child_process");
const http=require("http");
const os=require("os");
const path=require("path");
const fs=require("fs");

const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),"alaboud-v83-"));
const child=spawn(process.execPath,[path.join(__dirname,"server.js")],{
  env:{...process.env,PORT:"5133",DATA_DIR:dataDir,JWT_SECRET:"TEST_V83"},
  stdio:["ignore","pipe","pipe"]
});

function request(method,url,body,token){
  return new Promise((resolve,reject)=>{
    const raw=body?JSON.stringify(body):"";
    const req=http.request({
      hostname:"127.0.0.1",port:5133,path:url,method,
      headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})}
    },res=>{
      let output="";
      res.on("data",chunk=>output+=chunk);
      res.on("end",()=>{
        let parsed={};
        try{parsed=output?JSON.parse(output):{}}catch{}
        resolve({status:res.statusCode,body:parsed});
      });
    });
    req.on("error",reject);
    if(raw)req.write(raw);
    req.end();
  });
}

function assert(value,label,response){
  if(!value)throw new Error(label+" "+JSON.stringify(response));
}

setTimeout(async()=>{
  try{
    let r=await request("POST","/api/auth/login",{email:"admin@alaboud.local",password:"Admin123!"});
    assert(r.status===200,"login",r);
    const token=r.body.token;

    r=await request("POST","/api/customers",{name:"عميل تقرير"},token);
    assert(r.status===201,"customer",r);
    const customerId=r.body.id;

    r=await request("POST","/api/capital",{type:"IN",amount:2000,date:"2026-07-01",description:"capital"},token);
    assert(r.status===201,"capital",r);

    r=await request("POST","/api/transactions",{
      customerId,amount:1000,costRate:1.4,finalRate:1.35,transferFee:20,transferDate:"2026-07-05"
    },token);
    assert(r.status===201,"transaction1",r);

    r=await request("POST","/api/transactions",{
      customerId,amount:500,costRate:1.4,finalRate:1.36,transferFee:10,transferDate:"2026-07-10"
    },token);
    assert(r.status===201,"transaction2",r);

    r=await request("POST","/api/expenses",{title:"مصروف",amount:50,date:"2026-07-15"},token);
    assert(r.status===201,"expense",r);

    r=await request("GET","/api/capital-overview?month=2026-07",null,token);
    assert(r.status===200&&r.body.monthlyTransferValue===1500,"capital overview",r);

    r=await request("GET","/api/monthly-report?month=2026-07",null,token);
    assert(r.status===200&&r.body.summary.transferTotal===1500&&r.body.summary.transferCount===2,"monthly report",r);

    console.log("SELFTEST_V83_OK: capital turnover and monthly reports passed");
    child.kill();
    fs.rmSync(dataDir,{recursive:true,force:true});
    process.exit(0);
  }catch(error){
    console.error("SELFTEST_V83_FAILED",error);
    child.kill();
    fs.rmSync(dataDir,{recursive:true,force:true});
    process.exit(1);
  }
},1400);
