const {spawn}=require("child_process");
const http=require("http");
const os=require("os");
const path=require("path");
const fs=require("fs");
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),"alaboud-v8-"));
const child=spawn(process.execPath,[path.join(__dirname,"server.js")],{
  env:{...process.env,PORT:"5108",DATA_DIR:dataDir,JWT_SECRET:"V8_TEST"},
  stdio:["ignore","pipe","pipe"]
});
function req(method,url,body,token){
  return new Promise((resolve,reject)=>{
    const raw=body?JSON.stringify(body):"";
    const r=http.request({hostname:"127.0.0.1",port:5108,path:url,method,headers:{
      "Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})
    }},res=>{let out="";res.on("data",c=>out+=c);res.on("end",()=>{
      let parsed={};try{parsed=out?JSON.parse(out):{}}catch{}
      resolve({status:res.statusCode,body:parsed});
    })});
    r.on("error",reject);if(raw)r.write(raw);r.end();
  });
}
function ok(condition,label,response){if(!condition)throw new Error(label+" "+JSON.stringify(response))}
setTimeout(async()=>{
  try{
    let r=await req("POST","/api/auth/login",{email:"admin@alaboud.local",password:"Admin123!"});
    ok(r.status===200,"login",r);const token=r.body.token;
    r=await req("POST","/api/customers",{name:"عميل v8"},token);ok(r.status===201,"customer",r);const customerId=r.body.id;
    r=await req("POST","/api/transactions",{customerId,amount:1000,costRate:1.35,finalRate:1.38,transferFee:15,transferDate:"2026-07-13"},token);
    ok(r.status===201,"transaction",r);const txId=r.body.id;
    r=await req("POST",`/api/transactions/${txId}/payments`,{amount:300,paymentDate:"2026-07-14",method:"BANK",reference:"R1"},token);
    ok(r.status===201,"payment",r);const paymentId=r.body.id;
    r=await req("PATCH",`/api/payments/${paymentId}`,{amount:350,notes:"updated"},token);ok(r.status===200,"edit payment",r);
    r=await req("PATCH",`/api/transactions/${txId}`,{amount:1100,transferFee:20},token);ok(r.status===200&&r.body.totalCustomerDue===1538,"edit transaction",r);
    r=await req("GET",`/api/customers/${customerId}`,null,token);ok(r.status===200&&r.body.payments.length===1,"customer profile",r);
    r=await req("DELETE",`/api/payments/${paymentId}`,null,token);ok(r.status===200,"delete payment",r);
    r=await req("DELETE",`/api/transactions/${txId}`,null,token);ok(r.status===200,"delete transaction",r);
    r=await req("GET",`/api/customers/${customerId}`,null,token);ok(r.status===200&&r.body.transactions.length===0,"soft delete hidden",r);
    console.log("SELFTEST_V8_OK: add/edit/delete transaction and payment passed");
    child.kill();fs.rmSync(dataDir,{recursive:true,force:true});process.exit(0);
  }catch(e){
    console.error("SELFTEST_V8_FAILED",e);child.kill();fs.rmSync(dataDir,{recursive:true,force:true});process.exit(1);
  }
},1200);
