const {spawn}=require("child_process");
const http=require("http");
const os=require("os");
const path=require("path");
const fs=require("fs");

const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),"alaboud-v84-"));
const child=spawn(process.execPath,[path.join(__dirname,"server.js")],{
  env:{...process.env,PORT:"5144",DATA_DIR:dataDir,JWT_SECRET:"TEST_V84"},
  stdio:["ignore","pipe","pipe"]
});

function request(method,url,body,token){
  return new Promise((resolve,reject)=>{
    const raw=body?JSON.stringify(body):"";
    const req=http.request({
      hostname:"127.0.0.1",port:5144,path:url,method,
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

    r=await request("POST","/api/customers",{name:"عميل كشف",phone:"15195550123"},token);
    assert(r.status===201,"customer",r);
    const customerId=r.body.id;

    r=await request("POST","/api/transactions",{
      customerId,
      amount:1000,
      costRate:1.36,
      finalRate:1.39,
      transferFee:0,
      transferDate:"2026-07-01"
    },token);
    assert(r.status===201,"transaction",r);
    const txId=r.body.id;

    r=await request("POST",`/api/transactions/${txId}/payments`,{
      amount:800,
      paymentDate:"2026-07-02",
      method:"CASH"
    },token);
    assert(r.status===201,"payment",r);

    r=await request("GET",`/api/customers/${customerId}/statement`,null,token);
    assert(r.status===200,"statement",r);
    assert(r.body.totals.usdAmount===1000,"usd total",r);
    assert(r.body.totals.costCad===1360,"cost cad",r);
    assert(r.body.totals.totalCad===1000,"final cad",r);
    assert(r.body.totals.paid===800,"paid",r);
    assert(r.body.totals.remaining===200,"remaining",r);
    assert(!("grossProfit" in r.body.totals),"profit hidden",r);

    console.log("SELFTEST_V84_OK: customer statement fields and privacy passed");
    child.kill();
    fs.rmSync(dataDir,{recursive:true,force:true});
    process.exit(0);
  }catch(error){
    console.error("SELFTEST_V84_FAILED",error);
    child.kill();
    fs.rmSync(dataDir,{recursive:true,force:true});
    process.exit(1);
  }
},1400);
