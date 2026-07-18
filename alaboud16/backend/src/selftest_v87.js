const {spawn}=require("child_process");
const http=require("http");
const os=require("os");
const path=require("path");
const fs=require("fs");
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),"alaboud-v87-"));
const child=spawn(process.execPath,[path.join(__dirname,"server.js")],{
  env:{...process.env,PORT:"5177",DATA_DIR:dataDir,JWT_SECRET:"TEST_V87"},
  stdio:["ignore","pipe","pipe"]
});
function request(method,url,body,token){
  return new Promise((resolve,reject)=>{
    const raw=body?JSON.stringify(body):"";
    const req=http.request({hostname:"127.0.0.1",port:5177,path:url,method,headers:{
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
    r=await request("POST","/api/customers",{name:"عميل وعد دفع",phone:"15195550123"},token);
    assert(r.status===201,"customer",r);const customerId=r.body.id;
    r=await request("POST","/api/transactions",{customerId,amount:900,costRate:1.35,finalRate:1.30,transferFee:0,transferDate:"2026-06-01"},token);
    assert(r.status===201,"transaction",r);
    const today=new Date().toISOString().slice(0,10);
    r=await request("POST","/api/notification-actions",{
      customerId,action:"PROMISE_TO_PAY",notes:"وعد بالدفع",promiseDate:today,expectedAmount:400
    },token);
    assert(r.status===201,"promise",r);
    r=await request("GET","/api/customer-alerts",null,token);
    assert(r.status===200&&r.body.count===1,"alerts",r);
    assert(r.body.expectedToday===400,"expected today",r);
    assert(r.body.largestOverdueBalance===900,"largest balance",r);
    assert(r.body.rows[0].promiseDate===today,"promise date",r);
    const source=fs.readFileSync(path.join(__dirname,"../../frontend/src/App.jsx"),"utf8");
    assert(source.includes("المتوقع تحصيله اليوم"),"top metric missing",{});
    assert(source.includes("تذكير لطيف"),"whatsapp options missing",{});
    assert(source.includes("حفظ وعد الدفع"),"promise action missing",{});
    console.log("SELFTEST_V87_OK: overdue collection center passed");
    child.kill();fs.rmSync(dataDir,{recursive:true,force:true});process.exit(0);
  }catch(e){
    console.error("SELFTEST_V87_FAILED",e);child.kill();fs.rmSync(dataDir,{recursive:true,force:true});process.exit(1);
  }
},1400);
