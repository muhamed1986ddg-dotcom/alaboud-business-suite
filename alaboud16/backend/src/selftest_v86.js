const {spawn}=require("child_process");
const http=require("http");
const os=require("os");
const path=require("path");
const fs=require("fs");

const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),"alaboud-v86-"));
const child=spawn(process.execPath,[path.join(__dirname,"server.js")],{
  env:{...process.env,PORT:"5166",DATA_DIR:dataDir,JWT_SECRET:"TEST_V86"},
  stdio:["ignore","pipe","pipe"]
});

function request(method,url,body,token){
  return new Promise((resolve,reject)=>{
    const raw=body?JSON.stringify(body):"";
    const req=http.request({
      hostname:"127.0.0.1",port:5166,path:url,method,
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

    r=await request("POST","/api/customers",{name:"عميل متأخر",phone:"15195550123"},token);
    assert(r.status===201,"customer",r);
    const customerId=r.body.id;

    r=await request("POST","/api/transactions",{
      customerId,amount:1000,costRate:1.3,finalRate:1.35,transferDate:"2026-06-01"
    },token);
    assert(r.status===201,"transaction",r);

    r=await request("GET","/api/customer-alerts",null,token);
    assert(r.status===200&&r.body.count===1&&r.body.rows[0].id===customerId,"overdue alerts",r);

    const appSource=fs.readFileSync(path.join(__dirname,"../../frontend/src/App.jsx"),"utf8");
    assert(appSource.includes("function OverdueCustomers"),"component missing",{});
    assert(appSource.includes('page==="overdue-customers"'),"route missing",{});
    assert(appSource.includes("العملاء المتأخرون"),"menu label missing",{});

    console.log("SELFTEST_V86_OK: overdue customers page passed");
    child.kill();
    fs.rmSync(dataDir,{recursive:true,force:true});
    process.exit(0);
  }catch(error){
    console.error("SELFTEST_V86_FAILED",error);
    child.kill();
    fs.rmSync(dataDir,{recursive:true,force:true});
    process.exit(1);
  }
},1400);
