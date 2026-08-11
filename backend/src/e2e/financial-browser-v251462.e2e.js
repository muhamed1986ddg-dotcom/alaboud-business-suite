"use strict";
const assert=require("assert/strict");
const baseUrl=(process.env.E2E_BASE_URL||"").replace(/\/$/,"");
const email=process.env.E2E_EMAIL||"";
const password=process.env.E2E_PASSWORD||"";
const otp=process.env.E2E_OTP||"";
const allowMutations=process.env.E2E_ALLOW_MUTATIONS==="1";
if(!baseUrl||!email||!password){
  console.log("v25.14.62 browser E2E: SKIPPED (set E2E_BASE_URL, E2E_EMAIL, E2E_PASSWORD)");
  process.exit(0);
}
const {chromium}=require("playwright");

(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({locale:"ar"});
  const stamp=Date.now();
  try{
    await page.goto(baseUrl,{waitUntil:"domcontentloaded",timeout:45000});
    await page.getByPlaceholder("البريد الإلكتروني").fill(email);
    await page.getByPlaceholder("كلمة المرور").fill(password);
    await page.getByRole("button",{name:"تسجيل الدخول",exact:true}).click();
    const twoFactor=page.getByRole("heading",{name:"التحقق بخطوتين"});
    if(await twoFactor.isVisible({timeout:2500}).catch(()=>false)){
      assert.ok(/^\d{6}$/.test(otp),"E2E_OTP is required for a 2FA account");
      await page.getByPlaceholder("000000").fill(otp);
      await page.getByRole("button",{name:"تحقق ودخول"}).click();
    }
    await page.waitForFunction(()=>!document.body.innerText.includes("تسجيل الدخول")||document.body.innerText.includes("لوحة"),null,{timeout:30000});
    assert.ok(!await page.getByRole("heading",{name:"تسجيل الدخول"}).isVisible().catch(()=>false),"browser remained on login screen");
    console.log("v25.14.62 browser login/navigation: OK");

    if(!allowMutations){
      console.log("v25.14.62 financial browser mutations: SKIPPED (set E2E_ALLOW_MUTATIONS=1 on an isolated test company)");
      return;
    }

    // Destructive financial E2E is intentionally opt-in. It uses the live UI for login,
    // then the authenticated browser request context for deterministic create/edit/delete.
    const request=page.request;
    const customerName=`E2E Browser ${stamp}`;
    let r=await request.post(`${baseUrl}/api/customers`,{data:{name:customerName,phone:"15195550000",oldBalance:25}});
    assert.equal(r.status(),201); const customer=await r.json();
    r=await request.post(`${baseUrl}/api/transactions`,{data:{customerId:customer.id,currency:"USD",amount:100,costRate:1.3,finalRate:1.4,transferFee:10,transferDate:new Date().toISOString().slice(0,10)}});
    assert.equal(r.status(),201); const tx=await r.json();
    r=await request.patch(`${baseUrl}/api/transactions/${tx.id}`,{data:{transferFee:20}});assert.equal(r.status(),200);
    r=await request.post(`${baseUrl}/api/customers/${customer.id}/payments`,{data:{amount:50,paymentDate:new Date().toISOString().slice(0,10)}});assert.equal(r.status(),201);
    r=await request.get(`${baseUrl}/api/customers?search=${encodeURIComponent(customerName)}&page=1&pageSize=20`);assert.equal(r.status(),200);
    const customers=await r.json();assert.ok(customers.items?.some(x=>x.id===customer.id));
    // Cleanup is deliberately limited to resources with supported delete endpoints.
    r=await request.delete(`${baseUrl}/api/transactions/${tx.id}`);assert.ok([200,204].includes(r.status()));
    console.log("v25.14.62 authenticated browser financial flow: OK");
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
