const {spawn}=require("child_process");
const http=require("http");
const os=require("os");
const path=require("path");
const fs=require("fs");
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),"alaboud-v82-"));
const child=spawn(process.execPath,[path.join(__dirname,"server.js")],{
  env:{...process.env,PORT:"5122",DATA_DIR:dataDir,JWT_SECRET:"TEST_V82"},
  stdio:["ignore","pipe","pipe"]
});
function request(method,url,body,token){
  return new Promise((resolve,reject)=>{
    const raw=body?JSON.stringify(body):"";
    const req=http.request({hostname:"127.0.0.1",port:5122,path:url,method,headers:{
      "Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})
    }},res=>{let output="";res.on("data",chunk=>output+=chunk);res.on("end",()=>{
      let parsed={};try{parsed=output?JSON.parse(output):{}}catch{}
      resolve({status:res.statusCode,body:parsed});
    })});
    req.on("error",reject);if(raw)req.write(raw);req.end();
  });
}
function assert(value,label,response){if(!value)throw new Error(label+" "+JSON.stringify(response))}
setTimeout(async()=>{
  try{
    let r=await request("POST","/api/auth/login",{email:"admin@alaboud.local",password:"Admin123!"});
    assert(r.status===200,"login",r);const token=r.body.token;
    r=await request("POST","/api/customers",{name:"عميل متأخر",phone:"15195550123"},token);
    assert(r.status===201,"customer",r);const customerId=r.body.id;
    r=await request("POST","/api/capital",{type:"IN",amount:1000,description:"Initial"},token);
    assert(r.status===201,"capital",r);
    r=await request("POST","/api/transactions",{
      customerId,amount:500,costRate:1.4,finalRate:1.35,transferFee:10,transferDate:"2026-07-01"
    },token);
    assert(r.status===201,"transaction",r);
    r=await request("GET","/api/customer-alerts",null,token);
    assert(r.status===200&&r.body.count===1&&r.body.rows[0].overdue===true,"alerts",r);
    r=await request("GET","/api/capital-overview?month=2026-07",null,token);
    assert(r.status===200&&r.body.monthlyTransferValue===500&&r.body.turnoverRate===0.5,"capital overview",r);
    r=await request("GET","/",null,null);
    assert(r.status===200,"root frontend",r);
    console.log("SELFTEST_V82_OK: customers, overdue alerts, capital turnover passed");
    child.kill();fs.rmSync(dataDir,{recursive:true,force:true});process.exit(0);
  }catch(error){
    console.error("SELFTEST_V82_FAILED",error);
    child.kill();fs.rmSync(dataDir,{recursive:true,force:true});process.exit(1);
  }
},1400);
