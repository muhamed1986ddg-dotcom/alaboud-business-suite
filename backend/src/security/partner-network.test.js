"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const {isPrivateIp,assertSafePartnerUrl,pinnedPartnerFetch}=require("./partner-network");

(async()=>{
  for(const address of ["127.0.0.1","10.2.3.4","169.254.169.254","172.20.0.1","192.168.1.2","::1","fd00::1"]){
    assert.equal(isPrivateIp(address),true,`${address} must be private`);
  }
  assert.equal(isPrivateIp("8.8.8.8"),false);
  await assert.rejects(()=>assertSafePartnerUrl("http://localhost/admin",{production:false}),/PARTNER_PRIVATE_HOST/);
  await assert.rejects(()=>assertSafePartnerUrl("http://169.254.169.254/latest/meta-data",{production:false}),/PARTNER_PRIVATE_IP/);
  await assert.rejects(()=>assertSafePartnerUrl("http://partner.example",{production:true,lookup:async()=>[{address:"93.184.216.34"}]}),/PARTNER_HTTPS_REQUIRED/);
  await assert.rejects(()=>assertSafePartnerUrl("https://user:pass@example.com"),/PARTNER_URL_CREDENTIALS/);
  await assert.rejects(()=>assertSafePartnerUrl("file:///etc/passwd"),/PARTNER_URL_PROTOCOL/);
  await assert.rejects(()=>assertSafePartnerUrl("https://rebind.example",{lookup:async()=>[{address:"93.184.216.34"},{address:"127.0.0.1"}]}),/PARTNER_PRIVATE_IP/);
  const safe=await assertSafePartnerUrl("https://partner.example/report?q=1",{lookup:async()=>[{address:"93.184.216.34"}]});
  assert.equal(safe.address,"93.184.216.34");
  assert.equal(safe.path,"/report?q=1");
  await assert.rejects(()=>pinnedPartnerFetch("http://127.0.0.1/",{networkOptions:{production:false}}),/PARTNER_PRIVATE_IP/);
  const source=fs.readFileSync(path.join(__dirname,"partner-network.js"),"utf8");
  assert(source.includes("host:safe.address"),"request must connect to the DNS-validated address");
  assert(source.includes("rejectUnauthorized:true"),"TLS verification must remain enabled");
  console.log("partner network SSRF and DNS pinning: OK");
})().catch(error=>{console.error(error);process.exit(1);});
