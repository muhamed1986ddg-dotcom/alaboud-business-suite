"use strict";

const assert=require("assert/strict");
const fs=require("fs");
const os=require("os");
const path=require("path");

const root=path.resolve(__dirname,"../..");
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),"alaboud-v251473-"));
process.env.DATA_DIR=dataDir;
process.env.NODE_ENV="test";

const store=require("./store");
const {createSession,revokeSession,revokeUserSessions,revokeBiometricForUser}=require("./session-registry");

async function main(){
  await store.initStore();
  const companyId="company-v251473";
  const otherCompanyId="other-company";
  const branchId="branch-main";

  await store.mutateDurable(rootStore=>{
    rootStore.companies.push({id:companyId,name:"Company",active:true});
    rootStore.companies.push({id:otherCompanyId,name:"Other",active:true});
    rootStore.branches.push({id:branchId,companyId,name:"Main",active:true,isMain:true});
    rootStore.users.push({id:"existing-user",companyId,name:"Existing",active:true});
    rootStore.users.push({id:"other-user",companyId:otherCompanyId,name:"Other",active:true});
    createSession(rootStore,{userId:"existing-user",companyId,jti:"session-one",expiresAt:new Date(Date.now()+60_000).toISOString()});
    rootStore.devices.push({id:"device-one",userId:"existing-user",companyId,active:true,biometricActive:true,biometricJti:"bio-one"});
  });

  let logoutResult=false;
  let revokedOtherSessions=0;
  let revokedBiometrics=0;
  await store.runWithTenant(companyId,branchId,async()=>{
    await store.mutateDurable(scoped=>{
      scoped.users.push({id:"created-user",name:"Created",active:true});
      scoped.branches.push({id:"created-branch",name:"Created branch",active:true});
      assert.equal(scoped.users.some(user=>user.id==="other-user"),false,"tenant view must not expose another company user");
      assert.equal(scoped.sessions.length,1,"company session must be visible from every branch");
      logoutResult=revokeSession(scoped,"session-one","existing-user");
      revokedOtherSessions=revokeUserSessions(scoped,"existing-user","existing-user",null);
      revokedBiometrics=revokeBiometricForUser(scoped,"existing-user");
    });
  });

  const saved=store.readRootStore();
  assert.equal(saved.users.some(user=>user.id==="created-user"&&user.companyId===companyId),true,"created user must persist in root store");
  assert.equal(saved.branches.some(branch=>branch.id==="created-branch"&&branch.companyId===companyId),true,"created branch must persist in root store");
  assert.equal(logoutResult,true,"logout must find and revoke the company-scoped session");
  assert.equal(revokedOtherSessions,0,"already revoked session must not be counted twice");
  assert.equal(saved.sessions.find(session=>session.jti==="session-one")?.active,false,"revoked session must remain inactive after durable save");
  assert.equal(revokedBiometrics,1,"password/security revocation must disable biometric access");
  assert.equal(saved.devices.find(device=>device.id==="device-one")?.biometricActive,false,"biometric device must be disabled");

  const android=fs.readFileSync(path.join(root,"app/src/main/java/com/alaboud/businesssuite/MainActivity.kt"),"utf8");
  const server=fs.readFileSync(path.join(root,"backend/src/server.js"),"utf8");
  const partnerNetwork=fs.readFileSync(path.join(root,"backend/src/security/partner-network.js"),"utf8");
  const login=fs.readFileSync(path.join(root,"frontend/src/LoginShell.jsx"),"utf8");
  assert(!android.includes('endsWith("run.app")'),"Android must never trust a run.app suffix");
  assert(android.includes('uri.host.equals(APP_HOST, ignoreCase = true)'),"Android must use exact trusted host matching");
  assert(android.includes('setAcceptThirdPartyCookies(webView, false)'),"Android must reject third-party cookies");
  assert(android.includes("performBiometricLogin(token, deviceId)"),"biometric login must run natively");
  assert(!android.includes("alaboud-biometric-token"),"biometric token must never be dispatched to JavaScript");
  assert(login.includes("alaboud-biometric-login-result"),"frontend must consume only the native login result");
  assert(server.includes("PASSWORD_CHANGE_REQUIRED"),"temporary passwords must be enforced server-side");
  assert(server.includes("INITIAL_ADMIN_PASSWORD قوي ومخصص مطلوب"),"production bootstrap must reject the default admin password");
  assert(server.includes("PUBLIC_REGISTRATION_DISABLED"),"production registration must be fail-closed");
  assert(server.includes("ignoreHTTPSErrors:false"),"browser connectors must validate TLS certificates");
  assert(partnerNetwork.includes("host:safe.address"),"partner HTTP connectors must pin validated DNS addresses");
  assert(server.includes("await assertSafePartnerUrl(nextUrl)"),"partner redirects must be revalidated");
  assert(server.includes("PARTNER_BROWSER_CROSS_HOST"),"browser connector must block cross-host subrequests");
  assert(server.includes("--host-resolver-rules=MAP"),"browser connector must pin its approved host");

  await store.closeStore();
  fs.rmSync(dataDir,{recursive:true,force:true});
  console.log("v25.14.73 security + tenant/session reliability: OK");
}

main().catch(async error=>{
  console.error(error);
  try{await store.closeStore();}catch{}
  fs.rmSync(dataDir,{recursive:true,force:true});
  process.exitCode=1;
});
