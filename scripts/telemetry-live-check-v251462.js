"use strict";
const base=(process.env.E2E_BASE_URL||"").replace(/\/$/,"");
const email=process.env.E2E_EMAIL||"";const password=process.env.E2E_PASSWORD||"";
if(!base||!email||!password){console.log("TELEMETRY_LIVE_CHECK_SKIPPED: set E2E_BASE_URL, E2E_EMAIL, E2E_PASSWORD");process.exit(0)}
async function json(url,opts={}){const r=await fetch(url,opts);let b={};try{b=await r.json()}catch{};return {r,b}}
(async()=>{
 const before=(await json(`${base}/api/health`)).b.telemetry||{};
 const login=await json(`${base}/api/auth/login`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password})});
 if(login.r.status!==200)throw new Error(`login failed: ${login.r.status} ${JSON.stringify(login.b)}`);
 if(login.b.twoFactorRequired)throw new Error("2FA account: run browser E2E with E2E_OTP instead of this non-interactive live check");
 const token=login.b.token; if(!token)throw new Error("login did not return a bearer token");
 const headers={Authorization:`Bearer ${token}`};
 const probe=await json(`${base}/api/users`,{headers}); if(!probe.r.ok)throw new Error(`authenticated probe failed: ${probe.r.status}`);
 await new Promise(r=>setTimeout(r,Number(process.env.TELEMETRY_VERIFY_WAIT_MS||12000)));
 const after=(await json(`${base}/api/health`)).b.telemetry||{};
 console.log(JSON.stringify({before,after},null,2));
 if(Number(after.telemetryDropped||0)>Number(before.telemetryDropped||0))throw new Error("telemetryDropped increased during live check");
 if(after.lastFlushError)throw new Error(`lastFlushError=${after.lastFlushError}`);
 if(Number(after.telemetryFlushed||0)<=Number(before.telemetryFlushed||0))throw new Error("no telemetry flush was observed; verify integration logging eligibility and PostgreSQL rows");
 console.log("v25.14.62 telemetry live enqueue→flush: OK");
})().catch(e=>{console.error(e);process.exit(1)});
