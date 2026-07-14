const {spawn}=require("child_process");
const http=require("http");
const os=require("os");
const path=require("path");
const fs=require("fs");
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),"alaboud-v85-"));
const child=spawn(process.execPath,[path.join(__dirname,"server.js")],{
  env:{...process.env,PORT:"5155",DATA_DIR:dataDir,JWT_SECRET:"TEST_V85"},
  stdio:["ignore","pipe","pipe"]
});
function request(method,url,body,token){
  return new Promise((resolve,reject)=>{
    const raw=body?JSON.stringify(body):"";
    const req=http.request({hostname:"127.0.0.1",port:5155,path:url,method,headers:{
      "Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})
    }},res=>{let out="";res.on("data",c=>out+=c);res.on("end",()=>{
      let parsed={};try{parsed=out?JSON.parse(out):{}}catch{}
      resolve({status:res.statusCode,body:parsed});
    })});
    req.on("error",reject);if(raw)req.write(raw);req.end();
  });
}
function assert(v,label,r){if(!v)throw new Error(label+" "+JSON.stringify(r))}
setTimeout(async()=>{
  try{
    let r=await request("POST","/api/auth/login",{email:"admin@alaboud.local",password:"Admin123!"});
    assert(r.status===200,"login",r);const token=r.body.token;
    r=await request("PATCH","/api/notification-settings",{overdueDays:5,lowCashLimit:10000},token);
    assert(r.status===200&&r.body.overdueDays===5,"settings",r);
    r=await request("POST","/api/customers",{name:"عميل متأخر",phone:"15195550123"},token);
    assert(r.status===201,"customer",r);const customerId=r.body.id;
    r=await request("POST","/api/transactions",{customerId,amount:500,costRate:1.3,finalRate:1.35,transferDate:"2026-07-01"},token);
    assert(r.status===201,"transaction",r);
    r=await request("GET","/api/notifications",null,token);
    assert(r.status===200&&r.body.overdueCount===1&&r.body.notifications.length>=1,"notifications",r);
    console.log("SELFTEST_V85_OK: notification center and settings passed");
    child.kill();fs.rmSync(dataDir,{recursive:true,force:true});process.exit(0);
  }catch(e){
    console.error("SELFTEST_V85_FAILED",e);child.kill();fs.rmSync(dataDir,{recursive:true,force:true});process.exit(1);
  }
},1400);
