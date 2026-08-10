const express = require("express");
const { isTransientDatabaseError, isRecoverableOperationalError } = require("./database/operational-error");
const helmet = require("helmet");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { hashPassword, verifyPassword, isScryptHash, passwordPolicy, encryptJson, decryptJson, sha256 } = require("./security");
const path = require("path");
const fs = require("fs");
const dns = require("dns").promises;
const net = require("net");
const http = require("http");
const https = require("https");
const { readStore, readRootStore, mutate, mutateDurable, id, now, runWithTenant, initStore, databaseHealth, closeStore, getDatabaseQuery } = require("./store");
const NativeRepositoryRegistry = require("./repositories/NativeRepositoryRegistry");
const FinancialEngine = require("./finance/FinancialEngine");
const { customerBalanceTotals } = FinancialEngine;
const { transactionFinancials } = require("./finance/TransactionFinancials");
const { calculateReceivableSummary } = require("./finance/ReceivableSummary");
const { calculateInventoryPayables, calculateInventoryMonthProfit } = require("./finance/MonthlyInventoryFinancials");
const { assertBalancedEntry, markSoftDeleted } = require("./finance/FinancialIntegrity");
const { registerHealthRoutes } = require("./routes/health");
const { createIdempotencyMiddleware, requireIdempotencyKey } = require("./reliability/idempotency");
const { permissionsFor, requirePermission, requiredPermissionForRequest, hasPermission } = require("./access-control");
const { createSession, validateSession, revokeSession, revokeUserSessions } = require("./session-registry");
const { normalizeChannel, normalizeEmail, normalizePhone: normalizeVerificationPhone, maskEmail, maskPhone, codeHash, safeEqualHex: safeEqualVerificationHex } = require("./account-verification");
const { generateApiKey, keyPrefix, normalizeScopes, apiKeyMiddleware, versionAliasMiddleware, integrationLogger, openApiDocument, docsHtml, safeEqualHex } = require("./api-platform");
const { createBranch, resolveBranch, branchSummary } = require("./branch-manager");
const {
  APP_VERSION,
  createBackupEnvelope,
  verifyBackupEnvelope,
  productionReadiness
} = require("./production-readiness");

const PORT = Number(process.env.PORT || 5000);
const IS_PROD = process.env.NODE_ENV === "production";
const JWT_SECRET = process.env.JWT_SECRET || "LOCAL_TRIAL_CHANGE_ME_6_0";
if (IS_PROD && JWT_SECRET === "LOCAL_TRIAL_CHANGE_ME_6_0") { throw new Error("JWT_SECRET قوي ومخصص مطلوب في الإنتاج"); }

const SESSION_COOKIE_NAME = "alaboud_session";
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
function readCookie(req,name){
  const raw=String(req.headers?.cookie||"");
  for(const part of raw.split(";")){
    const index=part.indexOf("=");
    if(index<0)continue;
    const key=part.slice(0,index).trim();
    if(key!==name)continue;
    try{return decodeURIComponent(part.slice(index+1).trim());}catch{return part.slice(index+1).trim();}
  }
  return "";
}
function sessionCookieOptions(){
  return {
    httpOnly:true,
    secure:IS_PROD,
    sameSite:"lax",
    path:"/",
    maxAge:SESSION_MAX_AGE_MS
  };
}
function setSessionCookie(res,token){
  res.cookie(SESSION_COOKIE_NAME,token,sessionCookieOptions());
  res.setHeader("X-Auth-Transport","cookie");
}
function clearSessionCookie(res){
  res.clearCookie(SESSION_COOKIE_NAME,{httpOnly:true,secure:IS_PROD,sameSite:"lax",path:"/"});
}
function clientSupportsCookieOnlySession(req){
  const raw=String(req.get("X-Alaboud-Client-Version")||"").trim();
  const match=raw.match(/^(\d+)\.(\d+)\.(\d+)/);
  if(!match)return false;
  const current=[Number(match[1]),Number(match[2]),Number(match[3])];
  const minimum=[25,14,50];
  for(let i=0;i<3;i++){if(current[i]>minimum[i])return true;if(current[i]<minimum[i])return false;}
  return true;
}
function sessionResponseBody(req,session){
  // v25.14.50+ web/Android frontend authenticates exclusively with the
  // HttpOnly cookie, so the JWT never enters JavaScript memory. Older clients
  // and API/self-test callers still receive the token during the transition.
  if(clientSupportsCookieOnlySession(req))return {user:session.user,authTransport:"cookie"};
  return session;
}
function requestOriginMatchesHost(req){
  const origin=String(req.get("origin")||"").trim();
  if(!origin)return false;
  try{
    const parsed=new URL(origin);
    return String(parsed.host||"").toLowerCase()===String(req.get("host")||"").toLowerCase();
  }catch{return false;}
}
function cookieWriteRequestAllowed(req){
  if(["GET","HEAD","OPTIONS"].includes(String(req.method||"").toUpperCase()))return true;
  // Same-origin browser requests include Origin. The installation header is a
  // second safe path for Android WebView/same-origin XHR; a cross-site HTML
  // form cannot add this custom header without a CORS preflight.
  return requestOriginMatchesHost(req)||Boolean(String(req.get("X-Installation-ID")||"").trim());
}

// إرسال بريد إلكتروني اختياري (يُستخدم في "نسيت كلمة المرور").
// إن لم يتم ضبط SMTP_HOST أو لم تكن مكتبة nodemailer مثبّتة، تُطبع الرسالة في
// السجلات بدلاً من الإرسال الفعلي (وضع تطوير) بدل تعطيل الميزة بالكامل.
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
let mailTransport = null;
if (process.env.SMTP_HOST) {
  try {
    const nodemailer = require("nodemailer");
    mailTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || "false") === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  } catch (error) {
    console.warn("SMTP_HOST مضبوط لكن حزمة nodemailer غير مثبتة. شغّل: npm install nodemailer --prefix backend");
  }
}

function isPrivateIp(address){
  const value=String(address||"").toLowerCase();
  if(!value)return true;
  if(net.isIP(value)===4){
    const p=value.split(".").map(Number);
    return p[0]===10||p[0]===127||p[0]===0||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168)||(p[0]===100&&p[1]>=64&&p[1]<=127)||(p[0]>=224);
  }
  if(net.isIP(value)===6)return value==="::1"||value==="::"||value.startsWith("fc")||value.startsWith("fd")||value.startsWith("fe8")||value.startsWith("fe9")||value.startsWith("fea")||value.startsWith("feb")||value.startsWith("::ffff:127.")||value.startsWith("::ffff:10.")||value.startsWith("::ffff:192.168.");
  return true;
}
async function assertSafeWebhookUrl(rawUrl){
  const parsed=new URL(String(rawUrl||"").trim());
  if(!["https:",...(!IS_PROD?["http:"]:[])].includes(parsed.protocol))throw new Error("WEBHOOK_PROTOCOL");
  if(parsed.username||parsed.password)throw new Error("WEBHOOK_CREDENTIALS");
  const host=String(parsed.hostname||"").toLowerCase();
  if(!host||host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||host.endsWith(".internal"))throw new Error("WEBHOOK_PRIVATE_HOST");
  const addresses=net.isIP(host)?[{address:host}]:await dns.lookup(host,{all:true,verbatim:true});
  if(!addresses.length||addresses.some(item=>isPrivateIp(item.address)))throw new Error("WEBHOOK_PRIVATE_IP");
  return {url:parsed.toString(),protocol:parsed.protocol,hostname:host,address:addresses[0].address,path:`${parsed.pathname}${parsed.search}`};
}


async function assertSafePartnerUrl(rawUrl){
  const safe=await assertSafeWebhookUrl(rawUrl);
  if(IS_PROD&&safe.protocol!=="https:")throw Object.assign(new Error("يجب استخدام HTTPS لروابط الشركات الخارجية في بيئة الإنتاج"),{code:"PARTNER_HTTPS_REQUIRED"});
  return safe;
}

// Sends a webhook request while pinning the TCP connection to the IP address
// that was already validated by assertSafeWebhookUrl, instead of letting a
// generic HTTP client re-resolve DNS for the same hostname. Without this, an
// attacker who controls the webhook's DNS record could pass validation while
// it resolves to a public IP, then flip the record (low TTL) to an internal
// address — e.g. a cloud metadata endpoint — before the request actually goes
// out. Redirects are never followed, since a redirect target is not re-validated.
function safeFetchWebhook(rawUrl,{method="POST",headers={},body,timeoutMs=10000}={}){
  return assertSafeWebhookUrl(rawUrl).then(safe=>new Promise((resolve,reject)=>{
    const transport=safe.protocol==="https:"?https:http;
    const req=transport.request({
      host:safe.address,
      servername:safe.protocol==="https:"?safe.hostname:undefined,
      port:safe.protocol==="https:"?443:80,
      path:safe.path||"/",
      method,
      headers:{...headers,Host:safe.hostname},
      timeout:timeoutMs,
    },res=>{
      // Drain and discard the body; callers here only need status/ok.
      res.resume();
      resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode});
    });
    req.on("timeout",()=>req.destroy(new Error("WEBHOOK_TIMEOUT")));
    req.on("error",reject);
    if(body!==undefined)req.write(body);
    req.end();
  }));
}

async function sendEmail(to, subject, text) {
  if (mailTransport) {
    try {
      await mailTransport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text });
      return true;
    } catch (error) {
      console.error("فشل إرسال البريد الإلكتروني:", error.message);
      return false;
    }
  }
  console.log(`[DEV EMAIL] To: ${to} | Subject: ${subject}\n${text}`);
  return false;
}
async function sendRaselSms({to,body}){
  const apiKey=String(process.env.RASEL_API_KEY||"").trim();
  if(!apiKey)return {ok:false,reason:"RASEL_NOT_CONFIGURED"};
  const phoneNumber=String(to||"").trim();
  const message=String(body||"").trim();
  if(!phoneNumber||!message)return {ok:false,reason:"RASEL_INVALID_PAYLOAD"};
  const response=await fetch("https://raselsms.com/api/v2/messages/send",{
    method:"POST",
    headers:{"X-API-Key":apiKey,"Content-Type":"application/json","Accept":"application/json"},
    body:JSON.stringify({to:phoneNumber,channel:"local_sms",messageType:"free_text",content:{text:message}}),
    signal:AbortSignal.timeout(10000)
  });
  if(response.ok)return {ok:true,provider:"rasel"};
  let detail="";try{const payload=await response.json();detail=payload?.message||payload?.error||JSON.stringify(payload).slice(0,300)}catch{}
  console.error("Rasel SMS failed:",response.status,detail);
  return {ok:false,reason:"RASEL_SEND_FAILED",status:response.status};
}

async function sendTwilioMessage({channel,to,body}){
  const accountSid=String(process.env.TWILIO_ACCOUNT_SID||"").trim();
  const authToken=String(process.env.TWILIO_AUTH_TOKEN||"").trim();
  const smsFrom=String(process.env.TWILIO_SMS_FROM||"").trim();
  const whatsappFrom=String(process.env.TWILIO_WHATSAPP_FROM||"").trim();
  if(!accountSid||!authToken)return {ok:false,reason:"TWILIO_NOT_CONFIGURED"};
  const from=channel==="WHATSAPP"?whatsappFrom:smsFrom;
  if(!from)return {ok:false,reason:channel==="WHATSAPP"?"WHATSAPP_SENDER_NOT_CONFIGURED":"SMS_SENDER_NOT_CONFIGURED"};
  const payload=new URLSearchParams();
  payload.set("From",channel==="WHATSAPP"?(from.startsWith("whatsapp:")?from:`whatsapp:${from}`):from);
  payload.set("To",channel==="WHATSAPP"?(to.startsWith("whatsapp:")?to:`whatsapp:${to}`):to);
  payload.set("Body",body);
  const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,{
    method:"POST",
    headers:{"Authorization":`Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,"Content-Type":"application/x-www-form-urlencoded"},
    body:payload.toString(),
    signal:AbortSignal.timeout(10000)
  });
  if(response.ok)return {ok:true};
  let detail="";try{detail=(await response.json())?.message||""}catch{}
  console.error(`Twilio ${channel} failed:`,response.status,detail);
  return {ok:false,reason:"TWILIO_SEND_FAILED",status:response.status};
}
const app = express();
let serviceReady = false;
let serviceStartupError = null;
let startupAttempt = 0;
// التقاط تلقائي لأي خطأ (متزامن أو غير متزامن) يحدث داخل أي مسار API لم يكن
// يحتوي على try/catch صريح. بدون هذا، أي استثناء داخل مسار async كان يتحول
// إلى "unhandled rejection" وبما أن السيرفر مهيأ لإيقاف نفسه عند أي رفض غير
// متوقع (انظر process.on("unhandledRejection")) فإن خطأ بسيط في مسار واحد
// كان قادرًا على إسقاط الخدمة بالكامل لكل المستخدمين. هذا التعديل يضمن أن كل
// خطأ يُمرَّر بأمان إلى معالج الأخطاء العام بدل أن يسقط العملية.
for (const method of ["get","post","patch","put","delete"]) {
  const original = app[method].bind(app);
  app[method] = (path, ...handlers) => original(path, ...handlers.map(handler => {
    if (typeof handler !== "function" || handler.length > 3) return handler;
    return (req, res, next) => {
      try {
        const result = handler(req, res, next);
        if (result && typeof result.catch === "function") result.catch(next);
      } catch (error) {
        next(error);
      }
    };
  }));
}
let nativeRepositories = new NativeRepositoryRegistry();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use((req,res,next)=>{ req.requestId=crypto.randomUUID(); res.setHeader("X-Request-ID",req.requestId); next(); });
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc:["'self'"], scriptSrc:["'self'"], styleSrc:["'self'","'unsafe-inline'"], imgSrc:["'self'","data:","blob:"], connectSrc:["'self'","https:"], objectSrc:["'none'"], baseUri:["'self'"], frameAncestors:["'none'"] } }, crossOriginEmbedderPolicy:false, hsts: IS_PROD ? {maxAge:31536000,includeSubDomains:true,preload:true}:false }));
app.use(express.json({ limit: "2mb", strict:true }));
app.use(express.urlencoded({extended:false,limit:"256kb"}));
function idempotencyTenantScope(req){
  const bearer=String(req.headers.authorization||"").startsWith("Bearer ")?String(req.headers.authorization).slice(7):"";
  const cookie=readCookie(req,SESSION_COOKIE_NAME);
  const token=bearer||cookie;
  let decoded=null;
  try{decoded=token?jwt.decode(token):null;}catch{}
  const companyId=String(decoded?.companyId||"").trim();
  const userId=String(decoded?.id||"").trim();
  let branchId="";
  if(companyId&&userId){
    try{
      const root=readRootStore();
      const user=(root.users||[]).find(item=>item.id===userId&&item.companyId===companyId&&item.active!==false);
      const branch=user?resolveBranch(root,{companyId,requestedBranchId:req.headers["x-branch-id"],user}):null;
      branchId=String(branch?.id||"").trim();
    }catch{}
  }
  const fingerprint=sha256(`${token||"no-token"}|${req.get("X-Installation-ID")||""}`).slice(0,24);
  return {scopeKey:companyId&&branchId?`${companyId}:${branchId}`:"",fallbackScope:fingerprint};
}
app.use("/api", createIdempotencyMiddleware({
  ttlMs: Number(process.env.IDEMPOTENCY_TTL_MS || 5 * 60 * 1000),
  maxEntries: Number(process.env.IDEMPOTENCY_MAX_ENTRIES || 5000),
  getQuery: getDatabaseQuery,
  getScope: idempotencyTenantScope
}));
// Start the HTTP listener even when PostgreSQL private DNS is temporarily
// unavailable. API writes/reads stay gated with 503 until initialization
// succeeds, allowing Render to keep the deployment alive and the service to
// recover automatically without an exit/redeploy loop.
app.use((req,res,next)=>{
  if(serviceReady || !String(req.path||"").startsWith("/api/") ||
     ["/api/health","/api/openapi.json","/api/docs"].includes(req.path)) return next();
  return res.status(503).json({
    message:"الخدمة تعيد الاتصال بقاعدة البيانات حاليًا. يرجى المحاولة بعد لحظات.",
    code:"SERVICE_STARTING_DATABASE_RETRY",
    retryable:true,
    startupAttempt
  });
});
app.use(versionAliasMiddleware);
app.use(apiKeyMiddleware({readStore,mutate,now}));
app.use(integrationLogger({mutate,now,id}));
const requestBuckets=new Map();
const requestBucketCleanup=setInterval(()=>{const t=Date.now();for(const [key,bucket] of requestBuckets){if(!bucket||t>bucket.reset)requestBuckets.delete(key)}},10*60*1000);
requestBucketCleanup.unref?.();
function rateLimit(name,limit,windowMs){return (req,res,next)=>{const key=`${name}:${req.ip}`;const t=Date.now();let b=requestBuckets.get(key);if(!b||t>b.reset){b={count:0,reset:t+windowMs};requestBuckets.set(key,b)}b.count++;res.setHeader("RateLimit-Limit",limit);res.setHeader("RateLimit-Remaining",Math.max(0,limit-b.count));if(b.count>limit)return res.status(429).json({message:"طلبات كثيرة جدًا، حاول لاحقًا"});next()}}
app.use("/api",rateLimit("api",600,15*60*1000));

app.use("/api",(_req,res,next)=>{
  res.setHeader("Cache-Control","no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma","no-cache");
  res.setHeader("Expires","0");
  res.setHeader("Surrogate-Control","no-store");
  next();
});

async function seedAdmin(){
  await mutateDurable((store)=>{
    let company=store.companies.find(item=>item.slug==="alaboud-primary");
    if(!company){
      company={id:id(),name:"شركة العبود التجارية",slug:"alaboud-primary",phone:"",active:true,createdAt:now()};
      store.companies.push(company);
    }
    let mainBranch=(store.branches||[]).find(item=>item.companyId===company.id&&item.isMain&&item.active!==false);
    if(!mainBranch){
      mainBranch={id:id(),companyId:company.id,name:"الفرع الرئيسي",code:"MAIN",address:"",phone:"",currency:"CAD",isMain:true,active:true,createdAt:now()};
      store.branches.push(mainBranch);
    }

    let admin=store.users.find(user=>user.email==="admin@alaboud.local");
    if(!admin){
      admin={id:id(),companyId:company.id,name:"System Administrator",email:"admin@alaboud.local",passwordHash:hashPassword(process.env.INITIAL_ADMIN_PASSWORD||"Admin123!ChangeMe"),role:"ADMIN",active:true,mustChangePassword:true,createdAt:now()};
      store.users.push(admin);
    }else if(!admin.companyId){
      admin.companyId=company.id;
    }

    const tenantArrays=["customers","transactions","payments","expenses","capitalMovements","exchangeRates","generalDebts","generalDebtPayments","partners","partnerTransactions","partnerPayments","partnerSyncLogs","notificationActions","auditLogs","devices","sessions","monthlyInventories"];
    for(const key of tenantArrays){
      for(const item of store[key]||[]){
        if(item&&!item.companyId)item.companyId=company.id;
        if(item&&item.companyId===company.id&&!item.branchId)item.branchId=mainBranch.id;
      }
    }
    if(!store.companySettings[company.id]){
      store.companySettings[company.id]={...(store.notificationSettings||{}),overdueDays:store.notificationSettings?.overdueDays||7,lowCashLimit:store.notificationSettings?.lowCashLimit||5000,whatsappTemplate:store.notificationSettings?.whatsappTemplate||""};
    }
  });
}

function auth(req,res,next){
  if(req.apiKeyUser){
    req.user=req.apiKeyUser;
    const requiredPermission=requiredPermissionForRequest(req.method,req.path);
    if(requiredPermission&&!hasPermission(req.user,requiredPermission)){
      return res.status(403).json({message:"ليس لديك صلاحية لتنفيذ هذه العملية",permission:requiredPermission});
    }
    const branch=resolveBranch(readRootStore(),{companyId:req.user.companyId,requestedBranchId:req.headers["x-branch-id"],user:req.user});
    if(!branch)return res.status(403).json({message:"لا يوجد فرع متاح"});
    req.branch=branch;req.user.branchId=branch.id;req.user.branchName=branch.name;
    return runWithTenant(req.user.companyId,branch.id,()=>next());
  }
  const h=req.headers.authorization||"";
  const bearerToken=h.startsWith("Bearer ")?h.slice(7):"";
  const cookieToken=readCookie(req,SESSION_COOKIE_NAME);
  const token=bearerToken||cookieToken;
  const authTransport=bearerToken?"bearer":cookieToken?"cookie":"none";
  if(authTransport==="cookie"&&!cookieWriteRequestAllowed(req)){
    return res.status(403).json({message:"تم رفض طلب غير موثوق به",code:"CSRF_ORIGIN_REJECTED"});
  }
  try{
    req.user=jwt.verify(token,JWT_SECRET,{issuer:"alaboud-business-suite",audience:"alaboud-client",algorithms:["HS256"]});
    if(!req.user.companyId)return res.status(401).json({message:"Company account required"});
    const store=readStore();
    const user=store.users.find(item=>item.id===req.user.id&&item.active!==false);
    if(!user)return res.status(401).json({message:"تم تعطيل الحساب أو حذفه"});
    const sessionStatus=validateSession(store,{jti:req.user.jti,userId:req.user.id,companyId:req.user.companyId});
    if(!sessionStatus.ok)return res.status(401).json({message:sessionStatus.reason==="IDLE_TIMEOUT"?"انتهت الجلسة بسبب عدم النشاط":"انتهت صلاحية الجلسة"});
    req.user.role=user.role; req.user.permissions=permissionsFor(user.role,user.permissions);
    const requiredPermission=requiredPermissionForRequest(req.method,req.path);
    if(requiredPermission&&!hasPermission(req.user,requiredPermission)){
      return res.status(403).json({message:"ليس لديك صلاحية لتنفيذ هذه العملية",permission:requiredPermission});
    }
    const branch=resolveBranch(readRootStore(),{companyId:req.user.companyId,requestedBranchId:req.headers["x-branch-id"],user});
    if(!branch)return res.status(403).json({message:"لا يوجد فرع متاح لهذا المستخدم"});
    req.branch=branch;req.user.branchId=branch.id;req.user.branchName=branch.name;
    req.authTransport=authTransport;
    // Seamless migration for already-signed-in web clients: the first valid
    // Bearer request also receives the HttpOnly cookie, then the frontend can
    // safely erase the JWT from localStorage without forcing a logout.
    if(authTransport==="bearer"&&!cookieToken)setSessionCookie(res,token);
    runWithTenant(req.user.companyId,branch.id,()=>next());
  }catch{
    res.status(401).json({message:"Authentication required"});
  }
}

app.get("/api/operations/:key/status", auth, async (req,res)=>{
  const operationKey=String(req.params.key||"").trim();
  if(!operationKey||operationKey.length>200)return res.status(400).json({message:"معرّف العملية غير صالح"});
  const query=getDatabaseQuery();
  if(!query){res.set("Retry-After","2");return res.status(503).json({code:"DATABASE_TEMPORARILY_UNAVAILABLE",retryable:true,message:"قاعدة البيانات غير جاهزة للتحقق الآن."});}
  try{
    const result=await query(
      `SELECT operation_key,method,path,company_id,branch_id,status,response_body,app_revision,committed_at
         FROM operation_receipts
        WHERE scope_key=$1 AND operation_key=$2
        LIMIT 1`,
      [`${req.user.companyId}:${req.user.branchId||"*"}`,operationKey],
      { operation:"operation-status",attempts:1,queryTimeoutMs:1200,recoveryBudgetMs:1200 }
    );
    const receipt=result.rows?.[0];
    if(!receipt)return res.json({operationKey,status:"UNKNOWN",committed:false});
    if(receipt.company_id&&String(receipt.company_id)!==String(req.user.companyId))return res.status(404).json({operationKey,status:"UNKNOWN",committed:false});
    return res.json({
      operationKey,
      status:receipt.status,
      committed:receipt.status==="COMMITTED",
      method:receipt.method,
      path:receipt.path,
      appRevision:Number(receipt.app_revision||0),
      committedAt:receipt.committed_at,
      response:receipt.response_body??null
    });
  }catch(error){
    if(isTransientDatabaseError(error)||String(error?.code||"").startsWith("08")||String(error?.code||"")==="57P03"){
      res.set("Retry-After","2"); return res.status(503).json({code:"DATABASE_TEMPORARILY_UNAVAILABLE",retryable:true,message:"قاعدة البيانات غير جاهزة للتحقق الآن."});
    }
    throw error;
  }
});

function normalizePhone(value="") {
  let digits=String(value||"").replace(/\D/g,"");
  if(!digits)return "";
  if(digits.length===10)digits=`1${digits}`;
  if(digits.length===11&&digits.startsWith("1"))return digits;
  return digits.replace(/^00/,"");
}

function audit(store, userId, action, entityType, entityId, details = {}) {
  const logs=store.auditLogs||[]; const previous=logs.length?logs[logs.length-1].integrityHash||"":"GENESIS";
  const user=(store.users||[]).find(item=>item.id===userId)||{};
  const safeDetails={...(details||{})};
  if(safeDetails.password)delete safeDetails.password;
  if(safeDetails.passwordEncrypted)delete safeDetails.passwordEncrypted;
  if(safeDetails.twoFactorSecret)delete safeDetails.twoFactorSecret;
  if(safeDetails.authenticatorCode)delete safeDetails.authenticatorCode;
  const entry={
    id:id(), userId, userName:user.name||user.email||userId, action, entityType, entityId,
    details:safeDetails, ip:safeDetails.ip||null, branchId:safeDetails.branchId||null,
    branchName:safeDetails.branchName||null, createdAt:now(), previousHash:previous
  };
  entry.integrityHash=sha256(JSON.stringify(entry)); logs.push(entry);
}

function recordPartnerSyncLog(store, partner, payload={}) {
  if(!Array.isArray(store.partnerSyncLogs))store.partnerSyncLogs=[];
  const entry={
    id:id(),
    partnerId:partner.id,
    partnerName:partner.name,
    connector:resolvePartnerConnector(partner),
    status:payload.status||"SUCCESS",
    trigger:payload.trigger||"MANUAL",
    durationMs:Math.max(0,Number(payload.durationMs)||0),
    beforeBalance:safeNumber(payload.beforeBalance),
    afterBalance:safeNumber(payload.afterBalance),
    changed:Boolean(payload.changed),
    importedCount:Math.max(0,Number(payload.importedCount)||0),
    message:String(payload.message||""),
    createdAt:now()
  };
  store.partnerSyncLogs.push(entry);
  if(store.partnerSyncLogs.length>500)store.partnerSyncLogs.splice(0,store.partnerSyncLogs.length-500);
  return entry;
}



function base32Encode(buffer){
  const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits="",out="";
  for(const byte of buffer) bits+=byte.toString(2).padStart(8,"0");
  for(let i=0;i<bits.length;i+=5){const chunk=bits.slice(i,i+5).padEnd(5,"0");out+=alphabet[parseInt(chunk,2)];}
  return out;
}
function base32Decode(value){
  const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits="";
  for(const ch of String(value||"").replace(/=+$/g,"").toUpperCase()){const i=alphabet.indexOf(ch);if(i>=0)bits+=i.toString(2).padStart(5,"0");}
  const bytes=[]; for(let i=0;i+8<=bits.length;i+=8)bytes.push(parseInt(bits.slice(i,i+8),2)); return Buffer.from(bytes);
}
function totp(secret,time=Date.now(),step=30){
  const counter=Math.floor(time/1000/step); const msg=Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(counter));
  const digest=crypto.createHmac("sha1",base32Decode(secret)).update(msg).digest(); const off=digest[digest.length-1]&15;
  const code=((digest.readUInt32BE(off)&0x7fffffff)%1000000).toString().padStart(6,"0"); return code;
}
function totpStep(time=Date.now(),step=30){return Math.floor(time/1000/step);}
// Returns the matching 30s step counter on success, or null on failure. Passing
// lastUsedStep (the previously-accepted step for this secret) rejects a code
// that has already been consumed once, closing the short TOTP replay window.
function verifyTotp(secret,code,lastUsedStep=null){
  const clean=String(code||"").replace(/\D/g,"");
  if(clean.length!==6)return null;
  // Accept a small clock drift (±60 seconds) between the phone and the server.
  for(let w=-2;w<=2;w++){
    const time=Date.now()+w*30000;
    if(totp(secret,time)===clean){
      const step=totpStep(time);
      if(lastUsedStep!==null&&lastUsedStep!==undefined&&step<=lastUsedStep)return null;
      return step;
    }
  }
  return null;
}
function issueSession(user,company,context={}){
  const jti=crypto.randomUUID();
  const expiresAt=new Date(Date.now()+30*24*60*60*1000).toISOString();
  const token=jwt.sign({id:user.id,name:user.name,role:user.role,companyId:user.companyId,jti},JWT_SECRET,{expiresIn:"30d",issuer:"alaboud-business-suite",audience:"alaboud-client"});
  mutate(store=>createSession(store,{userId:user.id,companyId:user.companyId,jti,ip:context.ip,userAgent:context.userAgent,expiresAt}));
  return {token,user:{id:user.id,name:user.name,email:user.email,role:user.role,permissions:permissionsFor(user.role,user.permissions),companyId:user.companyId,companyName:company.name,mustChangePassword:Boolean(user.mustChangePassword),twoFactorEnabled:Boolean(user.twoFactorEnabled)}};
}


const nativeInteractiveReadsEnabled = String(process.env.NATIVE_INTERACTIVE_READS || "false").toLowerCase() === "true";
function branchSafeRead(req,key,nativeRead,fallbackRead){
  // app_state + the in-memory tenant view are the authoritative interactive
  // state on the single-instance deployment. Reading the relational mirror for
  // every screen added a PostgreSQL round-trip after each add/edit/delete and
  // made the UI wait for a mirror that is intentionally asynchronous. Prefer
  // the already-committed in-memory state for interactive reads. Native reads
  // remain opt-in for installations that explicitly need them.
  if(req?.branch?.id || !nativeInteractiveReadsEnabled)return Promise.resolve(fallbackRead());
  return nativeRepositories.withFallback(key,nativeRead,fallbackRead);
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function legacyPaymentGroupKey(payment) {
  const timestamp = String(payment.date || payment.createdAt || payment.paymentDate || "").slice(0, 19);
  return [
    payment.customerId || "",
    payment.paymentDate || "",
    payment.receivedBy || "",
    payment.method || "",
    payment.reference || "",
    payment.notes || "",
    timestamp,
  ].join("|");
}

function groupCustomerPaymentRecords(payments, customerId) {
  const rows = (Array.isArray(payments) ? payments : [])
    .filter((payment) => payment && !payment.isDeleted && payment.customerId === customerId);

  const receipts = rows.filter((payment) => payment.recordType === "CUSTOMER_PAYMENT_RECEIPT");
  const receiptBatchIds = new Set(receipts.map((payment) => payment.paymentBatchId).filter(Boolean));
  const result = receipts.map((receipt) => ({
    ...receipt,
    amount: +safeNumber(receipt.originalAmount, receipt.amount).toFixed(2),
    allocations: Array.isArray(receipt.allocations) ? receipt.allocations : [],
    isGroupedPayment: true,
  }));

  const legacyGroups = new Map();
  for (const payment of rows) {
    if (payment.recordType === "CUSTOMER_PAYMENT_RECEIPT") continue;
    if (payment.recordType === "PAYMENT_ALLOCATION" && payment.paymentBatchId && receiptBatchIds.has(payment.paymentBatchId)) continue;

    const key = payment.paymentBatchId || (
      payment.allocationMode === "CUSTOMER_AUTO" ? legacyPaymentGroupKey(payment) : `single:${payment.id}`
    );
    if (!legacyGroups.has(key)) {
      legacyGroups.set(key, {
        ...payment,
        id: payment.id,
        paymentBatchId: payment.paymentBatchId || null,
        amount: 0,
        allocationIds: [],
        allocations: [],
        isGroupedPayment: payment.allocationMode === "CUSTOMER_AUTO" || Boolean(payment.paymentBatchId),
      });
    }
    const group = legacyGroups.get(key);
    group.amount += safeNumber(payment.originalAmount, payment.amount);
    group.allocationIds.push(payment.id);
    if (payment.transactionId) {
      group.allocations.push({transactionId: payment.transactionId, amount: +safeNumber(payment.amount).toFixed(2)});
    }
  }

  for (const group of legacyGroups.values()) {
    group.amount = +group.amount.toFixed(2);
    result.push(group);
  }

  return result.sort((a,b)=>String(b.paymentDate||b.date||b.createdAt||"").localeCompare(String(a.paymentDate||a.date||a.createdAt||"")));
}

// ترقيم صفحات اختياري ومتوافق مع القديم: إن لم يُرسل الطالب ?page أو ?pageSize
// تُعاد المصفوفة كما هي (بدون كسر الواجهات الحالية). أي طلب يحدد page/pageSize
// يحصل على كائن {items,total,page,pageSize,totalPages}.
function paginate(req, rows) {
  const query=req?.query||{};
  const hasPaging = query.page !== undefined || query.pageSize !== undefined;
  const legacyLimit = Math.min(200, Math.max(0, parseInt(query.limit,10)||0));
  // Backward-compatible lightweight list requests: ?limit=50 returns an array,
  // while page/pageSize returns metadata for screens that support pagination.
  if (!hasPaging) return legacyLimit ? rows.slice(0,legacyLimit) : rows;
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(query.pageSize, 10) || legacyLimit || 25));
  const total = rows.length;
  const start = (page - 1) * pageSize;
  return {
    items: rows.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

function requestedWindow(req,total){
  const query=req?.query||{};
  const hasPaging=query.page!==undefined||query.pageSize!==undefined;
  const limit=Math.min(200,Math.max(0,parseInt(query.limit,10)||0));
  if(!hasPaging)return {start:0,end:limit||total,hasPaging:false,page:1,pageSize:limit||total,total};
  const page=Math.max(1,parseInt(query.page,10)||1);
  const pageSize=Math.min(200,Math.max(1,parseInt(query.pageSize,10)||limit||25));
  const start=(page-1)*pageSize;
  return {start,end:start+pageSize,hasPaging:true,page,pageSize,total};
}
function windowResponse(window,items){
  if(!window.hasPaging)return items;
  return {items,total:window.total,page:window.page,pageSize:window.pageSize,totalPages:Math.max(1,Math.ceil(window.total/window.pageSize))};
}

function rateTimestamp(rate = {}) {
  return String(rate.effectiveAt || rate.sourceDate || rate.updatedAt || rate.createdAt || "");
}

function isAutomaticExchangeRate(rate = {}) {
  const source = String(rate.source || rate.rateSource || "").trim().toUpperCase();
  return Boolean(source) && !["MANUAL", "USER", "CUSTOM", "LOCAL"].includes(source);
}

function latestExchangeGraph(store, { automaticOnly = true } = {}) {
  const allRates = Array.isArray(store.exchangeRates) ? store.exchangeRates : [];
  const candidates = automaticOnly ? allRates.filter(isAutomaticExchangeRate) : allRates;
  const latest = new Map();
  for (const rate of candidates.slice().sort((a,b)=>rateTimestamp(b).localeCompare(rateTimestamp(a)))) {
    const base=String(rate.baseCurrency||"").toUpperCase();
    const quote=String(rate.quoteCurrency||"").toUpperCase();
    if(!base||!quote||base===quote)continue;
    const key=`${base}_${quote}`;
    if(!latest.has(key))latest.set(key,rate);
  }
  const graph=new Map();
  const add=(from,to,factor,updatedAt,source)=>{
    if(!Number.isFinite(factor)||factor<=0)return;
    if(!graph.has(from))graph.set(from,[]);
    graph.get(from).push({to,factor,updatedAt,source});
  };
  for(const rate of latest.values()){
    const base=String(rate.baseCurrency||"").toUpperCase();
    const quote=String(rate.quoteCurrency||"").toUpperCase();
    const sell=Number(rate.sellRate);
    const buy=Number(rate.buyRate);
    const factor=Number.isFinite(sell)&&sell>0?sell:(Number.isFinite(buy)&&buy>0?buy:0);
    const updatedAt=rateTimestamp(rate)||null;
    const source=rate.source||rate.rateSource||null;
    if(factor>0){add(base,quote,factor,updatedAt,source);add(quote,base,1/factor,updatedAt,source);}
  }
  return graph;
}

function currencyConversion(store, fromCurrency, toCurrency="CAD", options = {}) {
  const from=String(fromCurrency||"CAD").toUpperCase();
  const to=String(toCurrency||"CAD").toUpperCase();
  if(from===to)return {factor:1,path:[from],updatedAt:null,source:"IDENTITY",automatic:true};
  const automaticOnly=options.automaticOnly!==false;
  const graph=latestExchangeGraph(store,{automaticOnly});
  const queue=[{currency:from,factor:1,path:[from],updatedAt:null,sources:[]}];
  const seen=new Set([from]);
  while(queue.length){
    const current=queue.shift();
    for(const edge of (graph.get(current.currency)||[])){
      if(seen.has(edge.to))continue;
      const next={currency:edge.to,factor:current.factor*edge.factor,path:[...current.path,edge.to],updatedAt:edge.updatedAt||current.updatedAt,sources:[...current.sources,edge.source].filter(Boolean)};
      if(edge.to===to)return {...next,source:next.sources.join(" → ")||null,automatic:automaticOnly};
      seen.add(edge.to);queue.push(next);
    }
  }
  return null;
}

function capitalCadAmount(store,item){
  const saved=Number(item?.cadAmount);
  if(Number.isFinite(saved))return saved;
  const currency=String(item?.currency||"CAD").toUpperCase();
  if(currency==="CAD")return safeNumber(item?.amount);
  const conversion=currencyConversion(store,currency,"CAD");
  return conversion?safeNumber(item?.amount)*conversion.factor:0;
}

function recordTime(value, fallback = "") {
  const text = String(value || fallback || "").trim();
  if (!text) return 0;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00` : text;
  const parsed = new Date(normalized).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function isAfterCustomerReset(record, customer, preferredDateKey = "") {
  const resetTime = recordTime(customer?.accountResetAt);
  if (!resetTime) return true;
  const activityTime = Math.max(
    preferredDateKey ? recordTime(record?.[preferredDateKey]) : 0,
    recordTime(record?.createdAt),
    recordTime(record?.updatedAt),
    recordTime(record?.date)
  );
  return activityTime >= resetTime;
}

function customerSummary(store, customer) {
  return FinancialEngine.customerSummary(store, customer, {
    overdueDays: Math.max(1, safeNumber(store.notificationSettings?.overdueDays, 7))
  });
}

registerHealthRoutes(app,{
  databaseHealth,productionReadiness,nativeRepositories,now,
  version:APP_VERSION,openApiDocument,docsHtml,
  getServiceState:()=>({serviceReady,startupAttempt,startupError:serviceStartupError?.message||null})
});

app.get("/api/developer/api-keys", auth, (req,res)=>{
  if(req.user.role!=="ADMIN")return res.status(403).json({message:"هذه الصفحة للمسؤول فقط"});
  const rows=(readStore().apiKeys||[]).map(item=>({id:item.id,name:item.name,prefix:item.prefix,scopes:item.scopes,active:item.active!==false,expiresAt:item.expiresAt||null,lastUsedAt:item.lastUsedAt||null,usageCount:item.usageCount||0,createdAt:item.createdAt}));
  res.json(rows.sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||""))));
});
app.post("/api/developer/api-keys", auth, async (req,res)=>{
  if(req.user.role!=="ADMIN")return res.status(403).json({message:"هذه الصفحة للمسؤول فقط"});
  const name=String(req.body?.name||"").trim(); if(!name)return res.status(400).json({message:"اسم المفتاح مطلوب"});
  const rawKey=generateApiKey();
  const record={id:id(),name,prefix:keyPrefix(rawKey),keyHash:sha256(rawKey),scopes:normalizeScopes(req.body?.scopes),active:true,expiresAt:req.body?.expiresAt||null,createdBy:req.user.id,createdAt:now()};
  await mutateDurable(store=>{store.apiKeys.push(record);audit(store,req.user.id,"CREATE","API_KEY",record.id,{name:record.name,scopes:record.scopes});});
  res.status(201).json({id:record.id,name:record.name,prefix:record.prefix,scopes:record.scopes,expiresAt:record.expiresAt,apiKey:rawKey,message:"احفظ المفتاح الآن؛ لن يظهر كاملًا مرة أخرى"});
});
app.post("/api/developer/api-keys/:id/revoke", auth, async (req,res)=>{
  if(req.user.role!=="ADMIN")return res.status(403).json({message:"هذه الصفحة للمسؤول فقط"});
  let found=false;await mutateDurable(store=>{const item=store.apiKeys.find(x=>x.id===req.params.id);if(item){item.active=false;item.revokedAt=now();item.revokedBy=req.user.id;found=true;audit(store,req.user.id,"REVOKE","API_KEY",item.id,{name:item.name});}});
  if(!found)return res.status(404).json({message:"المفتاح غير موجود"});res.json({message:"تم إلغاء المفتاح"});
});

app.get("/api/developer/webhooks", auth, (req,res)=>{
  if(req.user.role!=="ADMIN")return res.status(403).json({message:"هذه الصفحة للمسؤول فقط"});
  res.json((readStore().webhooks||[]).map(({secretHash,...item})=>item));
});
app.post("/api/developer/webhooks", auth, async (req,res)=>{
  if(req.user.role!=="ADMIN")return res.status(403).json({message:"هذه الصفحة للمسؤول فقط"});
  let url=String(req.body?.url||"").trim();const name=String(req.body?.name||"").trim();
  try{({url}=await assertSafeWebhookUrl(url));}catch{return res.status(400).json({message:"رابط Webhook غير صالح أو يشير إلى شبكة داخلية"});}
  const secret=crypto.randomBytes(24).toString("base64url");const item={id:id(),name:name||"Webhook",url,events:normalizeScopes(req.body?.events||["transaction.created"]),secretHash:sha256(secret),active:true,createdBy:req.user.id,createdAt:now()};
  await mutateDurable(store=>{store.webhooks.push(item);audit(store,req.user.id,"CREATE","WEBHOOK",item.id,{url:item.url,events:item.events});});
  res.status(201).json({...item,secretHash:undefined,secret,message:"احفظ السر الآن؛ لن يظهر مرة أخرى"});
});
app.post("/api/developer/webhooks/:id/test", auth, async (req,res)=>{
  if(req.user.role!=="ADMIN")return res.status(403).json({message:"هذه الصفحة للمسؤول فقط"});
  const item=(readStore().webhooks||[]).find(x=>x.id===req.params.id&&x.active!==false);if(!item)return res.status(404).json({message:"Webhook غير موجود"});
  const payload={event:"webhook.test",id:crypto.randomUUID(),createdAt:now(),data:{companyId:req.user.companyId}};
  try{
    const response=await safeFetchWebhook(item.url,{method:"POST",headers:{"content-type":"application/json","x-alaboud-event":"webhook.test"},body:JSON.stringify(payload),timeoutMs:10000});
    await mutateDurable(store=>{const w=store.webhooks.find(x=>x.id===item.id);if(w){w.lastTestAt=now();w.lastStatus=response.status;}});
    return res.status(response.ok?200:502).json({ok:response.ok,status:response.status});
  }catch(error){
    const rejected=["WEBHOOK_PROTOCOL","WEBHOOK_CREDENTIALS","WEBHOOK_PRIVATE_HOST","WEBHOOK_PRIVATE_IP"].includes(error.message);
    return res.status(rejected?400:502).json({ok:false,message:rejected?"تم رفض رابط Webhook لأنه يشير إلى شبكة داخلية أو عنوان غير آمن":error.message});
  }
});
app.delete("/api/developer/webhooks/:id", auth, async (req,res)=>{
  if(req.user.role!=="ADMIN")return res.status(403).json({message:"هذه الصفحة للمسؤول فقط"});
  let found=false;await mutateDurable(store=>{const item=store.webhooks.find(x=>x.id===req.params.id);if(item){item.active=false;item.updatedAt=now();found=true;audit(store,req.user.id,"DISABLE","WEBHOOK",item.id,{url:item.url});}});if(!found)return res.status(404).json({message:"Webhook غير موجود"});res.json({message:"تم تعطيل Webhook"});
});
app.get("/api/developer/integration-logs", auth, (req,res)=>{
  if(req.user.role!=="ADMIN")return res.status(403).json({message:"هذه الصفحة للمسؤول فقط"});
  const limit=Math.min(500,Math.max(1,Number(req.query.limit)||100));res.json((readStore().integrationLogs||[]).slice().sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||""))).slice(0,limit));
});

app.post("/api/auth/login", rateLimit("login",10,15*60*1000),async (req,res)=>{
  const email=String(req.body?.email||"").trim().toLowerCase(); const password=String(req.body?.password||"");
  const store=readStore(); const user=store.users.find(u=>String(u.email||"").toLowerCase()===email&&u.active); const current=Date.now();
  if(user?.lockedUntil&&new Date(user.lockedUntil).getTime()>current) return res.status(423).json({message:"الحساب مقفل مؤقتًا بسبب محاولات فاشلة متكررة"});
  const valid=user&&(isScryptHash(user.passwordHash)?verifyPassword(password,user.passwordHash):bcrypt.compareSync(password,user.passwordHash));
  if(!valid){ await mutateDurable(root=>{const u=root.users.find(x=>String(x.email||"").toLowerCase()===email); if(u){u.failedLoginAttempts=(u.failedLoginAttempts||0)+1; if(u.failedLoginAttempts>=5){u.lockedUntil=new Date(Date.now()+15*60*1000).toISOString();u.failedLoginAttempts=0;} audit(root,u.id,"LOGIN_FAILED","AUTH",u.id,{ip:req.ip,requestId:req.requestId});}}); return res.status(401).json({message:"بيانات الدخول غير صحيحة"}); }
  const company=store.companies.find(item=>item.id===user.companyId&&item.active); if(!company)return res.status(403).json({message:"Company account is inactive"});
  if(user.twoFactorEnabled){
    const challengeTtlSeconds=10*60;
    const challenge=jwt.sign({id:user.id,companyId:user.companyId,purpose:"2fa"},JWT_SECRET,{expiresIn:challengeTtlSeconds,issuer:"alaboud-business-suite",audience:"alaboud-2fa"});
    return res.json({twoFactorRequired:true,challenge,challengeExpiresIn:challengeTtlSeconds});
  }
  await mutateDurable(root=>{const u=root.users.find(x=>x.id===user.id);u.failedLoginAttempts=0;u.lockedUntil=null;if(!isScryptHash(u.passwordHash))u.passwordHash=hashPassword(password);u.lastLoginAt=now();audit(root,u.id,"LOGIN_SUCCESS","AUTH",u.id,{ip:req.ip,requestId:req.requestId});});
  const session=issueSession(user,company,{ip:req.ip,userAgent:req.get("user-agent")});
  setSessionCookie(res,session.token);
  res.json(sessionResponseBody(req,session));
});

app.post("/api/auth/2fa/verify",rateLimit("2fa",20,10*60*1000),async (req,res)=>{
  let payload;
  try{
    payload=jwt.verify(String(req.body?.challenge||""),JWT_SECRET,{issuer:"alaboud-business-suite",audience:"alaboud-2fa",algorithms:["HS256"]});
  }catch(error){
    const expired=error?.name==="TokenExpiredError";
    return res.status(401).json({code:expired?"TWO_FACTOR_CHALLENGE_EXPIRED":"TWO_FACTOR_CHALLENGE_INVALID",message:expired?"انتهت مهلة التحقق. اطلب جلسة تحقق جديدة ثم أدخل الرمز الحالي.":"جلسة التحقق غير صالحة. أعد تسجيل الدخول."});
  }
  if(payload.purpose!=="2fa")return res.status(401).json({code:"TWO_FACTOR_CHALLENGE_INVALID",message:"جلسة التحقق غير صالحة. أعد تسجيل الدخول."});
  const store=readStore();
  const user=store.users.find(u=>u.id===payload.id&&u.active);
  const company=store.companies.find(c=>c.id===payload.companyId&&c.active);
  if(!user||!company||!user.twoFactorSecret)return res.status(401).json({code:"TWO_FACTOR_ACCOUNT_UNAVAILABLE",message:"تعذر إكمال التحقق لهذا الحساب."});
  const acceptedStep=verifyTotp(user.twoFactorSecret,req.body?.code,user.twoFactorLastStep);
  if(acceptedStep===null){
    await mutateDurable(root=>{const u=root.users.find(x=>x.id===user.id);if(u)audit(root,u.id,"LOGIN_2FA_FAILED","AUTH",u.id,{ip:req.ip,requestId:req.requestId});});
    return res.status(401).json({code:"TWO_FACTOR_CODE_INVALID",message:"رمز التحقق غير صحيح أو مستخدم من قبل أو انتهت مدته. انتظر الرمز الجديد في Authenticator ثم حاول مرة أخرى."});
  }
  await mutateDurable(root=>{const u=root.users.find(x=>x.id===user.id);u.failedLoginAttempts=0;u.lockedUntil=null;u.lastLoginAt=now();u.twoFactorLastStep=acceptedStep;audit(root,u.id,"LOGIN_2FA_SUCCESS","AUTH",u.id,{ip:req.ip,requestId:req.requestId});});
  const session=issueSession(user,company,{ip:req.ip,userAgent:req.get("user-agent")});
  setSessionCookie(res,session.token);
  return res.json(sessionResponseBody(req,session));
});

app.post("/api/auth/2fa/setup",auth,async (req,res)=>{
  const secret=base32Encode(crypto.randomBytes(20));
  await mutateDurable(store=>{const u=store.users.find(x=>x.id===req.user.id);u.twoFactorPendingSecret=secret;audit(store,u.id,"2FA_SETUP_STARTED","AUTH",u.id);});
  const label=encodeURIComponent(`ALABOUD:${req.user.name||req.user.id}`);
  res.json({secret,otpauth:`otpauth://totp/${label}?secret=${secret}&issuer=ALABOUD%20Business%20Suite&digits=6&period=30`});
});
app.post("/api/auth/2fa/enable",auth,async (req,res)=>{
  let ok=false; await mutateDurable(store=>{const u=store.users.find(x=>x.id===req.user.id);if(!u?.twoFactorPendingSecret)return;const step=verifyTotp(u.twoFactorPendingSecret,req.body?.code);if(step===null)return;u.twoFactorSecret=u.twoFactorPendingSecret;delete u.twoFactorPendingSecret;u.twoFactorEnabled=true;u.twoFactorLastStep=step;ok=true;audit(store,u.id,"2FA_ENABLED","AUTH",u.id);});
  if(!ok)return res.status(400).json({message:"رمز التحقق غير صحيح"});res.json({message:"تم تفعيل التحقق بخطوتين"});
});
app.post("/api/auth/2fa/disable",auth,async (req,res)=>{
  const currentPassword=String(req.body?.currentPassword||"");
  const code=String(req.body?.code||"");
  try{
    await mutateDurable(store=>{
      const u=store.users.find(x=>x.id===req.user.id);
      if(!u)throw new Error("الحساب غير موجود");
      const passwordOk=currentPassword&&(isScryptHash(u.passwordHash)?verifyPassword(currentPassword,u.passwordHash):bcrypt.compareSync(currentPassword,u.passwordHash));
      const codeStep=code&&u.twoFactorSecret?verifyTotp(u.twoFactorSecret,code,u.twoFactorLastStep):null;
      if(!passwordOk&&codeStep===null){
        audit(store,u.id,"2FA_DISABLE_REJECTED","AUTH",u.id,{ip:req.ip,requestId:req.requestId});
        throw new Error("REAUTH_REQUIRED");
      }
      if(codeStep!==null)u.twoFactorLastStep=codeStep;
      u.twoFactorEnabled=false;delete u.twoFactorSecret;delete u.twoFactorPendingSecret;
      audit(store,u.id,"2FA_DISABLED","AUTH",u.id,{ip:req.ip,requestId:req.requestId});
    });
    res.json({message:"تم تعطيل التحقق بخطوتين"});
  }catch(error){
    if(error.message==="REAUTH_REQUIRED")return res.status(401).json({code:"REAUTH_REQUIRED",message:"يلزم إدخال كلمة المرور الحالية أو رمز التحقق الحالي لتعطيل التحقق بخطوتين"});
    res.status(400).json({message:error.message||"تعذر تعطيل التحقق بخطوتين"});
  }
});

app.get("/api/auth/account-verification",auth,(req,res)=>{
  const user=(readStore().users||[]).find(item=>item.id===req.user.id);
  if(!user)return res.status(404).json({message:"الحساب غير موجود"});
  const email=normalizeEmail(user.verificationEmail||user.email);
  const phone=normalizeVerificationPhone(user.verificationPhone||user.phone);
  res.json({
    email,phone,
    emailVerified:Boolean(user.emailVerifiedAt),phoneVerified:Boolean(user.phoneVerifiedAt),
    emailVerifiedAt:user.emailVerifiedAt||null,phoneVerifiedAt:user.phoneVerifiedAt||null,
    preferredChannel:normalizeChannel(user.preferredVerificationChannel)||"EMAIL",
    maskedEmail:maskEmail(email),maskedPhone:maskPhone(phone),
    providers:{email:Boolean(mailTransport),sms:Boolean(process.env.RASEL_API_KEY||process.env.TWILIO_ACCOUNT_SID&&process.env.TWILIO_AUTH_TOKEN&&process.env.TWILIO_SMS_FROM),whatsapp:Boolean(process.env.TWILIO_ACCOUNT_SID&&process.env.TWILIO_AUTH_TOKEN&&process.env.TWILIO_WHATSAPP_FROM)}
  });
});

app.patch("/api/auth/account-verification",auth,async(req,res)=>{
  const email=normalizeEmail(req.body?.email);
  const phone=normalizeVerificationPhone(req.body?.phone);
  const preferredChannel=normalizeChannel(req.body?.preferredChannel)||"EMAIL";
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({message:"البريد الإلكتروني غير صالح"});
  if(phone&&!(phone.startsWith("+")&&/^\+\d{8,17}$/.test(phone)))return res.status(400).json({message:"اكتب رقم الهاتف بصيغة دولية مثل +15195551234"});
  await mutateDurable(store=>{
    const user=store.users.find(item=>item.id===req.user.id);if(!user)throw new Error("الحساب غير موجود");
    const previousEmail=normalizeEmail(user.verificationEmail||user.email),previousPhone=normalizeVerificationPhone(user.verificationPhone||user.phone);
    user.verificationEmail=email;user.verificationPhone=phone;user.preferredVerificationChannel=preferredChannel;
    const emailChanged=email!==previousEmail,phoneChanged=phone!==previousPhone;
    if(emailChanged)user.emailVerifiedAt=null;
    if(phoneChanged)user.phoneVerifiedAt=null;
    const challengeChannel=normalizeChannel(user.accountVerificationChallenge?.channel);
    const challengeTargetChanged=(challengeChannel==="EMAIL"&&emailChanged)||((challengeChannel==="SMS"||challengeChannel==="WHATSAPP")&&phoneChanged);
    if(challengeTargetChanged)delete user.accountVerificationChallenge;
    audit(store,user.id,"UPDATE","ACCOUNT_VERIFICATION_CONTACT",user.id,{preferredChannel,emailChanged,phoneChanged,challengePreserved:Boolean(user.accountVerificationChallenge)});
  });
  res.json({message:"تم حفظ بيانات تأكيد الحساب"});
});

app.post("/api/auth/account-verification/send",auth,rateLimit("account-verification-send",8,15*60*1000),async(req,res)=>{
  const channel=normalizeChannel(req.body?.channel);
  if(!channel)return res.status(400).json({message:"اختر طريقة إرسال رمز التأكيد"});
  const store=readStore();const user=(store.users||[]).find(item=>item.id===req.user.id);
  if(!user)return res.status(404).json({message:"الحساب غير موجود"});
  const email=normalizeEmail(user.verificationEmail||user.email),phone=normalizeVerificationPhone(user.verificationPhone||user.phone);
  const target=channel==="EMAIL"?email:phone;
  if(!target)return res.status(400).json({message:channel==="EMAIL"?"أضف البريد الإلكتروني أولًا":"أضف رقم الهاتف أولًا"});
  if(channel!=="EMAIL"&&!(phone.startsWith("+")&&/^\+\d{8,17}$/.test(phone)))return res.status(400).json({message:"رقم الهاتف يجب أن يكون بالصيغة الدولية مثل +15195551234"});
  const code=String(crypto.randomInt(100000,1000000));
  const challenge={channel,targetHash:sha256(target),codeHash:codeHash({userId:user.id,channel,target,code,secret:JWT_SECRET}),expiresAt:new Date(Date.now()+10*60*1000).toISOString(),attempts:0,createdAt:now()};
  await mutateDurable(root=>{const u=root.users.find(item=>item.id===user.id);u.accountVerificationChallenge=challenge;u.preferredVerificationChannel=channel;audit(root,u.id,"SEND","ACCOUNT_VERIFICATION",u.id,{channel,target:channel==="EMAIL"?maskEmail(target):maskPhone(target)});});
  const body=`رمز تأكيد حساب العبود هو: ${code}\nينتهي الرمز خلال 10 دقائق. لا تشارك هذا الرمز مع أي شخص.`;
  let delivered=false,reason="";
  if(channel==="EMAIL")delivered=await sendEmail(target,"رمز تأكيد حساب العبود",body);
  else {try{const result=channel==="SMS"&&process.env.RASEL_API_KEY?await sendRaselSms({to:target,body}):await sendTwilioMessage({channel,to:target,body});delivered=result.ok;reason=result.reason||"";}catch(error){console.error("verification delivery failed",error.message);reason="DELIVERY_ERROR";}}
  if(!delivered){
    if(!IS_PROD)return res.json({message:"تم إنشاء رمز التأكيد في وضع التطوير",channel,expiresIn:600,devCode:code});
    return res.status(503).json({message:channel==="EMAIL"?"إرسال البريد غير مهيأ على الخادم":channel==="SMS"?"تعذر إرسال SMS. تحقق من إعداد Rasel والمفتاح السري.":"خدمة واتساب غير مهيأة أو تعذر الإرسال. تحقق من إعدادات Twilio.",code:reason||"DELIVERY_NOT_CONFIGURED"});
  }
  res.json({message:`تم إرسال رمز التأكيد عبر ${channel==="EMAIL"?"البريد الإلكتروني":channel==="SMS"?"SMS":"واتساب"}`,channel,expiresIn:600,target:channel==="EMAIL"?maskEmail(target):maskPhone(target)});
});

app.post("/api/auth/account-verification/verify",auth,rateLimit("account-verification-verify",20,15*60*1000),async(req,res)=>{
  const code=String(req.body?.code||"").replace(/\D/g,"").slice(0,6);
  if(code.length!==6)return res.status(400).json({message:"أدخل رمز التأكيد المكون من 6 أرقام"});
  const outcome=await mutateDurable(store=>{
    const user=store.users.find(item=>item.id===req.user.id);
    if(!user)return {ok:false,reason:"ACCOUNT_NOT_FOUND"};
    const challenge=user.accountVerificationChallenge;
    if(!challenge)return {ok:false,reason:"NO_CHALLENGE"};
    if(new Date(challenge.expiresAt).getTime()<Date.now()){delete user.accountVerificationChallenge;return {ok:false,reason:"EXPIRED"};}
    if(Number(challenge.attempts||0)>=5){delete user.accountVerificationChallenge;return {ok:false,reason:"TOO_MANY_ATTEMPTS"};}
    const channel=normalizeChannel(challenge.channel),target=channel==="EMAIL"?normalizeEmail(user.verificationEmail||user.email):normalizeVerificationPhone(user.verificationPhone||user.phone);
    const expected=codeHash({userId:user.id,channel,target,code,secret:JWT_SECRET});
    if(challenge.targetHash!==sha256(target)||!safeEqualVerificationHex(challenge.codeHash,expected)){
      challenge.attempts=Number(challenge.attempts||0)+1;
      audit(store,user.id,"VERIFY_FAILED","ACCOUNT_VERIFICATION",user.id,{channel,attempts:challenge.attempts});
      return {ok:false,reason:"INVALID_CODE"};
    }
    const verifiedAt=now();if(channel==="EMAIL")user.emailVerifiedAt=verifiedAt;else user.phoneVerifiedAt=verifiedAt;
    delete user.accountVerificationChallenge;audit(store,user.id,"VERIFY_SUCCESS","ACCOUNT_VERIFICATION",user.id,{channel});
    return {ok:true,channel};
  });
  if(!outcome?.ok){
    const messages={ACCOUNT_NOT_FOUND:"الحساب غير موجود",NO_CHALLENGE:"اطلب رمز تأكيد جديد أولًا",EXPIRED:"انتهت صلاحية الرمز. اطلب رمزًا جديدًا",TOO_MANY_ATTEMPTS:"تم تجاوز عدد المحاولات. اطلب رمزًا جديدًا",INVALID_CODE:"رمز التأكيد غير صحيح"};
    return res.status(outcome?.reason==="ACCOUNT_NOT_FOUND"?404:400).json({message:messages[outcome?.reason]||"تعذر تأكيد الحساب"});
  }
  res.json({message:"تم تأكيد الحساب بنجاح",channel:outcome.channel});
});

function biometricDeviceId(req){
  return String(req.get("X-Installation-ID")||req.body?.deviceId||"").trim().slice(0,160);
}
app.post("/api/auth/biometric-token",auth,async (req,res)=>{
  const deviceId=biometricDeviceId(req);
  if(!deviceId)return res.status(400).json({message:"تعذر تحديد هذا الجهاز لتفعيل البصمة"});
  const jti=crypto.randomUUID();
  await mutateDurable(store=>{
    if(!Array.isArray(store.devices))store.devices=[];
    let device=store.devices.find(d=>d.id===deviceId&&d.userId===req.user.id&&d.companyId===req.user.companyId);
    if(!device){device={id:deviceId,userId:req.user.id,companyId:req.user.companyId,createdAt:now()};store.devices.push(device);}
    device.active=true;device.biometricActive=true;device.biometricJti=jti;device.lastSeenAt=now();device.revokedAt=null;
    audit(store,req.user.id,"BIOMETRIC_ENABLED","DEVICE",deviceId,{ip:req.ip,requestId:req.requestId});
  });
  const token=jwt.sign({id:req.user.id,companyId:req.user.companyId,purpose:"biometric",deviceId,jti},JWT_SECRET,{expiresIn:"90d",issuer:"alaboud-business-suite",audience:"alaboud-biometric"});
  res.json({token,deviceId});
});
app.post("/api/auth/biometric/revoke",auth,async (req,res)=>{
  const deviceId=biometricDeviceId(req);
  if(!deviceId)return res.status(400).json({message:"تعذر تحديد الجهاز"});
  await mutateDurable(store=>{
    const device=(store.devices||[]).find(d=>d.id===deviceId&&d.userId===req.user.id&&d.companyId===req.user.companyId);
    if(device){device.biometricActive=false;device.biometricJti=null;device.revokedAt=now();device.updatedAt=now();}
    audit(store,req.user.id,"BIOMETRIC_REVOKED","DEVICE",deviceId,{ip:req.ip,requestId:req.requestId});
  });
  res.json({message:"تم إبطال الدخول بالبصمة أو الوجه على هذا الجهاز"});
});
app.post("/api/auth/biometric-login",rateLimit("biometric",20,15*60*1000),(req,res)=>{
  try{
    const p=jwt.verify(String(req.body?.token||""),JWT_SECRET,{issuer:"alaboud-business-suite",audience:"alaboud-biometric",algorithms:["HS256"]});
    if(p.purpose!=="biometric"||!p.deviceId||!p.jti)throw new Error();
    const presentedDevice=biometricDeviceId(req);
    if(presentedDevice&&presentedDevice!==p.deviceId)throw new Error();
    const store=readStore();
    const user=store.users.find(u=>u.id===p.id&&u.active);
    const company=store.companies.find(c=>c.id===p.companyId&&c.active);
    const device=(store.devices||[]).find(d=>d.id===p.deviceId&&d.userId===p.id&&d.companyId===p.companyId&&d.active!==false&&d.biometricActive===true&&d.biometricJti===p.jti);
    if(!user||!company||!device)throw new Error();
    device.lastSeenAt=now();
    const session=issueSession(user,company,{ip:req.ip,userAgent:req.get("user-agent")});
    setSessionCookie(res,session.token);
    res.json(sessionResponseBody(req,session));
  }catch{return res.status(401).json({message:"تم إبطال أو انتهاء صلاحية الدخول بالبصمة أو الوجه"});}
});

app.get("/api/auth/session",auth,(req,res)=>{
  const store=readStore();
  const user=store.users.find(item=>item.id===req.user.id&&item.active);
  const company=store.companies.find(item=>item.id===req.user.companyId&&item.active);

  if(!user||!company){
    return res.status(401).json({message:"الجلسة غير صالحة، يرجى تسجيل الدخول مجددًا"});
  }

  res.json({
    version:"17.1.0",
    user:{
      id:user.id,
      name:user.name,
      email:user.email,
      role:user.role,
      companyId:company.id,
      companyName:company.name
    },
    liveData:{
      customers:(store.customers||[]).filter(item=>!item.isDeleted).length,
      transactions:(store.transactions||[]).filter(item=>!item.isDeleted).length,
      payments:(store.payments||[]).filter(item=>!item.isDeleted).length
    }
  });
});

app.post("/api/auth/register-company",async (req,res)=>{
  const ownerName=String(req.body?.ownerName||"").trim();
  const companyName=String(req.body?.companyName||"").trim();
  const email=String(req.body?.email||"").trim().toLowerCase();
  const phone=String(req.body?.phone||"").trim();
  const password=String(req.body?.password||"");
  if(!ownerName||!companyName||!email.includes("@")){
    return res.status(400).json({message:"الاسم واسم الشركة والبريد الإلكتروني مطلوبة"});
  }
  { const policy=passwordPolicy(password); if(!policy.ok)return res.status(400).json({message:policy.message}); }

  try{
    const result=await mutateDurable(store=>{
      if(store.users.some(user=>String(user.email||"").toLowerCase()===email))throw new Error("البريد الإلكتروني مستخدم مسبقًا");
      const company={id:id(),name:companyName,phone,active:true,createdAt:now()};
      const user={id:id(),companyId:company.id,name:ownerName,email,passwordHash:hashPassword(password),role:"ADMIN",active:true,createdAt:now()};
      store.companies.push(company);
      store.users.push(user);
      store.companySettings[company.id]={overdueDays:7,lowCashLimit:5000,whatsappTemplate:""};
      return {company,user};
    });
    const session=issueSession(result.user,result.company,{ip:req.ip,userAgent:req.get("user-agent")});
    setSessionCookie(res,session.token);
    res.status(201).json(sessionResponseBody(req,session));
  }catch(error){
    res.status(400).json({message:error.message||"تعذر إنشاء حساب الشركة"});
  }
});


function revokeBiometricForUser(store,userId,revokedAt=now()){
  let count=0;
  for(const device of (store.devices||[])){
    if(device.userId!==userId||device.biometricActive!==true)continue;
    device.biometricActive=false;
    device.biometricJti=null;
    device.revokedAt=revokedAt;
    device.updatedAt=revokedAt;
    count+=1;
  }
  return count;
}

app.post("/api/auth/change-password", auth, async (req,res)=>{
  const currentPassword=String(req.body?.currentPassword||"");
  const newPassword=String(req.body?.newPassword||"");
  const policy=passwordPolicy(newPassword);
  if(!policy.ok){ return res.status(400).json({message:policy.message}); }

  try{
    await mutateDurable((store)=>{
      const user=store.users.find(item=>item.id===req.user.id&&item.active);
      if(!user)throw new Error("الحساب غير موجود");
      const currentPasswordOk = isScryptHash(user.passwordHash)
        ? verifyPassword(currentPassword,user.passwordHash)
        : bcrypt.compareSync(currentPassword,user.passwordHash);
      if(!currentPasswordOk){
        throw new Error("كلمة المرور الحالية غير صحيحة");
      }
      user.passwordHash=hashPassword(newPassword);
      user.mustChangePassword=false;
      user.updatedAt=now();
      const revokedSessions=revokeUserSessions(store,user.id,user.id,req.user.jti);
      const revokedBiometric=revokeBiometricForUser(store,user.id);
      audit(store,req.user.id,"UPDATE","USER_PASSWORD",user.id,{revokedSessions,revokedBiometric});
    });
    res.json({message:"تم تغيير كلمة المرور بنجاح"});
  }catch(error){
    res.status(400).json({message:error.message||"تعذر تغيير كلمة المرور"});
  }
});

app.post("/api/auth/forgot-password", rateLimit("forgot-password",5,15*60*1000), async (req,res)=>{
  const identifier=String(req.body?.identifier||req.body?.email||req.body?.phone||"").trim();
  const email=identifier.toLowerCase();
  const normalizedPhone=identifier.replace(/\D/g,"");
  // نفس الرد دائمًا (بصرف النظر عن وجود الحساب) لمنع اكتشاف البريد الإلكتروني المسجّل.
  const genericResponse={message:"إذا كان البريد الإلكتروني مسجلاً، فستصلك رسالة تحتوي رابط إعادة التعيين"};
  const store=readStore();
  const user=store.users.find(u=>u.active&&(
    (email.includes("@")&&String(u.email||"").toLowerCase()===email) ||
    (normalizedPhone.length>=7&&String(u.phone||store.companies.find(c=>c.id===u.companyId)?.phone||"").replace(/\D/g,"")===normalizedPhone)
  ));
  if(!user) return res.json(genericResponse);
  const deliveryEmail=String(user.email||"").trim().toLowerCase();
  if(!deliveryEmail.includes("@"))return res.json(genericResponse);

  const rawToken=crypto.randomBytes(32).toString("hex");
  const tokenHash=sha256(rawToken);
  const expiresAt=new Date(Date.now()+30*60*1000).toISOString();

  await mutateDurable(root=>{
    const u=root.users.find(x=>x.id===user.id);
    if(u){ u.resetPasswordTokenHash=tokenHash; u.resetPasswordExpiresAt=expiresAt; audit(root,u.id,"PASSWORD_RESET_REQUESTED","AUTH",u.id,{ip:req.ip,requestId:req.requestId}); }
  });

  const resetLink=`${APP_URL}/reset-password?email=${encodeURIComponent(deliveryEmail)}&token=${rawToken}`;
  await sendEmail(deliveryEmail,"إعادة تعيين كلمة المرور - ALABOUD Business Suite",
    `تم طلب إعادة تعيين كلمة المرور لحسابك.\nهذا الرابط صالح لمدة 30 دقيقة:\n${resetLink}\nإذا لم تطلب ذلك، تجاهل هذه الرسالة.`);

  // في وضع التطوير فقط (وعند عدم وجود SMTP فعلي)، نعيد الرمز مباشرة لتسهيل الاختبار.
  if(!IS_PROD && !mailTransport) return res.json({...genericResponse,devResetToken:rawToken,devResetLink:resetLink});
  res.json(genericResponse);
});

app.post("/api/auth/reset-password", rateLimit("reset-password",10,15*60*1000), async (req,res)=>{
  const email=String(req.body?.email||"").trim().toLowerCase();
  const token=String(req.body?.token||"");
  const newPassword=String(req.body?.newPassword||"");
  const policy=passwordPolicy(newPassword);
  if(!policy.ok) return res.status(400).json({message:policy.message});
  if(!email||!token) return res.status(400).json({message:"البيانات غير مكتملة"});

  try{
    await mutateDurable(root=>{
      const user=root.users.find(u=>String(u.email||"").toLowerCase()===email&&u.active);
      if(!user||!user.resetPasswordTokenHash) throw new Error("رابط إعادة التعيين غير صالح");
      if(new Date(user.resetPasswordExpiresAt||0).getTime()<Date.now()) throw new Error("انتهت صلاحية رابط إعادة التعيين، اطلب رابطًا جديدًا");
      if(!safeEqualHex(sha256(token),user.resetPasswordTokenHash)) throw new Error("رابط إعادة التعيين غير صالح");

      user.passwordHash=hashPassword(newPassword);
      user.mustChangePassword=false;
      user.resetPasswordTokenHash=null;
      user.resetPasswordExpiresAt=null;
      user.updatedAt=now();
      const revokedSessions=revokeUserSessions(root,user.id,user.id,null);
      const revokedBiometric=revokeBiometricForUser(root,user.id);
      audit(root,user.id,"PASSWORD_RESET_COMPLETED","AUTH",user.id,{ip:req.ip,requestId:req.requestId,revokedSessions,revokedBiometric});
    });
    res.json({message:"تم تعيين كلمة المرور الجديدة بنجاح، يمكنك تسجيل الدخول الآن"});
  }catch(error){
    res.status(400).json({message:error.message||"تعذر إعادة تعيين كلمة المرور"});
  }
});

app.get("/api/auth/sessions", auth, (req,res)=>{
  const sessions=(readStore().sessions||[]).filter(item=>item.userId===req.user.id).map(item=>({id:item.id,jti:item.jti,ip:item.ip,userAgent:item.userAgent,active:item.active!==false,createdAt:item.createdAt,lastSeenAt:item.lastSeenAt,expiresAt:item.expiresAt,current:item.jti===req.user.jti})).sort((a,b)=>String(b.lastSeenAt||"").localeCompare(String(a.lastSeenAt||"")));
  res.json(sessions);
});

app.post("/api/auth/logout", auth, async (req,res)=>{
  await mutateDurable(store=>{revokeSession(store,req.user.jti,req.user.id);audit(store,req.user.id,"LOGOUT","AUTH_SESSION",req.user.jti,{ip:req.ip,requestId:req.requestId});});
  clearSessionCookie(res);
  res.json({message:"تم تسجيل الخروج بنجاح"});
});

app.post("/api/auth/logout-all", auth, async (req,res)=>{
  const includeCurrent=Boolean(req.body?.includeCurrent);
  const count=await mutateDurable(store=>{const total=revokeUserSessions(store,req.user.id,req.user.id,includeCurrent?null:req.user.jti);audit(store,req.user.id,"REVOKE_ALL","AUTH_SESSION",req.user.id,{count:total,includeCurrent});return total;});
  if(includeCurrent)clearSessionCookie(res);
  res.json({message:"تم إنهاء الجلسات",revoked:count});
});

app.get("/api/security/permissions", auth, (req,res)=>res.json({role:req.user.role,permissions:req.user.permissions||[]}));

app.get("/api/audit-logs", auth, requirePermission("audit.read"), (req,res)=>{
  const limit=Math.min(500,Math.max(1,Number(req.query.limit)||100));
  const action=String(req.query.action||"").toUpperCase();
  const entityType=String(req.query.entityType||"").toUpperCase();
  const auditStore=readStore();
  const userMap=new Map((auditStore.users||[]).map(user=>[user.id,user.name||user.email||user.id]));
  let logs=(auditStore.auditLogs||[]).slice().map(item=>({...item,userName:item.userName||userMap.get(item.userId)||item.userId}));
  if(action)logs=logs.filter(item=>String(item.action||"").toUpperCase()===action);
  if(entityType)logs=logs.filter(item=>String(item.entityType||"").toUpperCase()===entityType);
  res.json(logs.sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||""))).slice(0,limit));
});

// v22.8.0 — Multi-Branch management
app.get("/api/branches",auth,(req,res)=>{
  const root=readRootStore();const user=root.users.find(x=>x.id===req.user.id)||req.user;
  const allowed=(root.branches||[]).filter(x=>x.companyId===req.user.companyId&&x.active!==false&&(!Array.isArray(user.branchIds)||!user.branchIds.length||user.branchIds.includes(x.id)));
  res.json(allowed.map(branch=>branchSummary(root,branch)));
});
app.post("/api/branches",auth,async (req,res)=>{
  if(!["ADMIN","MANAGER"].includes(req.user.role))return res.status(403).json({message:"إنشاء الفروع متاح للمدير فقط"});
  try{let branch;await mutateDurable(root=>{branch=createBranch(root,{companyId:req.user.companyId,name:req.body?.name,code:req.body?.code,address:req.body?.address,phone:req.body?.phone,currency:req.body?.currency,isMain:req.body?.isMain,createdBy:req.user.id,now});audit(root,req.user.id,"CREATE","BRANCH",branch.id,{name:branch.name,code:branch.code});});res.status(201).json(branch);}catch(error){const messages={BRANCH_NAME_REQUIRED:"اسم الفرع مطلوب",BRANCH_CODE_REQUIRED:"رمز الفرع مطلوب",BRANCH_CODE_EXISTS:"رمز الفرع مستخدم مسبقًا"};res.status(400).json({message:messages[error.message]||error.message});}
});
app.patch("/api/branches/:id",auth,async (req,res)=>{
  if(!["ADMIN","MANAGER"].includes(req.user.role))return res.status(403).json({message:"تعديل الفروع متاح للمدير فقط"});let branch;await mutateDurable(root=>{branch=(root.branches||[]).find(x=>x.id===req.params.id&&x.companyId===req.user.companyId);if(!branch)return;if(req.body?.isMain){for(const x of root.branches)if(x.companyId===req.user.companyId)x.isMain=false;}for(const key of ["name","address","phone","currency","active","isMain"])if(req.body?.[key]!==undefined)branch[key]=req.body[key];branch.updatedAt=now();audit(root,req.user.id,"UPDATE","BRANCH",branch.id,{name:branch.name});});if(!branch)return res.status(404).json({message:"الفرع غير موجود"});res.json(branch);
});
app.get("/api/branches/current",auth,(req,res)=>res.json(req.branch));
app.get("/api/branches/network-summary",auth,(req,res)=>{const root=readRootStore();const rows=(root.branches||[]).filter(x=>x.companyId===req.user.companyId&&x.active!==false).map(x=>branchSummary(root,x));res.json({branches:rows,totals:rows.reduce((a,x)=>({customers:a.customers+x.metrics.customers,transactions:a.transactions+x.metrics.transactions,transactionValueCad:+(a.transactionValueCad+x.metrics.transactionValueCad).toFixed(2),expensesCad:+(a.expensesCad+x.metrics.expensesCad).toFixed(2)}),{customers:0,transactions:0,transactionValueCad:0,expensesCad:0})});});

app.get("/api/company-profile", auth, (req,res)=>{
  const store=readStore();
  const company=store.companies.find(item=>item.id===req.user.companyId);
  if(!company)return res.status(404).json({message:"الشركة غير موجودة"});
  res.json({id:company.id,name:company.name,phone:company.phone||"",logoDataUrl:company.logoDataUrl||""});
});

app.patch("/api/company-profile", auth, async (req,res)=>{
  if(req.user.role!=="ADMIN")return res.status(403).json({message:"تعديل هوية الشركة متاح للمسؤول الكامل فقط"});
  const name=String(req.body?.name||"").trim();
  const phone=String(req.body?.phone||"").trim();
  const logoDataUrl=String(req.body?.logoDataUrl||"");
  if(!name)return res.status(400).json({message:"اسم الشركة مطلوب"});
  if(logoDataUrl && !/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(logoDataUrl)){
    return res.status(400).json({message:"صيغة الشعار غير مدعومة"});
  }
  if(logoDataUrl.length>1500000)return res.status(400).json({message:"حجم الشعار كبير جدًا"});
  const company=await mutateDurable(store=>{
    const item=store.companies.find(company=>company.id===req.user.companyId);
    if(!item)throw new Error("الشركة غير موجودة");
    item.name=name; item.phone=phone; item.logoDataUrl=logoDataUrl; item.updatedAt=now();
    return {id:item.id,name:item.name,phone:item.phone||"",logoDataUrl:item.logoDataUrl||""};
  });
  res.json(company);
});

app.post("/api/users", auth, async (req,res)=>{
  if(req.user.role!=="ADMIN"){
    return res.status(403).json({message:"إنشاء الحسابات متاح للمدير فقط"});
  }

  const name=String(req.body?.name||"").trim();
  const email=String(req.body?.email||"").trim().toLowerCase();
  const password=String(req.body?.password||"");
  const role=["ADMIN","MANAGER","ACCOUNTANT","USER","VIEWER"].includes(String(req.body?.role||"").toUpperCase())
    ? String(req.body.role).toUpperCase()
    : "USER";

  if(!name||!email||!email.includes("@")){
    return res.status(400).json({message:"الاسم والبريد الإلكتروني مطلوبان"});
  }
  { const policy=passwordPolicy(password); if(!policy.ok)return res.status(400).json({message:policy.message}); }

  try{
    const created=await mutateDurable((store)=>{
      if(store.users.some(item=>String(item.email||"").toLowerCase()===email)){
        throw new Error("البريد الإلكتروني مستخدم مسبقًا");
      }
      const user={
        id:id(),
        companyId:req.user.companyId,
        name,
        email,
        passwordHash:hashPassword(password),
        role,
        active:true,
        createdAt:now()
      };
      store.users.push(user);
      audit(store,req.user.id,"CREATE","USER",user.id,{name,email,role});
      return {id:user.id,name:user.name,email:user.email,role:user.role,active:user.active};
    });
    res.status(201).json(created);
  }catch(error){
    res.status(400).json({message:error.message||"تعذر إنشاء الحساب"});
  }
});

app.get("/api/users", auth, (req,res)=>{
  if(req.user.role!=="ADMIN")return res.status(403).json({message:"إدارة المستخدمين متاحة للمدير فقط"});
  const users=readStore().users.map(user=>({id:user.id,name:user.name,email:user.email,role:user.role,active:user.active!==false,createdAt:user.createdAt,lastLoginAt:user.lastLoginAt||null}));
  res.json(users);
});

app.patch("/api/users/:id", auth, async (req,res)=>{
  if(req.user.role!=="ADMIN")return res.status(403).json({message:"إدارة المستخدمين متاحة للمدير فقط"});
  try{
    const updated=await mutateDurable(store=>{
      const user=store.users.find(item=>item.id===req.params.id);
      if(!user)throw new Error("المستخدم غير موجود");
      if(user.id===req.user.id&&req.body?.active===false)throw new Error("لا يمكنك تعطيل حسابك الحالي");
      if(req.body?.name!==undefined)user.name=String(req.body.name||"").trim()||user.name;
      if(req.body?.role!==undefined&&["ADMIN","MANAGER","USER","VIEWER"].includes(String(req.body.role).toUpperCase()))user.role=String(req.body.role).toUpperCase();
      if(req.body?.active!==undefined)user.active=Boolean(req.body.active);
      if(req.body?.password!==undefined){const policy=passwordPolicy(String(req.body.password));if(!policy.ok)throw new Error(policy.message);user.passwordHash=hashPassword(String(req.body.password));user.mustChangePassword=true;}
      user.updatedAt=now();
      audit(store,req.user.id,"UPDATE","USER",user.id,{role:user.role,active:user.active});
      return {id:user.id,name:user.name,email:user.email,role:user.role,active:user.active!==false,lastLoginAt:user.lastLoginAt||null};
    });
    res.json(updated);
  }catch(error){res.status(400).json({message:error.message||"تعذر تحديث المستخدم"})}
});

app.get("/api/devices", auth, (req,res)=>{
  if(req.user.role!=="ADMIN")return res.status(403).json({message:"إدارة الأجهزة متاحة للمدير فقط"});
  res.json((readStore().devices||[]).slice().sort((a,b)=>String(b.lastSeenAt||"").localeCompare(String(a.lastSeenAt||""))));
});

app.patch("/api/devices/:id", auth, async (req,res)=>{
  if(req.user.role!=="ADMIN")return res.status(403).json({message:"إدارة الأجهزة متاحة للمدير فقط"});
  try{
    const device=await mutateDurable(store=>{
      const item=(store.devices||[]).find(row=>row.id===req.params.id);
      if(!item)throw new Error("الجهاز غير موجود");
      if(req.body?.active!==undefined)item.active=Boolean(req.body.active);
      if(req.body?.deviceName!==undefined)item.deviceName=String(req.body.deviceName||"").slice(0,120);
      item.updatedAt=now();
      audit(store,req.user.id,"UPDATE","DEVICE",item.id,{active:item.active});
      return item;
    });
    res.json(device);
  }catch(error){res.status(400).json({message:error.message||"تعذر تحديث الجهاز"})}
});

app.get("/api/legal/privacy", (_req,res)=>res.json({version:"1.0",updatedAt:"2026-07-18",title:"سياسة الخصوصية",content:"يجمع النظام معلومات الحساب ومعرّف التثبيت ونوع الجهاز وإصدار التطبيق وتاريخ أول وآخر استخدام لأغراض الأمان وإدارة التراخيص فقط. لا تُباع البيانات ولا تُشارك مع جهات خارجية، ولا يتم جمع كلمات المرور بصورتها الأصلية. يتحمل مدير الشركة مسؤولية بيانات العملاء المسجلة داخل النظام."}));
app.get("/api/legal/terms", (_req,res)=>res.json({version:"1.0",updatedAt:"2026-07-18",title:"شروط الاستخدام",content:"استخدام البرنامج مخصص للحسابات والأجهزة المصرح بها. يمنع نسخ البرنامج أو إعادة بيعه أو محاولة تجاوز الحماية دون إذن. المستخدم مسؤول عن صحة البيانات والنسخ الاحتياطية والالتزام بالقوانين المحلية."}));


const dashboardSummaryCache=new Map();
app.get("/api/dashboard", auth, (req,res)=>{
  const cacheKey=`${req.user.companyId||"main"}:${req.headers["x-branch-id"]||"main"}`;
  const cached=dashboardSummaryCache.get(cacheKey);
  if(cached&&cached.expiresAt>Date.now())return res.json(cached.value);
  const s = readStore();
  const today = new Date().toISOString().slice(0,10);
  const activeTransactions=(s.transactions||[]).filter(t=>!t.isDeleted&&t.status!=="CANCELLED");
  const todayTx = activeTransactions.filter((t)=>String(t.createdAt||t.transferDate||"").slice(0,10)===today);
  const todayExpenses = (s.expenses||[]).filter((e)=>e.date===today&&!e.isDeleted).reduce((a,e)=>a+Number(e.cadAmount??e.amount),0);
  const totalProfit = todayTx.reduce((a,t)=>a+transactionFinancials(t).totalProfit,0)-todayExpenses;
  const customerBalances = customerBalanceTotals(s);
  const receivables = safeNumber(customerBalances.receivable);
  const customerPayables = safeNumber(customerBalances.payable);
  const customerNetBalance = safeNumber(customerBalances.net);
  const capital = (s.capitalMovements||[]).filter(m=>!m.isDeleted).reduce((a,m)=>a+(m.type==="IN"?capitalCadAmount(s,m):-capitalCadAmount(s,m)),0);
  const value={customers:(s.customers||[]).filter(c=>!c.isDeleted).length,todayTransactions:todayTx.length,todayProfit:+totalProfit.toFixed(2),receivables:+receivables.toFixed(2),customerPayables:+customerPayables.toFixed(2),customerNetBalance:+customerNetBalance.toFixed(2),capital:+capital.toFixed(2),recent:todayTx.slice(-8).reverse()};
  dashboardSummaryCache.set(cacheKey,{value,expiresAt:Date.now()+15000});
  res.set("Cache-Control","private, max-age=15");
  res.json(value);
});



app.get("/api/notification-settings", auth, (_req,res)=>{
  const store=readStore();
  res.json({
    overdueDays:Math.max(1,safeNumber(store.notificationSettings?.overdueDays,7)),
    lowCashLimit:Math.max(0,safeNumber(store.notificationSettings?.lowCashLimit,5000)),
    whatsappTemplate:String(store.notificationSettings?.whatsappTemplate||"")
  });
});

app.patch("/api/notification-settings", auth, requirePermission("admin.only"), async (req,res)=>{
  const updated=await mutateDurable((store)=>{
    store.notificationSettings ||= {};
    if(req.body?.overdueDays!==undefined){
      const value=Number(req.body.overdueDays);
      if(!Number.isFinite(value)||value<1||value>365)throw new Error("مدة التأخير يجب أن تكون بين 1 و365 يومًا");
      store.notificationSettings.overdueDays=Math.round(value);
    }
    if(req.body?.lowCashLimit!==undefined){
      const value=Number(req.body.lowCashLimit);
      if(!Number.isFinite(value)||value<0)throw new Error("حد السيولة غير صحيح");
      store.notificationSettings.lowCashLimit=value;
    }
    if(req.body?.whatsappTemplate!==undefined){
      store.notificationSettings.whatsappTemplate=String(req.body.whatsappTemplate||"");
    }
    audit(store,req.user.id,"UPDATE","NOTIFICATION_SETTINGS","global",store.notificationSettings);
    return store.notificationSettings;
  });
  res.json(updated);
});

app.get("/api/notifications", auth, (_req,res)=>{
  const store=readStore();
  const customers=(Array.isArray(store.customers)?store.customers:[])
    .map(customer=>customerSummary(store,customer));
  const overdue=customers
    .filter(customer=>customer.overdue)
    .sort((a,b)=>b.overdueDays-a.overdueDays);

  const capital=(Array.isArray(store.capitalMovements)?store.capitalMovements:[])
    .reduce((sum,item)=>sum+(item.type==="IN"?capitalCadAmount(store,item):-capitalCadAmount(store,item)),0);
  const lowCashLimit=Math.max(0,safeNumber(store.notificationSettings?.lowCashLimit,5000));

  const notifications=[];
  for(const customer of overdue){
    const severity=customer.overdueDays>=60?"critical":customer.overdueDays>=30?"danger":customer.overdueDays>=15?"warning":"notice";
    notifications.push({
      id:`overdue-${customer.id}`,
      type:"OVERDUE_CUSTOMER",
      severity,
      title:`تأخر دفع: ${customer.name}`,
      message:`متأخر ${customer.overdueDays} يوم — الرصيد ${customer.finalBalance.toFixed(2)} CAD`,
      customerId:customer.id,
      phone:customer.phone||"",
      amount:customer.finalBalance,
      days:customer.overdueDays
    });
  }

  if(capital<lowCashLimit){
    notifications.push({
      id:"low-capital",
      type:"LOW_CAPITAL",
      severity:"danger",
      title:"تنبيه انخفاض السيولة",
      message:`صافي حركة رأس المال ${capital.toFixed(2)} CAD أقل من الحد ${lowCashLimit.toFixed(2)} CAD`
    });
  }

  const incomplete=(Array.isArray(store.transactions)?store.transactions:[])
    .filter(item=>item&&!item.isDeleted&&item.status&&item.status!=="COMPLETED"&&item.status!=="CANCELLED");
  if(incomplete.length){
    notifications.push({
      id:"incomplete-transfers",
      type:"INCOMPLETE_TRANSFERS",
      severity:"warning",
      title:"حوالات تحتاج مراجعة",
      message:`يوجد ${incomplete.length} حوالة غير مكتملة`
    });
  }

  res.json({
    count:notifications.length,
    overdueCount:overdue.length,
    overdueTotal:+overdue.reduce((sum,item)=>sum+safeNumber(item.finalBalance),0).toFixed(2),
    notifications
  });
});

app.post("/api/notification-actions", auth, async (req,res)=>{
  const {customerId,action="CONTACTED",notes="",promiseDate=null,expectedAmount=null}=req.body||{};
  const saved=await mutateDurable((store)=>{
    store.notificationActions ||= [];
    const item={
      id:id(),
      customerId:customerId||null,
      action,
      notes:String(notes||""),
      promiseDate:promiseDate?String(promiseDate).slice(0,10):null,
      expectedAmount:expectedAmount===null||expectedAmount===""?null:+safeNumber(expectedAmount).toFixed(2),
      createdAt:now(),
      createdBy:req.user.id
    };
    store.notificationActions.push(item);
    audit(store,req.user.id,"CREATE","NOTIFICATION_ACTION",item.id,item);
    return item;
  });
  res.status(201).json(saved);
});

app.get("/api/notification-actions/:customerId", auth, (req,res)=>{
  const store=readStore();
  const rows=(Array.isArray(store.notificationActions)?store.notificationActions:[])
    .filter(item=>item?.customerId===req.params.customerId)
    .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json(rows);
});

app.get("/api/customer-alerts", auth, (_req,res)=>{
  const store = readStore();
  const payments=Array.isArray(store.payments)?store.payments:[];
  const actions=Array.isArray(store.notificationActions)?store.notificationActions:[];
  const today=new Date().toISOString().slice(0,10);

  const latestActionByCustomer=new Map();
  for(const action of actions){
    if(!action?.customerId)continue;
    const current=latestActionByCustomer.get(action.customerId);
    if(!current||String(action.createdAt)>String(current.createdAt)){
      latestActionByCustomer.set(action.customerId,action);
    }
  }

  const rows = (Array.isArray(store.customers) ? store.customers : [])
    .map((customer)=>{
      const summary=customerSummary(store,customer);
      const customerPayments=payments
        .filter(payment=>payment&&!payment.isDeleted)
        .filter(payment=>{
          const transaction=(Array.isArray(store.transactions)?store.transactions:[])
            .find(item=>item?.id===payment.transactionId);
          return transaction?.customerId===customer.id;
        })
        .sort((a,b)=>String(b.paymentDate||b.createdAt).localeCompare(String(a.paymentDate||a.createdAt)));
      const latestAction=latestActionByCustomer.get(customer.id)||null;
      return {
        ...summary,
        lastPaymentDate:customerPayments[0]
          ? String(customerPayments[0].paymentDate||customerPayments[0].createdAt).slice(0,10)
          : null,
        latestAction,
        promiseDate:latestAction?.promiseDate||null,
        expectedAmount:latestAction?.expectedAmount??null,
        contacted:latestAction?.action==="CONTACTED"||latestAction?.action==="PROMISE_TO_PAY"
      };
    })
    .filter((customer)=>customer.overdue)
    .sort((a,b)=>b.overdueDays-a.overdueDays);

  const expectedToday=rows.reduce((sum,item)=>{
    if(item.promiseDate!==today)return sum;
    return sum+safeNumber(item.expectedAmount,item.finalBalance);
  },0);

  const largestBalance=rows.reduce((max,item)=>safeNumber(item.finalBalance)>safeNumber(max?.finalBalance)?item:max,null);
  const oldest=rows[0]||null;

  res.json({
    count:rows.length,
    totalOverdue:+rows.reduce((sum,item)=>sum+safeNumber(item.finalBalance),0).toFixed(2),
    largestOverdueBalance:largestBalance?+safeNumber(largestBalance.finalBalance).toFixed(2):0,
    largestOverdueCustomer:largestBalance?.name||null,
    oldestCustomer:oldest?.name||null,
    oldestDays:oldest?.overdueDays||0,
    expectedToday:+expectedToday.toFixed(2),
    rows
  });
});

app.get("/api/capital-overview", auth, (req,res)=>{
  const store=readStore();
  const requestedMonth=String(req.query.month||new Date().toISOString().slice(0,7));
  const transactions=(Array.isArray(store.transactions)?store.transactions:[])
    .filter(item=>item&&!item.isDeleted&&item.status!=="CANCELLED");
  const capitalMovements=Array.isArray(store.capitalMovements)?store.capitalMovements:[];
  const expenses=Array.isArray(store.expenses)?store.expenses:[];
  const customers=Array.isArray(store.customers)?store.customers:[];
  const debts=Array.isArray(store.generalDebts)?store.generalDebts:[];
  const debtPayments=Array.isArray(store.generalDebtPayments)?store.generalDebtPayments:[];

  const capitalBalance=capitalMovements.reduce(
    (sum,item)=>sum+(item.type==="IN"?capitalCadAmount(store,item):-capitalCadAmount(store,item)),0
  );

  const monthTransactions=transactions.filter(item=>
    String(item.transferDate||item.createdAt||"").slice(0,7)===requestedMonth
  );

  const monthlyTransferValue=monthTransactions.reduce(
    (sum,item)=>sum+transactionFinancials(item).convertedCad,0
  );
  const monthlyProfit=monthTransactions.reduce(
    (sum,item)=>sum+transactionFinancials(item).totalProfit,0
  );
  const monthlyExpenses=expenses
    .filter(item=>String(item.date||item.createdAt||"").slice(0,7)===requestedMonth)
    .reduce((sum,item)=>sum+safeNumber(item.cadAmount??item.amount),0);

  const customerBalances=customerBalanceTotals(store);
  const receivables=safeNumber(customerBalances.receivable);
  const customerPayable=safeNumber(customerBalances.payable);

  const debtPaidById=new Map();
  for(const payment of debtPayments){
    debtPaidById.set(payment.debtId,safeNumber(debtPaidById.get(payment.debtId))+safeNumber(payment.amount));
  }
  let generalReceivable=0;
  let generalPayable=0;
  const missingDebtRates=new Set();
  const toCad=(amount,currency="CAD")=>{
    const normalized=String(currency||"CAD").toUpperCase();
    if(normalized==="CAD")return safeNumber(amount);
    const conversion=currencyConversion(store,normalized,"CAD");
    if(!conversion){missingDebtRates.add(normalized);return 0;}
    return safeNumber(amount)*conversion.factor;
  };
  for(const debt of debts){
    const remaining=Math.max(safeNumber(debt.amount)-safeNumber(debtPaidById.get(debt.id)),0);
    const cadRemaining=toCad(remaining,debt.currency||"CAD");
    if(debt.type==="RECEIVABLE")generalReceivable+=cadRemaining;
    if(debt.type==="PAYABLE")generalPayable+=cadRemaining;
  }

  // Include every company/partner balance shown in the general-debts page.
  let partnerReceivable=0;
  let partnerPayable=0;
  const partners=Array.isArray(store.partners)?store.partners:[];
  const partnerTransactions=Array.isArray(store.partnerTransactions)?store.partnerTransactions:[];
  const partnerPayments=Array.isArray(store.partnerPayments)?store.partnerPayments:[];
  for(const partner of partners){
    const txs=partnerTransactions.filter(item=>item.partnerId===partner.id);
    const pays=partnerPayments.filter(item=>item.partnerId===partner.id);
    const currencies=new Set([
      ...txs.map(item=>String(item.currency||"CAD").toUpperCase()),
      ...pays.map(item=>String(item.currency||"CAD").toUpperCase())
    ]);
    for(const currency of currencies){
      const receivable=txs.filter(item=>item.type==="RECEIVABLE"&&String(item.currency||"CAD").toUpperCase()===currency).reduce((sum,item)=>sum+safeNumber(item.amount),0);
      const payable=txs.filter(item=>item.type==="PAYABLE"&&String(item.currency||"CAD").toUpperCase()===currency).reduce((sum,item)=>sum+safeNumber(item.amount),0);
      const received=pays.filter(item=>item.direction==="RECEIVED"&&String(item.currency||"CAD").toUpperCase()===currency).reduce((sum,item)=>sum+safeNumber(item.amount),0);
      const paid=pays.filter(item=>item.direction==="PAID"&&String(item.currency||"CAD").toUpperCase()===currency).reduce((sum,item)=>sum+safeNumber(item.amount),0);
      partnerReceivable+=toCad(Math.max(receivable-received,0),currency);
      partnerPayable+=toCad(Math.max(payable-paid,0),currency);
    }

    const multi=partner.externalBalances&&typeof partner.externalBalances==="object"?partner.externalBalances:null;
    const entries=multi?Object.entries(multi).filter(([currency,value])=>currency&&value&&typeof value==="object"):[];
    if(entries.length){
      for(const [currency,value] of entries){
        partnerReceivable+=toCad(Math.max(safeNumber(value.receivable),0),currency);
        partnerPayable+=toCad(Math.max(safeNumber(value.payable),0),currency);
      }
    }else{
      const currency=String(partner.accountCurrency||"USD").toUpperCase();
      const extReceivable=Math.max(safeNumber(partner.externalReceivable),0);
      const extPayable=Math.max(safeNumber(partner.externalPayable),0);
      if(extReceivable>0.001||extPayable>0.001){
        partnerReceivable+=toCad(extReceivable,currency);
        partnerPayable+=toCad(extPayable,currency);
      }else{
        const balance=safeNumber(partner.externalBalance);
        if(balance>0.001)partnerReceivable+=toCad(balance,currency);
        if(balance<-0.001)partnerPayable+=toCad(Math.abs(balance),currency);
      }
    }
  }

  // Financial capital indicators (all values normalized to CAD).
  // Total money includes capital, accumulated profit and all receivables.
  // Net capital after everything deducts accumulated expenses and every payable.
  const accumulatedProfit=transactions.reduce(
    (sum,item)=>sum+transactionFinancials(item).totalProfit,0
  );
  const accumulatedExpenses=expenses.reduce(
    (sum,item)=>sum+safeNumber(item.cadAmount??item.amount),0
  );
  // Business rule: "debt for us" is exactly customer balances + company balances.
  // Manual general-debt records remain visible in the debt register but do not alter this KPI.
  const totalReceivables=receivables+partnerReceivable;
  const totalPayables=customerPayable+generalPayable+partnerPayable;
  const totalMoney=capitalBalance+accumulatedProfit+totalReceivables;
  const totalLiabilities=accumulatedExpenses+totalPayables;
  const netCapital=totalMoney-totalLiabilities;
  const netDebt=totalReceivables-totalPayables;
  const estimatedCapital=netCapital;
  const totalCapital=netCapital;
  const turnoverBase=Math.abs(capitalBalance)>0?Math.abs(capitalBalance):Math.abs(estimatedCapital);
  const turnoverRate=turnoverBase>0?monthlyTransferValue/turnoverBase:0;
  const averageTransfer=monthTransactions.length?monthlyTransferValue/monthTransactions.length:0;

  res.json({
    month:requestedMonth,
    capitalBalance:+capitalBalance.toFixed(2),
    accumulatedProfit:+accumulatedProfit.toFixed(2),
    accumulatedExpenses:+accumulatedExpenses.toFixed(2),
    totalMoney:+totalMoney.toFixed(2),
    totalLiabilities:+totalLiabilities.toFixed(2),
    netCapital:+netCapital.toFixed(2),
    totalReceivables:+totalReceivables.toFixed(2),
    totalPayables:+totalPayables.toFixed(2),
    customerReceivable:+receivables.toFixed(2),
    customerPayable:+customerPayable.toFixed(2),
    partnerReceivable:+partnerReceivable.toFixed(2),
    partnerPayable:+partnerPayable.toFixed(2),
    missingDebtRates:[...missingDebtRates],
    netDebt:+netDebt.toFixed(2),
    estimatedCapital:+estimatedCapital.toFixed(2),
    totalCapital:+totalCapital.toFixed(2),
    monthlyTransferValue:+monthlyTransferValue.toFixed(2),
    monthlyTransferCount:monthTransactions.length,
    averageTransfer:+averageTransfer.toFixed(2),
    monthlyProfit:+monthlyProfit.toFixed(2),
    monthlyExpenses:+monthlyExpenses.toFixed(2),
    receivables:+receivables.toFixed(2),
    generalReceivable:+generalReceivable.toFixed(2),
    generalPayable:+generalPayable.toFixed(2),
    turnoverRate:+turnoverRate.toFixed(3)
  });
});


function inventoryLocalDate(settings={}){
  const timeZone=String(settings.timeZone||"America/Toronto");
  try{
    const parts=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
    const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
    return {date:`${values.year}-${values.month}-${values.day}`,year:Number(values.year),month:Number(values.month),day:Number(values.day),timeZone};
  }catch(_error){
    const date=new Date();
    return {date:date.toISOString().slice(0,10),year:date.getUTCFullYear(),month:date.getUTCMonth()+1,day:date.getUTCDate(),timeZone:"UTC"};
  }
}

function calculateInventoryNetCapital(store){
  // IMPORTANT: this mirrors the authoritative "صافي رأس المال" equation used by
  // /api/capital-overview. Monthly inventory must snapshot that KPI, not rebuild
  // a second inventory-specific balance equation.
  const transactions=(Array.isArray(store.transactions)?store.transactions:[])
    .filter(item=>item&&!item.isDeleted&&item.status!=="CANCELLED");
  const capitalMovements=Array.isArray(store.capitalMovements)?store.capitalMovements:[];
  const expenses=Array.isArray(store.expenses)?store.expenses:[];
  const customers=Array.isArray(store.customers)?store.customers:[];
  const debts=Array.isArray(store.generalDebts)?store.generalDebts:[];
  const debtPayments=Array.isArray(store.generalDebtPayments)?store.generalDebtPayments:[];

  const capitalBalance=capitalMovements.reduce(
    (sum,item)=>sum+(item.type==="IN"?capitalCadAmount(store,item):-capitalCadAmount(store,item)),0
  );
  const customerBalances=customerBalanceTotals(store);
  const customerReceivable=safeNumber(customerBalances.receivable);
  const customerPayable=safeNumber(customerBalances.payable);
  const debtPaidById=new Map();
  for(const payment of debtPayments){
    debtPaidById.set(payment.debtId,safeNumber(debtPaidById.get(payment.debtId))+safeNumber(payment.amount));
  }
  const missingRates=new Set();
  const toCad=(amount,currency="CAD")=>{
    const normalized=String(currency||"CAD").toUpperCase();
    if(normalized==="CAD")return safeNumber(amount);
    const conversion=currencyConversion(store,normalized,"CAD");
    if(!conversion){missingRates.add(normalized);return 0;}
    return safeNumber(amount)*conversion.factor;
  };
  let generalPayable=0;
  for(const debt of debts){
    const remaining=Math.max(safeNumber(debt.amount)-safeNumber(debtPaidById.get(debt.id)),0);
    if(debt.type==="PAYABLE")generalPayable+=toCad(remaining,debt.currency||"CAD");
  }

  let partnerReceivable=0;
  let partnerPayable=0;
  const partners=Array.isArray(store.partners)?store.partners:[];
  const partnerTransactions=Array.isArray(store.partnerTransactions)?store.partnerTransactions:[];
  const partnerPayments=Array.isArray(store.partnerPayments)?store.partnerPayments:[];
  for(const partner of partners){
    const txs=partnerTransactions.filter(item=>item.partnerId===partner.id);
    const pays=partnerPayments.filter(item=>item.partnerId===partner.id);
    const currencies=new Set([
      ...txs.map(item=>String(item.currency||"CAD").toUpperCase()),
      ...pays.map(item=>String(item.currency||"CAD").toUpperCase())
    ]);
    for(const currency of currencies){
      const receivable=txs.filter(item=>item.type==="RECEIVABLE"&&String(item.currency||"CAD").toUpperCase()===currency).reduce((sum,item)=>sum+safeNumber(item.amount),0);
      const payable=txs.filter(item=>item.type==="PAYABLE"&&String(item.currency||"CAD").toUpperCase()===currency).reduce((sum,item)=>sum+safeNumber(item.amount),0);
      const received=pays.filter(item=>item.direction==="RECEIVED"&&String(item.currency||"CAD").toUpperCase()===currency).reduce((sum,item)=>sum+safeNumber(item.amount),0);
      const paid=pays.filter(item=>item.direction==="PAID"&&String(item.currency||"CAD").toUpperCase()===currency).reduce((sum,item)=>sum+safeNumber(item.amount),0);
      partnerReceivable+=toCad(Math.max(receivable-received,0),currency);
      partnerPayable+=toCad(Math.max(payable-paid,0),currency);
    }
    const multi=partner.externalBalances&&typeof partner.externalBalances==="object"?partner.externalBalances:null;
    const entries=multi?Object.entries(multi).filter(([currency,value])=>currency&&value&&typeof value==="object"):[];
    if(entries.length){
      for(const [currency,value] of entries){
        partnerReceivable+=toCad(Math.max(safeNumber(value.receivable),0),currency);
        partnerPayable+=toCad(Math.max(safeNumber(value.payable),0),currency);
      }
    }else{
      const currency=String(partner.accountCurrency||"USD").toUpperCase();
      const extReceivable=Math.max(safeNumber(partner.externalReceivable),0);
      const extPayable=Math.max(safeNumber(partner.externalPayable),0);
      if(extReceivable>0.001||extPayable>0.001){
        partnerReceivable+=toCad(extReceivable,currency);
        partnerPayable+=toCad(extPayable,currency);
      }else{
        const balance=safeNumber(partner.externalBalance);
        if(balance>0.001)partnerReceivable+=toCad(balance,currency);
        if(balance<-0.001)partnerPayable+=toCad(Math.abs(balance),currency);
      }
    }
  }

  const accumulatedProfit=transactions.reduce((sum,item)=>sum+transactionFinancials(item).totalProfit,0);
  const accumulatedExpenses=expenses.reduce((sum,item)=>sum+safeNumber(item.cadAmount??item.amount),0);
  const totalReceivables=customerReceivable+partnerReceivable;
  const totalPayables=customerPayable+generalPayable+partnerPayable;
  const totalMoney=capitalBalance+accumulatedProfit+totalReceivables;
  const totalLiabilities=accumulatedExpenses+totalPayables;
  return {netCapital:totalMoney-totalLiabilities,missingRates:[...missingRates]};
}

function monthlyInventoryDraft(store,{vaultCash=0}={}){
  const capital=calculateInventoryNetCapital(store);
  const normalizedVault=Math.max(0,safeNumber(vaultCash));
  const round=value=>+safeNumber(value).toFixed(2);
  return {
    currency:"CAD",
    netCapital:round(capital.netCapital),
    vaultCash:round(normalizedVault),
    finalValue:round(capital.netCapital+normalizedVault),
    missingRates:capital.missingRates
  };
}

function inventoryAlert(store){
  const settings=store.notificationSettings||{};
  const scheduleDay=Math.max(1,Math.min(28,Math.trunc(safeNumber(settings.inventoryDay,20)||20)));
  const local=inventoryLocalDate(settings);
  const month=`${local.year}-${String(local.month).padStart(2,"0")}`;
  const closed=(Array.isArray(store.monthlyInventories)?store.monthlyInventories:[]).some(item=>item&&item.month===month&&!item.isDeleted);
  if(closed)return {status:"DONE",day:scheduleDay,month,message:"تم إنجاز جرد هذا الشهر"};
  const delta=local.day-scheduleDay;
  if(delta===-1)return {status:"TOMORROW",day:scheduleDay,month,message:"غدًا موعد الجرد الشهري"};
  if(delta===0)return {status:"DUE",day:scheduleDay,month,message:"اليوم موعد الجرد الشهري — لم يتم تثبيت الجرد بعد"};
  if(delta>0)return {status:"OVERDUE",day:scheduleDay,month,daysLate:delta,message:`الجرد الشهري متأخر منذ ${delta} ${delta===1?"يوم":"أيام"}`};
  return {status:"UPCOMING",day:scheduleDay,month,daysUntil:-delta,message:`موعد الجرد القادم يوم ${scheduleDay} من الشهر`};
}

app.get("/api/monthly-inventory", auth, (req,res)=>{
  const store=readStore();
  const settings=store.notificationSettings||{};
  const scheduleDay=Math.max(1,Math.min(28,Math.trunc(safeNumber(settings.inventoryDay,20)||20)));
  const rows=Array.from(store.monthlyInventories||[]).filter(item=>item&&!item.isDeleted).sort((a,b)=>String(b.month).localeCompare(String(a.month)));
  const current=monthlyInventoryDraft(store,{vaultCash:0});
  res.json({scheduleDay,alert:inventoryAlert(store),current,rows});
});

app.patch("/api/monthly-inventory/settings", auth, async (req,res)=>{
  const day=Math.trunc(safeNumber(req.body?.day));
  if(day<1||day>28)return res.status(400).json({message:"يوم الجرد يجب أن يكون بين 1 و28"});
  await mutateDurable(store=>{store.notificationSettings={...(store.notificationSettings||{}),inventoryDay:day};audit(store,req.user.id,"UPDATE","MONTHLY_INVENTORY_SETTINGS",String(day),{day});});
  res.json({message:"تم حفظ يوم الجرد الشهري",day});
});

app.post("/api/monthly-inventory/close", auth, async (req,res)=>{
  const vaultCash=safeNumber(req.body?.vaultCash);
  if(vaultCash<0)return res.status(400).json({message:"قيمة الكاش في الخزنة لا يمكن أن تكون سالبة"});
  const result=await mutateDurable(store=>{
    const local=inventoryLocalDate(store.notificationSettings||{});
    const month=`${local.year}-${String(local.month).padStart(2,"0")}`;
    const existing=(store.monthlyInventories||[]).find(item=>item&&item.month===month&&!item.isDeleted);
    if(existing){const error=new Error("تم تثبيت جرد هذا الشهر مسبقًا");error.statusCode=409;throw error;}
    const draft=monthlyInventoryDraft(store,{vaultCash});
    if(draft.missingRates.length){const error=new Error(`لا يمكن تثبيت الجرد قبل إضافة أسعار تحويل العملات: ${draft.missingRates.join(", ")}`);error.statusCode=400;throw error;}
    const item={id:id(),month,inventoryDate:local.date,scheduleDay:Math.max(1,Math.min(28,Math.trunc(safeNumber(store.notificationSettings?.inventoryDay,20)||20))),...draft,notes:String(req.body?.notes||"").trim().slice(0,1000),fixedAt:now(),fixedBy:req.user.id,fixedByName:req.user.name||"",createdAt:now()};
    store.monthlyInventories.push(item);
    audit(store,req.user.id,"CREATE","MONTHLY_INVENTORY",item.id,{month,finalValue:item.finalValue,vaultCash:item.vaultCash});
    return item;
  });
  res.status(201).json({message:"تم تثبيت جرد الشهر بنجاح",inventory:result});
});

app.get("/api/monthly-report", auth, (req,res)=>{
  const store=readStore();
  const month=String(req.query.month||new Date().toISOString().slice(0,7));

  const transactions=(Array.isArray(store.transactions)?store.transactions:[])
    .filter(item=>item&&!item.isDeleted&&item.status!=="CANCELLED")
    .filter(item=>String(item.transferDate||item.createdAt||"").slice(0,7)===month);

  const expenses=(Array.isArray(store.expenses)?store.expenses:[])
    .filter(item=>String(item.date||item.createdAt||"").slice(0,7)===month);

  const capitalMovements=(Array.isArray(store.capitalMovements)?store.capitalMovements:[])
    .filter(item=>String(item.date||item.createdAt||"").slice(0,7)===month);

  const payments=(Array.isArray(store.payments)?store.payments:[])
    .filter(item=>item&&!item.isDeleted)
    .filter(item=>String(item.paymentDate||item.date||item.createdAt||"").slice(0,7)===month);

  const transferTotal=transactions.reduce((sum,item)=>sum+transactionFinancials(item).convertedCad,0);
  const feesTotal=transactions.reduce((sum,item)=>sum+transactionFinancials(item).transferFee,0);
  const exchangeProfit=transactions.reduce((sum,item)=>sum+transactionFinancials(item).exchangeProfit,0);
  const grossProfit=transactions.reduce((sum,item)=>sum+transactionFinancials(item).totalProfit,0);
  const expenseTotal=expenses.reduce((sum,item)=>sum+safeNumber(item.cadAmount??item.amount),0);
  const netProfit=grossProfit-expenseTotal;
  const paidTotal=payments.reduce((sum,item)=>sum+safeNumber(item.cadAmount??item.amount),0);

  const capitalIn=capitalMovements
    .filter(item=>item.type==="IN")
    .reduce((sum,item)=>sum+safeNumber(item.cadAmount??item.amount),0);
  const capitalOut=capitalMovements
    .filter(item=>item.type!=="IN")
    .reduce((sum,item)=>sum+safeNumber(item.cadAmount??item.amount),0);

  const customerMap=new Map();
  for(const transaction of transactions){
    customerMap.set(
      transaction.customerId,
      safeNumber(customerMap.get(transaction.customerId))+safeNumber(transaction.amount)
    );
  }

  const topCustomers=Array.from(customerMap.entries())
    .map(([customerId,total])=>({
      customerId,
      customerName:(Array.isArray(store.customers)?store.customers:[]).find(c=>c.id===customerId)?.name||"-",
      total:+total.toFixed(2)
    }))
    .sort((a,b)=>b.total-a.total)
    .slice(0,10);

  const dailyMap={};
  for(const transaction of transactions){
    const date=String(transaction.transferDate||transaction.createdAt||"").slice(0,10);
    dailyMap[date] ||= {date,count:0,total:0,profit:0};
    dailyMap[date].count+=1;
    const financials=transactionFinancials(transaction);
    dailyMap[date].total+=financials.convertedCad;
    dailyMap[date].profit+=financials.totalProfit;
  }

  const daily=Object.values(dailyMap)
    .map(item=>({
      ...item,
      total:+item.total.toFixed(2),
      profit:+item.profit.toFixed(2)
    }))
    .sort((a,b)=>a.date.localeCompare(b.date));

  res.json({
    month,
    generatedAt:now(),
    summary:{
      transferCount:transactions.length,
      transferTotal:+transferTotal.toFixed(2),
      averageTransfer:+(transactions.length?transferTotal/transactions.length:0).toFixed(2),
      largestTransfer:+(transactions.length?Math.max(...transactions.map(item=>safeNumber(item.amount))):0).toFixed(2),
      smallestTransfer:+(transactions.length?Math.min(...transactions.map(item=>safeNumber(item.amount))):0).toFixed(2),
      feesTotal:+feesTotal.toFixed(2),
      exchangeProfit:+exchangeProfit.toFixed(2),
      grossProfit:+grossProfit.toFixed(2),
      expenses:+expenseTotal.toFixed(2),
      netProfit:+netProfit.toFixed(2),
      paymentsReceived:+paidTotal.toFixed(2),
      capitalIn:+capitalIn.toFixed(2),
      capitalOut:+capitalOut.toFixed(2),
      netCapitalMovement:+(capitalIn-capitalOut).toFixed(2)
    },
    daily,
    topCustomers,
    transactions:transactions
      .slice()
      .sort((a,b)=>String(a.transferDate||a.createdAt).localeCompare(String(b.transferDate||b.createdAt)))
  });
});


function normalizeCustomerSortName(value){
  return String(value||"")
    .trim()
    .replace(/[\u064B-\u065F\u0670]/g,"")
    .replace(/^[اأإآ]ل(?=\S)/,"")
    .replace(/^[أإآ]/,"ا")
    .replace(/ى/g,"ي")
    .replace(/ة/g,"ه")
    .replace(/\s+/g," ");
}
function compareCustomers(sort){
  const collator=new Intl.Collator("ar",{sensitivity:"base",numeric:true,ignorePunctuation:true});
  const name=(a,b)=>collator.compare(normalizeCustomerSortName(a.name),normalizeCustomerSortName(b.name));
  if(sort==="name-desc")return (a,b)=>name(b,a);
  if(sort==="newest")return (a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||""))||name(a,b);
  if(sort==="oldest")return (a,b)=>String(a.createdAt||"").localeCompare(String(b.createdAt||""))||name(a,b);
  return name;
}

app.get("/api/customers", auth, async (req,res)=>{
  try{
    const store=readStore();
    const search=String(req.query.search||"").trim();
    const sort=String(req.query.sort||"name-asc");
    const hasPaging=req.query.page!==undefined||req.query.pageSize!==undefined;
    const page=Math.max(1,parseInt(req.query.page,10)||1);
    const pageSize=Math.min(200,Math.max(1,parseInt(req.query.pageSize||req.query.limit,10)||50));
    const offset=(page-1)*pageSize;

    const nativePage=await branchSafeRead(
      req,
      "customers-page",
      ()=>nativeRepositories.customers.listCustomersPage(req.user.companyId,{search,sort,limit:pageSize,offset}),
      ()=>null
    );
    if(nativePage&&Array.isArray(nativePage.rows)){
      const items=nativePage.rows.map(customer=>customerSummary(store,customer));
      if(!hasPaging)return res.json(items);
      return res.json({items,total:nativePage.total,page,pageSize,totalPages:Math.max(1,Math.ceil(nativePage.total/pageSize))});
    }

    const customers=Array.from(store.customers||[]);
    const lowered=search.toLowerCase();
    const base=customers
      .filter(customer=>!customer?.isDeleted)
      .filter(customer=>!lowered||[customer.name,customer.phone,customer.customerNumber,customer.identityNumber].some(value=>String(value||"").toLowerCase().includes(lowered)))
      .sort(compareCustomers(sort));
    const win=requestedWindow(req,base.length);
    const items=base.slice(win.start,win.end).map(customer=>customerSummary(store,customer));
    res.json(windowResponse(win,items));
  }catch(error){
    console.error("Customer list failed",{requestId:req.requestId,error:error?.stack||error});
    if(isTransientDatabaseError(error)){
      return res.status(503).json({code:"DATABASE_TEMPORARILY_UNAVAILABLE",retryable:true,message:"جارٍ استعادة الاتصال. سيتم تحديث قائمة العملاء تلقائيًا.",requestId:req.requestId||null});
    }
    res.status(500).json({code:"CUSTOMERS_LIST_FAILED",message:"تعذر تحميل قائمة العملاء.",requestId:req.requestId||null});
  }
});

app.get("/api/customers/debt-summary",auth,(req,res)=>{
  try{
    const store=readStore();
    const summary=FinancialEngine.customerDebtSummary(store,{overdueDays:store.notificationSettings?.overdueDays});
    res.set("Cache-Control","no-store");
    res.json({...summary,calculatedAt:now()});
  }catch(error){
    console.error("Customer debt summary failed",{requestId:req.requestId,error:error?.stack||error});
    res.status(500).json({code:"CUSTOMER_DEBT_SUMMARY_FAILED",message:"تعذر حساب إجمالي دين العملاء.",requestId:req.requestId||null});
  }
});

app.get("/api/customers/options",auth,async(req,res)=>{
  try{
    const store=readStore();
    const search=String(req.query.search||"").trim();
    const limit=Math.min(5000,Math.max(1,parseInt(req.query.limit,10)||200));
    const page=Math.max(1,parseInt(req.query.page,10)||1);
    const offset=(page-1)*limit;
    const nativePage=await branchSafeRead(
      req,
      "customer-options",
      ()=>nativeRepositories.customers.listCustomersPage(req.user.companyId,{search,sort:"name-asc",limit,offset}),
      ()=>null
    );
    const customers=nativePage&&Array.isArray(nativePage.rows)?nativePage.rows:Array.from(store.customers||[]);
    const lowered=search.toLowerCase();
    const rows=customers
      .filter(customer=>!customer?.isDeleted)
      .filter(customer=>!lowered||[customer.name,customer.phone,customer.customerNumber].some(value=>String(value||"").toLowerCase().includes(lowered)))
      .sort(compareCustomers("name-asc"))
      .slice(nativePage&&Array.isArray(nativePage.rows)?0:offset,nativePage&&Array.isArray(nativePage.rows)?undefined:offset+limit)
      .map(customer=>({id:customer.id,name:customer.name,phone:customer.phone||"",customerNumber:customer.customerNumber||customer.identityNumber||""}));
    res.set("Cache-Control","private, max-age=60");
    if(String(req.query.paged||"")==="1")return res.json({items:rows,page,pageSize:limit,total:nativePage?.total??rows.length,hasMore:nativePage?offset+rows.length<nativePage.total:rows.length===limit});
    res.json(rows);
  }catch(error){
    console.error("Customer options failed",{requestId:req.requestId,error:error?.stack||error});
    res.status(500).json({code:"CUSTOMER_OPTIONS_FAILED",message:"تعذر تحميل قائمة اختيار العملاء.",requestId:req.requestId||null});
  }
});
app.post("/api/customers", auth, async (req,res)=>{
  try{
  const {name,phone="",email="",identityNumber="",customerNumber="",notes="",oldBalance=0,oldBalanceType="RECEIVABLE"}=req.body||{};
  if(!String(name).trim()) return res.status(400).json({message:"Customer name is required"});
  const customer=await mutateDurable((s)=>{
    const requested=String(customerNumber||identityNumber||"").trim();
    if(requested&&s.customers.some(item=>!item.isDeleted&&String(item.customerNumber||item.identityNumber||"").trim()===requested))throw new Error("رقم العميل مضاف مسبقًا");
    const normalizedPhone=normalizePhone(phone);
    const existingByPhone=normalizedPhone?s.customers.find(item=>!item.isDeleted&&normalizePhone(item.phone)===normalizedPhone):null;
    if(existingByPhone){
      const error=new Error(`رقم الهاتف مستخدم مسبقًا باسم ${existingByPhone.name}`);
      error.code="DUPLICATE_PHONE";error.existingCustomer={id:existingByPhone.id,name:existingByPhone.name,phone:existingByPhone.phone};
      throw error;
    }
    const nextNumber=requested||String(Math.max(0,...s.customers.map(item=>Number(item.customerNumber)||0))+1);
    const openingBalance=+Math.max(safeNumber(oldBalance),0).toFixed(2);
    const normalizedOldBalanceType=String(oldBalanceType||"RECEIVABLE").toUpperCase()==="PAYABLE"?"PAYABLE":"RECEIVABLE";
    const c={id:id(),customerNumber:nextNumber,name:String(name).trim(),phone:String(phone||"").trim(),phoneNormalized:normalizedPhone,email,identityNumber,notes,oldBalance:openingBalance,oldBalanceType:normalizedOldBalanceType,openingBalanceInitial:openingBalance,oldBalancePaid:0,createdAt:now()};
    s.customers.push(c);
    audit(s,req.user.id,"CREATE","CUSTOMER",c.id,{after:{...c},ip:req.ip,branchId:req.user.branchId,branchName:req.user.branchName});
    return c;
  });
  res.status(201).json(customer);
  }catch(error){res.status(400).json({message:error.message||"تعذر إضافة العميل",code:error.code||undefined,existingCustomer:error.existingCustomer||undefined});}
});

app.patch("/api/customers/:id", auth, async (req,res)=>{
  try{
    const updated=await mutateDurable((store)=>{
      const customer=(Array.isArray(store.customers)?store.customers:[])
        .find(item=>item?.id===req.params.id);
      if(!customer)return null;

      const oldData={...customer};
      if(req.body.phone!==undefined){
        const normalizedPhone=normalizePhone(req.body.phone);
        const existingByPhone=normalizedPhone?(store.customers||[]).find(item=>!item.isDeleted&&item.id!==customer.id&&normalizePhone(item.phone)===normalizedPhone):null;
        if(existingByPhone){
          const error=new Error(`رقم الهاتف مستخدم مسبقًا باسم ${existingByPhone.name}`);
          error.code="DUPLICATE_PHONE";error.existingCustomer={id:existingByPhone.id,name:existingByPhone.name,phone:existingByPhone.phone};
          throw error;
        }
      }
      const allowed=["name","phone","email","address","notes","oldBalance","oldBalanceType"];
      for(const key of allowed){
        if(req.body[key]!==undefined)customer[key]=req.body[key];
      }
      if(!String(customer.name||"").trim()){
        throw new Error("اسم العميل مطلوب");
      }
      customer.phone=String(customer.phone||"").trim();
      customer.phoneNormalized=normalizePhone(customer.phone);
      customer.oldBalance=+Math.max(safeNumber(customer.oldBalance),0).toFixed(2);
      customer.oldBalanceType=String(customer.oldBalanceType||"RECEIVABLE").toUpperCase()==="PAYABLE"?"PAYABLE":"RECEIVABLE";
      const updateTime=now();
      if(req.body.oldBalance!==undefined||req.body.oldBalanceType!==undefined){
        customer.openingBalanceInitial=customer.oldBalance;
        customer.oldBalancePaid=0;
        // A new opening balance entered after an account reset belongs to the NEW account.
        // Keep the reset marker so historical transactions stay archived, but mark this opening balance as post-reset.
        customer.openingBalanceUpdatedAt=updateTime;
      }
      else customer.oldBalancePaid=+Math.min(Math.max(safeNumber(customer.oldBalancePaid),0),customer.oldBalance).toFixed(2);
      customer.updatedAt=updateTime;
      customer.updatedBy=req.user.id;
      audit(store,req.user.id,"UPDATE","CUSTOMER",customer.id,{before:oldData,after:{...customer},ip:req.ip,branchId:req.user.branchId,branchName:req.user.branchName});
      return customer;
    });

    if(!updated)return res.status(404).json({message:"العميل غير موجود"});
    res.json(updated);
  }catch(error){
    res.status(400).json({message:error.message||"تعذر تعديل العميل",code:error.code||undefined,existingCustomer:error.existingCustomer||undefined});
  }
});

app.post("/api/customers/:id/reset-account", auth, async (req,res)=>{
  try{
    const result=await mutateDurable((store)=>{
      const customer=(Array.isArray(store.customers)?store.customers:[])
        .find(item=>item?.id===req.params.id && !item?.isDeleted);
      if(!customer)return null;

      const before=customerSummary(store,customer);
      const resetAt=now();
      const resetEntry={
        id:id(),
        resetAt,
        resetBy:req.user.id,
        note:String(req.body?.note||"تصفير الحساب وبدء حساب جديد").trim(),
        snapshot:{
          totalTransactions:before.totalTransactions,
          totalPaid:before.totalPaid,
          finalBalance:before.finalBalance,
          oldBalance:before.oldBalance,
          oldBalancePaid:before.oldBalancePaid
        }
      };

      if(!Array.isArray(customer.accountResets))customer.accountResets=[];
      customer.accountResets.push(resetEntry);
      customer.accountResetAt=resetAt;
      customer.updatedAt=resetAt;
      customer.updatedBy=req.user.id;
      audit(store,req.user.id,"RESET_ACCOUNT","CUSTOMER",customer.id,resetEntry);
      return {customer:customerSummary(store,customer),reset:resetEntry};
    });

    if(!result)return res.status(404).json({message:"العميل غير موجود"});
    res.json({message:"تم تصفير حساب العميل وبدء حساب جديد مع حفظ الحساب السابق في الأرشيف",...result});
  }catch(error){
    res.status(400).json({message:error.message||"تعذر تصفير حساب العميل"});
  }
});

app.delete("/api/customers/:id", auth, async (req,res)=>{
  try{
    const deleted=await mutateDurable((store)=>{
      const customer=(Array.isArray(store.customers)?store.customers:[])
        .find(item=>item?.id===req.params.id && !item?.isDeleted);
      if(!customer)return null;
      markSoftDeleted(customer,{userId:req.user.id,reason:req.body?.reason||"حذف العميل",at:now()});
      audit(store,req.user.id,"DELETE","CUSTOMER",customer.id,{before:{...customer},softDelete:true,name:customer.name,ip:req.ip,branchId:req.user.branchId,branchName:req.user.branchName});
      return {id:customer.id,name:customer.name};
    });
    if(!deleted)return res.status(404).json({message:"العميل غير موجود أو محذوف مسبقًا"});
    res.json({message:"تم حذف العميل مع الحفاظ على السجلات المالية",customer:deleted});
  }catch(error){
    res.status(400).json({message:error.message||"تعذر حذف العميل"});
  }
});

app.get("/api/customers/:id", auth, (req,res)=>{
  try {
    const store = readStore();
    const customers = Array.isArray(store.customers) ? store.customers : [];
    const allTransactions = (Array.isArray(store.transactions) ? store.transactions : []).filter(item=>!item?.isDeleted);
    const allPayments = (Array.isArray(store.payments) ? store.payments : []).filter(item=>!item?.isDeleted);

    const customer = customers.find((item) => item && item.id === req.params.id && !item.isDeleted);
    if (!customer) return res.status(404).json({message:"العميل غير موجود"});

    const transactions = allTransactions
      .filter((transaction) => transaction && transaction.customerId === customer.id)
      .map((transaction) => {
        const paid = allPayments
          .filter((payment) => payment && payment.transactionId === transaction.id)
          .reduce((sum, payment) => sum + safeNumber(payment.amount), 0);

        const financials = transactionFinancials(transaction);
        const due = financials.totalCustomerDue;

        return {
          ...transaction,
          number: String(transaction.number || transaction.id || "-"),
          totalCustomerDue: +due.toFixed(2),
          paid: +paid.toFixed(2),
          remaining: +Math.max(due - paid, 0).toFixed(2),
        };
      });

    const payments = groupCustomerPaymentRecords(allPayments, customer.id);

    res.json({
      customer: customerSummary(store, customer),
      transactions,
      payments,
    });
  } catch (error) {
    console.error("Customer profile error:", error);
    res.status(500).json({message:"تعذر تحميل ملف العميل"});
  }
});

app.get("/api/transactions", auth, async (req,res)=>{
  const s=readStore();
  const [transactions,payments,customers]=await Promise.all([
    branchSafeRead(req,"transactions",()=>nativeRepositories.transactions.listByCompany(req.user.companyId,{orderBy:"created_at DESC",includeDeleted:false}),()=>Array.from(s.transactions).filter(t=>!t.isDeleted).reverse()),
    branchSafeRead(req,"payments",()=>nativeRepositories.payments.listByCompany(req.user.companyId,{orderBy:"created_at DESC",includeDeleted:false}),()=>Array.from(s.payments).filter(p=>!p.isDeleted)),
    branchSafeRead(req,"transaction-customers",()=>nativeRepositories.customers.listByCompany(req.user.companyId,{orderBy:"created_at DESC",includeDeleted:false}),()=>Array.from(s.customers).filter(c=>!c.isDeleted))
  ]);
  const paidByTransaction=new Map();
  for(const payment of payments){if(payment.isDeleted||!payment.transactionId)continue;paidByTransaction.set(payment.transactionId,(paidByTransaction.get(payment.transactionId)||0)+safeNumber(payment.amount));}
  const customerNameById=new Map(customers.map(c=>[c.id,c.name||"-"]));
  const search=String(req.query.search||"").trim().toLowerCase();
  const status=String(req.query.status||"").toUpperCase();
  const currency=String(req.query.currency||"").toUpperCase();
  const base=transactions.filter(t=>(!currency||String(t.currency||"").toUpperCase()===currency)&&(!search||[t.id,t.reference,t.customerId,customerNameById.get(t.customerId)].some(v=>String(v||"").toLowerCase().includes(search))));
  const win=requestedWindow(req,base.length);
  const items=base.slice(win.start,win.end).map(t=>{
    const paidAmount=paidByTransaction.get(t.id)||0;
    const remaining=Math.max(safeNumber(t.totalCustomerDue)-paidAmount,0);
    return {...t,customerName:customerNameById.get(t.customerId)||"-",paidAmount:+paidAmount.toFixed(2),remaining:+remaining.toFixed(2),paymentStatus:remaining<=0.001?"PAID":"UNPAID"};
  }).filter(t=>!status||t.paymentStatus===status||String(t.status||"").toUpperCase()===status);
  res.json(windowResponse({...win,total:status?items.length:win.total},items));
});
app.get("/api/transactions/unpaid-summary", auth, async (req,res)=>{
  try{
    const s=readStore();
    const [transactions,payments]=await Promise.all([
      branchSafeRead(req,"transactions-unpaid-summary",()=>nativeRepositories.transactions.listByCompany(req.user.companyId,{orderBy:"created_at DESC",includeDeleted:false}),()=>Array.from(s.transactions).filter(t=>!t.isDeleted)),
      branchSafeRead(req,"payments-unpaid-summary",()=>nativeRepositories.payments.listByCompany(req.user.companyId,{orderBy:"created_at DESC",includeDeleted:false}),()=>Array.from(s.payments).filter(p=>!p.isDeleted))
    ]);
    const paidByTransaction=new Map();
    for(const payment of payments){
      if(payment.isDeleted||!payment.transactionId)continue;
      paidByTransaction.set(payment.transactionId,(paidByTransaction.get(payment.transactionId)||0)+safeNumber(payment.amount));
    }
    let totalCad=0;
    let count=0;
    for(const transaction of transactions){
      if(transaction.isDeleted)continue;
      const due=transactionFinancials(transaction).totalCustomerDue;
      const remaining=Math.max(due-(paidByTransaction.get(transaction.id)||0),0);
      if(remaining>0.001){totalCad+=remaining;count+=1;}
    }
    res.json({totalCad:+totalCad.toFixed(2),count});
  }catch(error){
    console.error("Transactions unpaid summary error:",error);
    res.status(500).json({message:"تعذر حساب مجموع الحوالات غير المدفوعة"});
  }
});

app.post("/api/transactions", auth, requireIdempotencyKey, async (req,res)=>{
  const {
    customerId,
    currency="USD",
    amount,
    costRate,
    finalRate,
    transferFee=0,
    feeMethod="ADD",
    rateSource="manual",
    rateUpdatedAt=null,
    status="COMPLETED",
    paymentStatus="UNPAID",
    transferDate=""
  }=req.body||{};

  const nums=[amount,costRate,finalRate,transferFee].map(Number);
  if(nums.some(n=>!Number.isFinite(n))||nums[0]<=0||nums[1]<=0||nums[2]<=0||nums[3]<0){
    return res.status(400).json({message:"قيم الحوالة غير صحيحة"});
  }

  const [a,cost,clientRate,fee]=nums;
  const normalizedCurrency=String(currency||"USD").toUpperCase();
  const baseCustomerDue=a*clientRate;
  const totalCustomerDue=feeMethod==="ADD"?baseCustomerDue+fee:baseCustomerDue;
  // Financial integrity: customer charge must equal base due plus any added fee.
  assertBalancedEntry([
    {account:"CUSTOMER_RECEIVABLE",debit:+totalCustomerDue.toFixed(2)},
    {account:"TRANSFER_BASE_DUE",credit:+baseCustomerDue.toFixed(2)},
    {account:"TRANSFER_FEE_ADDED",credit:feeMethod==="ADD"?+fee.toFixed(2):0}
  ]);
  const beneficiaryReceives=feeMethod==="DEDUCT"?Math.max(a-fee,0):a;
  const exchangeProfit=a*(clientRate-cost);
  const totalProfit=exchangeProfit+fee;

  const tx=await mutateDurable((s)=>{
    if(!s.customers.some(c=>c.id===customerId))throw new Error("Customer not found");
    const n=s.transactions.length+1;
    const t={
      id:id(),
      number:`TRX-${new Date().getFullYear()}-${String(n).padStart(6,"0")}`,
      customerId,
      currency:normalizedCurrency,
      direction:`${normalizedCurrency}_TO_CAD`,
      amount:+a.toFixed(2),
      costRate:cost,
      finalRate:clientRate,
      rateSource,
      rateUpdatedAt,
      transferFee:+fee.toFixed(2),
      feeMethod,
      destinationAmount:+a.toFixed(2),
      beneficiaryReceives:+beneficiaryReceives.toFixed(2),
      exchangeProfit:+exchangeProfit.toFixed(2),
      totalProfit:+totalProfit.toFixed(2),
      totalCustomerDue:+totalCustomerDue.toFixed(2),
      status,
      transferDate:transferDate||new Date().toISOString().slice(0,10),
      createdAt:now(),
      createdBy:req.user.id
    };
    s.transactions.push(t);

    const normalizedPaymentStatus=String(paymentStatus||"UNPAID").toUpperCase();
    if(normalizedPaymentStatus==="PAID"){
      s.payments.push({
        id:id(),
        transactionId:t.id,
        customerId:t.customerId,
        amount:t.totalCustomerDue,
        method:"CASH",
        notes:"تم تسجيل الحوالة كمدفوعة عند الإنشاء",
        reference:"",
        paymentDate:t.transferDate,
        date:now(),
        receivedBy:req.user.id,
        isDeleted:false,
        allocationMode:"TRANSFER_INITIAL_FULL"
      });
    }

    audit(s,req.user.id,"CREATE","TRANSACTION",t.id,{after:{...t,paymentStatus:normalizedPaymentStatus},ip:req.ip,branchId:req.user.branchId,branchName:req.user.branchName});

    return {
      ...t,
      paidAmount:normalizedPaymentStatus==="PAID"?t.totalCustomerDue:0,
      remaining:normalizedPaymentStatus==="PAID"?0:t.totalCustomerDue,
      paymentStatus:normalizedPaymentStatus==="PAID"?"PAID":"UNPAID"
    };
  });

  res.status(201).json(tx);
});

app.post("/api/customers/:id/payments", auth, requireIdempotencyKey, async (req,res)=>{
  try{
    const {amount,method="CASH",notes="",paymentDate="",reference=""}=req.body||{};
    const requested=Number(amount);
    if(!Number.isFinite(requested)||requested<=0){
      return res.status(400).json({message:"مبلغ الدفعة غير صحيح"});
    }

    const result=await mutateDurable((store)=>{
      const customer=store.customers.find(item=>item.id===req.params.id);
      if(!customer)throw new Error("العميل غير موجود");

      const rows=store.transactions
        .filter(item=>item.customerId===customer.id&&!item.isDeleted&&item.status!=="CANCELLED"&&isAfterCustomerReset(item,customer,"transferDate"))
        .sort((a,b)=>String(a.transferDate||a.createdAt||"").localeCompare(String(b.transferDate||b.createdAt||"")))
        .map(transaction=>{
          const paid=store.payments
            .filter(payment=>payment.transactionId===transaction.id&&!payment.isDeleted&&isAfterCustomerReset(payment,customer,"paymentDate"))
            .reduce((sum,payment)=>sum+Number(payment.amount||0),0);
          return {transaction,remaining:Math.max(Number(transaction.totalCustomerDue||0)-paid,0)};
        })
        .filter(row=>row.remaining>0.0001);

      const totalRemaining=rows.reduce((sum,row)=>sum+row.remaining,0);
      const storedOldBalance=Math.max(safeNumber(customer.oldBalance),0);
      const legacyOldBalancePaid=Math.min(Math.max(safeNumber(customer.oldBalancePaid),0),storedOldBalance);
      const oldBalanceType=String(customer.oldBalanceType||"RECEIVABLE").toUpperCase()==="PAYABLE"?"PAYABLE":"RECEIVABLE";
      const oldBalanceRemaining=oldBalanceType==="RECEIVABLE"?Math.max(storedOldBalance-legacyOldBalancePaid,0):0;
      // توحيد السجلات القديمة: نخزن من الآن فصاعدًا الرصيد الافتتاحي المتبقي مباشرة.
      if(!Number.isFinite(Number(customer.openingBalanceInitial))){
        customer.openingBalanceInitial=+storedOldBalance.toFixed(2);
      }
      if(oldBalanceType==="RECEIVABLE") customer.oldBalance=+oldBalanceRemaining.toFixed(2);
      else customer.oldBalance=+storedOldBalance.toFixed(2);
      customer.oldBalancePaid=0;
      const grandRemaining=totalRemaining+oldBalanceRemaining;

      if(grandRemaining<=0)throw new Error("لا يوجد رصيد مستحق على العميل");
      if(requested>grandRemaining+0.001){
        throw new Error(`الدفعة أكبر من الرصيد المتبقي (${grandRemaining.toFixed(2)} CAD)`);
      }

      let left=requested;
      const allocations=[];
      const paymentBatchId=id();
      const createdAt=now();
      const effectivePaymentDate=paymentDate||new Date().toISOString().slice(0,10);
      let oldBalanceAllocation=0;
      // أولًا: تسديد أقدم الحوالات المستحقة.
      for(const row of rows){
        if(left<=0.0001)break;
        const allocated=Math.min(left,row.remaining);
        const payment={
          id:id(),
          transactionId:row.transaction.id,
          customerId:customer.id,
          amount:+allocated.toFixed(2),
          method,
          notes,
          reference,
          paymentDate:effectivePaymentDate,
          date:createdAt,
          receivedBy:req.user.id,
          isDeleted:false,
          allocationMode:"CUSTOMER_AUTO",
          recordType:"PAYMENT_ALLOCATION",
          paymentBatchId
        };
        store.payments.push(payment);
        allocations.push(payment);
        left-=allocated;
      }
      // ثانيًا: إذا بقي جزء من الدفعة بعد تسديد الحوالات، يخصم من الحساب القديم.
      if(oldBalanceRemaining>0&&left>0.0001){
        oldBalanceAllocation=Math.min(left,oldBalanceRemaining);
        customer.oldBalance=+Math.max(oldBalanceRemaining-oldBalanceAllocation,0).toFixed(2);
        customer.oldBalancePaid=0;
        left-=oldBalanceAllocation;
      }

      const allocatedToTransactions=allocations.reduce((sum,item)=>sum+safeNumber(item.amount),0);
      // Financial integrity: the receipt must be fully allocated between transfers and old balance.
      assertBalancedEntry([
        {account:"CUSTOMER_PAYMENT_RECEIPT",debit:+requested.toFixed(2)},
        {account:"TRANSFER_ALLOCATIONS",credit:+allocatedToTransactions.toFixed(2)},
        {account:"OLD_BALANCE_ALLOCATION",credit:+oldBalanceAllocation.toFixed(2)}
      ]);

      const receipt={
        id:id(),
        transactionId:null,
        customerId:customer.id,
        amount:+requested.toFixed(2),
        originalAmount:+requested.toFixed(2),
        oldBalanceAllocation:+oldBalanceAllocation.toFixed(2),
        oldBalanceBefore:+oldBalanceRemaining.toFixed(2),
        oldBalanceAfter:+Math.max(oldBalanceRemaining-oldBalanceAllocation,0).toFixed(2),
        method,
        notes,
        reference,
        paymentDate:effectivePaymentDate,
        date:createdAt,
        receivedBy:req.user.id,
        isDeleted:false,
        recordType:"CUSTOMER_PAYMENT_RECEIPT",
        paymentBatchId,
        allocations:allocations.map(item=>({transactionId:item.transactionId,amount:item.amount}))
      };
      store.payments.push(receipt);

      audit(store,req.user.id,"PAYMENT","CUSTOMER",customer.id,{
        paymentId:receipt.id,
        paymentBatchId,
        amount:+requested.toFixed(2),
        oldBalanceAllocation:+oldBalanceAllocation.toFixed(2),
        allocations:receipt.allocations
      });

      return {customerId:customer.id,payment:receipt,amount:+requested.toFixed(2),oldBalanceAllocation:+oldBalanceAllocation.toFixed(2),allocations};
    });

    res.status(201).json(result);
  }catch(error){
    res.status(400).json({message:error.message||"تعذر إضافة الدفعة"});
  }
});

app.post("/api/transactions/:id/payments", auth, requireIdempotencyKey, async (req,res)=>{
  try{
    const {amount,method="CASH",notes="",paymentDate="",reference=""}=req.body||{};
    const n=Number(amount);
    if(!Number.isFinite(n)||n<=0)return res.status(400).json({message:"Invalid amount"});

    const payment=await mutateDurable((s)=>{
      const t=s.transactions.find(x=>x.id===req.params.id);
      if(!t)throw new Error("Transaction not found");
      const already=s.payments.filter(p=>p.transactionId===t.id&&!p.isDeleted).reduce((a,p)=>a+Number(p.amount),0);
      const remaining=Math.max(Number(t.totalCustomerDue)-already,0);
      if(n>remaining+0.001)throw new Error("Payment exceeds remaining balance");
      const p={
        id:id(),
        transactionId:t.id,
        amount:+n.toFixed(2),
        method,
        notes,
        reference,
        paymentDate:paymentDate||new Date().toISOString().slice(0,10),
        date:now(),
        receivedBy:req.user.id,
        isDeleted:false
      };
      s.payments.push(p);
      audit(s,req.user.id,"PAYMENT","TRANSACTION",t.id,{amount:n,remainingBefore:+remaining.toFixed(2)});
      return p;
    });

    res.status(201).json(payment);
  }catch(error){
    const message=String(error?.message||"تعذر إضافة الدفعة");
    const status=(message==="Transaction not found")?404:400;
    res.status(status).json({message});
  }
});

app.patch("/api/transactions/:id", auth, requireIdempotencyKey, async (req,res)=>{
  try{
    // Soft-delete uses PATCH intentionally. In production the normal PATCH
    // durable-write path is stable, while some proxies/connections were
    // repeatedly aborting HTTP DELETE requests. Since deletion is logical
    // (isDeleted=true), PATCH is also the correct state-transition semantics.
    if(req.body?._softDelete===true){
      const deleted=await mutateDurable((state)=>{
        const transaction=state.transactions.find(item=>item.id===req.params.id&&!item.isDeleted);
        if(!transaction)return null;
        const deletedAt=now();
        const reason=String(req.body?.reason||"حذف الحوالة");
        markSoftDeleted(transaction,{userId:req.user.id,reason,at:deletedAt});
        for(const payment of state.payments||[]){
          if(payment.transactionId===transaction.id&&!payment.isDeleted){
            markSoftDeleted(payment,{userId:req.user.id,reason:"حذف تابع لحوالة محذوفة",at:deletedAt});
          }
        }
        audit(state,req.user.id,"DELETE","TRANSACTION",transaction.id,{softDelete:true,transport:"PATCH"});
        return {id:transaction.id,number:transaction.number};
      });
      if(!deleted)return res.status(404).json({message:"الحوالة غير موجودة أو محذوفة مسبقًا"});
      return res.json({success:true,id:deleted.id,message:"تم حذف الحوالة بنجاح",committed:true});
    }

    const updated=await mutateDurable((s)=>{
      const transaction=s.transactions.find(item=>item.id===req.params.id&&!item.isDeleted);
      if(!transaction)return null;

      const allowed=["currency","amount","costRate","finalRate","transferFee","feeMethod","transferDate","status","rateSource","rateUpdatedAt"];
      const oldData={...transaction};

      for(const key of allowed){
        if(req.body[key]!==undefined)transaction[key]=req.body[key];
      }

      const amount=Number(transaction.amount);
      const cost=Number(transaction.costRate);
      const finalRate=Number(transaction.finalRate);
      const fee=Number(transaction.transferFee||0);

      if(![amount,cost,finalRate,fee].every(Number.isFinite)||amount<=0||cost<=0||finalRate<=0||fee<0){
        throw new Error("قيم الحوالة غير صحيحة");
      }

      const baseCustomerDue=amount*finalRate;
      const exchangeProfit=amount*(finalRate-cost);

      transaction.currency=String(transaction.currency||"USD").toUpperCase();
      transaction.direction=`${transaction.currency}_TO_CAD`;
      transaction.destinationAmount=+amount.toFixed(2);
      transaction.beneficiaryReceives=+(transaction.feeMethod==="DEDUCT"?Math.max(amount-fee,0):amount).toFixed(2);
      transaction.exchangeProfit=+exchangeProfit.toFixed(2);
      transaction.totalProfit=+(exchangeProfit+fee).toFixed(2);
      transaction.totalCustomerDue=+(transaction.feeMethod==="ADD"?baseCustomerDue+fee:baseCustomerDue).toFixed(2);
      assertBalancedEntry([
        {account:"CUSTOMER_RECEIVABLE",debit:transaction.totalCustomerDue},
        {account:"TRANSFER_BASE_DUE",credit:+baseCustomerDue.toFixed(2)},
        {account:"TRANSFER_FEE_ADDED",credit:transaction.feeMethod==="ADD"?+fee.toFixed(2):0}
      ]);
      transaction.updatedAt=now();
      transaction.updatedBy=req.user.id;

      const paid=s.payments
        .filter(p=>p.transactionId===transaction.id&&!p.isDeleted)
        .reduce((sum,p)=>sum+Number(p.amount||0),0);
      if(paid>transaction.totalCustomerDue+0.001){
        throw new Error("لا يمكن جعل إجمالي الحوالة أقل من الدفعات المسجلة");
      }

      audit(s,req.user.id,"UPDATE","TRANSACTION",transaction.id,{before:oldData,after:{...transaction},ip:req.ip,branchId:req.user.branchId,branchName:req.user.branchName});
      return transaction;
    });

    if(!updated)return res.status(404).json({message:"الحوالة غير موجودة"});
    res.json(updated);
  }catch(error){
    if(isTransientDatabaseError(error)||Number(error?.status||error?.statusCode||0)===503){
      return res.status(503).json({
        code:"DATABASE_TEMPORARILY_UNAVAILABLE",
        retryable:true,
        message:error?.publicMessage||"تعذر تنفيذ التعديل الآن لأن قاعدة البيانات غير جاهزة. لم يتم تأكيد أي تغيير."
      });
    }
    res.status(400).json({message:error.message||"تعذر تعديل الحوالة"});
  }
});

app.delete("/api/transactions/:id", auth, requireIdempotencyKey, async (req,res)=>{
  try{
    const deleted=await mutateDurable((s)=>{
      const transaction=s.transactions.find(item=>item.id===req.params.id&&!item.isDeleted);
      if(!transaction)return null;
      const deletedAt=now();
      markSoftDeleted(transaction,{userId:req.user.id,reason:req.body?.reason||"حذف الحوالة",at:deletedAt});

      for(const payment of s.payments){
        if(payment.transactionId===transaction.id&&!payment.isDeleted){
          markSoftDeleted(payment,{userId:req.user.id,reason:req.body?.reason||"حذف تابع لحوالة محذوفة",at:deletedAt});
        }
      }

      audit(s,req.user.id,"DELETE","TRANSACTION",transaction.id,{softDelete:true});
      return {id:transaction.id,number:transaction.number};
    });

    if(!deleted)return res.status(404).json({message:"الحوالة غير موجودة أو محذوفة مسبقًا"});
    // mutateDurable resolves only after PostgreSQL COMMIT succeeds. A second
    // in-memory verification here was redundant and could turn a committed
    // delete into a false 500 response while the request context was changing.
    res.json({success:true,id:deleted.id,message:"تم حذف الحوالة بنجاح",committed:true});
  }catch(error){
    console.error("Delete transaction failed:",error);
    if(isTransientDatabaseError(error)||Number(error?.status||error?.statusCode||0)===503){
      return res.status(503).json({
        code:"DATABASE_TEMPORARILY_UNAVAILABLE",
        retryable:true,
        message:error?.publicMessage||"تعذر تنفيذ الحذف الآن لأن قاعدة البيانات غير جاهزة. لم يتم تأكيد أي تغيير."
      });
    }
    res.status(error?.statusCode||error?.status||500).json({message:error?.message||"تعذر حذف الحوالة"});
  }
});

app.patch("/api/payments/:id", auth, requireIdempotencyKey, async (req,res)=>{
  try{
    const updated=await mutateDurable((s)=>{
      const payment=s.payments.find(item=>item.id===req.params.id&&!item.isDeleted);
      if(!payment)return null;

      if(payment.recordType==="CUSTOMER_PAYMENT_RECEIPT" || payment.paymentBatchId){
        const batchId=payment.paymentBatchId;
        const batchRows=(s.payments||[]).filter(item=>!item.isDeleted&&(
          (batchId&&item.paymentBatchId===batchId) || item.id===payment.id
        ));
        const receipt=batchRows.find(item=>item.recordType==="CUSTOMER_PAYMENT_RECEIPT")||payment;
        if(req.body.amount!==undefined && Math.abs(Number(req.body.amount)-safeNumber(receipt.originalAmount,receipt.amount))>0.001){
          throw new Error("لا يمكن تغيير مبلغ دفعة موزعة. احذف الدفعة وسجلها من جديد.");
        }
        for(const item of batchRows){
          if(req.body.method!==undefined)item.method=req.body.method;
          if(req.body.notes!==undefined)item.notes=req.body.notes;
          if(req.body.reference!==undefined)item.reference=req.body.reference;
          if(req.body.paymentDate!==undefined)item.paymentDate=req.body.paymentDate;
          item.updatedAt=now();
          item.updatedBy=req.user.id;
        }
        audit(s,req.user.id,"UPDATE","PAYMENT",receipt.id,{paymentBatchId:batchId,newData:{...receipt}});
        return {...receipt,amount:+safeNumber(receipt.originalAmount,receipt.amount).toFixed(2)};
      }

      const transaction=s.transactions.find(item=>item.id===payment.transactionId&&!item.isDeleted);
      if(!transaction)throw new Error("الحوالة غير موجودة");
      const oldData={...payment};
      if(req.body.amount!==undefined)payment.amount=Number(req.body.amount);
      if(req.body.method!==undefined)payment.method=req.body.method;
      if(req.body.notes!==undefined)payment.notes=req.body.notes;
      if(req.body.reference!==undefined)payment.reference=req.body.reference;
      if(req.body.paymentDate!==undefined)payment.paymentDate=req.body.paymentDate;
      if(!Number.isFinite(payment.amount)||payment.amount<=0)throw new Error("مبلغ الدفعة غير صحيح");
      const totalPaid=s.payments
        .filter(item=>item.transactionId===transaction.id&&!item.isDeleted&&item.recordType!=="CUSTOMER_PAYMENT_RECEIPT")
        .reduce((sum,item)=>sum+Number(item.amount||0),0);
      if(totalPaid>Number(transaction.totalCustomerDue)+0.001)throw new Error("إجمالي الدفعات أكبر من رصيد الحوالة");
      payment.updatedAt=now();
      payment.updatedBy=req.user.id;
      audit(s,req.user.id,"UPDATE","PAYMENT",payment.id,{oldData,newData:{...payment}});
      return payment;
    });
    if(!updated)return res.status(404).json({message:"الدفعة غير موجودة"});
    res.json(updated);
  }catch(error){
    res.status(400).json({message:error.message||"تعذر تعديل الدفعة"});
  }
});

app.delete("/api/payments/:id", auth, requireIdempotencyKey, async (req,res)=>{
  const deleted=await mutateDurable((s)=>{
    const payment=s.payments.find(item=>item.id===req.params.id&&!item.isDeleted);
    if(!payment)return null;
    const batchId=payment.paymentBatchId;
    const targets=(batchId
      ? s.payments.filter(item=>!item.isDeleted&&item.paymentBatchId===batchId)
      : [payment]);
    for(const item of targets){
      markSoftDeleted(item,{userId:req.user.id,reason:req.body?.reason||"حذف الدفعة",at:now()});
    }
    if(payment.recordType==="CUSTOMER_PAYMENT_RECEIPT"&&safeNumber(payment.oldBalanceAllocation)>0){
      const customer=s.customers.find(item=>item.id===payment.customerId);
      if(customer){
        const stored=Math.max(safeNumber(customer.oldBalance),0);
        const legacyPaid=Math.min(Math.max(safeNumber(customer.oldBalancePaid),0),stored);
        const current=Math.max(stored-legacyPaid,0);
        customer.oldBalance=+(current+safeNumber(payment.oldBalanceAllocation)).toFixed(2);
        customer.oldBalancePaid=0;
      }
    }
    audit(s,req.user.id,"DELETE","PAYMENT",payment.id,{softDelete:true,paymentBatchId:batchId,deletedCount:targets.length});
    return payment;
  });
  if(!deleted)return res.status(404).json({message:"الدفعة غير موجودة"});
  res.json({message:"تم حذف الدفعة كاملة مع توزيعها"});
});



const GLOBAL_USD_RATE_CODES = [
  "CAD","EUR","GBP","TRY","SYP","SAR","AED","JOD","LBP","EGP","IQD",
  "KWD","QAR","BHD","OMR","CHF","AUD","NZD","CNY","JPY","INR","SEK","NOK"
];

const TROY_OUNCE_GRAMS = 31.1034768;
const GOLD_KARATS = [
  ["XAU24", 24/24],
  ["XAU22", 22/24],
  ["XAU21", 21/24],
  ["XAU18", 18/24]
];

async function fetchOfficialRate(baseCurrency, quoteCurrency) {
  const url = `https://api.frankfurter.dev/v2/rate/${encodeURIComponent(baseCurrency)}/${encodeURIComponent(quoteCurrency)}`;
  const response = await fetch(url, {
    headers: { "Accept": "application/json", "User-Agent": "AlAboud-Cloud/16.0.7" }
  });
  if (!response.ok) throw new Error(`Rate provider returned ${response.status}`);
  const data = await response.json();
  const rate = Number(data.rate);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Invalid rate received");
  return { rate, date: data.date || new Date().toISOString().slice(0,10) };
}

async function fetchGlobalUsdRates() {
  const response = await fetch("https://open.er-api.com/v6/latest/USD", {
    headers: { "Accept": "application/json", "User-Agent": "AlAboud-Cloud/24.0.8" }
  });
  if (!response.ok) throw new Error(`Global rate provider returned ${response.status}`);
  const data = await response.json();
  if (data.result !== "success") throw new Error(data["error-type"] || "Global USD feed failed");
  const rates = {};
  for (const code of GLOBAL_USD_RATE_CODES) {
    const value = Number(data.rates?.[code]);
    if (Number.isFinite(value) && value > 0) rates[code] = value;
  }
  if (!Object.keys(rates).length) throw new Error("Global USD rates are unavailable");
  return { rates, updatedAt:data.time_last_update_utc || new Date().toISOString(), nextUpdate:data.time_next_update_utc || null };
}

async function fetchGoldPriceCad() {
  const response = await fetch("https://api.gold-api.com/price/XAU/CAD", {
    headers: { "Accept": "application/json", "User-Agent": "AlAboud-Cloud/16.0.7" }
  });
  if (!response.ok) throw new Error(`Gold provider returned ${response.status}`);
  const data = await response.json();
  const pricePerOunceCad = Number(data.price);
  if (!Number.isFinite(pricePerOunceCad) || pricePerOunceCad <= 0) {
    throw new Error("Gold price is unavailable");
  }
  return {
    pricePerOunceCad,
    updatedAt:data.updatedAt || new Date().toISOString()
  };
}

async function saveAutomaticRate({baseCurrency,quoteCurrency,rate,source,notes,sourceDate,userId}) {
  return await mutateDurable((store)=>{
    const x = {
      id:id(),
      baseCurrency,
      quoteCurrency,
      buyRate:rate,
      sellRate:rate,
      notes,
      source,
      sourceDate:sourceDate || new Date().toISOString(),
      isAutomatic:true,
      createdAt:now(),
      createdBy:userId
    };
    store.exchangeRates.push(x);
    audit(store,userId,"AUTO_REFRESH","EXCHANGE_RATE",x.id,{
      baseCurrency,quoteCurrency,rate,source
    });
    return x;
  });
}

async function refreshAutomaticRates(userId="SYSTEM") {
  const results = [];
  try {
    const globalFeed = await fetchGlobalUsdRates();
    for (const code of GLOBAL_USD_RATE_CODES) {
      const rate = globalFeed.rates[code];
      if (!rate) { results.push({ok:false,pair:`USD/${code}`,error:`${code} rate is unavailable`}); continue; }
      const saved = await saveAutomaticRate({
        baseCurrency:"USD", quoteCurrency:code, rate, source:"GLOBAL_USD_FEED",
        notes:`تحديث تلقائي عالمي لسعر USD/${code}`, sourceDate:globalFeed.updatedAt, userId
      });
      results.push({ok:true,pair:`USD/${code}`,rate:saved.buyRate,source:"GLOBAL_USD_FEED"});
    }
  } catch (error) {
    for (const code of GLOBAL_USD_RATE_CODES) results.push({ok:false,pair:`USD/${code}`,error:error.message});
  }

  try {
    const gold = await fetchGoldPriceCad();
    const pureGramCad = gold.pricePerOunceCad / TROY_OUNCE_GRAMS;
    for (const [baseCurrency, purity] of GOLD_KARATS) {
      const gramRate = +(pureGramCad * purity).toFixed(4);
      const saved = await saveAutomaticRate({ baseCurrency, quoteCurrency:"CAD", rate:gramRate, source:"GOLD_API", notes:`سعر غرام الذهب التلقائي — ${baseCurrency.replace("XAU","")} قيراط`, sourceDate:gold.updatedAt, userId });
      results.push({ok:true,pair:`${baseCurrency}/CAD`,rate:saved.buyRate,source:"GOLD_API"});
    }
  } catch (error) {
    for (const [baseCurrency] of GOLD_KARATS) results.push({ok:false,pair:`${baseCurrency}/CAD`,error:error.message});
  }
  return results;
}

app.get("/api/profits", auth, (req,res)=>{
  const s = readStore();
  const from = String(req.query.from || "");
  const to = String(req.query.to || "");
  const inRange = (iso) => {
    const d = String(iso || "").slice(0,10);
    return (!from || d >= from) && (!to || d <= to);
  };

  const transactions = s.transactions.filter((t)=>t&&!t.isDeleted&&t.status!=="CANCELLED" && inRange(t.transferDate||t.createdAt));
  const expenses = s.expenses.filter((e)=>e&&!e.isDeleted&&inRange(e.date || e.createdAt));

  const exchangeProfit = transactions.reduce((a,t)=>a+transactionFinancials(t).exchangeProfit,0);
  const transferFees = transactions.reduce((a,t)=>a+transactionFinancials(t).transferFee,0);
  const grossProfit = transactions.reduce((a,t)=>a+transactionFinancials(t).totalProfit,0);
  const totalExpenses = expenses.reduce((a,e)=>a+Number(e.cadAmount??e.amount??0),0);
  const netProfit = grossProfit-totalExpenses;

  const byMonthMap = {};
  for (const t of transactions) {
    const month = String(t.transferDate||t.createdAt||"").slice(0,7);
    byMonthMap[month] ||= {month,exchangeProfit:0,transferFees:0,grossProfit:0,expenses:0,netProfit:0};
    const financials=transactionFinancials(t);
    byMonthMap[month].exchangeProfit += financials.exchangeProfit;
    byMonthMap[month].transferFees += financials.transferFee;
    byMonthMap[month].grossProfit += financials.totalProfit;
  }
  for (const e of expenses) {
    const month = String(e.date || e.createdAt).slice(0,7);
    byMonthMap[month] ||= {month,exchangeProfit:0,transferFees:0,grossProfit:0,expenses:0,netProfit:0};
    byMonthMap[month].expenses += Number(e.cadAmount??e.amount??0);
  }
  const monthly = Object.values(byMonthMap)
    .map((x)=>({...x,
      exchangeProfit:+x.exchangeProfit.toFixed(2),
      transferFees:+x.transferFees.toFixed(2),
      grossProfit:+x.grossProfit.toFixed(2),
      expenses:+x.expenses.toFixed(2),
      netProfit:+(x.grossProfit-x.expenses).toFixed(2)
    }))
    .sort((a,b)=>b.month.localeCompare(a.month));

  res.json({
    from: from || null,
    to: to || null,
    transactionCount: transactions.length,
    exchangeProfit:+exchangeProfit.toFixed(2),
    transferFees:+transferFees.toFixed(2),
    grossProfit:+grossProfit.toFixed(2),
    expenses:+totalExpenses.toFixed(2),
    netProfit:+netProfit.toFixed(2),
    monthly,
    transactions: transactions.slice().reverse()
  });
});


app.post("/api/exchange-rates/refresh", auth, async (req,res)=>{
  try {
    const results = await refreshAutomaticRates(req.user.id);
    const successCount = results.filter(x=>x.ok).length;
    res.json({
      message:`تم تحديث ${successCount} من ${results.length} سعرًا عالميًا تلقائيًا، والدولار الأمريكي هو العملة الأساسية.`,
      successCount,
      total:results.length,
      updatedAt:now(),
      results
    });
  } catch (error) {
    res.status(502).json({message:"تعذر تحديث أسعار الصرف",error:error.message});
  }
});

app.get("/api/exchange-rates", auth, async (req,res)=>{
  const s = readStore();
  const rates=await branchSafeRead(req,"exchange-rates",()=>nativeRepositories.exchangeRates.listByCompany(req.user.companyId,{orderBy:"created_at DESC"}),()=>Array.from(s.exchangeRates));
  const latest = new Map();
  for (const rate of rates.slice().sort((a,b)=>String(b.createdAt||b.effectiveAt||"").localeCompare(String(a.createdAt||a.effectiveAt||"")))) {
    const key = `${rate.baseCurrency}_${rate.quoteCurrency}`;
    if (!latest.has(key)) latest.set(key, rate);
  }
  res.json(Array.from(latest.values()).sort((a,b)=>a.baseCurrency.localeCompare(b.baseCurrency)));
});

app.get("/api/exchange-rates/history", auth, async (req,res)=>{
  const s = readStore();
  const rates=await branchSafeRead(req,"exchange-rates-history",()=>nativeRepositories.exchangeRates.listByCompany(req.user.companyId,{orderBy:"created_at DESC"}),()=>Array.from(s.exchangeRates));
  const base = String(req.query.base || "");
  const quote = String(req.query.quote || "");
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const list = rates.filter((r)=>
    (!base || r.baseCurrency===base) &&
    (!quote || r.quoteCurrency===quote)
  ).sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||""))).slice(0,limit);
  res.json(list);
});

app.post("/api/exchange-rates", auth, async (req,res)=>{
  const {baseCurrency,quoteCurrency,buyRate,sellRate,notes=""}=req.body||{};
  const buy=Number(buyRate), sell=Number(sellRate);
  if(!baseCurrency||!quoteCurrency||baseCurrency===quoteCurrency||!Number.isFinite(buy)||!Number.isFinite(sell)||buy<=0||sell<=0){
    return res.status(400).json({message:"Invalid exchange rate"});
  }
  const rate=await mutateDurable((s)=>{
    const x={
      id:id(),
      baseCurrency:String(baseCurrency).toUpperCase(),
      quoteCurrency:String(quoteCurrency).toUpperCase(),
      buyRate:buy,
      sellRate:sell,
      notes,
      createdAt:now(),
      createdBy:req.user.id
    };
    s.exchangeRates.push(x);
    audit(s,req.user.id,"CREATE","EXCHANGE_RATE",x.id,{after:{...x},ip:req.ip,branchId:req.user.branchId,branchName:req.user.branchName});
    return x;
  });
  res.status(201).json(rate);
});


app.get("/api/general-debts", auth, async (req,res)=>{
  const store = readStore();
  const [debts,debtPayments,transactions,payments,customers]=await Promise.all([
    branchSafeRead(req,"debts",()=>nativeRepositories.debts.listByCompany(req.user.companyId,{orderBy:"created_at DESC"}),()=>Array.from(store.generalDebts||[])),
    branchSafeRead(req,"debt-payments",()=>nativeRepositories.debtPayments.listByCompany(req.user.companyId,{orderBy:"created_at DESC"}),()=>Array.from(store.generalDebtPayments||[])),
    branchSafeRead(req,"debt-transactions",()=>nativeRepositories.transactions.listByCompany(req.user.companyId,{orderBy:"created_at DESC",includeDeleted:false}),()=>Array.from(store.transactions||[]).filter(item=>item&&!item.isDeleted)),
    branchSafeRead(req,"debt-transaction-payments",()=>nativeRepositories.payments.listByCompany(req.user.companyId,{orderBy:"created_at DESC",includeDeleted:false}),()=>Array.from(store.payments||[]).filter(item=>item&&!item.isDeleted)),
    branchSafeRead(req,"debt-customers",()=>nativeRepositories.customers.listByCompany(req.user.companyId,{orderBy:"created_at DESC",includeDeleted:false}),()=>Array.from(store.customers||[]).filter(item=>item&&!item.isDeleted))
  ]);
  const type = String(req.query.type || "");

  const manualRows = debts.map((debt)=>{
    const paid = debtPayments
      .filter((payment)=>payment.debtId===debt.id)
      .reduce((sum,payment)=>sum+safeNumber(payment.amount),0);
    const amount = safeNumber(debt.amount);
    const remaining = Math.max(amount-paid,0);
    let status = debt.status || "OPEN";
    if (remaining <= 0) status = "PAID";
    else if (paid > 0) status = "PARTIAL";
    else if (debt.dueDate && debt.dueDate < new Date().toISOString().slice(0,10)) status = "OVERDUE";

    return {
      ...debt,
      source:"MANUAL",
      paid:+paid.toFixed(2),
      remaining:+remaining.toFixed(2),
      status,
    };
  });

  // أرصدة الحساب القديم للعملاء تُعد دينًا لنا وتدخل في مجموع الدين العام.
  // لا ننشئ سجلاً دائمًا جديدًا حتى لا يحدث تكرار؛ بل نشتق الرصيد مباشرة من بيانات العميل.
  const customerOldBalanceRows = customers.map((customer)=>{
    if (!customer || customer.isDeleted) return null;
    const resetTime=recordTime(customer.accountResetAt);
    const openingUpdatedTime=recordTime(customer.openingBalanceUpdatedAt);
    if(resetTime && openingUpdatedTime < resetTime) return null;
    const storedAmount = Math.max(safeNumber(customer.oldBalance), 0);
    const legacyPaid = Math.min(Math.max(safeNumber(customer.oldBalancePaid), 0), storedAmount);
    const remaining = Math.max(storedAmount-legacyPaid, 0);
    const amount = remaining;
    const paid = 0;
    if (remaining <= 0.001) return null;
    return {
      id:`CUSTOMER_OLD_BALANCE:${customer.id}`,
      type:String(customer.oldBalanceType||"RECEIVABLE").toUpperCase()==="PAYABLE"?"PAYABLE":"RECEIVABLE",
      partyName:String(customer.name || "عميل بدون اسم"),
      amount:+amount.toFixed(2),
      currency:"CAD",
      dueDate:String(customer.createdAt || "").slice(0,10),
      description:String(customer.oldBalanceType||"RECEIVABLE").toUpperCase()==="PAYABLE"?"الحساب القديم — له":"الحساب القديم — عليه",
      reference:String(customer.oldBalanceType||"RECEIVABLE").toUpperCase()==="PAYABLE"?"حساب قديم له":"حساب قديم عليه",
      status:paid>0?"PARTIAL":"OPEN",
      source:"CUSTOMER_OLD_BALANCE",
      customerId:customer.id,
      createdAt:customer.updatedAt || customer.createdAt || now(),
      paid:+paid.toFixed(2),
      remaining:+remaining.toFixed(2),
    };
  }).filter(Boolean);

  const paidByTransaction = new Map();
  for (const payment of payments) {
    paidByTransaction.set(
      payment.transactionId,
      safeNumber(paidByTransaction.get(payment.transactionId)) + safeNumber(payment.amount)
    );
  }

  const transferRows = transactions.map((transaction)=>{
    const amount = transactionFinancials(transaction).totalCustomerDue;
    const paid = safeNumber(paidByTransaction.get(transaction.id));
    const remaining = Math.max(amount-paid,0);
    if (remaining <= 0.001) return null;
    const customer = customers.find((item)=>item.id===transaction.customerId);
    const transferDate = String(transaction.transferDate || transaction.createdAt || "").slice(0,10);
    return {
      id:`TRANSFER:${transaction.id}`,
      type:"RECEIVABLE",
      partyName:customer?.name || "عميل بدون اسم",
      amount:+amount.toFixed(2),
      currency:"CAD",
      dueDate:transferDate,
      description:`حوالة غير مدفوعة ${transaction.number || ""}`.trim(),
      reference:transaction.number || "",
      status:paid>0?"PARTIAL":"OPEN",
      source:"TRANSFER",
      transactionId:transaction.id,
      customerId:transaction.customerId,
      createdAt:transaction.createdAt || transaction.transferDate || now(),
      paid:+paid.toFixed(2),
      remaining:+remaining.toFixed(2),
    };
  }).filter(Boolean);

  const partners = Array.isArray(store.partners) ? store.partners : [];
  const partnerTransactions = Array.isArray(store.partnerTransactions) ? store.partnerTransactions : [];
  const partnerPayments = Array.isArray(store.partnerPayments) ? store.partnerPayments : [];
  const partnerRows = [];

  for (const partner of partners) {
    const transactionsForPartner = partnerTransactions.filter((item)=>item.partnerId===partner.id);
    const paymentsForPartner = partnerPayments.filter((item)=>item.partnerId===partner.id);
    const currencies = new Set([
      ...transactionsForPartner.map((item)=>String(item.currency||"CAD").toUpperCase()),
      ...paymentsForPartner.map((item)=>String(item.currency||"CAD").toUpperCase())
    ]);

    for (const currency of currencies) {
      const receivable = transactionsForPartner
        .filter((item)=>item.type==="RECEIVABLE" && String(item.currency||"CAD").toUpperCase()===currency)
        .reduce((sum,item)=>sum+safeNumber(item.amount),0);
      const payable = transactionsForPartner
        .filter((item)=>item.type==="PAYABLE" && String(item.currency||"CAD").toUpperCase()===currency)
        .reduce((sum,item)=>sum+safeNumber(item.amount),0);
      const received = paymentsForPartner
        .filter((item)=>item.direction==="RECEIVED" && String(item.currency||"CAD").toUpperCase()===currency)
        .reduce((sum,item)=>sum+safeNumber(item.amount),0);
      const paid = paymentsForPartner
        .filter((item)=>item.direction==="PAID" && String(item.currency||"CAD").toUpperCase()===currency)
        .reduce((sum,item)=>sum+safeNumber(item.amount),0);

      const receivableRemaining = Math.max(receivable-received,0);
      const payableRemaining = Math.max(payable-paid,0);
      if (receivableRemaining>0.001) partnerRows.push({
        id:`PARTNER:RECEIVABLE:${partner.id}:${currency}`,
        type:"RECEIVABLE", partyName:partner.name, amount:+receivable.toFixed(2),
        paid:+received.toFixed(2), remaining:+receivableRemaining.toFixed(2), currency,
        dueDate:"", description:"رصيد شركة مرتبط", reference:partner.integrationName||partner.name,
        status:received>0?"PARTIAL":"OPEN", source:"PARTNER", partnerId:partner.id,
        createdAt:partner.updatedAt||partner.createdAt||now()
      });
      if (payableRemaining>0.001) partnerRows.push({
        id:`PARTNER:PAYABLE:${partner.id}:${currency}`,
        type:"PAYABLE", partyName:partner.name, amount:+payable.toFixed(2),
        paid:+paid.toFixed(2), remaining:+payableRemaining.toFixed(2), currency,
        dueDate:"", description:"رصيد شركة مرتبط", reference:partner.integrationName||partner.name,
        status:paid>0?"PARTIAL":"OPEN", source:"PARTNER", partnerId:partner.id,
        createdAt:partner.updatedAt||partner.createdAt||now()
      });
    }

    // أرصدة الشركات الخارجية متعددة العملات تظهر في الدين العام حسب العملة الأصلية لكل رصيد.
    // externalBalances مثال: { USD:{receivable,payable,balance}, EUR:{...} }
    const externalCreatedAt = partner.lastSyncAt || partner.updatedAt || partner.createdAt || now();
    const multiCurrencyBalances = partner.externalBalances && typeof partner.externalBalances === "object"
      ? partner.externalBalances
      : null;
    const multiEntries = multiCurrencyBalances
      ? Object.entries(multiCurrencyBalances).filter(([currency,value])=>currency && value && typeof value === "object")
      : [];

    if (multiEntries.length) {
      for (const [rawCurrency, value] of multiEntries) {
        const currency = String(rawCurrency || "USD").toUpperCase();
        const receivable = Math.max(safeNumber(value.receivable), 0);
        const payable = Math.max(safeNumber(value.payable), 0);
        if (receivable > 0.001) partnerRows.push({
          id:`PARTNER:EXTERNAL:RECEIVABLE:${partner.id}:${currency}`,
          type:"RECEIVABLE", partyName:partner.name, amount:+receivable.toFixed(2), paid:0,
          remaining:+receivable.toFixed(2), currency, dueDate:"",
          description:`دين لنا من الرصيد الخارجي لشركة ${partner.name}`,
          reference:partner.integrationName || partner.name, status:"OPEN", source:"PARTNER_EXTERNAL",
          partnerId:partner.id, createdAt:externalCreatedAt, lastSyncAt:partner.lastSyncAt || null
        });
        if (payable > 0.001) partnerRows.push({
          id:`PARTNER:EXTERNAL:PAYABLE:${partner.id}:${currency}`,
          type:"PAYABLE", partyName:partner.name, amount:+payable.toFixed(2), paid:0,
          remaining:+payable.toFixed(2), currency, dueDate:"",
          description:`دين علينا من الرصيد الخارجي لشركة ${partner.name}`,
          reference:partner.integrationName || partner.name, status:"OPEN", source:"PARTNER_EXTERNAL",
          partnerId:partner.id, createdAt:externalCreatedAt, lastSyncAt:partner.lastSyncAt || null
        });
      }
    } else {
      // توافق مع السجلات القديمة ذات العملة الواحدة.
      const externalCurrency = String(partner.accountCurrency || "USD").toUpperCase();
      const externalReceivable = Math.max(safeNumber(partner.externalReceivable), 0);
      const externalPayable = Math.max(safeNumber(partner.externalPayable), 0);
      const hasDetailedExternalDebt = externalReceivable > 0.001 || externalPayable > 0.001;
      if (externalReceivable > 0.001) partnerRows.push({
        id:`PARTNER:EXTERNAL:RECEIVABLE:${partner.id}:${externalCurrency}`, type:"RECEIVABLE",
        partyName:partner.name, amount:+externalReceivable.toFixed(2), paid:0, remaining:+externalReceivable.toFixed(2),
        currency:externalCurrency, dueDate:"", description:`دين لنا من الرصيد الخارجي لشركة ${partner.name}`,
        reference:partner.integrationName || partner.name, status:"OPEN", source:"PARTNER_EXTERNAL",
        partnerId:partner.id, createdAt:externalCreatedAt, lastSyncAt:partner.lastSyncAt || null
      });
      if (externalPayable > 0.001) partnerRows.push({
        id:`PARTNER:EXTERNAL:PAYABLE:${partner.id}:${externalCurrency}`, type:"PAYABLE",
        partyName:partner.name, amount:+externalPayable.toFixed(2), paid:0, remaining:+externalPayable.toFixed(2),
        currency:externalCurrency, dueDate:"", description:`دين علينا من الرصيد الخارجي لشركة ${partner.name}`,
        reference:partner.integrationName || partner.name, status:"OPEN", source:"PARTNER_EXTERNAL",
        partnerId:partner.id, createdAt:externalCreatedAt, lastSyncAt:partner.lastSyncAt || null
      });
      if (!hasDetailedExternalDebt) {
        const externalBalance = safeNumber(partner.externalBalance);
        if (Math.abs(externalBalance) > 0.001) {
          const externalType = externalBalance < 0 ? "PAYABLE" : "RECEIVABLE";
          const externalAmount = Math.abs(externalBalance);
          partnerRows.push({
            id:`PARTNER:EXTERNAL:BALANCE:${partner.id}:${externalCurrency}`, type:externalType,
            partyName:partner.name, amount:+externalAmount.toFixed(2), paid:0, remaining:+externalAmount.toFixed(2),
            currency:externalCurrency, dueDate:"", description:`الرصيد الخارجي لشركة ${partner.name}`,
            reference:partner.integrationName || partner.name, status:"OPEN", source:"PARTNER_EXTERNAL",
            partnerId:partner.id, createdAt:externalCreatedAt, lastSyncAt:partner.lastSyncAt || null
          });
        }
      }
    }
  }

  const rows = [...manualRows, ...customerOldBalanceRows, ...transferRows, ...partnerRows]
    .filter((debt)=>!type || debt.type===type)
    .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));

  const totalsByCurrency = {};
  for (const row of rows) {
    const currency = String(row.currency || "CAD").toUpperCase();
    if (!totalsByCurrency[currency]) totalsByCurrency[currency] = {receivable:0,payable:0,net:0};
    if (row.type==="RECEIVABLE") totalsByCurrency[currency].receivable += safeNumber(row.remaining);
    if (row.type==="PAYABLE") totalsByCurrency[currency].payable += safeNumber(row.remaining);
    totalsByCurrency[currency].net = totalsByCurrency[currency].receivable - totalsByCurrency[currency].payable;
  }
  for (const currency of Object.keys(totalsByCurrency)) {
    totalsByCurrency[currency] = {
      receivable:+totalsByCurrency[currency].receivable.toFixed(2),
      payable:+totalsByCurrency[currency].payable.toFixed(2),
      net:+totalsByCurrency[currency].net.toFixed(2),
    };
  }

  // Convert every currency total to the requested base currency for the top summary cards.
  // Latest exchange rates are treated as quote units per 1 base unit.
  const summaryCurrency = String(req.query.summaryCurrency || "CAD").toUpperCase();
  const latestRates = new Map();
  for (const rate of (Array.isArray(store.exchangeRates) ? store.exchangeRates : [])
    .slice().sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")))) {
    const base = String(rate.baseCurrency || "").toUpperCase();
    const quote = String(rate.quoteCurrency || "").toUpperCase();
    if (!base || !quote || base===quote) continue;
    const key = `${base}_${quote}`;
    if (!latestRates.has(key)) latestRates.set(key, rate);
  }

  const graph = new Map();
  const addEdge = (from,to,factor,sourceUpdatedAt)=>{
    if (!from || !to || !Number.isFinite(factor) || factor<=0) return;
    if (!graph.has(from)) graph.set(from,[]);
    graph.get(from).push({to,factor,sourceUpdatedAt});
  };
  for (const rate of latestRates.values()) {
    const base = String(rate.baseCurrency || "").toUpperCase();
    const quote = String(rate.quoteCurrency || "").toUpperCase();
    const direct = safeNumber(rate.sellRate, rate.buyRate);
    if (direct>0) {
      addEdge(base,quote,direct,rate.createdAt||null);
      addEdge(quote,base,1/direct,rate.createdAt||null);
    }
  }

  const findConversion = (from,to)=>{
    if (from===to) return {factor:1,path:[from],updatedAt:null};
    const queue=[{currency:from,factor:1,path:[from],updatedAt:null}];
    const seen=new Set([from]);
    while(queue.length){
      const current=queue.shift();
      for(const edge of (graph.get(current.currency)||[])){
        if(seen.has(edge.to)) continue;
        const next={
          currency:edge.to,
          factor:current.factor*edge.factor,
          path:[...current.path,edge.to],
          updatedAt:[current.updatedAt,edge.sourceUpdatedAt].filter(Boolean).sort().pop()||null
        };
        if(edge.to===to) return next;
        seen.add(edge.to);
        queue.push(next);
      }
    }
    return null;
  };

  let convertedReceivable=0;
  let convertedPayable=0;
  const conversionDetails={};
  const missingRates=[];
  let ratesUpdatedAt=null;
  for (const [currency,total] of Object.entries(totalsByCurrency)) {
    const conversion=findConversion(currency,summaryCurrency);
    if (!conversion) {
      missingRates.push(currency);
      conversionDetails[currency]={available:false,from:currency,to:summaryCurrency};
      continue;
    }
    const receivable=safeNumber(total.receivable)*conversion.factor;
    const payable=safeNumber(total.payable)*conversion.factor;
    convertedReceivable+=receivable;
    convertedPayable+=payable;
    if(conversion.updatedAt && (!ratesUpdatedAt || conversion.updatedAt>ratesUpdatedAt)) ratesUpdatedAt=conversion.updatedAt;
    conversionDetails[currency]={
      available:true,
      from:currency,
      to:summaryCurrency,
      factor:+conversion.factor.toFixed(8),
      path:conversion.path,
      receivable:+receivable.toFixed(2),
      payable:+payable.toFixed(2),
      net:+(receivable-payable).toFixed(2),
      updatedAt:conversion.updatedAt
    };
  }

  // Use one authoritative customer-balance calculation everywhere. customerSummary
  // already includes the customer's opening balance, transfers and payments, so
  // summing CUSTOMER_OLD_BALANCE and TRANSFER rows again would double-count debt.
  const authoritativeCustomerBalancesCad=customerBalanceTotals(store);
  const customerConversion=findConversion("CAD",summaryCurrency);
  const authoritativeCustomerReceivable=customerConversion
    ? safeNumber(authoritativeCustomerBalancesCad.receivable)*customerConversion.factor
    : 0;
  const authoritativeCustomerPayable=customerConversion
    ? safeNumber(authoritativeCustomerBalancesCad.payable)*customerConversion.factor
    : 0;

  // Company debt comes only from partner/company rows. It is kept separate from
  // customer debt and is converted using the same exchange-rate graph.
  let companyReceivable=0;
  let companyPayable=0;
  for(const row of partnerRows){
    const currency=String(row.currency||"CAD").toUpperCase();
    const conversion=findConversion(currency,summaryCurrency);
    if(!conversion)continue;
    const convertedRemaining=safeNumber(row.remaining)*conversion.factor;
    if(row.type==="RECEIVABLE") companyReceivable+=convertedRemaining;
    if(row.type==="PAYABLE") companyPayable+=convertedRemaining;
  }
  // Keep the gross company receivable separate from company payables. "Debt for us"
  // must never subtract company payables; those belong only in "Debt on us" and net debt.
  const companyFinalBalance=companyReceivable-companyPayable;

  // Manual general debts are not represented by customerSummary or partnerRows.
  // Include them explicitly so the general-debts total matches the budget endpoint.
  let manualReceivable=0;
  let manualPayable=0;
  for(const row of manualRows){
    const currency=String(row.currency||"CAD").toUpperCase();
    const conversion=findConversion(currency,summaryCurrency);
    if(!conversion)continue;
    const convertedRemaining=safeNumber(row.remaining)*conversion.factor;
    if(row.type==="RECEIVABLE")manualReceivable+=convertedRemaining;
    if(row.type==="PAYABLE")manualPayable+=convertedRemaining;
  }

  // Business rule: the headline "debt for us" must equal customer debt + company debt only.
  // Manual records are reported separately to avoid silently inflating the authoritative KPI.
  const authoritativeSummary=calculateReceivableSummary({
    customerReceivable:authoritativeCustomerReceivable,
    customerPayable:authoritativeCustomerPayable,
    companyReceivable,
    companyPayable,
    manualReceivable,
    manualPayable
  });
  const authoritativeReceivable=authoritativeSummary.receivable;
  const authoritativePayable=authoritativeSummary.payable;
  const convertedTotals={receivable:authoritativeSummary.receivable,payable:authoritativeSummary.payable,net:authoritativeSummary.net};

  const receivableBreakdown={
    ...authoritativeSummary.breakdown,
    companyNet:+companyFinalBalance.toFixed(2),
    companyReceivable:+companyReceivable.toFixed(2)
  };

  const manualDebtById=new Map(manualRows.map((item)=>[item.id,item]));
  const paymentRows=debtPayments
    .map((payment)=>{
      const debt=manualDebtById.get(payment.debtId);
      return {
        ...payment,
        partyName:debt?.partyName||"",
        debtType:debt?.type||"",
        currency:debt?.currency||"CAD"
      };
    })
    .sort((a,b)=>String(b.paymentDate||b.createdAt||"").localeCompare(String(a.paymentDate||a.createdAt||"")));

  const normalizePartyKey=(value)=>String(value||"").trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"");
  const customerPartyKeys=new Map(customers.filter(c=>c&&!c.isDeleted).map(c=>[normalizePartyKey(c.name),c]).filter(([key])=>key.length>=3));
  const possibleDuplicateParties=manualRows.map(row=>{
    const customer=customerPartyKeys.get(normalizePartyKey(row.partyName));
    return customer?{manualDebtId:row.id,partyName:row.partyName,customerId:customer.id,customerName:customer.name,warning:"قد تكون الجهة مسجلة كعميل وكدين يدوي"}:null;
  }).filter(Boolean);

  res.json({
    rows,
    payments:paymentRows,
    totals:convertedTotals,
    receivableBreakdown,
    summaryCurrency,
    totalsByCurrency,
    conversionDetails,
    missingRates,
    ratesUpdatedAt,
    automaticTransferDebts:transferRows.length,
    automaticCustomerOldBalanceDebts:customerOldBalanceRows.length,
    automaticCompanyDebts:partnerRows.length,
    possibleDuplicateParties
  });
});

app.post("/api/general-debts", auth, requireIdempotencyKey, async (req,res)=>{
  const {
    type,
    partyName,
    amount,
    currency="CAD",
    dueDate="",
    description="",
    reference=""
  } = req.body || {};

  const numericAmount = Number(amount);
  const normalizedCurrency = String(currency || "CAD").toUpperCase();
  const supportedDebtCurrencies = ["CAD","USD","EUR","SYP","TRY","SAR","JOD","AED","GBP"];

  if (!["RECEIVABLE","PAYABLE"].includes(type)) {
    return res.status(400).json({message:"نوع الدين غير صحيح"});
  }
  if (!partyName || !Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({message:"أدخل اسم الجهة ومبلغًا صحيحًا"});
  }
  if (!supportedDebtCurrencies.includes(normalizedCurrency)) {
    return res.status(400).json({message:"عملة الدين غير مدعومة"});
  }

  const currentStore=readStore();
  const normalizedParty=String(partyName||"").trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"");
  const duplicateCustomer=(currentStore.customers||[]).find(customer=>!customer?.isDeleted&&normalizedParty.length>=3&&String(customer.name||"").trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"")===normalizedParty);
  if(duplicateCustomer&&req.body?.confirmPossibleDuplicate!==true){
    return res.status(409).json({code:"POSSIBLE_DUPLICATE_PARTY",message:`الجهة موجودة أيضًا كعميل باسم ${duplicateCustomer.name}. أكد الإضافة فقط إذا كان القيد اليدوي منفصلًا فعلًا.`,customer:{id:duplicateCustomer.id,name:duplicateCustomer.name}});
  }

  const debt = await mutateDurable((store)=>{
    const item = {
      id:id(),
      type,
      partyName:String(partyName),
      amount:numericAmount,
      currency:normalizedCurrency,
      dueDate:dueDate || "",
      description,
      reference,
      status:"OPEN",
      createdAt:now(),
      createdBy:req.user.id
    };
    store.generalDebts.push(item);
    audit(store, req.user.id, "CREATE", "GENERAL_DEBT", item.id, {
      after:{...item}, ip:req.ip, branchId:req.user.branchId, branchName:req.user.branchName
    });
    return item;
  });

  res.status(201).json(debt);
});

app.get("/api/general-debts/:id/payments", auth, (req,res)=>{
  const store = readStore();
  const list = (Array.isArray(store.generalDebtPayments) ? store.generalDebtPayments : [])
    .filter((payment)=>payment.debtId===req.params.id)
    .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json(list);
});

app.post("/api/general-debts/:id/payments", auth, requireIdempotencyKey, async (req,res)=>{
  const numericAmount = Number(req.body?.amount);
  const paymentDate = req.body?.paymentDate || new Date().toISOString().slice(0,10);
  const notes = req.body?.notes || "";

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({message:"مبلغ الدفعة غير صحيح"});
  }

  const store = readStore();
  const debt = (Array.isArray(store.generalDebts) ? store.generalDebts : [])
    .find((item)=>item.id===req.params.id);

  if (!debt) {
    return res.status(404).json({message:"الدين غير موجود"});
  }

  const previousPaid = (Array.isArray(store.generalDebtPayments) ? store.generalDebtPayments : [])
    .filter((payment)=>payment.debtId===debt.id)
    .reduce((sum,payment)=>sum+safeNumber(payment.amount),0);

  const remaining = Math.max(safeNumber(debt.amount)-previousPaid,0);

  if (numericAmount > remaining + 0.0001) {
    return res.status(400).json({message:"الدفعة أكبر من المبلغ المتبقي"});
  }

  const payment = await mutateDurable((currentStore)=>{
    const currentDebt=(currentStore.generalDebts||[]).find(item=>item.id===debt.id);
    const remainingBefore=Math.max(safeNumber(currentDebt?.amount)-previousPaid,0);
    const remainingAfter=Math.max(remainingBefore-numericAmount,0);
    // Financial integrity: opening debt balance = payment + remaining debt.
    assertBalancedEntry([
      {account:"DEBT_REMAINING_BEFORE",debit:+remainingBefore.toFixed(2)},
      {account:"DEBT_PAYMENT",credit:+numericAmount.toFixed(2)},
      {account:"DEBT_REMAINING_AFTER",credit:+remainingAfter.toFixed(2)}
    ]);
    const item = {
      id:id(), debtId:debt.id, amount:+numericAmount.toFixed(2), paymentDate,
      method:String(req.body?.method||"CASH").toUpperCase(), notes,
      direction:debt.type==="PAYABLE"?"OUTGOING":"INCOMING",
      remainingBefore:+remainingBefore.toFixed(2), remainingAfter:+remainingAfter.toFixed(2),
      createdAt:now(), createdBy:req.user.id
    };
    currentStore.generalDebtPayments.push(item);
    if(currentDebt){
      currentDebt.status=remainingAfter<=0.001?"PAID":remainingAfter<safeNumber(currentDebt.amount)?"PARTIAL":"OPEN";
      currentDebt.paid=+(safeNumber(currentDebt.amount)-remainingAfter).toFixed(2);
      currentDebt.remaining=+remainingAfter.toFixed(2);
      currentDebt.updatedAt=now();currentDebt.updatedBy=req.user.id;
    }
    audit(currentStore, req.user.id, debt.type==="PAYABLE"?"PAYABLE_PAYMENT":"RECEIVABLE_PAYMENT", "GENERAL_DEBT", debt.id, {
      before:{status:debt.status,paid:previousPaid,remaining:remainingBefore},
      payment:{...item},
      after:{status:currentDebt?.status,paid:currentDebt?.paid,remaining:remainingAfter},
      ip:req.ip,branchId:req.user.branchId,branchName:req.user.branchName
    });
    return {...item,debtStatus:currentDebt?.status};
  });

  res.status(201).json(payment);
});

app.patch("/api/general-debts/:id", auth, requireIdempotencyKey, async (req,res)=>{
  const updated = await mutateDurable((store)=>{
    const debt = store.generalDebts.find((item)=>item.id===req.params.id);
    if (!debt) return null;
    const before={...debt};

    if (req.body?.partyName !== undefined) debt.partyName = String(req.body.partyName);
    if (req.body?.amount !== undefined) {
      const nextAmount=Number(req.body.amount);
      const paid=(store.generalDebtPayments||[]).filter(item=>item.debtId===debt.id).reduce((sum,item)=>sum+safeNumber(item.amount),0);
      if(!Number.isFinite(nextAmount)||nextAmount<=0||nextAmount+0.0001<paid)return {validationError:"المبلغ الجديد لا يمكن أن يكون أقل من مجموع الدفعات"};
      debt.amount=+nextAmount.toFixed(2);debt.paid=+paid.toFixed(2);debt.remaining=+Math.max(nextAmount-paid,0).toFixed(2);debt.status=debt.remaining<=0.001?"PAID":paid>0?"PARTIAL":"OPEN";
    }
    if (req.body?.currency !== undefined) debt.currency = String(req.body.currency||"CAD").toUpperCase();
    if (req.body?.dueDate !== undefined) debt.dueDate = req.body.dueDate || "";
    if (req.body?.description !== undefined) debt.description = req.body.description || "";
    if (req.body?.reference !== undefined) debt.reference = req.body.reference || "";
    if (req.body?.status !== undefined) debt.status = req.body.status;

    debt.updatedAt = now();
    audit(store, req.user.id, "UPDATE", "GENERAL_DEBT", debt.id, {before,after:{...debt},ip:req.ip,branchId:req.user.branchId,branchName:req.user.branchName});
    return debt;
  });

  if (!updated) return res.status(404).json({message:"الدين غير موجود"});
  if(updated.validationError)return res.status(400).json({message:updated.validationError});
  res.json(updated);
});

app.delete("/api/general-debts/:id", auth, requireIdempotencyKey, async (req,res)=>{
  const result=await mutateDurable((store)=>{
    const index=(store.generalDebts||[]).findIndex(item=>item.id===req.params.id);
    if(index<0)return {notFound:true};
    const debt=store.generalDebts[index];
    const payments=(store.generalDebtPayments||[]).filter(item=>item.debtId===debt.id);
    if(payments.length)return {hasPayments:true};
    store.generalDebts.splice(index,1);
    audit(store,req.user.id,"DELETE","GENERAL_DEBT",debt.id,{before:{...debt},ip:req.ip,branchId:req.user.branchId,branchName:req.user.branchName});
    return {deleted:true,id:debt.id};
  });
  if(result?.notFound)return res.status(404).json({message:"الدين غير موجود"});
  if(result?.hasPayments)return res.status(409).json({message:"لا يمكن حذف دين مرتبط بدفعات. عدّل الدين أو راجع سجل الدفعات أولًا."});
  res.json(result);
});


app.get("/api/customers/:id/statement", auth, (req,res)=>{
  try{
    const store=readStore();
    const customer=(Array.isArray(store.customers)?store.customers:[])
      .find(item=>item?.id===req.params.id);

    if(!customer)return res.status(404).json({message:"العميل غير موجود"});

    const from=String(req.query.from||"");
    const to=String(req.query.to||"");

    const inRange=(transaction)=>{
      const date=String(transaction.transferDate||transaction.createdAt||"").slice(0,10);
      return (!from||date>=from)&&(!to||date<=to);
    };

    const allPayments=(Array.isArray(store.payments)?store.payments:[])
      .filter(payment=>payment&&!payment.isDeleted);

    const today=new Date();
    today.setHours(0,0,0,0);

    const transactions=(Array.isArray(store.transactions)?store.transactions:[])
      .filter(transaction=>
        transaction?.customerId===customer.id &&
        !transaction?.isDeleted &&
        transaction.status!=="CANCELLED" &&
        isAfterCustomerReset(transaction, customer, "transferDate") &&
        inRange(transaction)
      )
      .map(transaction=>{
        const paid=allPayments
          .filter(payment=>payment.transactionId===transaction.id)
          .reduce((sum,payment)=>sum+safeNumber(payment.amount),0);

        const financials=transactionFinancials(transaction);
        const usdAmount=financials.amount;
        const costRate=financials.costRate;
        const finalRate=financials.finalRate;
        const costCad=usdAmount*costRate;
        const totalCad=financials.totalCustomerDue;

        const remaining=Math.max(totalCad-paid,0);
        const date=transaction.transferDate||String(transaction.createdAt||"").slice(0,10);
        const transferDate=new Date(`${date}T00:00:00`);
        const overdueDays=!Number.isNaN(transferDate.getTime())
          ? Math.max(0,Math.floor((today-transferDate)/86400000))
          : 0;

        let paymentStatus="UNPAID";
        if(remaining<=0.001)paymentStatus="PAID";
        else if(paid>0)paymentStatus="PARTIAL";
        if(remaining>0.001&&overdueDays>7)paymentStatus="OVERDUE";

        return {
          id:transaction.id,
          number:transaction.number||transaction.id,
          transferDate:date,
          usdAmount:+usdAmount.toFixed(2),
          customerRate:+finalRate.toFixed(6),
          formulaResultCad:+(usdAmount*finalRate).toFixed(2),
          costCad:+costCad.toFixed(2),
          totalCad:+totalCad.toFixed(2),
          paid:+paid.toFixed(2),
          remaining:+remaining.toFixed(2),
          status:paymentStatus,
          overdueDays,
          transferFee:+safeNumber(transaction.transferFee).toFixed(2)
        };
      })
      .sort((a,b)=>String(a.transferDate).localeCompare(String(b.transferDate)));

    const paymentRecords=groupCustomerPaymentRecords(allPayments, customer.id)
      .filter(payment=>{
        const date=String(payment.paymentDate||payment.date||payment.createdAt||"").slice(0,10);
        return (!from||date>=from)&&(!to||date<=to);
      })
      .sort((a,b)=>String(a.paymentDate||a.date||"").localeCompare(String(b.paymentDate||b.date||"")));

    const resetTime=recordTime(customer.accountResetAt);
    const openingUpdatedTime=recordTime(customer.openingBalanceUpdatedAt);
    const activeOpeningBalance=!resetTime || openingUpdatedTime>=resetTime;
    const storedOldBalance=activeOpeningBalance?Math.max(safeNumber(customer.oldBalance),0):0;
    const legacyOldBalancePaid=activeOpeningBalance?Math.min(Math.max(safeNumber(customer.oldBalancePaid),0),storedOldBalance):0;
    const oldBalance=Math.max(storedOldBalance-legacyOldBalancePaid,0);
    const oldBalanceType=String(customer.oldBalanceType||"RECEIVABLE").toUpperCase()==="PAYABLE"?"PAYABLE":"RECEIVABLE";
    const oldBalanceSign=oldBalanceType==="PAYABLE"?-1:1;
    const signedOldBalance=oldBalanceSign*oldBalance;
    const openingBalanceInitial=activeOpeningBalance?Math.max(safeNumber(customer.openingBalanceInitial,storedOldBalance),oldBalance):0;
    const oldBalancePaid=0;
    const oldBalanceRemaining=oldBalance;
    const actualPaid=paymentRecords.reduce((sum,payment)=>sum+safeNumber(payment.amount),0);

    const totals=transactions.reduce((acc,item)=>{
      acc.usdAmount+=safeNumber(item.usdAmount);
      acc.costCad+=safeNumber(item.costCad);
      acc.totalCad+=safeNumber(item.totalCad);
      acc.formulaResultCad+=safeNumber(item.formulaResultCad);
      acc.paid+=safeNumber(item.paid);
      acc.remaining+=safeNumber(item.remaining);
      return acc;
    },{usdAmount:0,costCad:0,totalCad:0,formulaResultCad:0,paid:0,remaining:0});

    const lastActivity=transactions.length
      ? transactions[transactions.length-1].transferDate
      : null;

    res.json({
      company:(()=>{
        const company=(Array.isArray(store.companies)?store.companies:[]).find(item=>item.id===req.user.companyId);
        return {name:company?.name||"شركة العبود للتجارة",nameEn:"",logoDataUrl:company?.logoDataUrl||""};
      })(),
      customer:{
        ...customer,
        oldBalance:+oldBalance.toFixed(2),
        openingBalanceInitial:+openingBalanceInitial.toFixed(2),
        oldBalancePaid:+oldBalancePaid.toFixed(2),
        oldBalanceRemaining:+oldBalanceRemaining.toFixed(2),
        oldBalanceType,
        oldBalanceLabel:oldBalanceType==="PAYABLE"?"له":"عليه",
        totalTransactions:+(totals.totalCad+(oldBalanceType==="RECEIVABLE"?openingBalanceInitial:0)).toFixed(2),
        totalPaid:+actualPaid.toFixed(2),
        finalBalance:+(totals.remaining+signedOldBalance).toFixed(2)
      },
      from:from||null,
      to:to||null,
      generatedAt:now(),
      lastActivity,
      transactions,
      payments:paymentRecords,
      totals:{
        usdAmount:+totals.usdAmount.toFixed(2),
        costCad:+totals.costCad.toFixed(2),
        totalCad:+totals.totalCad.toFixed(2),
        formulaResultCad:+totals.formulaResultCad.toFixed(2),
        oldBalance:+oldBalance.toFixed(2),
        openingBalanceInitial:+openingBalanceInitial.toFixed(2),
        oldBalancePaid:0,
        oldBalanceRemaining:+oldBalanceRemaining.toFixed(2),
        oldBalanceType,
        oldBalanceLabel:oldBalanceType==="PAYABLE"?"له":"عليه",
        signedOldBalance:+signedOldBalance.toFixed(2),
        paid:+actualPaid.toFixed(2),
        remaining:+(totals.remaining+signedOldBalance).toFixed(2)
      }
    });
  }catch(error){
    console.error("Statement error:",error);
    res.status(500).json({message:"تعذر إنشاء كشف الحساب"});
  }
});

app.get("/api/transactions/:id/invoice", auth, (req,res)=>{
  try{
    const store=readStore();
    const transaction=(Array.isArray(store.transactions)?store.transactions:[])
      .find(item=>item?.id===req.params.id);

    if(!transaction)return res.status(404).json({message:"الحوالة غير موجودة"});

    const customer=(Array.isArray(store.customers)?store.customers:[])
      .find(item=>item?.id===transaction.customerId)||{name:"عميل"};

    const paid=(Array.isArray(store.payments)?store.payments:[])
      .filter(payment=>payment?.transactionId===transaction.id&&!payment?.isDeleted)
      .reduce((sum,payment)=>sum+safeNumber(payment.amount),0);

    const financials=transactionFinancials(transaction);
    const due=financials.totalCustomerDue;

    res.json({
      company:{
        name:"شركة العبود للتجارة",
        nameEn:"AlAboud Trading Company"
      },
      invoiceNumber:transaction.number||transaction.id,
      invoiceDate:transaction.transferDate||String(transaction.createdAt||"").slice(0,10),
      customer:{
        id:customer.id,
        name:customer.name||"عميل",
        phone:customer.phone||"",
        email:customer.email||""
      },
      transaction:{
        ...transaction,
        amount:safeNumber(transaction.amount),
        costRate:financials.costRate,
        finalRate:financials.finalRate,
        transferFee:financials.transferFee,
        totalCustomerDue:+due.toFixed(2),
        paid:+paid.toFixed(2),
        remaining:+Math.max(due-paid,0).toFixed(2)
      },
      generatedAt:now()
    });
  }catch(error){
    console.error("Invoice error:",error);
    res.status(500).json({message:"تعذر إنشاء الفاتورة"});
  }
});



// Integration credentials remain decryptable across deployments. New values use
// INTEGRATION_SECRET when configured. In production this must be a dedicated
// secret, distinct from JWT_SECRET: JWT_SECRET signs session tokens, and reusing
// it to derive the encryption key for stored partner credentials means a single
// leaked value would compromise both sessions and encrypted-at-rest data. Old
// values encrypted before this separation can still be opened via
// integrationSecretCandidates() below (JWT_SECRET / LEGACY_INTEGRATION_SECRET),
// but new writes always use a distinct key.
if (IS_PROD && !process.env.INTEGRATION_SECRET) {
  throw new Error("INTEGRATION_SECRET قوي ومستقل عن JWT_SECRET مطلوب في الإنتاج");
}
const INTEGRATION_SECRET=process.env.INTEGRATION_SECRET||(IS_PROD?null:"LOCAL_INTEGRATION_SECRET_CHANGE_ME");
function integrationKey(secret=INTEGRATION_SECRET){return crypto.createHash("sha256").update(String(secret)).digest();}
function integrationSecretCandidates(){
  return [...new Set([
    process.env.INTEGRATION_SECRET,
    JWT_SECRET,
    process.env.LEGACY_INTEGRATION_SECRET,
    "LOCAL_TRIAL_CHANGE_ME_6_0"
  ].filter(Boolean).map(String))];
}
function encryptIntegrationSecret(value){
  if(!value)return "";
  const iv=crypto.randomBytes(12);const cipher=crypto.createCipheriv("aes-256-gcm",integrationKey(),iv);
  const encrypted=Buffer.concat([cipher.update(String(value),"utf8"),cipher.final()]);
  return `enc:v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${encrypted.toString("base64")}`;
}
function decryptIntegrationSecret(value){
  const text=String(value||"");if(!text)return "";if(!text.startsWith("enc:v1:"))return text;
  const parts=text.split(":");
  if(parts.length!==5||parts[1]!=="v1")throw new Error("صيغة بيانات الربط المشفرة غير مدعومة");
  const [,version,iv64,tag64,data64]=parts;
  let lastError=null;
  for(const secret of integrationSecretCandidates()){
    try{
      const decipher=crypto.createDecipheriv("aes-256-gcm",integrationKey(secret),Buffer.from(iv64,"base64"));
      decipher.setAuthTag(Buffer.from(tag64,"base64"));
      return Buffer.concat([decipher.update(Buffer.from(data64,"base64")),decipher.final()]).toString("utf8");
    }catch(error){lastError=error;}
  }
  const error=new Error("تعذر فك بيانات دخول الشركة. أعد حفظ كلمة المرور أو اضبط LEGACY_INTEGRATION_SECRET بالمفتاح السابق.");
  error.code="INTEGRATION_DECRYPT_FAILED";
  error.cause=lastError;
  throw error;
}
function normalizeBaseUrl(value){
  let raw=String(value||"").trim();
  if(!raw)throw new Error("رابط شركة جاد مطلوب");
  if(!/^https?:\/\//i.test(raw))raw=`https://${raw.replace(/^\/+/,"")}`;
  const parsed=new URL(raw);
  if(!["http:","https:"].includes(parsed.protocol))throw new Error("رابط شركة جاد يجب أن يبدأ بـ http أو https");
  if(IS_PROD&&parsed.protocol!=="https:")throw new Error("يجب استخدام HTTPS لروابط الشركات الخارجية");
  if(["localhost","127.0.0.1","::1"].includes(String(parsed.hostname).toLowerCase()))throw new Error("لا يمكن استخدام عنوان داخلي للشركة الخارجية");
  return `${parsed.protocol}//${parsed.host}`;
}
function resolveJadConnection(partner={}){
  let raw=String(partner.systemUrl||"").trim();
  if(!raw)throw new Error("رابط شركة جاد مطلوب");
  if(!/^https?:\/\//i.test(raw))raw=`https://${raw.replace(/^\/+/,"")}`;
  const parsed=new URL(raw);
  if(!["http:","https:"].includes(parsed.protocol))throw new Error("رابط شركة جاد غير صالح");
  if(IS_PROD&&parsed.protocol!=="https:")throw new Error("يجب استخدام HTTPS لروابط الشركات الخارجية");

  const base=`${parsed.protocol}//${parsed.host}`;
  const configured=String(partner.pathPrefix||"").trim();
  let prefix=configured;
  const pathname=decodeURIComponent(parsed.pathname||"").replace(/\/+$/,"");

  // Accept the complete Jad URL pasted by the user, including /log, /pl.m,
  // /account or /accountprint.php, and derive the installation prefix from it.
  const endpointMatch=pathname.match(/^(.*?)(?:\/(?:log(?:_2)?|pl(?:\.m)?|account|accountprint\.php|statement))$/i);
  const candidate=(endpointMatch?.[1]||pathname).replace(/\/+$/,"");
  if(/\/ssljd\//i.test(candidate)||String(partner.connectorType||"").toUpperCase()==="SURYANA")prefix=candidate;
  if(!prefix)prefix="/ssljd/merkez112/1/2";
  if(!prefix.startsWith("/"))prefix=`/${prefix}`;
  prefix=prefix.replace(/\/{2,}/g,"/").replace(/\/+$/,"");

  return {base,prefix,loginUrl:`${base}${prefix}/log`,accountUrl:`${base}${prefix}/account`,landingUrl:`${base}${prefix}/pl.m`};
}
function htmlText(value){return String(value||"").replace(/<br\s*\/?\s*>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&#039;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g," ").trim();}
function numberFromText(value){
  const normalized=htmlText(value)
    .replace(/[٠-٩]/g,ch=>"٠١٢٣٤٥٦٧٨٩".indexOf(ch))
    .replace(/[٬,\s]/g,"")
    .replace(/٫/g,".");
  const match=normalized.match(/-?\d+(?:\.\d+)?/);
  return match?safeNumber(match[0]):0;
}
function splitSetCookieHeader(value){
  const text=String(value||"");if(!text)return [];
  return text.split(/,(?=\s*[^;,=\s]+=[^;,]+)/g).map(x=>x.trim()).filter(Boolean);
}
function extractCookies(headers){
  let raw=[];
  if(typeof headers.getSetCookie==="function")raw=headers.getSetCookie();
  if(!raw?.length)raw=splitSetCookieHeader(headers.get("set-cookie"));
  return raw.map(item=>String(item).split(";")[0]).filter(Boolean).join("; ");
}
function mergeCookies(current,next){const jar={};for(const pair of `${current||""}; ${next||""}`.split(";")){const i=pair.indexOf("=");if(i>0)jar[pair.slice(0,i).trim()]=pair.slice(i+1).trim();}return Object.entries(jar).map(([k,v])=>`${k}=${v}`).join("; ");}
function isJadLoginPage(html,url=""){
  const source=String(html||"");
  const forms=[...source.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)];
  const hasRealLoginForm=forms.some(form=>{
    const body=form[2];
    return /<input\b[^>]*name=["']pass["'][^>]*>/i.test(body)
      && /<input\b[^>]*name=["'](?:mail|tok)["'][^>]*>/i.test(body);
  });
  const path=(()=>{try{return new URL(url).pathname.replace(/\/$/,"");}catch{return "";}})();
  return hasRealLoginForm || /\/log$/.test(path);
}
function parseSafeTransitionPostForm(html,baseUrl){
  const source=String(html||"");
  for(const form of source.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)){
    const formAttrs=parseHtmlAttributes(form[1]);
    if(String(formAttrs.method||"GET").toUpperCase()!=="POST")continue;
    const body=new URLSearchParams();
    let hasField=false;
    let unsafe=false;
    for(const input of form[2].matchAll(/<input\b([^>]*)>/gi)){
      const attrs=parseHtmlAttributes(input[1]);
      const name=attrs.name;
      if(!name)continue;
      const type=String(attrs.type||"text").toLowerCase();
      if(["password","text","email","file"].includes(type)){unsafe=true;break;}
      if(type==="checkbox"||type==="radio"){
        if(!Object.prototype.hasOwnProperty.call(attrs,"checked"))continue;
      }
      if(["hidden","submit","button","image"].includes(type)){
        body.append(name,attrs.value||"");
        hasField=true;
        continue;
      }
      unsafe=true;break;
    }
    if(unsafe||!hasField)continue;
    const action=new URL(formAttrs.action||baseUrl,baseUrl).toString();
    if(/(?:logout|signout|logoff)/i.test(action))continue;
    return {action,body:body.toString()};
  }
  return null;
}

async function fetchWithCookies(url,options={},cookie="",settings={}){
  const maxRedirects=Number.isFinite(settings.maxRedirects)?settings.maxRedirects:8;
  let currentUrl=String(url);
  let currentCookie=String(cookie||"");
  let currentOptions={...options};
  const redirects=[];
  for(let index=0;index<=maxRedirects;index+=1){
    await assertSafePartnerUrl(currentUrl);
    const headers={...(currentOptions.headers||{})};
    if(currentCookie)headers.Cookie=currentCookie;
    const response=await fetch(currentUrl,{...currentOptions,headers,redirect:"manual",signal:AbortSignal.timeout(20000)});
    currentCookie=mergeCookies(currentCookie,extractCookies(response.headers));
    const status=response.status;
    const location=response.headers.get("location");
    if(!location||![301,302,303,307,308].includes(status)){
      return {response,cookie:currentCookie,url:currentUrl,redirects};
    }
    if(index===maxRedirects)throw new Error("تجاوز موقع الشركة الحد المسموح لإعادة التوجيه");
    const nextUrl=new URL(location,currentUrl).toString();
    await assertSafePartnerUrl(nextUrl);
    redirects.push({status,from:currentUrl,to:nextUrl});
    const method=String(currentOptions.method||"GET").toUpperCase();
    const shouldSwitchToGet=status===303||((status===301||status===302)&&method!=="GET"&&method!=="HEAD");
    const nextHeaders={...(currentOptions.headers||{})};
    try{
      if(new URL(nextUrl).origin===new URL(currentUrl).origin)nextHeaders.Referer=currentUrl;
    }catch{}
    if(shouldSwitchToGet){
      delete nextHeaders["Content-Type"];delete nextHeaders["content-type"];
      delete nextHeaders["Content-Length"];delete nextHeaders["content-length"];
      delete nextHeaders.Origin;delete nextHeaders.origin;
      currentOptions={...currentOptions,method:"GET",body:undefined,headers:nextHeaders};
    }else{
      currentOptions={...currentOptions,headers:nextHeaders};
    }
    currentUrl=nextUrl;
  }
  throw new Error("تعذر إكمال إعادة التوجيه");
}
function decodeHtmlAttribute(value){
  return String(value||"")
    .replace(/&amp;/gi,"&")
    .replace(/&quot;/gi,'"')
    .replace(/&#039;|&#39;/gi,"'")
    .replace(/&lt;/gi,"<")
    .replace(/&gt;/gi,">");
}
function parseHtmlAttributes(value){
  const attrs={};
  for(const match of String(value||"").matchAll(/([:\w-]+)(?:\s*=\s*(?:["']([^"']*)["']|([^\s>]+)))?/g)){
    attrs[String(match[1]||"").toLowerCase()]=decodeHtmlAttribute(match[2]??match[3]??"");
  }
  return attrs;
}
function parseJadLoginForm(html,baseUrl){
  const source=String(html||"");
  for(const form of source.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)){
    const formAttrs=parseHtmlAttributes(form[1]);
    const fields=new URLSearchParams();
    let hasPassword=false;
    let hasIdentity=false;
    for(const input of form[2].matchAll(/<input\b([^>]*)>/gi)){
      const attrs=parseHtmlAttributes(input[1]);
      const name=attrs.name;
      if(!name)continue;
      const type=String(attrs.type||"text").toLowerCase();
      if(["submit","button","image","file","reset"].includes(type))continue;
      if(type==="checkbox"||type==="radio"){
        if(!Object.prototype.hasOwnProperty.call(attrs,"checked"))continue;
      }
      fields.append(name,attrs.value||"");
      if(name.toLowerCase()==="pass"||type==="password")hasPassword=true;
      if(["mail","email","username","user","tok"].includes(name.toLowerCase()))hasIdentity=true;
    }
    if(!hasPassword||!hasIdentity)continue;
    const action=new URL(formAttrs.action||baseUrl,baseUrl).toString();
    return {action,method:String(formAttrs.method||"POST").toUpperCase(),fields};
  }
  return null;
}
function findToken(html){
  const form=parseJadLoginForm(html,"https://localhost/");
  if(form){
    const token=form.fields.get("tok");
    if(token)return token;
  }
  const patterns=[/name=["']tok["'][^>]*value=["']([^"']+)/i,/value=["']([^"']+)["'][^>]*name=["']tok["']/i];
  for(const pattern of patterns){const match=String(html).match(pattern);if(match)return decodeHtmlAttribute(match[1]);}return "";
}
function extractClientRedirect(html,currentUrl){
  const source=String(html||"");
  const meta=source.match(/<meta\b[^>]*http-equiv=["']?refresh["']?[^>]*content=["'][^"']*url\s*=\s*([^"';>]+)["']/i)
    || source.match(/<meta\b[^>]*content=["'][^"']*url\s*=\s*([^"';>]+)["'][^>]*http-equiv=["']?refresh/i);
  const script=source.match(/(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i)
    || source.match(/location\.replace\(\s*["']([^"']+)["']\s*\)/i);
  const target=meta?.[1]||script?.[1];
  if(!target)return "";
  try{return new URL(decodeHtmlAttribute(target.trim()),currentUrl).toString();}catch{return "";}
}
function loginFailureMessage(html){
  const text=htmlText(html);
  const snippets=[
    /(?:خطأ|تنبيه|تحذير|error|invalid)[^.!؟\n]{0,180}/i,
    /(?:اسم المستخدم|كلمة المرور|رمز الحماية)[^.!؟\n]{0,180}/i
  ];
  for(const pattern of snippets){const match=text.match(pattern);if(match)return match[0].trim();}
  return "";
}
async function followJadPostLoginFlow(step,cookie,browserHeaders,base,prefix){
  let current=step;
  let jar=cookie;
  let html=await current.response.text();
  for(let attempt=0;attempt<8;attempt+=1){
    if(isJadLoginPage(html,current.url))return {step:current,cookie:jar,html,loggedOut:true};

    const clientRedirect=extractClientRedirect(html,current.url);
    if(clientRedirect){
      current=await fetchWithCookies(clientRedirect,{headers:{...browserHeaders,Referer:current.url}},jar,{maxRedirects:10});
      jar=current.cookie;html=await current.response.text();continue;
    }

    const safeForm=parseSafeTransitionPostForm(html,current.url);
    if(safeForm){
      current=await fetchWithCookies(safeForm.action,{
        method:"POST",
        headers:{...browserHeaders,"Content-Type":"application/x-www-form-urlencoded",Origin:base,Referer:current.url},
        body:safeForm.body
      },jar,{maxRedirects:10});
      jar=current.cookie;html=await current.response.text();continue;
    }
    break;
  }
  return {step:current,cookie:jar,html,loggedOut:isJadLoginPage(html,current.url)};
}

function normalizeJadCurrencyDebt(receivableValue,payableValue,{prefer="RECEIVABLE"}={}){
  let receivable=Math.max(safeNumber(receivableValue),0);
  let payable=Math.max(safeNumber(payableValue),0);

  // بعض صفحات جاد تكرر بطاقة الرصيد نفسها قرب كلمتي «لنا» و«علينا»،
  // فيلتقط المحلل الرقم نفسه في العمودين. لا يجوز عندها إظهار دينين متساويين
  // وصافي صفر. نحتفظ بالقيمة في جهة واحدة فقط.
  if(receivable>0.001&&payable>0.001&&Math.abs(receivable-payable)<0.01){
    if(String(prefer).toUpperCase()==="PAYABLE")receivable=0;
    else payable=0;
  }

  return {
    receivable:+receivable.toFixed(2),
    payable:+payable.toFixed(2),
    balance:+(receivable-payable).toFixed(2)
  };
}

function parseJadCurrencyBalances(html){
  const raw=htmlText(String(html||""))
    .replace(/[٠-٩]/g,ch=>"٠١٢٣٤٥٦٧٨٩".indexOf(ch))
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g," ")
    .replace(/[\u{1F000}-\u{1FAFF}\u2600-\u27BF]/gu," ")
    .replace(/[^\p{L}\p{N}.,+\-٫٬]+/gu," ")
    .replace(/\s+/g," ")
    .trim();
  const aliases=[
    {code:"CAD",patterns:["دولار كندي","كندي","CAD"]},
    {code:"USD",patterns:["دولار أمريكي","دولار امريكي","دولار","USD"]},
    {code:"EUR",patterns:["يورو","EUR"]},
    {code:"TRY",patterns:["ليرة تركية","تركي","TRY"]},
    {code:"SYP",patterns:["ليرة سورية","سوري","SYP"]},
    {code:"SAR",patterns:["ريال سعودي","سعودي","SAR"]},
    {code:"JOD",patterns:["دينار أردني","دينار اردني","أردني","اردني","JOD"]},
    {code:"AED",patterns:["درهم إماراتي","درهم اماراتي","إماراتي","اماراتي","AED"]},
    {code:"GBP",patterns:["جنيه إسترليني","جنيه استرليني","إسترليني","استرليني","GBP"]}
  ];
  const out={};
  const esc=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const amountPattern='([+-]?[0-9][0-9,٬]*(?:[.٫][0-9]+)?)';
  const receivableWords=/(?:^|\s)(?:لنا|لكم|مستحق\s*لنا|دائن\s*(?:لنا|لكم))(?:\s|$)/iu;
  const payableWords=/(?:^|\s)(?:علينا|عليكم|مستحق\s*علينا|مدين\s*(?:علينا|عليكم))(?:\s|$)/iu;

  // Jad dashboard cards carry the accounting direction in their visible label:
  // "يورو لكم" means receivable, while "دولار عليكم" means payable.
  // Parse each direction word with only its nearest preceding currency and amount,
  // so text from neighbouring cards can never assign the same value to both sides.
  const directionRe=/(?:مستحق\s*لنا|دائن\s*(?:لنا|لكم)|مستحق\s*علينا|مدين\s*(?:علينا|عليكم)|لنا|لكم|علينا|عليكم)/giu;
  for(const directionMatch of raw.matchAll(directionRe)){
    const direction=directionMatch[0];
    const isReceivable=receivableWords.test(` ${direction} `);
    const isPayable=payableWords.test(` ${direction} `);
    if(!isReceivable&&!isPayable)continue;

    const before=raw.slice(Math.max(0,directionMatch.index-120),directionMatch.index).trim();
    let selected=null;
    for(const item of aliases){
      for(const alias of item.patterns){
        const aliasRe=new RegExp(`(?:^|\\s)${esc(alias)}(?:\\s|$)`,`giu`);
        const aliasMatches=[...before.matchAll(aliasRe)];
        const aliasMatch=aliasMatches.at(-1);
        if(!aliasMatch)continue;
        const aliasStart=aliasMatch.index;
        const afterAlias=before.slice(aliasStart+aliasMatch[0].length).trim();
        // A different number after the currency means this direction belongs to another card.
        if(new RegExp(amountPattern,"u").test(afterAlias))continue;
        const amountArea=before.slice(0,aliasStart);
        const amounts=[...amountArea.matchAll(new RegExp(amountPattern,"gu"))];
        const valueMatch=amounts.at(-1);
        if(!valueMatch)continue;
        const distance=before.length-(valueMatch.index+valueMatch[0].length);
        if(distance>90)continue;
        if(!selected||distance<selected.distance){
          selected={code:item.code,amount:Math.abs(numberFromText(valueMatch[1])),distance};
        }
      }
    }
    if(!selected||!Number.isFinite(selected.amount))continue;
    const current=out[selected.code]||{receivable:0,payable:0,balance:0};
    if(isReceivable)current.receivable=Math.max(current.receivable,selected.amount);
    if(isPayable)current.payable=Math.max(current.payable,selected.amount);
    current.balance=+(current.receivable-current.payable).toFixed(2);
    out[selected.code]=current;
  }

  // Compatibility fallback for older Jad layouts. It is used only for currencies
  // that were not already found with an explicit "لكم/عليكم" card label.
  const sep='(?:\\s|[^\\p{L}\\p{N}]){0,18}';
  const recv='(?:لنا|لكم|مستحق\\s*لنا|دائن\\s*(?:لنا|لكم))';
  const pay='(?:علينا|عليكم|مستحق\\s*علينا|مدين\\s*(?:علينا|عليكم))';
  for(const item of aliases){
    if(out[item.code])continue;
    let receivable=0,payable=0;
    for(const alias of item.patterns){
      const a=esc(alias);
      const candidates=[
        {kind:"receivable",re:new RegExp(`${amountPattern}${sep}${a}${sep}${recv}`,"giu")},
        {kind:"receivable",re:new RegExp(`${a}${sep}${amountPattern}${sep}${recv}`,"giu")},
        {kind:"payable",re:new RegExp(`${amountPattern}${sep}${a}${sep}${pay}`,"giu")},
        {kind:"payable",re:new RegExp(`${a}${sep}${amountPattern}${sep}${pay}`,"giu")}
      ];
      for(const candidate of candidates){
        for(const match of raw.matchAll(candidate.re)){
          const value=Math.abs(numberFromText(match[1]));
          if(!Number.isFinite(value))continue;
          if(candidate.kind==="receivable")receivable=Math.max(receivable,value);
          else payable=Math.max(payable,value);
        }
      }
    }
    if(receivable||payable)out[item.code]=normalizeJadCurrencyDebt(receivable,payable,{prefer:payable&&!receivable?"PAYABLE":"RECEIVABLE"});
  }
  return out;
}

function parseJadStatement(html){
  const source=String(html||"");
  const tbodyMatches=[...source.matchAll(/<tbody[^>]*>([\s\S]*?)<\/tbody>/gi)];
  let rows=[];
  for(const body of tbodyMatches){
    const parsed=[...body[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(row=>[...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(cell=>htmlText(cell[1]))).filter(cells=>cells.length>=6);
    if(parsed.length>rows.length)rows=parsed;
  }
  const headerCells=[...source.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map(match=>htmlText(match[1]).trim());
  const feeHeaderIndex=headerCells.findIndex(value=>/(?:أجور|اجور|عمولة|commission|fee|fees)/i.test(value));
  const feeLabelPattern=/(?:أجور|اجور|عمولة|commission|service\s*fee|transfer\s*fee|fees?)/i;
  const movements=rows.map(cells=>{
    const movement={
      sequence:cells[0]||"",date:cells[1]||"",movementType:cells[2]||"",movementNumber:cells[3]||"",notes:cells[4]||"",
      payable:numberFromText(cells[5]),receivable:numberFromText(cells[6]),balance:numberFromText(cells[7]??cells[cells.length-1]),raw:cells
    };
    const movementText=`${movement.movementType} ${movement.notes}`;
    const labelledAsFee=feeLabelPattern.test(movementText);
    const explicitFee=feeHeaderIndex>=0&&feeHeaderIndex<cells.length?Math.abs(numberFromText(cells[feeHeaderIndex])):0;
    const paidLabel=/(?:مدفوع(?:ة)?|مسدد(?:ة)?|تم\s*الدفع|خصم|مقتطع|paid|settled|charged)/i.test(movementText);
    // أجور كشف الحساب المدفوعة هي المبالغ التي خُصمت من الحساب (عمود علينا/المدين)،
    // أو قيمة عمولة صريحة أثبتها موقع جاد داخل عمود الأجور.
    const debitedFee=labelledAsFee?Math.abs(safeNumber(movement.payable)):0;
    movement.fee=explicitFee||debitedFee;
    movement.isPaidFee=movement.fee>0&&(explicitFee>0||debitedFee>0||paidLabel);
    movement.isFee=movement.isPaidFee;
    movement.feeStatus=movement.isPaidFee?"PAID":"UNPAID";
    return movement;
  });
  const last=movements[movements.length-1]||{};
  const totalPayableMatch=source.match(/(?:دائن\s*علينا|مجموع\s*الدائن\s*علينا)[\s\S]{0,180}?([\d,]+(?:\.\d+)?)/i);
  const totalReceivableMatch=source.match(/(?:مدين\s*لنا|مجموع\s*المدين\s*لنا)[\s\S]{0,180}?([\d,]+(?:\.\d+)?)/i);
  let payable=totalPayableMatch?numberFromText(totalPayableMatch[1]):0;
  let receivable=totalReceivableMatch?numberFromText(totalReceivableMatch[1]):0;
  const balance=safeNumber(last.balance);
  if(!payable&&!receivable&&balance){
    const pageText=htmlText(source);
    if(/دائن\s*علينا|دولار\s*عليكم/.test(pageText))payable=Math.abs(balance);else receivable=Math.abs(balance);
  }
  const normalized=normalizeJadCurrencyDebt(receivable,payable,{prefer:balance<0?"PAYABLE":"RECEIVABLE"});
  const feeMovements=movements.filter(item=>item.isPaidFee);
  const totalFees=+feeMovements.reduce((sum,item)=>sum+safeNumber(item.fee),0).toFixed(2);
  return {movements,feeMovements,totalFees,balance:normalized.balance,payable:normalized.payable,receivable:normalized.receivable};
}
async function syncJadPartnerHttp(partner,{fromDate,toDate,testOnly=false}={}){
  const {base,prefix,loginUrl,accountUrl,landingUrl}=resolveJadConnection(partner);
  const username=String(partner.username||"").trim();
  const password=decryptIntegrationSecret(partner.passwordEncrypted);
  if(!username||!password)throw new Error("اسم المستخدم وكلمة المرور مطلوبان للربط");

  const browserHeaders={
    Accept:"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language":"ar,en-US;q=0.9,en;q=0.8",
    "Cache-Control":"no-cache",
    Pragma:"no-cache",
    "Upgrade-Insecure-Requests":"1",
    "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36"
  };

  let cookie="";
  const fastSuryanaTest=testOnly&&String(partner.connectorType||"").toUpperCase()==="SURYANA";

  // Browser traffic reaches /log from pl.m. This preflight initializes the same PHP branch
  // and keeps any session cookies issued before the login form is opened.
  if(!fastSuryanaTest){
    try{
      const landing=await fetchWithCookies(landingUrl,{headers:browserHeaders},cookie,{maxRedirects:6});
      cookie=landing.cookie;
      await landing.response.arrayBuffer();
    }catch(error){
      console.warn("[JAD] pl.m preflight skipped:",error?.message||error);
    }
  }

  // Read the real login form first. Jad binds the dynamic tok value to the PHP session.
  let step=await fetchWithCookies(loginUrl,{headers:{...browserHeaders,Referer:`${base}${prefix}/pl.m`}},cookie,{maxRedirects:6});
  cookie=step.cookie;
  const loginHtml=await step.response.text();
  const loginForm=parseJadLoginForm(loginHtml,step.url||loginUrl);
  if(!loginForm)throw new Error("تعذر العثور على نموذج تسجيل دخول جاد أو استخراج رمز الحماية tok");

  const loginBody=new URLSearchParams(loginForm.fields);
  loginBody.set("mail",username);
  loginBody.set("pass",password);
  if(!loginBody.has("tok")){
    const token=findToken(loginHtml);
    if(!token)throw new Error("تعذر استخراج رمز الحماية tok من صفحة تسجيل دخول جاد");
    loginBody.set("tok",token);
  }
  if(!loginBody.has("btn-login"))loginBody.set("btn-login","");

  step=await fetchWithCookies(loginForm.action||loginUrl,{
    method:loginForm.method==="GET"?"GET":"POST",
    headers:{
      ...browserHeaders,
      "Content-Type":"application/x-www-form-urlencoded",
      Origin:base,
      Referer:step.url||loginUrl
    },
    body:loginForm.method==="GET"?undefined:loginBody.toString()
  },cookie,{maxRedirects:12});
  cookie=step.cookie;

  let postLogin=await followJadPostLoginFlow(step,cookie,browserHeaders,base,prefix);
  step=postLogin.step;cookie=postLogin.cookie;
  if(postLogin.loggedOut){
    const reason=loginFailureMessage(postLogin.html);
    throw new Error(reason?`رفض موقع جاد تسجيل الدخول: ${reason}`:"رفض موقع جاد تسجيل الدخول؛ تحقق من اسم المستخدم وكلمة المرور ورمز الحماية");
  }

  // Some Jad installations initialize the authenticated branch on log_2 before /account.
  // Visit it once when the login flow ended elsewhere; a 404/redirect is harmless and is followed manually.
  const currentPath=(()=>{try{return new URL(step.url).pathname.replace(/\/$/,"");}catch{return "";}})();
  if(!fastSuryanaTest&&!currentPath.endsWith(`${prefix}/log_2`)){
    const bootstrap=await fetchWithCookies(`${base}${prefix}/log_2`,{
      headers:{...browserHeaders,Referer:step.url||loginUrl}
    },cookie,{maxRedirects:10});
    cookie=bootstrap.cookie;
    const bootstrapFlow=await followJadPostLoginFlow(bootstrap,cookie,browserHeaders,base,prefix);
    if(!bootstrapFlow.loggedOut){step=bootstrapFlow.step;cookie=bootstrapFlow.cookie;}
  }

  step=await fetchWithCookies(`${base}${prefix}/account`,{
    headers:{...browserHeaders,Referer:step.url||`${base}${prefix}/log_2`}
  },cookie,{maxRedirects:12});
  cookie=step.cookie;
  let accountHtml=await step.response.text();

  // If /account bounced back to /log, retry once through log_2 with the same cookie jar.
  if(isJadLoginPage(accountHtml,step.url)){
    const retryBootstrap=await fetchWithCookies(`${base}${prefix}/log_2`,{
      headers:{...browserHeaders,Referer:loginUrl}
    },cookie,{maxRedirects:10});
    cookie=retryBootstrap.cookie;
    const retryFlow=await followJadPostLoginFlow(retryBootstrap,cookie,browserHeaders,base,prefix);
    cookie=retryFlow.cookie;
    if(!retryFlow.loggedOut){
      step=await fetchWithCookies(`${base}${prefix}/account`,{
        headers:{...browserHeaders,Referer:retryFlow.step.url||`${base}${prefix}/log_2`}
      },cookie,{maxRedirects:12});
      cookie=step.cookie;accountHtml=await step.response.text();
    }
  }

  if(isJadLoginPage(accountHtml,step.url)){
    console.error("[JAD AUTH] account returned login page",{
      finalUrl:step.url,
      redirects:step.redirects,
      cookieNames:String(cookie||"").split(";").map(x=>x.split("=")[0].trim()).filter(Boolean)
    });
    throw new Error("انتهت جلسة جاد بعد تسجيل الدخول؛ موقع جاد أعاد صفحة الدخول عند فتح الحساب");
  }

  // A connection test only needs to prove that authentication produced an
  // authenticated account page. Avoid the print report here: on Suryana it can
  // take long enough for Render/the browser to close the request without a
  // response. A normal sync still loads and parses the complete statement.
  if(testOnly){
    const summary=parseJadStatement(accountHtml);
    return {...summary,testOnly:true,authenticated:true,fromDate:null,toDate:null,redirects:step.redirects||[]};
  }

  const start=fromDate||partner.syncFromDate||new Date(Date.now()-365*24*3600*1000).toISOString().slice(0,10);
  const end=toDate||new Date().toISOString().slice(0,10);
  const accountId=String(partner.externalAccountId||"").trim();
  if(accountId){
    const form=new URLSearchParams();
    form.set("currency",String(partner.accountCurrency||"USD").toLowerCase());
    form.set("date1","date");
    form.set("confirm",accountId);
    form.set("date2",start);
    form.set("date3",end);
    step=await fetchWithCookies(`${base}${prefix}/account`,{
      method:"POST",
      headers:{...browserHeaders,"Content-Type":"application/x-www-form-urlencoded",Origin:base,Referer:`${base}${prefix}/account`},
      body:form.toString()
    },cookie,{maxRedirects:12});
    cookie=step.cookie;
    const selectedHtml=await step.response.text();
    if(isJadLoginPage(selectedHtml,step.url))throw new Error("رفض موقع جاد اختيار الحساب؛ أعد التحقق من رقم الحساب وبيانات الدخول");
  }

  const query=new URLSearchParams({
    currency:String(partner.accountCurrency||"USD").toLowerCase(),
    date1:"date",date2:start,date3:end
  });
  step=await fetchWithCookies(`${base}${prefix}/accountprint.php?${query}`,{
    headers:{...browserHeaders,Referer:`${base}${prefix}/account`}
  },cookie,{maxRedirects:12});
  cookie=step.cookie;
  if(step.response.status!==200)throw new Error(`تعذر جلب كشف الحساب (${step.response.status})`);
  const html=await step.response.text();
  if(isJadLoginPage(html,step.url)&&!/<tbody/i.test(html))throw new Error("رفض موقع جاد جلسة الدخول عند طلب كشف الحساب");
  if(!/<tbody/i.test(html)&&!/كشف\s*حساب|الرصيد|مدين|دائن/i.test(htmlText(html)))throw new Error("تم الاتصال بجاد لكن لم يتم العثور على جدول كشف الحساب");
  return {...parseJadStatement(html),fromDate:start,toDate:end,redirects:step.redirects||[]};
}


async function syncJadPartnerBrowser(partner,{fromDate,toDate,otp}={}){
  let chromium;
  try{({chromium}=require("playwright"));}
  catch(error){const wrapped=new Error("موصل JAD بالمتصفح غير متاح: تأكد من تثبيت playwright وChromium داخل صورة التشغيل");wrapped.code="JAD_BROWSER_UNAVAILABLE";wrapped.cause=error;throw wrapped;}

  const {base,prefix,loginUrl,accountUrl,landingUrl}=resolveJadConnection(partner);
  const username=String(partner.username||"").trim();
  const password=decryptIntegrationSecret(partner.passwordEncrypted);
  if(!username||!password)throw new Error("اسم المستخدم وكلمة المرور مطلوبان للربط");

  const start=fromDate||partner.syncFromDate||new Date(Date.now()-365*24*3600*1000).toISOString().slice(0,10);
  const end=toDate||new Date().toISOString().slice(0,10);
  const accountId=String(partner.externalAccountId||"").trim();
  const cleanOtp=String(otp||"").replace(/\D/g,"").slice(0,8);

  const launchOptions={headless:true,args:["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-gpu","--no-zygote"],timeout:60000};
  if(process.env.CHROME_EXECUTABLE_PATH)launchOptions.executablePath=process.env.CHROME_EXECUTABLE_PATH;

  let browser; let page; const trace=[];
  const diagnosticDir=path.join(require("os").tmpdir(),"alaboud-jad-diagnostics");
  const diagnosticBase=path.join(diagnosticDir,String(partner.id||"jad"));
  const safeText=value=>String(value||"").replace(new RegExp(username.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"gi"),"[username]").replace(/\b\d{6,8}\b/g,"[otp]");
  const saveDiagnosticArtifacts=async(label)=>{
    if(!page)return null;
    try{
      fs.mkdirSync(diagnosticDir,{recursive:true});
      const stamp=Date.now();
      const png=`${diagnosticBase}-${stamp}.png`;
      const htmlFile=`${diagnosticBase}-${stamp}.html`;
      await page.screenshot({path:png,fullPage:true}).catch(()=>null);
      const rawHtml=await page.content().catch(()=>"");
      fs.writeFileSync(htmlFile,safeText(rawHtml),"utf8");
      return {label,png,html:htmlFile,createdAt:new Date().toISOString()};
    }catch{return null;}
  };
  const record=async(label)=>{
    if(!page)return;
    const entry={label,url:page.url(),title:await page.title().catch(()=>""),time:new Date().toISOString()};
    entry.text=safeText((await page.locator('body').innerText({timeout:2500}).catch(()=>"" )).replace(/\s+/g," ").slice(0,900));
    trace.push(entry);
  };
  const errorDetails=error=>({
    name:String(error?.name||"Error"),
    message:safeText(error?.message||error||"Unknown error"),
    code:String(error?.code||""),
    stack:safeText(error?.stack||"").split("\n").slice(0,12).join("\n"),
    cause:error?.cause?{name:String(error.cause?.name||"Error"),message:safeText(error.cause?.message||error.cause),stack:safeText(error.cause?.stack||"").split("\n").slice(0,8).join("\n")}:null
  });
  const diagnosticError=async(message,code="JAD_FLOW_ERROR",cause=null)=>{
    await record("failure");
    const artifacts=await saveDiagnosticArtifacts(code);
    const error=new Error(message); error.code=code; error.cause=cause||undefined; error.jadTrace=trace.slice(-16); error.jadArtifacts=artifacts; error.jadDetails=cause?errorDetails(cause):null; return error;
  };
  console.log("[JAD][START]",{partnerId:partner.id,base,prefix,loginUrl,accountUrl,accountConfigured:Boolean(accountId),otpProvided:Boolean(cleanOtp),playwrightVersion:(()=>{try{return require("playwright/package.json").version}catch{return "unknown"}})(),browsersPath:process.env.PLAYWRIGHT_BROWSERS_PATH||"default",chromeExecutablePath:process.env.CHROME_EXECUTABLE_PATH||"default"});
  try{
    try {
      const executable=chromium.executablePath ? chromium.executablePath() : "";
      const executableExists=executable ? fs.existsSync(executable) : false;
      console.log("[JAD][CHROMIUM][BEFORE_LAUNCH]",{executable,exists:executableExists,launchOptions:{...launchOptions,args:[...launchOptions.args]}});
      if(executable && !executableExists && !process.env.CHROME_EXECUTABLE_PATH){
        const missing=new Error(`Chromium executable not found at ${executable}`);
        missing.code="JAD_BROWSER_UNAVAILABLE";
        throw missing;
      }
      browser=await chromium.launch(launchOptions);
      trace.push({label:"chromium-launched",time:new Date().toISOString(),executable,exists:executable?fs.existsSync(executable):false});
      console.log("[JAD][CHROMIUM][LAUNCHED]",{executable});
    } catch (launchError) {
      const executable=chromium.executablePath ? chromium.executablePath() : "";
      const details=errorDetails(launchError);
      console.error("[JAD][CHROMIUM][LAUNCH_FAILED]",{...details,executable,exists:executable?fs.existsSync(executable):false,platform:process.platform,arch:process.arch,node:process.version,cwd:process.cwd()});
      const launchCode=String(launchError?.code||"")==="JAD_BROWSER_UNAVAILABLE" ? "JAD_BROWSER_UNAVAILABLE" : "JAD_CHROMIUM_LAUNCH_FAILED";
      const wrapped=await diagnosticError(`فشل تشغيل Chromium: ${details.message}${executable ? ` | المسار: ${executable}` : ""}`,launchCode,launchError);
      wrapped.executablePath=executable;
      throw wrapped;
    }
    let savedStorageState=null;
    try{
      const encryptedState=String(partner.jadStorageStateEncrypted||"");
      if(encryptedState){
        const decoded=decryptIntegrationSecret(encryptedState);
        const parsed=JSON.parse(decoded);
        if(parsed&&Array.isArray(parsed.cookies))savedStorageState=parsed;
      }
    }catch(error){console.warn("[JAD][SESSION][STATE_INVALID]",String(error?.message||error));}
    const contextOptions={locale:"ar",timezoneId:"America/Toronto",userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",viewport:{width:1365,height:900},extraHTTPHeaders:{"Accept-Language":"ar,en-US;q=0.9,en;q=0.8"},ignoreHTTPSErrors:false};
    if(savedStorageState)contextOptions.storageState=savedStorageState;
    const context=await browser.newContext(contextOptions);
    await context.route("**/*",async route=>{
      const request=route.request();
      if(request.resourceType()!=="document")return route.continue();
      try{await assertSafePartnerUrl(request.url());return route.continue();}
      catch{return route.abort("blockedbyclient");}
    });
    page=await context.newPage();
    page.setDefaultTimeout(25000); page.setDefaultNavigationTimeout(45000);

    await page.goto(landingUrl,{waitUntil:"domcontentloaded"}).catch(()=>null);
    await page.waitForTimeout(900);
    await record(savedStorageState?"session-probe":"landing");
    const probeHtml=await page.content().catch(()=>"");
    const probeText=htmlText(probeHtml);
    const probeHasLogin=Boolean(await page.locator('input[type="password"],input[name="pass"],button[name="btn-login"],input[name="btn-login"]').count().catch(()=>0));
    let reusedSession=Boolean(savedStorageState&&!probeHasLogin&&!isJadLoginPage(probeHtml,page.url())&&/الصفحة الرئيسية|الحسابات|الحوالات|يورو|دولار|الرصيد/i.test(probeText));
    if(reusedSession){
      trace.push({label:"session-reused",url:page.url(),time:new Date().toISOString()});
      console.log("[JAD][SESSION][REUSED]",{partnerId:partner.id,url:page.url()});
    }else{
      await page.goto(loginUrl,{waitUntil:"domcontentloaded"});
      await record("login-page");

      const mail=page.locator('input[name="mail"],input[type="email"],input[name*="user" i],input[name*="login" i]').first();
      const pass=page.locator('input[name="pass"],input[type="password"]').first();
      if(await mail.count()===0||await pass.count()===0)throw await diagnosticError("تعذر العثور على حقول تسجيل الدخول في موقع جاد");
      await mail.fill(username); await pass.fill(password);
      const submit=page.locator('button[name="btn-login"],input[name="btn-login"],button[type="submit"],input[type="submit"]').first();
      if(await submit.count()===0)throw await diagnosticError("تعذر العثور على زر تسجيل الدخول في موقع جاد");
      await Promise.all([page.waitForNavigation({waitUntil:"domcontentloaded",timeout:30000}).catch(()=>null),submit.click()]);
      await page.waitForTimeout(1200); await record("after-credentials");

    // Detect OTP in the main page or any iframe. Jad may render Authenticator inside a nested frame.
    let otpTarget=null;
    let otpContext=null;
    let otpHint=false;
    for(const frame of page.frames()){
      const frameText=await frame.locator('body').innerText({timeout:2500}).catch(()=>"");
      if(/رمز\s*(?:التحقق|التوثيق|المصادقة)|authenticator|verification\s*code|one[- ]time|otp|2fa/i.test(frameText))otpHint=true;
      const candidates=frame.locator('input:not([type="hidden"]):not([type="password"]):not([type="email"]):not([name="mail"])');
      for(let i=0;i<await candidates.count();i+=1){
        const c=candidates.nth(i); if(!(await c.isVisible().catch(()=>false)))continue;
        const meta=await c.evaluate(el=>({name:el.name||"",id:el.id||"",type:el.type||"",inputmode:el.inputMode||"",autocomplete:el.autocomplete||"",placeholder:el.placeholder||"",maxlength:el.maxLength||0})).catch(()=>({}));
        const signature=Object.values(meta).join(" ");
        if(/otp|code|token|verify|verification|auth|two|2fa|numeric|one-time|pin/i.test(signature)||meta.maxlength===6||meta.maxlength===8){otpTarget=c;otpContext=frame;break;}
      }
      if(otpTarget)break;
    }
    if(!otpTarget&&otpHint){
      for(const frame of page.frames()){
        const candidates=frame.locator('input[type="text"],input[type="tel"],input:not([type])');
        for(let i=0;i<await candidates.count();i+=1){const c=candidates.nth(i);if(await c.isVisible().catch(()=>false)){otpTarget=c;otpContext=frame;break;}}
        if(otpTarget)break;
      }
    }
    if(otpTarget){
      if(!/^\d{6,8}$/.test(cleanOtp))throw await diagnosticError("أدخل رمز Google Authenticator الحالي ثم أعد المحاولة","JAD_OTP_REQUIRED");
      await otpTarget.fill(cleanOtp);
      const scope=otpContext||page.mainFrame();
      const otpSubmit=scope.locator('button[type="submit"],input[type="submit"],button:has-text("تأكيد"),button:has-text("تحقق"),button:has-text("دخول"),button:has-text("متابعة")').first();
      if(await otpSubmit.count())await Promise.all([page.waitForLoadState("domcontentloaded",{timeout:30000}).catch(()=>null),otpSubmit.click()]);
      else {await otpTarget.press("Enter");await page.waitForLoadState("domcontentloaded").catch(()=>null);}
      await page.waitForTimeout(1800); await record("after-otp");
    }else if(otpHint){throw await diagnosticError("ظهرت صفحة رمز التحقق ولكن لم يتمكن البرنامج من تحديد خانة الرمز","JAD_OTP_FIELD_NOT_FOUND");}
    }

    // Allow client-side redirects and intermediate transfer pages to finish.
    for(let i=0;i<8;i+=1){
      await page.waitForTimeout(650);
      const html=await page.content(); const url=page.url();
      if(!isJadLoginPage(html,url)&&!/\/log(?:_2)?\/?(?:$|[?#])/i.test(url))break;
    }
    await record("authenticated-landing");

    // Do not treat a failed login page as an authenticated session merely because
    // the URL or visible text changed. Jad sometimes returns /log with an error.
    const verifyAuthenticatedSession=async()=>{
      const html=await page.content().catch(()=>"");
      const body=htmlText(html);
      const hasPassword=await page.locator('input[type="password"],input[name="pass"]').count().catch(()=>0);
      const hasLoginButton=await page.locator('button[name="btn-login"],input[name="btn-login"]').count().catch(()=>0);
      const rejected=/(?:اسم المستخدم|كلمة المرور|بيانات الدخول).{0,35}(?:غير صحيحة|خاطئة|مرفوضة)|خطأ في تسجيل الدخول|invalid credentials|incorrect password|login failed|رمز.{0,20}(?:خاطئ|منتهي)/i.test(body);
      if((hasPassword&&hasLoginButton)||rejected){
        const reason=rejected?"رفض موقع جاد بيانات الدخول أو رمز التحقق":"بقيت صفحة تسجيل الدخول ظاهرة بعد الإرسال";
        throw await diagnosticError(`${reason}. استخدم اسم المستخدم وكلمة المرور الصحيحين ورمز Authenticator جديدًا`,"JAD_LOGIN_REJECTED");
      }
      return true;
    };
    await verifyAuthenticatedSession();

    // Read every currency card from Jad dashboard before navigating to the statement page.
    // Jad may render the cards asynchronously or inside an iframe. Poll all frames so
    // patterns such as "8,857 [EU icon] يورو لكم" are not missed.
    const collectDashboardCurrencySource=async()=>{
      const chunks=[];
      for(const frame of page.frames()){
        const text=await frame.locator("body").innerText().catch(()=>"");
        const html=await frame.content().catch(()=>"");
        if(text)chunks.push(text);
        if(html)chunks.push(html);
      }
      return chunks.join(" ");
    };
    let dashboardCurrencySource="";
    let dashboardCurrencyBalances={};
    for(let attempt=0;attempt<12;attempt+=1){
      dashboardCurrencySource=await collectDashboardCurrencySource();
      dashboardCurrencyBalances=parseJadCurrencyBalances(dashboardCurrencySource);
      const hasPrimary=dashboardCurrencyBalances.USD||dashboardCurrencyBalances.EUR;
      if(hasPrimary)break;
      await page.waitForTimeout(650);
    }
    // One extra wait for delayed secondary cards (especially EUR) after USD appears.
    if(dashboardCurrencyBalances.USD&&!dashboardCurrencyBalances.EUR){
      for(let attempt=0;attempt<8;attempt+=1){
        await page.waitForTimeout(500);
        dashboardCurrencySource=await collectDashboardCurrencySource();
        dashboardCurrencyBalances=parseJadCurrencyBalances(dashboardCurrencySource);
        if(dashboardCurrencyBalances.EUR)break;
      }
    }
    trace.push({label:"dashboard-currency-balances",url:page.url(),time:new Date().toISOString(),balances:dashboardCurrencyBalances,preview:safeText(htmlText(dashboardCurrencySource)).slice(0,1400)});

    // Jad commonly exposes the statement on pl.m even when the authenticated
    // landing URL remains /log. Probe the known authenticated endpoint first,
    // preserving the current browser session and cookies.
    const knownStatementUrls=[
      `${base}${prefix}/pl.m`,
      `${base}${prefix}/pl`,
      `${base}${prefix}/account`,
      `${base}${prefix}/statement`
    ];

    // Jad often serves the statement form directly on the authenticated landing page
    // (usually /pl.m). Do not leave that page unless no suitable form exists there.
    const findAccountForm=async()=>{
      const forms=page.locator('form');
      let best=null;
      let bestScore=-1;
      const inspected=[];
      for(let i=0;i<await forms.count();i+=1){
        const form=forms.nth(i);
        const info=await form.evaluate((node,index)=>{
          const controls=[...node.elements].map(el=>({
            name:el.name||'',id:el.id||'',type:el.type||'',tag:el.tagName||'',value:el.value||'',
            placeholder:el.placeholder||'',text:(el.innerText||el.value||'').trim()
          }));
          return {index,action:node.action||location.href,method:(node.method||'POST').toUpperCase(),controls};
        },i).catch(()=>null);
        if(!info)continue;
        const names=info.controls.map(c=>String(c.name||'').toLowerCase());
        const signature=info.controls.map(c=>`${c.name} ${c.id} ${c.placeholder} ${c.text}`).join(' ');
        let score=0;
        if(names.includes('currency')||names.some(n=>/curr|coin|money|currency_id/.test(n)))score+=5;
        if(names.includes('date2')||names.some(n=>/from|start|date_from|firstdate/.test(n)))score+=5;
        if(names.includes('date3')||names.some(n=>/to|end|date_to|lastdate/.test(n)))score+=5;
        if(/كشف\s*حساب|statement|account|الرصيد|مدين|دائن/i.test(signature))score+=4;
        if(/mail|pass|btn-login|otp|authenticator/i.test(signature))score-=12;
        inspected.push({index:i,action:info.action,method:info.method,score,names:names.filter(Boolean)});
        if(score>bestScore){bestScore=score;best=form;}
      }
      trace.push({label:'account-form-scan',url:page.url(),time:new Date().toISOString(),bestScore,forms:inspected});
      return bestScore>=7?best:null;
    };

    let accountForm=await findAccountForm();
    if(!accountForm){
      const authenticatedUrl=page.url();
      for(const target of knownStatementUrls){
        await page.goto(target,{waitUntil:'domcontentloaded'}).catch(()=>null);
        await page.waitForTimeout(850);
        await record(`known-account-page-${target.split('/').pop()||'root'}`);
        const candidateHtml=await page.content().catch(()=>'');
        if(!isJadLoginPage(candidateHtml,page.url())){
          accountForm=await findAccountForm();
          if(accountForm)break;
        }
      }
      if(!accountForm){
        await page.goto(authenticatedUrl,{waitUntil:'domcontentloaded'}).catch(()=>null);
        await page.waitForTimeout(500);
      }
      const links=await page.locator('a[href]').evaluateAll(items=>items.map((a,index)=>({
        index,href:a.href||'',text:(a.innerText||a.textContent||'').replace(/\s+/g,' ').trim()
      }))).catch(()=>[]);
      const candidates=links.map(link=>{
        let score=0;
        if(/كشف\s*حساب|حركة\s*الحساب|account\s*statement|statement/i.test(link.text))score+=20;
        if(/الحساب|account/i.test(link.text))score+=8;
        if(/pl\.m|account|statement|ledger/i.test(link.href))score+=6;
        if(/logout|signout|\/log(?:_|\/|$)|javascript:/i.test(link.href))score-=30;
        return {...link,score};
      }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
      trace.push({label:'account-link-candidates',url:page.url(),time:new Date().toISOString(),candidates:candidates.slice(0,12)});

      for(const candidate of candidates.slice(0,12)){
        await page.goto(candidate.href,{waitUntil:'domcontentloaded'}).catch(()=>null);
        await page.waitForTimeout(700);
        await record(`account-candidate-${candidate.index}`);
        const candidateHtml=await page.content().catch(()=>'');
        if(!isJadLoginPage(candidateHtml,page.url())){
          accountForm=await findAccountForm();
          if(accountForm)break;
        }
        await page.goto(authenticatedUrl,{waitUntil:'domcontentloaded'}).catch(()=>null);
        await page.waitForTimeout(500);
      }
    }

    // Final fallback: try the configured/known account URL, but never accept a
    // redirect back to the login page as a valid account page.
    if(!accountForm){
      await page.goto(accountUrl,{waitUntil:'domcontentloaded'}).catch(()=>null);
      await page.waitForLoadState('networkidle',{timeout:12000}).catch(()=>null);
      await page.waitForTimeout(900);
      await record('account-page-fallback');
      const accountHtml=await page.content().catch(()=>'');
      if(!isJadLoginPage(accountHtml,page.url()))accountForm=await findAccountForm();
    }

    if(!accountForm){
      const forms=await page.locator('form').evaluateAll(items=>items.map((form,index)=>({
        index,
        action:form.action,
        method:form.method,
        controls:[...form.elements].map(el=>({name:el.name||'',type:el.type||'',value:el.value||''})).filter(x=>x.name)
      }))).catch(()=>[]);
      trace.push({label:'account-forms-final',url:page.url(),time:new Date().toISOString(),forms});
      throw await diagnosticError('تم تسجيل الدخول، لكن لم يتم العثور على نموذج كشف الحساب في صفحات جاد المتاحة','JAD_ACCOUNT_FORM_NOT_FOUND');
    }
    await record('account-form-ready');

    const formInfo=await accountForm.evaluate(form=>({
      action:form.action,
      method:(form.method||"POST").toUpperCase(),
      controls:[...form.elements].map(el=>({
        name:el.name||"",type:el.type||"",tag:el.tagName||"",value:el.value||"",
        options:el.tagName==="SELECT"?[...el.options].map(o=>({value:o.value,text:o.text,selected:o.selected})):undefined
      })).filter(x=>x.name)
    }));
    trace.push({label:"account-form-detected",url:page.url(),time:new Date().toISOString(),form:{action:formInfo.action,method:formInfo.method,controls:formInfo.controls.map(c=>({name:c.name,type:c.type,tag:c.tag,value:/pass|token|otp/i.test(c.name)?"[hidden]":safeText(c.value)}))}});

    const setNamedValue=async(name,value)=>{
      const field=accountForm.locator(`[name="${name}"]`).first();
      if(await field.count()===0)return false;
      const tag=await field.evaluate(el=>el.tagName).catch(()=>"");
      if(tag==="SELECT"){
        const selected=await field.selectOption(String(value)).catch(()=>[]);
        if(!selected.length){
          await field.selectOption({label:String(value)}).catch(()=>[]);
        }
      }else{
        await field.fill(String(value)).catch(async()=>{await field.evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));},String(value));});
      }
      return true;
    };

    await setNamedValue("currency",String(partner.accountCurrency||"USD").toLowerCase());
    await setNamedValue("date1","date");
    await setNamedValue("date2",start);
    await setNamedValue("date3",end);

    // Select the external account only in a genuine account/customer control.
    // Never overwrite the submit button named `confirm`.
    if(accountId){
      const accountCandidates=accountForm.locator('select, input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="date"])');
      let accountChosen=false;
      for(let i=0;i<await accountCandidates.count();i+=1){
        const candidate=accountCandidates.nth(i);
        const meta=await candidate.evaluate(el=>({name:el.name||"",id:el.id||"",tag:el.tagName||"",type:el.type||"",placeholder:el.placeholder||"",options:el.tagName==="SELECT"?[...el.options].map(o=>({value:o.value,text:o.text})):[]})).catch(()=>({}));
        if(/^(currency|date1|date2|date3|confirm)$/i.test(meta.name||""))continue;
        const signature=`${meta.name||""} ${meta.id||""} ${meta.placeholder||""}`;
        const optionMatch=Array.isArray(meta.options)&&meta.options.some(o=>String(o.value)===accountId||String(o.text).includes(accountId));
        if(optionMatch||/account|client|customer|cust|member|رقم|حساب|عميل/i.test(signature)){
          if(meta.tag==="SELECT"){
            const result=await candidate.selectOption(accountId).catch(()=>[]);
            if(!result.length)await candidate.selectOption({label:accountId}).catch(()=>[]);
          }else await candidate.fill(accountId).catch(()=>null);
          accountChosen=true;
          trace.push({label:"account-selected",control:meta.name||meta.id||"unknown",time:new Date().toISOString()});
          break;
        }
      }
      if(!accountChosen)trace.push({label:"account-control-not-found",accountId:"[configured]",time:new Date().toISOString()});
    }

    let html="";
    let postedStatus=0;
    let postedUrl=page.url();
    for(let attempt=1;attempt<=3;attempt+=1){
      // Do not click Jad's disabled Save button. Serialize and POST the real form
      // from inside the authenticated browser page, preserving cookies, hidden
      // fields, disabled named controls and the submit button name/value.
      const formSnapshot=await accountForm.evaluate(form=>({
        action:form.action||location.href,
        method:(form.method||"POST").toUpperCase(),
        valid:typeof form.checkValidity==="function"?form.checkValidity():true,
        controls:[...form.elements].map(el=>({
          name:el.name||"",type:el.type||"",tag:el.tagName||"",value:el.value||"",
          disabled:Boolean(el.disabled),required:Boolean(el.required),
          valid:el.validity?el.validity.valid:true,validationMessage:el.validationMessage||""
        })).filter(item=>item.name)
      })).catch(()=>null);
      trace.push({label:`account-form-state-${attempt}`,time:new Date().toISOString(),form:formSnapshot?{
        action:formSnapshot.action,method:formSnapshot.method,valid:formSnapshot.valid,
        controls:formSnapshot.controls.map(c=>({name:c.name,type:c.type,tag:c.tag,value:/pass|token|otp/i.test(c.name)?"[hidden]":safeText(c.value),disabled:c.disabled,required:c.required,valid:c.valid,validationMessage:safeText(c.validationMessage)}))
      }:null});

      const posted=await accountForm.evaluate(async form=>{
        const pairs=[];
        const add=(name,value)=>{if(name)pairs.push([String(name),String(value??"")]);};
        for(const el of [...form.elements]){
          if(!el.name)continue;
          const type=String(el.type||"").toLowerCase();
          if((type==="checkbox"||type==="radio")&&!el.checked)continue;
          if(el.tagName==="SELECT"&&el.multiple){
            for(const option of [...el.selectedOptions])add(el.name,option.value);
          }else if(type!=="submit"&&type!=="button"&&type!=="reset"&&type!=="file"){
            add(el.name,el.value);
          }
        }
        const submitter=form.querySelector('[name="confirm"],button[type="submit"],input[type="submit"]');
        if(submitter&&submitter.name)add(submitter.name,submitter.value||"");
        const body=new URLSearchParams();
        for(const [key,value] of pairs)body.append(key,value);
        const target=new URL(form.action||location.href,location.href).href;
        const method=(form.method||"POST").toUpperCase();
        const response=await fetch(target,{
          method,credentials:"include",redirect:"follow",
          headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8","Accept":"text/html,application/xhtml+xml"},
          body:method==="GET"?undefined:body.toString()
        });
        return {status:response.status,url:response.url,html:await response.text(),payload:[...body.entries()]};
      }).catch(error=>({error:String(error&&error.message||error)}));

      if(!posted||posted.error){
        trace.push({label:`account-direct-post-error-${attempt}`,time:new Date().toISOString(),error:posted?.error||"unknown"});
        await page.waitForTimeout(700*attempt);
        continue;
      }

      postedUrl=posted.url;
      postedStatus=posted.status;
      html=posted.html;
      const text=safeText(htmlText(html).slice(0,1200));
      trace.push({label:`account-direct-post-${attempt}`,url:postedUrl,status:postedStatus,time:new Date().toISOString(),payload:posted.payload.map(([k,v])=>[k,/pass|token|otp/i.test(k)?"[hidden]":safeText(v)]),text});
      if(postedStatus>=200&&postedStatus<400&&(/<tbody/i.test(html)||/كشف\s*حساب|الرصيد|مدين|دائن|حركة/i.test(text)))break;
      await page.waitForTimeout(900*attempt);
    }

    if(postedStatus<200||postedStatus>=400)throw await diagnosticError(`تعذر إرسال نموذج كشف الحساب الحقيقي إلى جاد (${postedStatus})`,"JAD_ACCOUNT_POST_FAILED");
    if(isJadLoginPage(html,postedUrl)&&!/<tbody/i.test(html))throw await diagnosticError("رفض موقع جاد الجلسة عند طلب كشف الحساب؛ أدخل رمز Authenticator جديدًا","JAD_SESSION_REJECTED");
    if(!/<tbody/i.test(html)&&!/كشف\s*حساب|الرصيد|مدين|دائن|حركة/i.test(htmlText(html)))throw await diagnosticError("تم تسجيل الدخول وإرسال النموذج، لكن جاد لم يعرض كشف الحساب. تحقق من رقم الحساب الخارجي أو اختر الحساب الصحيح","JAD_STATEMENT_NOT_FOUND");
    const statement=parseJadStatement(html);
    const currencyBalances={...dashboardCurrencyBalances};
    const statementCurrency=String(partner.accountCurrency||"USD").toUpperCase();
    if(!currencyBalances[statementCurrency] && (statement.receivable||statement.payable||statement.balance)){
      currencyBalances[statementCurrency]={receivable:statement.receivable,payable:statement.payable,balance:statement.balance};
    }
    const freshStorageState=await context.storageState().catch(()=>null);
    return {...statement,currencies:currencyBalances,fromDate:start,toDate:end,mode:"BROWSER",diagnostic:trace.slice(-10),_storageState:freshStorageState};
  }catch(error){
    if(!error.jadTrace)error.jadTrace=trace.slice(-16);
    if(!error.jadArtifacts)error.jadArtifacts=await saveDiagnosticArtifacts(error.code||"JAD_ERROR");
    if(!error.jadDetails)error.jadDetails=errorDetails(error);
    console.error("[JAD][FAILURE]",{code:error.code||"JAD_ERROR",message:error.message,details:error.jadDetails,trace:error.jadTrace,artifacts:error.jadArtifacts});
    throw error;
  }finally{
    if(browser)await browser.close().catch(closeError=>console.error("[JAD][CHROMIUM][CLOSE_FAILED]",errorDetails(closeError)));
    console.log("[JAD][END]",{partnerId:partner.id,time:new Date().toISOString()});
  }
}

async function syncJadPartner(partner,options={}){
  const mode=String(process.env.JAD_CONNECTOR_MODE||"browser").toLowerCase();
  if(mode==="http")return syncJadPartnerHttp(partner,options);
  try{
    return await syncJadPartnerBrowser(partner,options);
  }catch(error){
    // إذا رفض جاد الجلسة المحفوظة، نعيد المحاولة مرة واحدة بجلسة جديدة.
    // هذا يعيد سلوك الربط البسيط الذي كان أكثر استقرارًا في الإصدارات القديمة.
    const hasSavedSession=Boolean(partner?.jadStorageStateEncrypted);
    if(hasSavedSession && ["JAD_SESSION_REJECTED","JAD_LOGIN_REJECTED"].includes(String(error?.code||""))){
      console.warn("[JAD][SESSION][RETRY_FRESH]",{partnerId:partner.id,code:error.code});
      const freshPartner={...partner,jadStorageStateEncrypted:""};
      return await syncJadPartnerBrowser(freshPartner,options);
    }
    const allowFallback=String(process.env.JAD_HTTP_FALLBACK||"false").toLowerCase()==="true";
    if(!allowFallback||error?.code!=="JAD_BROWSER_UNAVAILABLE")throw error;
    console.warn("[JAD] Browser connector unavailable; falling back to HTTP connector:",error?.message||error);
    return syncJadPartnerHttp(partner,options);
  }
}


function partnerLocalBalancesCad(store,partnerId){
  const transactions=(Array.isArray(store.partnerTransactions)?store.partnerTransactions:[]).filter(item=>item.partnerId===partnerId);
  const payments=(Array.isArray(store.partnerPayments)?store.partnerPayments:[]).filter(item=>item.partnerId===partnerId);
  const currencies=new Set([...transactions.map(item=>String(item.currency||"CAD").toUpperCase()),...payments.map(item=>String(item.currency||"CAD").toUpperCase())]);
  let receivable=0,payable=0;const missingRates=new Set();let ratesUpdatedAt=null;
  for(const currency of currencies){
    const txReceivable=transactions.filter(item=>item.type==="RECEIVABLE"&&String(item.currency||"CAD").toUpperCase()===currency).reduce((sum,item)=>sum+safeNumber(item.amount),0);
    const txPayable=transactions.filter(item=>item.type==="PAYABLE"&&String(item.currency||"CAD").toUpperCase()===currency).reduce((sum,item)=>sum+safeNumber(item.amount),0);
    const received=payments.filter(item=>item.direction==="RECEIVED"&&String(item.currency||"CAD").toUpperCase()===currency).reduce((sum,item)=>sum+safeNumber(item.amount),0);
    const paid=payments.filter(item=>item.direction==="PAID"&&String(item.currency||"CAD").toUpperCase()===currency).reduce((sum,item)=>sum+safeNumber(item.amount),0);
    const net=txReceivable-txPayable-received+paid;
    if(Math.abs(net)<=0.001)continue;
    const conversion=currencyConversion(store,currency,"CAD");
    if(!conversion){missingRates.add(currency);continue;}
    const cad=Math.abs(net)*conversion.factor;
    if(net>0)receivable+=cad;else payable+=cad;
    if(conversion.updatedAt&&(!ratesUpdatedAt||conversion.updatedAt>ratesUpdatedAt))ratesUpdatedAt=conversion.updatedAt;
  }
  return {receivable,payable,net:receivable-payable,missingRates:[...missingRates],ratesUpdatedAt};
}

app.get("/api/partners", auth, async (req,res)=>{
  const store=readStore();
  const summaryCurrency=String(req.query.summaryCurrency||"CAD").toUpperCase();
  const missingRates=new Set();
  let ratesUpdatedAt=null;
  const convertedTotals={receivable:0,payable:0};
  const addConverted=(amount,currency,type)=>{
    const value=Math.max(safeNumber(amount),0);
    if(value<=0.001)return;
    const conversion=currencyConversion(store,String(currency||summaryCurrency).toUpperCase(),summaryCurrency);
    if(!conversion){missingRates.add(String(currency||summaryCurrency).toUpperCase());return;}
    convertedTotals[type]+=value*conversion.factor;
    if(conversion.updatedAt&&(!ratesUpdatedAt||conversion.updatedAt>ratesUpdatedAt))ratesUpdatedAt=conversion.updatedAt;
  };
  const partners=await branchSafeRead(req,"partners",()=>nativeRepositories.partners.listByCompany(req.user.companyId,{orderBy:"name ASC"}),()=>Array.from(store.partners||[]));
  const transactions=Array.isArray(store.partnerTransactions)?store.partnerTransactions:[];
  const payments=Array.isArray(store.partnerPayments)?store.partnerPayments:[];

  const rows=partners.map(partner=>{
    const localBalance=partnerLocalBalancesCad(store,partner.id);
    const localReceivable=localBalance.receivable;
    const localPayable=localBalance.payable;
    for(const currency of localBalance.missingRates)missingRates.add(currency);

    const multi=partner.externalBalances&&typeof partner.externalBalances==="object"?partner.externalBalances:null;
    const entries=multi?Object.entries(multi).filter(([currency,value])=>currency&&value&&typeof value==="object"):[];
    let externalReceivable=0;
    let externalPayable=0;
    if(entries.length){
      for(const [currency,value] of entries){
        const itemReceivable=Math.max(safeNumber(value.receivable),0);
        const itemPayable=Math.max(safeNumber(value.payable),0);
        addConverted(itemReceivable,currency,"receivable");
        addConverted(itemPayable,currency,"payable");
        if(String(currency).toUpperCase()===String(partner.accountCurrency||"USD").toUpperCase()){
          externalReceivable+=itemReceivable;externalPayable+=itemPayable;
        }
      }
    }else{
      externalReceivable=Math.max(safeNumber(partner.externalReceivable),0);
      externalPayable=Math.max(safeNumber(partner.externalPayable),0);
      if(externalReceivable<=0.001&&externalPayable<=0.001){
        const balance=safeNumber(partner.externalBalance);
        if(balance>0)externalReceivable=balance;
        if(balance<0)externalPayable=Math.abs(balance);
      }
      addConverted(externalReceivable,partner.accountCurrency||"USD","receivable");
      addConverted(externalPayable,partner.accountCurrency||"USD","payable");
    }
    // Partner transactions are stored in their normalized CAD value.
    addConverted(localReceivable,"CAD","receivable");
    addConverted(localPayable,"CAD","payable");

    // Never add CAD local balances to a foreign-currency external balance directly.
    // Every displayed company total is normalized independently using the latest automatic rate.
    let partnerCadReceivable=localReceivable;
    let partnerCadPayable=localPayable;
    let partnerRateUpdatedAt=null;
    const partnerRateSources=new Set();
    const addPartnerCad=(amount,currency,type)=>{
      const value=Math.max(safeNumber(amount),0);
      if(value<=0.001)return;
      const conversion=currencyConversion(store,String(currency||"CAD").toUpperCase(),"CAD");
      if(!conversion)return;
      if(type==="receivable")partnerCadReceivable+=value*conversion.factor;
      else partnerCadPayable+=value*conversion.factor;
      if(conversion.updatedAt&&(!partnerRateUpdatedAt||conversion.updatedAt>partnerRateUpdatedAt))partnerRateUpdatedAt=conversion.updatedAt;
      for(const source of conversion.sources||[])partnerRateSources.add(source);
    };
    if(entries.length){
      for(const [currency,value] of entries){
        addPartnerCad(Math.max(safeNumber(value.receivable),0),currency,"receivable");
        addPartnerCad(Math.max(safeNumber(value.payable),0),currency,"payable");
      }
    }else{
      addPartnerCad(externalReceivable,partner.accountCurrency||"USD","receivable");
      addPartnerCad(externalPayable,partner.accountCurrency||"USD","payable");
    }

    const {passwordEncrypted,...publicPartner}=partner;
    return {
      ...publicPartner,
      hasPassword:Boolean(passwordEncrypted),
      // Legacy fields now have an explicit currency and no longer mix currencies.
      receivable:+partnerCadReceivable.toFixed(2),
      payable:+partnerCadPayable.toFixed(2),
      net:+(partnerCadReceivable-partnerCadPayable).toFixed(2),
      balanceCurrency:"CAD",
      cadReceivable:+partnerCadReceivable.toFixed(2),
      cadPayable:+partnerCadPayable.toFixed(2),
      cadNet:+(partnerCadReceivable-partnerCadPayable).toFixed(2),
      automaticRateUpdatedAt:partnerRateUpdatedAt,
      automaticRateSource:[...partnerRateSources].join("، ")||null
    };
  }).sort((a,b)=>String(a.name).localeCompare(String(b.name),"ar"));

  res.json({
    rows,
    summaryCurrency,
    missingRates:[...missingRates],
    ratesUpdatedAt,
    totals:{
      receivable:+convertedTotals.receivable.toFixed(2),
      payable:+convertedTotals.payable.toFixed(2),
      net:+(convertedTotals.receivable-convertedTotals.payable).toFixed(2)
    }
  });
});


function resolvePartnerConnector(partner={}){
  const raw=String(partner.connectorType||"").trim().toUpperCase();
  if(raw==="DAHAB")return "DAHAB";
  if(raw==="SURYANA")return "SURYANA";
  if(["TAWASUL","KONTORUN"].includes(raw))return "TAWASUL";
  if(raw==="JAD"){
    const identity=`${partner.name||""} ${partner.integrationName||""}`.toLowerCase();
    if(/تواصل|tawasul|kontorun/.test(identity))return "TAWASUL";
    return "JAD";
  }
  const identity=`${partner.name||""} ${partner.integrationName||""}`.toLowerCase();
  if(/تواصل|tawasul|kontorun/.test(identity))return "TAWASUL";
  return raw||"GENERIC";
}
function normalizeConnectorType(value){
  const raw=String(value||"GENERIC").trim().toUpperCase();
  return raw==="KONTORUN"?"TAWASUL":raw;
}

function parseJsonpPayload(text){
  const raw=String(text||"").trim();
  if(!raw)throw Object.assign(new Error("استجابة فارغة من شركة الحوالات"),{code:"KONTORUN_EMPTY_RESPONSE"});
  try{return JSON.parse(raw)}catch{}
  const match=raw.match(/^[^(]*\(([\s\S]*)\)\s*;?\s*$/);
  if(!match)throw Object.assign(new Error("تعذر قراءة استجابة شركة الحوالات"),{code:"KONTORUN_INVALID_RESPONSE"});
  try{return JSON.parse(match[1])}catch{throw Object.assign(new Error("صيغة استجابة شركة الحوالات غير صالحة"),{code:"KONTORUN_INVALID_JSON"})}
}
function kontorunBaseUrl(partner={}){
  const raw=String(partner.systemUrl||"https://www.krs47n92t.com").trim()||"https://www.krs47n92t.com";
  const withProtocol=/^https?:\/\//i.test(raw)?raw:`https://${raw}`;
  const parsed=new URL(withProtocol);
  if(IS_PROD&&parsed.protocol!=="https:")throw new Error("يجب استخدام HTTPS لروابط الشركات الخارجية");
  const segments=parsed.pathname.split("/").filter(Boolean);
  const scriptIndex=segments.findIndex(part=>/^(?:index\.php|api)$/i.test(part));
  const prefix=(scriptIndex>=0?segments.slice(0,scriptIndex):segments).join("/");
  return `${parsed.protocol}//${parsed.host}/${prefix?`${prefix}/`:""}`;
}
async function kontorunJsonp(base,route,{cookie="",csrf="",params={}}={}){
  const url=new URL(route,base);
  url.searchParams.set("callback",`alaboud_${Date.now()}_${Math.random().toString(16).slice(2)}`);
  for(const [key,value] of Object.entries(params||{}))if(value!==undefined&&value!==null&&String(value)!=="")url.searchParams.set(key,String(value));
  const headers={
    Accept:"*/*",
    "Accept-Language":"ar,en-CA;q=0.9,en;q=0.8",
    "Cache-Control":"no-cache",
    Pragma:"no-cache",
    Referer:`${base}/`,
    "User-Agent":"Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36"
  };
  if(csrf)headers["X-CSRF-Token"]=csrf;
  const result=await fetchWithCookies(url.toString(),{method:"GET",headers},cookie,{maxRedirects:4});
  const text=await result.response.text();
  if(!result.response.ok)throw Object.assign(new Error(`فشل اتصال شركة الحوالات (${result.response.status})`),{code:"KONTORUN_HTTP_ERROR"});
  return {data:parseJsonpPayload(text),cookie:result.cookie,url:result.url};
}
function parseKontorunAmount(value){
  let text=String(value??"").trim();
  if(!text)return 0;
  const arabicDigits={"٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9","۰":"0","۱":"1","۲":"2","۳":"3","۴":"4","۵":"5","۶":"6","۷":"7","۸":"8","۹":"9"};
  text=text.replace(/[٠-٩۰-۹]/g,ch=>arabicDigits[ch]||ch).replace(/٫/g,".").replace(/٬/g,",");
  const negative=/^\(.*\)$/.test(text)||/-\s*$/.test(text)||/^\s*-/.test(text);
  text=text.replace(/[()]/g,"").replace(/-\s*$/g,"").replace(/^\s*-/,"").replace(/\s/g,"").replace(/[^0-9+,.-]/g,"");
  if(!text)return 0;
  const lastComma=text.lastIndexOf(","),lastDot=text.lastIndexOf(".");
  if(lastComma>=0&&lastDot>=0){
    const decimalPos=Math.max(lastComma,lastDot);
    const integer=text.slice(0,decimalPos).replace(/[.,]/g,"");
    const fraction=text.slice(decimalPos+1).replace(/[.,]/g,"");
    text=`${integer}.${fraction}`;
  }else if(lastComma>=0){
    const parts=text.split(",");
    // Tawasul uses a comma as a thousands separator for balances such as
    // 20,908 and 8,857, while decimal comma values normally have 1-2 digits.
    text=(parts.length===2&&parts[1].length<=2)?`${parts[0]}.${parts[1]}`:parts.join("");
  }else if((text.match(/\./g)||[]).length>1){
    const parts=text.split(".");
    const fraction=parts.pop();
    text=fraction.length<=3?`${parts.join("")}.${fraction}`:[...parts,fraction].join("");
  }
  const number=Number(text);
  return Number.isFinite(number)?(negative?-Math.abs(number):number):0;
}
function kontorunRows(payload){
  if(Array.isArray(payload))return payload;
  if(!payload||typeof payload!=="object")return [];
  // Some Tawasul versions return one balance object directly instead of an
  // array. Recognize it before walking nested response envelopes.
  if(["AMS","ams","Balance","balance","Amount","amount"].some(key=>payload[key]!==undefined))return [payload];
  for(const key of ["data","rows","result","balances","amounts","AMS","items","list"]){
    if(Array.isArray(payload[key]))return payload[key];
  }
  for(const value of Object.values(payload)){
    if(Array.isArray(value)&&value.some(item=>item&&typeof item==="object"))return value;
    if(value&&typeof value==="object"){
      const nested=kontorunRows(value);if(nested.length)return nested;
    }
  }
  return [];
}
function kontorunAmountFromItem(item={}){
  const preferredKeys=["AMS","ams","SystemAmount","systemAmount","RegularAmount","regularAmount","NIZAMI","nizami","Balance","balance","Amount","amount","AM","NET","Net","net","Value","value","TOTAL","Total","total"];
  for(const key of preferredKeys){
    if(item[key]!==undefined&&item[key]!==null&&String(item[key]).trim()!=="")return parseKontorunAmount(item[key]);
  }
  return 0;
}
function normalizeKontorunText(value){
  return String(value??"")
    .normalize("NFKC")
    .replace(/[\u00A0\u2007\u202F]/g," ")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g,"")
    .replace(/\s+/g," ")
    .trim();
}
function mapKontorunCurrency(item={}){
  const raw=normalizeKontorunText(item.CName||item.cname||item.CURN||item.CurName||item.CurrencyName||item.Currency||item.currency||item.CUR||item.CURID||item.CurrencyCode||item.Code).toUpperCase();
  const compact=raw.replace(/[^A-Z]/g,"");
  if(compact==="US"||compact==="USD")return "USD";
  if(compact==="EU"||compact==="EUR")return "EUR";
  if(compact==="SY"||compact==="SYP")return "SYP";
  if(compact==="TR"||compact==="TRY")return "TRY";
  if(compact==="CA"||compact==="CAD")return "CAD";
  const aliases=[
    ["ليرة سورية جديدة","SYP"],["الليرة السورية الجديدة","SYP"],
    ["ليرة سورية","SYP"],["الليرة السورية","SYP"],
    ["ليرة تركية","TRY"],["الليرة التركية","TRY"],
    ["دولار كندي","CAD"],["الدولار الكندي","CAD"],
    ["دولار أمريكي","USD"],["الدولار الأمريكي","USD"],
    ["دولار","USD"],["يورو","EUR"],["الليرة النظامية","SYP"],["المبلغ النظامي","SYP"],["نظامي","SYP"],
    ["USD","USD"],["EUR","EUR"],["TRY","TRY"],["SYP","SYP"],["CAD","CAD"]
  ];
  for(const [name,code] of aliases){
    if(raw.includes(normalizeKontorunText(name).toUpperCase()))return code;
  }
  return /^[A-Z]{3}$/.test(raw)?raw:"UNKNOWN";
}
async function syncKontorunPartner(partner,{fromDate,toDate,otp}={}){
  const base=kontorunBaseUrl(partner);
  const username=String(partner.username||"").trim();
  const password=decryptIntegrationSecret(partner.passwordEncrypted);
  if(!username||!password)throw Object.assign(new Error("اسم المستخدم وكلمة المرور مطلوبان"),{code:"KONTORUN_CREDENTIALS_REQUIRED"});
  let cookie="",csrf="";
  let login=await kontorunJsonp(base,"api/index.php?p=l&f=in",{cookie,params:{username,password}});cookie=login.cookie;
  let profile=login.data||{};
  if(String(profile.ID)==="0")throw Object.assign(new Error("بيانات الدخول غير صحيحة"),{code:"KONTORUN_LOGIN_REJECTED"});
  if(String(profile.ID).toUpperCase()==="OK"){
    const token=profile.token||profile.Token||profile.TOKEN;
    const cleanOtp=String(otp||"").replace(/\D/g,"");
    if(!cleanOtp)throw Object.assign(new Error("مطلوب رمز التحقق من تطبيق التوثيق"),{code:"KONTORUN_OTP_REQUIRED"});
    const verified=await kontorunJsonp(base,"api/index.php?p=l&f=a",{cookie,params:{pin:cleanOtp,token}});cookie=verified.cookie;profile=verified.data||{};
    if(String(profile.ID)==="0")throw Object.assign(new Error("رمز التحقق غير صحيح أو منتهي"),{code:"KONTORUN_OTP_REJECTED"});
  }
  csrf=String(profile.CSRF||profile.csrf||"");
  // The dedicated balances screen in the official Tawasul app uses f=ams.
  // Keep GA only as a fallback because some older server versions expose balances there.
  let balancesResponse=await kontorunJsonp(base,"api/index.php?p=mt&f=ams",{cookie,csrf});cookie=balancesResponse.cookie;
  let rows=kontorunRows(balancesResponse.data);
  if(!rows.length){
    const fallback=await kontorunJsonp(base,"api/index.php?p=mt&f=GA",{cookie,csrf});cookie=fallback.cookie;
    balancesResponse=fallback;rows=kontorunRows(fallback.data);
  }
  if(!rows.length&&String(balancesResponse.data?.ID||"")==="0")throw Object.assign(new Error("انتهت جلسة الشركة؛ أعد إدخال رمز التحقق"),{code:"KONTORUN_SESSION_REJECTED"});
  if(!rows.length)throw Object.assign(new Error("تم تسجيل الدخول لكن لم تُرجع شركة تواصل قائمة الأرصدة"),{code:"KONTORUN_BALANCES_EMPTY"});
  const currencies={};
  const balanceRows=rows.map(item=>({
    currency:mapKontorunCurrency(item),
    name:normalizeKontorunText(item.CName||item.CURN||item.CurrencyName||item.Currency||""),
    amount:kontorunAmountFromItem(item)
  }));
  for(const row of balanceRows){
    if(row.currency==="UNKNOWN")continue;
    if(!currencies[row.currency])currencies[row.currency]={balance:0,receivable:0,payable:0};
    currencies[row.currency].balance+=row.amount;
    if(row.amount>0)currencies[row.currency].receivable+=row.amount;
    if(row.amount<0)currencies[row.currency].payable+=Math.abs(row.amount);
  }
  for(const value of Object.values(currencies)){
    value.balance=+value.balance.toFixed(2);
    value.receivable=+value.receivable.toFixed(2);
    value.payable=+value.payable.toFixed(2);
  }
  const preferred=String(partner.accountCurrency||"USD").toUpperCase();
  // Tawasul may return a correct row (for example "دولار = 187") while an older
  // aggregate field is zero. Always derive the stored partner balance from rows.
  const preferredRows=balanceRows.filter(row=>row.currency===preferred);
  const preferredBalance=preferredRows.reduce((sum,row)=>sum+row.amount,0);
  const main=currencies[preferred]||Object.values(currencies)[0]||{balance:0,receivable:0,payable:0};
  if(preferredRows.length){
    main.balance=+preferredBalance.toFixed(2);
    main.receivable=preferredBalance>0?+preferredBalance.toFixed(2):0;
    main.payable=preferredBalance<0?+Math.abs(preferredBalance).toFixed(2):0;
    currencies[preferred]={...main};
  }
  console.info("[TAWASUL_BALANCE_ROWS]",JSON.stringify({partnerId:partner.id,preferred,balanceRows,currencies,selected:main}));
  const start=fromDate||partner.syncFromDate||new Date(Date.now()-365*86400000).toISOString().slice(0,10);
  const end=toDate||new Date().toISOString().slice(0,10);
  let movements=[];
  try{
    const statement=await kontorunJsonp(base,"api/index.php?p=mt&f=aspro",{cookie,csrf,params:{cur:partner.externalAccountId||"1",fr:start,to:end}});
    const list=Array.isArray(statement.data)?statement.data:[];
    movements=list.map(item=>({externalId:String(item.ID||""),date:String(item.Date||""),name:String(item.Name||""),phone:String(item.Phone||""),amount:parseKontorunAmount(item.Value),fees:parseKontorunAmount(item.Fees),balance:parseKontorunAmount(item.AM),currency:mapKontorunCurrency(item),raw:item}));
  }catch{}
  return {balance:main.balance,receivable:main.receivable,payable:main.payable,currencies,movements,profile:{id:profile.ID||"",name:profile.Name||""},balanceRows};
}

function dahabUrls(partner={}){
  const raw=String(partner.systemUrl||"https://endulusmt2.com/branch/index.php?p=l&f=i").trim();
  const parsed=new URL(/^https?:\/\//i.test(raw)?raw:`https://${raw}`);
  if(IS_PROD&&parsed.protocol!=="https:")throw new Error("يجب استخدام HTTPS لروابط الشركات الخارجية");
  const loginPath=parsed.pathname&&/index\.php$/i.test(parsed.pathname)?parsed.pathname:"/branch/index.php";
  return {origin:parsed.origin,login:`${parsed.origin}${loginPath}?p=l&f=i`,report:`${parsed.origin}/clman/index.php`};
}
function dahabDate(value){
  const date=value?new Date(`${value}T12:00:00Z`):new Date();
  if(Number.isNaN(date.getTime()))return dahabDate();
  return `${String(date.getUTCDate()).padStart(2,"0")}-${String(date.getUTCMonth()+1).padStart(2,"0")}-${date.getUTCFullYear()}`;
}
function decodeHtmlText(html){
  return String(html||"")
    .replace(/<script\b[\s\S]*?<\/script>/gi," ").replace(/<style\b[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;/gi," ").replace(/&minus;|&#8722;/gi,"-")
    .replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'")
    .replace(/\s+/g," ").trim();
}
function dahabCurrencyFromHtml(html,fallback="USD"){
  const text=decodeHtmlText(html).toUpperCase();
  for(const code of ["USD","EUR","TRY","SYP","CAD","SAR","AED","JOD"])if(new RegExp(`(?:^|[^A-Z])${code}(?:[^A-Z]|$)`).test(text))return code;
  return String(fallback||"USD").toUpperCase();
}
function dahabBalanceFromHtml(html){
  const raw=String(html||"");
  const candidates=[];
  const addAmounts=text=>{
    const normalized=decodeHtmlText(text)
      .replace(/\b[0-9٠-٩۰-۹]{1,2}[-\/]\s*[0-9٠-٩۰-۹]{1,2}[-\/]\s*[0-9٠-٩۰-۹]{2,4}\b/g," ")
      .replace(/\b[0-9٠-٩۰-۹]{1,2}:[0-9٠-٩۰-۹]{2}(?::[0-9٠-٩۰-۹]{2})?\b/g," ");
    // Never pass a whole nested table cell to the number parser: doing so can
    // concatenate dates and several amounts into one exponential-size value.
    for(const token of normalized.match(/[-−]?\s*[0-9٠-٩۰-۹]+(?:[.,٬٫][0-9٠-٩۰-۹]+)*-?/g)||[]){
      const amount=parseKontorunAmount(token.replace(/−/g,"-"));
      if(Number.isFinite(amount)&&Math.abs(amount)<=1e12)candidates.push(amount);
    }
  };
  // The Dahab report renders monetary cells with da/mad classes. Prefer the
  // final running-balance cell, while also supporting pages labelled الرصيد/الصافي.
  for(const match of raw.matchAll(/<(?:td|div|span)[^>]*class=["'][^"']*(?:\bda\b|\bmad\b|balance|saldo)[^"']*["'][^>]*>([\s\S]*?)<\/(?:td|div|span)>/gi)){
    addAmounts(match[1]);
  }
  const plain=decodeHtmlText(raw);
  for(const match of plain.matchAll(/(?:الرصيد|الصافي|balance|saldo)\s*[:：-]?\s*([-−]?\s*[0-9٠-٩۰-۹]+(?:[.,٬٫][0-9٠-٩۰-۹]+)*-?)/gi))addAmounts(match[1]);
  const finite=candidates.filter(Number.isFinite);
  if(!finite.length)throw Object.assign(new Error("تم تسجيل الدخول إلى دهب لكن تعذر تحديد خانة الرصيد من التقرير"),{code:"DAHAB_BALANCE_NOT_FOUND"});
  const selected=finite[finite.length-1];
  if(Math.abs(selected)>1e12)throw Object.assign(new Error("أعاد تقرير دهب رقمًا غير منطقي؛ لم يتم حفظه لحماية الحسابات"),{code:"DAHAB_BALANCE_OUT_OF_RANGE"});
  return selected;
}
function dahabDashboardBalance(html){
  const text=decodeHtmlText(html);
  const numberPattern="[-−]?[0-9٠-٩۰-۹]+(?:[.,٬٫][0-9٠-٩۰-۹]+)*";
  const patterns=[
    new RegExp(`(?:دولار|USD)\\s*[:：-]?\\s*(${numberPattern})`,"i"),
    new RegExp(`(${numberPattern})\\s*(?:دولار|USD)`,"i")
  ];
  for(const pattern of patterns){
    const match=text.match(pattern);
    if(!match)continue;
    const value=parseKontorunAmount(match[1].replace(/−/g,"-"));
    if(Number.isFinite(value)&&Math.abs(value)<=1e12)return value;
  }
  return null;
}
function dahabOtpForm(html,baseUrl){
  const form=String(html||"").match(/<form\b([^>]*)>([\s\S]*?)<\/form>/i);
  if(!form)return null;
  const inputs=[...form[2].matchAll(/<input\b([^>]*)>/gi)].map(match=>{
    const attrs=match[1];
    const name=attrs.match(/\bname=["']([^"']+)["']/i)?.[1]||"";
    const value=attrs.match(/\bvalue=["']([^"']*)["']/i)?.[1]||"";
    return {name,value};
  }).filter(item=>item.name);
  const otpInput=inputs.find(item=>/(?:otp|pin|code|auth|verify|token|sms)/i.test(item.name));
  if(!otpInput)return null;
  const action=form[1].match(/\baction=["']([^"']*)["']/i)?.[1]||baseUrl;
  return {url:new URL(action,baseUrl).toString(),inputs,otpName:otpInput.name};
}
async function syncDahabPartner(partner,{fromDate,toDate,otp}={}){
  const {origin,login,report}=dahabUrls(partner);
  const username=String(partner.username||"").trim();
  const password=decryptIntegrationSecret(partner.passwordEncrypted);
  if(!username||!password)throw Object.assign(new Error("اسم المستخدم وكلمة المرور لشركة دهب مطلوبان"),{code:"DAHAB_CREDENTIALS_REQUIRED"});
  const userAgent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
  const commonHeaders={Accept:"text/html,application/xhtml+xml","Accept-Language":"ar,en;q=0.8","User-Agent":userAgent,Referer:login};
  // Dahab initializes a PHP session on the login-page GET and its JavaScript
  // submits a 128-bit browser fingerprint plus base64 device details.
  const landing=await fetchWithCookies(login,{method:"GET",headers:commonHeaders},"",{maxRedirects:4});
  if(!landing.response.ok)throw Object.assign(new Error(`تعذر فتح صفحة دخول دهب (${landing.response.status})`),{code:"DAHAB_LOGIN_PAGE_ERROR"});
  await landing.response.text();
  const fingerprintDetails=["userAgent = "+userAgent,"language = ar","platform = Win32","timezone = America/Toronto","screenResolution = 1920,1080"].join("\n");
  const fingerprint=crypto.createHash("md5").update(`${userAgent}|${username}|alaboud-dahab`).digest("hex");
  const headers={...commonHeaders,"Content-Type":"application/x-www-form-urlencoded",Origin:origin};
  const body=new URLSearchParams({username,password,hash:fingerprint,dt:Buffer.from(fingerprintDetails,"utf8").toString("base64"),login:""});
  let result=await fetchWithCookies(login,{method:"POST",headers,body:body.toString()},landing.cookie,{maxRedirects:6});
  let cookie=result.cookie;
  let html=await result.response.text();
  if(!result.response.ok)throw Object.assign(new Error(`فشل تسجيل الدخول إلى دهب (${result.response.status})`),{code:"DAHAB_HTTP_ERROR"});
  const otpForm=dahabOtpForm(html,result.url||login);
  if(otpForm){
    const cleanOtp=String(otp||"").replace(/\D/g,"");
    if(!cleanOtp)throw Object.assign(new Error("مطلوب رمز Google Authenticator لشركة دهب"),{code:"DAHAB_OTP_REQUIRED"});
    const otpBody=new URLSearchParams();
    for(const input of otpForm.inputs)otpBody.set(input.name,input.name===otpForm.otpName?cleanOtp:input.value);
    result=await fetchWithCookies(otpForm.url,{method:"POST",headers:{...headers,Referer:result.url||login},body:otpBody.toString()},cookie,{maxRedirects:6});
    cookie=result.cookie;html=await result.response.text();
  }
  if(/name=["']username["']/i.test(html)&&/name=["']password["']/i.test(html))throw Object.assign(new Error("رفض موقع دهب تسجيل الدخول. تأكد من اسم المستخدم وكلمة المرور، وإذا كانا صحيحين فقد يمنع الموقع دخول خادم Render"),{code:"DAHAB_LOGIN_REJECTED"});
  // The home card is the authoritative Dahab balance. Statement pages also
  // contain movement totals, which are not the current account balance.
  const dashboardBalance=dahabDashboardBalance(html);
  if(dashboardBalance!==null){
    const currency="USD";
    const normalized={balance:+dashboardBalance.toFixed(2),receivable:dashboardBalance>0?+dashboardBalance.toFixed(2):0,payable:dashboardBalance<0?+Math.abs(dashboardBalance).toFixed(2):0};
    return {...normalized,currencies:{[currency]:normalized},movements:[],balanceRows:[{currency,amount:normalized.balance,source:"dashboard"}]};
  }
  const start=dahabDate(fromDate||partner.syncFromDate||new Date(Date.now()-7*86400000).toISOString().slice(0,10));
  const end=dahabDate(toDate||new Date().toISOString().slice(0,10));
  const currencyId=String(partner.externalAccountId||"3").replace(/\D/g,"")||"3";
  const reportUrl=new URL(report);reportUrl.search=new URLSearchParams({p:"h",f:"report",fr:start,to:end,cur:currencyId,ajax:"1"}).toString();
  const reportHeaders={
    Accept:"*/*",
    "Accept-Language":"ar,en;q=0.8",
    "Cache-Control":"no-cache",
    Pragma:"no-cache",
    Referer:result.url&&/\/clman\//i.test(result.url)?result.url:`${origin}/clman/index.php?p=h&f=report&fr=0&to=0&cur=${currencyId}`,
    "Sec-Fetch-Dest":"empty",
    "Sec-Fetch-Mode":"cors",
    "Sec-Fetch-Site":"same-origin",
    "User-Agent":userAgent,
    "X-Requested-With":"XMLHttpRequest"
  };
  const reportResult=await fetchWithCookies(reportUrl.toString(),{method:"GET",headers:reportHeaders},cookie,{maxRedirects:4});
  const reportHtml=await reportResult.response.text();
  if(!reportResult.response.ok)throw Object.assign(new Error(`فشل فتح تقرير دهب (${reportResult.response.status})`),{code:"DAHAB_REPORT_HTTP_ERROR"});
  if(/name=["']username["']/i.test(reportHtml)&&/name=["']password["']/i.test(reportHtml))throw Object.assign(new Error("انتهت جلسة دهب؛ أعد إدخال رمز Authenticator"),{code:"DAHAB_SESSION_REJECTED"});
  const balance=dahabBalanceFromHtml(reportHtml);
  const currency=dahabCurrencyFromHtml(reportHtml,partner.accountCurrency||"USD");
  const normalized={balance:+balance.toFixed(2),receivable:balance>0?+balance.toFixed(2):0,payable:balance<0?+Math.abs(balance).toFixed(2):0};
  return {...normalized,currencies:{[currency]:normalized},movements:[],balanceRows:[{currency,amount:normalized.balance}]};
}

app.post("/api/partners", auth, async (req,res)=>{
  const {
    name,
    contactName="",
    phone="",
    whatsapp="",
    email="",
    country="",
    city="",
    address="",
    notes="",
    systemUrl="",
    connectionType="WEB",
    accountCurrency="CAD",
    integrationName="",
    username="",
    password="",
    externalAccountId="",
    connectorType="GENERIC",
    companyMode="CONNECTED",
    openingBalance=0,
    openingBalanceDirection="RECEIVABLE",
    pathPrefix="/ssljd/merkez112/1/2",
    syncFromDate="",
    syncEnabled=false,
    syncIntervalMinutes=5,
    syncMode="BALANCE_ONLY"
  }=req.body||{};

  if(!name)return res.status(400).json({message:"اسم المورد أو الشركة مطلوب"});
  if(String(systemUrl||"").trim()){try{await assertSafePartnerUrl(systemUrl);}catch(error){return res.status(400).json({message:error.message||"رابط الشركة الخارجية غير آمن",code:error.code||"PARTNER_URL_REJECTED"});}}
  const normalizedCompanyMode=String(companyMode||"CONNECTED").toUpperCase()==="MANUAL"?"MANUAL":"CONNECTED";
  const numericOpeningBalance=Number(openingBalance||0);
  if(!Number.isFinite(numericOpeningBalance)||numericOpeningBalance<0)return res.status(400).json({message:"الرصيد الافتتاحي غير صحيح"});
  if(!["RECEIVABLE","PAYABLE"].includes(String(openingBalanceDirection||"").toUpperCase()))return res.status(400).json({message:"اتجاه الرصيد الافتتاحي غير صحيح"});

  const partner=await mutateDurable(store=>{
    const item={
      id:id(),
      name:String(name),
      contactName,
      phone,
      whatsapp,
      email,
      country,
      city,
      address,
      notes,
      systemUrl:String(systemUrl||"").trim(),
      connectionType:["API","WEB","CSV","EXCEL","PDF"].includes(String(connectionType).toUpperCase())?String(connectionType).toUpperCase():"WEB",
      accountCurrency:String(accountCurrency||"CAD").toUpperCase(),
      integrationName:String(integrationName||name),
      username:String(username||""),
      passwordEncrypted:encryptIntegrationSecret(password),
      externalAccountId:String(externalAccountId||""),
      companyMode:normalizedCompanyMode,
      connectorType:normalizedCompanyMode==="MANUAL"?"GENERIC":normalizeConnectorType(connectorType),
      pathPrefix:String(pathPrefix||"/ssljd/merkez112/1/2"),
      syncFromDate:String(syncFromDate||""),
      externalReceivable:0,externalPayable:0,externalBalance:0,
      syncEnabled:normalizedCompanyMode==="MANUAL"?false:Boolean(syncEnabled),
      syncIntervalMinutes:Math.max(1,Math.min(1440,Number(syncIntervalMinutes)||5)),
      syncMode:["BALANCE_ONLY","BALANCE_AND_STATEMENT"].includes(String(syncMode).toUpperCase())?String(syncMode).toUpperCase():"BALANCE_ONLY",
      connectionStatus:normalizedCompanyMode==="MANUAL"?"MANUAL":(String(systemUrl||"").trim()?"CONFIGURED":"MANUAL"),
      lastSyncAt:null,
      createdAt:now(),
      createdBy:req.user.id
    };
    store.partners.push(item);
    if(normalizedCompanyMode==="MANUAL"&&numericOpeningBalance>0){
      const currency=String(accountCurrency||"CAD").toUpperCase();
      const conversion=currencyConversion(store,currency,"CAD");
      if(!conversion)throw Object.assign(new Error(`لا يوجد سعر صرف آلي لتحويل ${currency} إلى CAD`),{status:400,code:"MISSING_AUTOMATIC_RATE"});
      store.partnerTransactions.push({
        id:id(),partnerId:item.id,type:String(openingBalanceDirection).toUpperCase(),amount:numericOpeningBalance,
        currency,cadAmount:+(numericOpeningBalance*conversion.factor).toFixed(2),date:new Date().toISOString().slice(0,10),
        dueDate:"",reference:"OPENING_BALANCE",description:"الرصيد الافتتاحي",isOpeningBalance:true,
        automaticRate:conversion.factor,automaticRateUpdatedAt:conversion.updatedAt||null,createdAt:now(),createdBy:req.user.id
      });
    }
    audit(store,req.user.id,"CREATE","PARTNER",item.id,{after:{...item,passwordEncrypted:undefined},ip:req.ip,branchId:req.user.branchId,branchName:req.user.branchName});
    return item;
  });

  res.status(201).json(partner);
});

app.patch("/api/partners/:id", auth, async (req,res)=>{
  if(req.body?.systemUrl!==undefined&&String(req.body.systemUrl||"").trim()){try{await assertSafePartnerUrl(req.body.systemUrl);}catch(error){return res.status(400).json({message:error.message||"رابط الشركة الخارجية غير آمن",code:error.code||"PARTNER_URL_REJECTED"});}}
  const allowed=["name","contactName","phone","whatsapp","email","country","city","address","notes","systemUrl","connectionType","accountCurrency","integrationName","username","externalAccountId","connectorType","companyMode","pathPrefix","syncFromDate","syncEnabled","syncIntervalMinutes","syncMode"];
  let updated=null;
  await mutateDurable(store=>{
    const partner=store.partners.find(item=>item.id===req.params.id);
    if(!partner)return;
    const before={...partner,passwordEncrypted:undefined};
    if(req.body?.password)partner.passwordEncrypted=encryptIntegrationSecret(req.body.password);
    for(const key of allowed){
      if(req.body?.[key]===undefined)continue;
      partner[key]=key==="syncEnabled"?Boolean(req.body[key]):key==="syncIntervalMinutes"?Math.max(1,Math.min(1440,Number(req.body[key])||5)):String(req.body[key]??"");
    }
    partner.connectionType=String(partner.connectionType||"WEB").toUpperCase();
    partner.accountCurrency=String(partner.accountCurrency||"CAD").toUpperCase();
    partner.companyMode=String(partner.companyMode||"CONNECTED").toUpperCase()==="MANUAL"?"MANUAL":"CONNECTED";
    partner.connectorType=partner.companyMode==="MANUAL"?"GENERIC":normalizeConnectorType(partner.connectorType);
    if(partner.companyMode==="MANUAL")partner.syncEnabled=false;
    partner.connectionStatus=partner.companyMode==="MANUAL"?"MANUAL":(String(partner.systemUrl||"").trim()?"CONFIGURED":"MANUAL");
    partner.updatedAt=now();
    audit(store,req.user.id,"UPDATE","PARTNER",partner.id,{before,after:{...partner,passwordEncrypted:undefined},integration:true,ip:req.ip,branchId:req.user.branchId,branchName:req.user.branchName});
    updated={...partner};
  });
  if(!updated)return res.status(404).json({message:"الشركة غير موجودة"});
  res.json(updated);
});

app.delete("/api/partners/:id", auth, async (req,res)=>{
  let deleted=null;
  await mutateDurable(store=>{
    const partner=(store.partners||[]).find(item=>item.id===req.params.id);
    if(!partner)return;
    deleted={id:partner.id,name:partner.name};
    store.partners=(store.partners||[]).filter(item=>item.id!==req.params.id);
    store.partnerTransactions=(store.partnerTransactions||[]).filter(item=>item.partnerId!==req.params.id);
    store.partnerPayments=(store.partnerPayments||[]).filter(item=>item.partnerId!==req.params.id);
    audit(store,req.user.id,"DELETE","PARTNER",partner.id,{name:partner.name,relatedRecordsRemoved:true});
  });
  if(!deleted)return res.status(404).json({message:"الشركة غير موجودة"});
  res.json({ok:true,message:"تم حذف الشركة وحركاتها ودفعاتها المرتبطة",partner:deleted});
});

app.get("/api/partners/sync-center", auth, (req,res)=>{
  const store=readStore();
  const partners=Array.isArray(store.partners)?store.partners:[];
  const logs=(Array.isArray(store.partnerSyncLogs)?store.partnerSyncLogs:[])
    .slice().sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  const today=new Date().toISOString().slice(0,10);
  const todayLogs=logs.filter(item=>String(item.createdAt||"").slice(0,10)===today);
  const successes=todayLogs.filter(item=>item.status==="SUCCESS").length;
  const failures=todayLogs.filter(item=>item.status==="FAILED").length;
  const durations=todayLogs.map(item=>safeNumber(item.durationMs)).filter(value=>value>0);
  const averageDurationMs=durations.length?Math.round(durations.reduce((sum,value)=>sum+value,0)/durations.length):0;
  const enabled=partners.filter(item=>item.syncEnabled&&["JAD","TAWASUL"].includes(resolvePartnerConnector(item))).length;
  const due=partners.filter(item=>{
    if(!item.syncEnabled||!["JAD","TAWASUL"].includes(resolvePartnerConnector(item)))return false;
    const interval=Math.max(1,Number(item.syncIntervalMinutes)||5)*60000;
    const last=new Date(item.lastSyncAt||0).getTime();
    return !last||Date.now()-last>=interval;
  }).map(item=>item.id);
  res.json({stats:{enabled,due:due.length,totalToday:todayLogs.length,successes,failures,averageDurationMs},duePartnerIds:due,logs:logs.slice(0,30)});
});

app.post("/api/partners/:id/test-connection", auth, async (req,res)=>{
  const store=readStore();const partner=(store.partners||[]).find(item=>item.id===req.params.id);
  if(!partner)return res.status(404).json({message:"الشركة غير موجودة"});
  try{
    const connector=resolvePartnerConnector(partner);
    if(["JAD","SURYANA"].includes(connector)){
      const result=await syncJadPartner(partner,{fromDate:new Date(Date.now()-7*86400000).toISOString().slice(0,10),otp:req.body?.otp,testOnly:true});
      await mutateDurable(current=>{const item=current.partners.find(x=>x.id===partner.id);if(item){item.connectionStatus="READY";item.lastConnectionTestAt=now();item.lastSyncError="";item.lastJadDiagnostic=[];item.lastJadArtifacts=null;item.updatedAt=now();}});
      return res.json({ok:true,status:"READY",connector,message:result.testOnly
        ?`تم تسجيل الدخول إلى شركة ${connector==="SURYANA"?"سوريانا":"جاد"} والتحقق من الجلسة بنجاح`
        :`تم الاتصال بشركة ${connector==="SURYANA"?"سوريانا":"جاد"}، الرصيد المكتشف ${result.balance} ${partner.accountCurrency||"USD"}`});
    }
    if(["TAWASUL","DAHAB"].includes(connector)){
      const result=connector==="DAHAB"
        ? await syncDahabPartner(partner,{fromDate:new Date(Date.now()-7*86400000).toISOString().slice(0,10),otp:req.body?.otp})
        : await syncKontorunPartner(partner,{fromDate:new Date(Date.now()-7*86400000).toISOString().slice(0,10),otp:req.body?.otp});
      await mutateDurable(current=>{const item=current.partners.find(x=>x.id===partner.id);if(item){item.connectorType=connector;item.connectionStatus="READY";item.lastConnectionTestAt=now();item.lastSyncError="";item.updatedAt=now();}});
      return res.json({ok:true,status:"READY",connector,message:`تم الاتصال بشركة ${connector==="DAHAB"?"دهب":"تواصل"} بنجاح، الرصيد المكتشف ${result.balance} ${partner.accountCurrency||"USD"}`});
    }
    normalizeBaseUrl(partner.systemUrl);
    await mutateDurable(current=>{const item=current.partners.find(x=>x.id===partner.id);if(item){item.connectionStatus="READY";item.lastConnectionTestAt=now();item.updatedAt=now();}});
    res.json({ok:true,status:"READY",message:"الرابط صالح. اختر موصل الشركة لإجراء مزامنة فعلية."});
  }catch(error){
    await mutateDurable(current=>{const item=current.partners.find(x=>x.id===partner.id);if(item){
      // لا نحول الشركة إلى "خطأ" إذا سبق أن نجحت مزامنة فعلية وجُلب الرصيد.
      // نحفظ خطأ المحاولة الأخيرة كسجل تحذيري فقط، وتبقى الحالة "متصل" حتى تنجح/تفشل مزامنة فعلية جديدة دون أي نجاح سابق.
      const hasSuccessfulSync=Boolean(item.lastSyncAt) && Number.isFinite(Number(item.externalBalance));
      item.connectionStatus=hasSuccessfulSync?"READY":"ERROR";
      item.lastSyncError=String(error.message||error);
      item.lastConnectionTestErrorAt=now();
      item.lastJadDiagnostic=Array.isArray(error.jadTrace)?error.jadTrace.slice(-16):[];
      item.lastJadArtifacts=error.jadArtifacts||null;
      item.updatedAt=now();
    }});
    res.status(400).json({message:error.message||"تعذر اختبار الاتصال",code:error.code||"JAD_ERROR",diagnostic:Array.isArray(error.jadTrace)?error.jadTrace.slice(-10):[],artifacts:error.jadArtifacts?{available:true,createdAt:error.jadArtifacts.createdAt}:null,details:error.jadDetails||null});
  }
});

const partnerSyncJobs=new Map();
const activePartnerSyncJobs=new Map();
const PARTNER_SYNC_JOB_TTL_MS=15*60*1000;
function partnerSyncJobView(job){
  return {
    jobId:job.id,
    partnerId:job.partnerId,
    status:job.status,
    acceptedAt:job.acceptedAt,
    startedAt:job.startedAt||null,
    finishedAt:job.finishedAt||null,
    progress:job.progress||"QUEUED",
    result:job.status==="SUCCESS"?job.result:null,
    error:job.status==="FAILED"?job.error:null
  };
}
function syncJobErrorPayload(error){
  return {
    message:error?.message||"تعذر جلب الرصيد",
    code:error?.code||"JAD_ERROR",
    diagnostic:Array.isArray(error?.jadTrace)?error.jadTrace.slice(-10):[],
    artifacts:error?.jadArtifacts?{available:true,createdAt:error.jadArtifacts.createdAt}:null,
    details:error?.jadDetails||null
  };
}
async function executePartnerSync({partnerId,body,user,companyId,branchId,onProgress}){
  return runWithTenant(companyId,branchId,async()=>{
    const syncStartedAt=Date.now();
    const syncTrigger=String(body?.trigger||"MANUAL").toUpperCase();
    const snapshot=readStore();const partner=(snapshot.partners||[]).find(item=>item.id===partnerId);
    if(!partner){const error=new Error("الشركة غير موجودة");error.code="PARTNER_NOT_FOUND";throw error;}
    const connector=resolvePartnerConnector(partner);
    if(partner.systemUrl)await assertSafePartnerUrl(partner.systemUrl);
    if(!["JAD","TAWASUL","DAHAB","SURYANA"].includes(connector)){const error=new Error("لا يوجد موصل فعلي محدد لهذه الشركة");error.code="CONNECTOR_NOT_CONFIGURED";throw error;}
    if(syncTrigger==="AUTO"&&["JAD","DAHAB","SURYANA"].includes(connector)){const error=new Error("تم تعطيل المزامنة التلقائية لهذه الشركة لحماية استقرار الخادم؛ استخدم زر جلب الرصيد يدويًا");error.code="AUTO_SYNC_DISABLED";throw error;}
    try{
      onProgress?.("CONNECTING");
      const result=connector==="DAHAB"
        ? await syncDahabPartner(partner,{fromDate:body?.fromDate,toDate:body?.toDate,otp:body?.otp})
        : connector==="TAWASUL"
          ? await syncKontorunPartner(partner,{fromDate:body?.fromDate,toDate:body?.toDate,otp:body?.otp})
          : await syncJadPartner(partner,{fromDate:body?.fromDate,toDate:body?.toDate,otp:body?.otp});
      onProgress?.("SAVING");
      const storageState=result?._storageState||null;
      if(result&&Object.prototype.hasOwnProperty.call(result,"_storageState"))delete result._storageState;
      let publicPartner=null;
      await mutateDurable(store=>{
        const item=store.partners.find(x=>x.id===partner.id);if(!item)return;
        item.connectorType=connector;
        const mainDebt=normalizeJadCurrencyDebt(result.receivable,result.payable,{prefer:safeNumber(result.balance)<0?"PAYABLE":"RECEIVABLE"});
        const normalizedCurrencies={};
        for(const [currency,value] of Object.entries((result.currencies&&typeof result.currencies==="object")?result.currencies:{})){
          const code=String(currency).toUpperCase();
          if(!/^[A-Z]{3}$/.test(code))continue;
          normalizedCurrencies[code]=normalizeJadCurrencyDebt(value?.receivable,value?.payable,{prefer:safeNumber(value?.balance)<0?"PAYABLE":"RECEIVABLE"});
        }
        result.receivable=mainDebt.receivable;result.payable=mainDebt.payable;result.balance=mainDebt.balance;result.currencies=normalizedCurrencies;
        item.externalReceivable=result.receivable;item.externalPayable=result.payable;item.externalBalance=result.balance;item.externalBalances=normalizedCurrencies;
        if(storageState)item.jadStorageStateEncrypted=encryptIntegrationSecret(JSON.stringify(storageState));
        item.lastSyncAt=now();item.lastSyncError="";item.lastJadDiagnostic=[];item.lastJadArtifacts=null;item.connectionStatus="READY";item.updatedAt=now();
        item.lastImportedMovementCount=result.movements.length;
        item.lastFeeTotal=safeNumber(result.totalFees);item.lastFeeFromDate=result.fromDate||body?.fromDate||"";item.lastFeeToDate=result.toDate||body?.toDate||"";item.lastFeeCurrency=partner.accountCurrency||"USD";
        const {passwordEncrypted,...safe}=item;publicPartner={...safe,hasPassword:Boolean(passwordEncrypted)};
        audit(store,user.id,"SYNC","PARTNER",item.id,{connector,balance:result.balance,receivable:result.receivable,payable:result.payable,currencies:Object.keys(result.currencies||{}),count:result.movements.length});
        recordPartnerSyncLog(store,item,{status:"SUCCESS",trigger:syncTrigger,durationMs:Date.now()-syncStartedAt,beforeBalance:safeNumber(partner.externalBalance),afterBalance:result.balance,changed:Math.abs(safeNumber(partner.externalBalance)-safeNumber(result.balance))>0.0001,importedCount:result.movements.length,message:"تمت المزامنة بنجاح"});
      });
      const connectorNames={TAWASUL:"تواصل",JAD:"جاد",DAHAB:"دهب",SURYANA:"سوريانا"};
      return {message:`تم جلب الرصيد من شركة ${connectorNames[connector]||partner.name}`,partner:publicPartner,result:{...result,movements:result.movements.slice(-20)}};
    }catch(error){
      let stalePartner=null;
      let hasSuccessfulSync=false;
      await mutateDurable(store=>{const item=store.partners.find(x=>x.id===partner.id);if(item){
        hasSuccessfulSync=Boolean(item.lastSyncAt) && (Number.isFinite(Number(item.externalBalance)) || (item.externalBalances&&typeof item.externalBalances==="object"&&Object.keys(item.externalBalances).length>0));
        item.connectionStatus=hasSuccessfulSync?"READY":"ERROR";
        item.lastSyncError=String(error.message||error);
        if(["JAD_SESSION_REJECTED","JAD_LOGIN_REJECTED"].includes(String(error.code||"")))item.jadStorageStateEncrypted="";
        item.lastSyncAttemptErrorAt=now();item.lastJadDiagnostic=Array.isArray(error.jadTrace)?error.jadTrace.slice(-16):[];item.lastJadArtifacts=error.jadArtifacts||null;item.updatedAt=now();
        recordPartnerSyncLog(store,item,{status:"FAILED",trigger:syncTrigger,durationMs:Date.now()-syncStartedAt,beforeBalance:safeNumber(partner.externalBalance),afterBalance:safeNumber(item.externalBalance),changed:false,importedCount:0,message:String(error.message||"تعذر جلب الرصيد")});
        if(hasSuccessfulSync){const {passwordEncrypted,...safe}=item;stalePartner={...safe,hasPassword:Boolean(passwordEncrypted)};}
      }});
      if(hasSuccessfulSync&&stalePartner){
        return {ok:true,stale:true,message:"تعذر تحديث الرصيد الآن؛ تم الاحتفاظ بآخر رصيد ناجح",reason:String(error.message||"تعذر تحديث البيانات مؤقتًا"),partner:stalePartner,lastSyncAt:stalePartner.lastSyncAt,result:{balance:safeNumber(stalePartner.externalBalance),receivable:safeNumber(stalePartner.externalReceivable),payable:safeNumber(stalePartner.externalPayable),currencies:stalePartner.externalBalances&&typeof stalePartner.externalBalances==="object"?stalePartner.externalBalances:{},movements:[]},warningCode:error.code||"JAD_TEMPORARY_ERROR"};
      }
      throw error;
    }
  });
}

app.post("/api/partners/:id/sync", auth, (req,res)=>{
  const partnerId=req.params.id;
  const snapshot=readStore();const partner=(snapshot.partners||[]).find(item=>item.id===partnerId);
  if(!partner)return res.status(404).json({message:"الشركة غير موجودة"});
  const connector=resolvePartnerConnector(partner);
  if(!["JAD","TAWASUL","DAHAB","SURYANA"].includes(connector))return res.status(400).json({message:"لا يوجد موصل فعلي محدد لهذه الشركة"});
  const trigger=String(req.body?.trigger||"MANUAL").toUpperCase();
  const dedupeKey=[req.user.companyId,req.user.branchId||"",partnerId,trigger,req.body?.fromDate||"",req.body?.toDate||""].join(":");
  const activeId=activePartnerSyncJobs.get(dedupeKey);
  if(activeId){const active=partnerSyncJobs.get(activeId);if(active&&["QUEUED","RUNNING"].includes(active.status))return res.status(202).json({accepted:true,reused:true,...partnerSyncJobView(active)});}
  const job={id:id(),companyId:req.user.companyId,branchId:req.user.branchId||null,userId:req.user.id,partnerId,status:"QUEUED",progress:"QUEUED",acceptedAt:now(),startedAt:null,finishedAt:null,result:null,error:null};
  partnerSyncJobs.set(job.id,job);activePartnerSyncJobs.set(dedupeKey,job.id);
  res.status(202).json({accepted:true,...partnerSyncJobView(job)});
  setImmediate(async()=>{
    job.status="RUNNING";job.progress="STARTING";job.startedAt=now();
    try{
      job.result=await executePartnerSync({partnerId,body:{...req.body},user:{...req.user},companyId:req.user.companyId,branchId:req.user.branchId||null,onProgress:value=>{job.progress=value;}});
      job.status="SUCCESS";job.progress="DONE";
    }catch(error){job.status="FAILED";job.progress="FAILED";job.error=syncJobErrorPayload(error);}
    finally{
      job.finishedAt=now();activePartnerSyncJobs.delete(dedupeKey);
      const timer=setTimeout(()=>partnerSyncJobs.delete(job.id),PARTNER_SYNC_JOB_TTL_MS);timer.unref?.();
    }
  });
});

app.get("/api/partners/sync-jobs/:jobId", auth, (req,res)=>{
  const job=partnerSyncJobs.get(req.params.jobId);
  if(!job||job.companyId!==req.user.companyId)return res.status(404).json({message:"مهمة المزامنة غير موجودة أو انتهت"});
  res.json(partnerSyncJobView(job));
});

app.get("/api/partners/:id/jad-diagnostic", auth, (req,res)=>{
  const store=readStore();
  const partner=(store.partners||[]).find(item=>item.id===req.params.id);
  if(!partner)return res.status(404).json({message:"الشركة غير موجودة"});
  res.json({message:partner.lastSyncError||"لا يوجد خطأ مسجل",diagnostic:Array.isArray(partner.lastJadDiagnostic)?partner.lastJadDiagnostic:[],artifacts:partner.lastJadArtifacts?{available:true,createdAt:partner.lastJadArtifacts.createdAt}:null,lastSyncAt:partner.lastSyncAt||null,status:partner.connectionStatus||"CONFIGURED"});
});

app.get("/api/partners/:id/jad-diagnostic/screenshot", auth, (req,res)=>{
  const store=readStore();
  const partner=(store.partners||[]).find(item=>item.id===req.params.id);
  if(!partner)return res.status(404).json({message:"الشركة غير موجودة"});
  const file=partner.lastJadArtifacts?.png;
  if(!file||!fs.existsSync(file))return res.status(404).json({message:"لا توجد لقطة تشخيص متاحة؛ أعد اختبار الاتصال ثم افتح اللقطة مباشرة"});
  res.type("png").sendFile(path.resolve(file));
});

app.get("/api/partners/:id", auth, (req,res)=>{
  const store=readStore();
  const partner=(Array.isArray(store.partners)?store.partners:[])
    .find(item=>item?.id===req.params.id);

  if(!partner)return res.status(404).json({message:"المورد أو الشركة غير موجود"});

  const transactions=(Array.isArray(store.partnerTransactions)?store.partnerTransactions:[])
    .filter(item=>item.partnerId===partner.id)
    .sort((a,b)=>String(b.date||b.createdAt).localeCompare(String(a.date||a.createdAt)));

  const payments=(Array.isArray(store.partnerPayments)?store.partnerPayments:[])
    .filter(item=>item.partnerId===partner.id)
    .sort((a,b)=>String(b.date||b.createdAt).localeCompare(String(a.date||a.createdAt)));

  const localBalance=partnerLocalBalancesCad(store,partner.id);
  let externalReceivableCad=0,externalPayableCad=0;
  const externalEntries=partner.externalBalances&&typeof partner.externalBalances==="object"?Object.entries(partner.externalBalances):[];
  if(externalEntries.length){
    for(const [currency,value] of externalEntries){
      const conversion=currencyConversion(store,String(currency).toUpperCase(),"CAD");if(!conversion)continue;
      externalReceivableCad+=Math.max(safeNumber(value?.receivable),0)*conversion.factor;
      externalPayableCad+=Math.max(safeNumber(value?.payable),0)*conversion.factor;
    }
  }else{
    const conversion=currencyConversion(store,String(partner.accountCurrency||"USD").toUpperCase(),"CAD");
    if(conversion){
      let extReceivable=Math.max(safeNumber(partner.externalReceivable),0),extPayable=Math.max(safeNumber(partner.externalPayable),0);
      if(extReceivable<=0.001&&extPayable<=0.001){const balance=safeNumber(partner.externalBalance);if(balance>0)extReceivable=balance;if(balance<0)extPayable=Math.abs(balance);}
      externalReceivableCad=extReceivable*conversion.factor;externalPayableCad=extPayable*conversion.factor;
    }
  }
  const totalNet=localBalance.net+externalReceivableCad-externalPayableCad;
  const {passwordEncrypted,...safePartner}=partner;
  res.json({
    partner:{...safePartner,hasPassword:Boolean(passwordEncrypted)},transactions,payments,
    totals:{receivable:+Math.max(totalNet,0).toFixed(2),payable:+Math.max(-totalNet,0).toFixed(2),net:+totalNet.toFixed(2)},
    localBalance:{receivable:+localBalance.receivable.toFixed(2),payable:+localBalance.payable.toFixed(2),net:+localBalance.net.toFixed(2),missingRates:localBalance.missingRates}
  });
});

app.post("/api/partners/:id/transactions", auth, requireIdempotencyKey, async (req,res)=>{
  const {type,amount,currency="CAD",date="",dueDate="",reference="",description=""}=req.body||{};
  const numericAmount=Number(amount);

  if(!["RECEIVABLE","PAYABLE"].includes(type)){
    return res.status(400).json({message:"نوع العملية غير صحيح"});
  }
  if(!Number.isFinite(numericAmount)||numericAmount<=0){
    return res.status(400).json({message:"المبلغ غير صحيح"});
  }

  const store=readStore();
  const partner=(Array.isArray(store.partners)?store.partners:[])
    .find(item=>item?.id===req.params.id);
  if(!partner)return res.status(404).json({message:"المورد أو الشركة غير موجود"});

  const transaction=await mutateDurable(currentStore=>{
    const normalizedCurrency=String(currency||partner.accountCurrency||"CAD").toUpperCase();
    const conversion=currencyConversion(currentStore,normalizedCurrency,"CAD");
    if(!conversion)throw Object.assign(new Error(`لا يوجد سعر صرف آلي لتحويل ${normalizedCurrency} إلى CAD`),{status:400,code:"MISSING_AUTOMATIC_RATE"});
    const item={
      id:id(),
      partnerId:partner.id,
      type,
      amount:numericAmount,
      currency:normalizedCurrency,
      cadAmount:+(numericAmount*conversion.factor).toFixed(2),
      automaticRate:conversion.factor,
      automaticRateUpdatedAt:conversion.updatedAt||null,
      date:date||new Date().toISOString().slice(0,10),
      dueDate:dueDate||"",
      reference,
      description,
      createdAt:now(),
      createdBy:req.user.id
    };
    currentStore.partnerTransactions.push(item);
    audit(currentStore,req.user.id,"CREATE","PARTNER_TRANSACTION",item.id,{
      partnerId:partner.id,type,amount:numericAmount
    });
    return item;
  });

  res.status(201).json(transaction);
});

app.patch("/api/partners/:id/transactions/:transactionId", auth, requireIdempotencyKey, async (req,res)=>{
  const {type,amount,currency,date,dueDate,reference,description}=req.body||{};
  let updated=null;
  await mutateDurable(store=>{
    const partner=(store.partners||[]).find(item=>item.id===req.params.id);
    if(!partner)return;
    const item=(store.partnerTransactions||[]).find(row=>row.id===req.params.transactionId&&row.partnerId===partner.id);
    if(!item)return;
    const nextType=type===undefined?item.type:String(type).toUpperCase();
    if(!["RECEIVABLE","PAYABLE"].includes(nextType))throw Object.assign(new Error("نوع العملية غير صحيح"),{status:400});
    const nextAmount=amount===undefined?safeNumber(item.amount):Number(amount);
    if(!Number.isFinite(nextAmount)||nextAmount<=0)throw Object.assign(new Error("المبلغ غير صحيح"),{status:400});
    const nextCurrency=String(currency||item.currency||partner.accountCurrency||"CAD").toUpperCase();
    const conversion=currencyConversion(store,nextCurrency,"CAD");
    if(!conversion)throw Object.assign(new Error(`لا يوجد سعر صرف آلي لتحويل ${nextCurrency} إلى CAD`),{status:400,code:"MISSING_AUTOMATIC_RATE"});
    const before={...item};
    Object.assign(item,{type:nextType,amount:nextAmount,currency:nextCurrency,cadAmount:+(nextAmount*conversion.factor).toFixed(2),automaticRate:conversion.factor,automaticRateUpdatedAt:conversion.updatedAt||null,date:date??item.date,dueDate:dueDate??item.dueDate,reference:reference??item.reference,description:description??item.description,updatedAt:now(),updatedBy:req.user.id});
    audit(store,req.user.id,"UPDATE","PARTNER_TRANSACTION",item.id,{before,after:item,partnerId:partner.id});
    updated={...item};
  });
  if(!updated)return res.status(404).json({message:"العملية غير موجودة"});
  res.json(updated);
});

app.delete("/api/partners/:id/transactions/:transactionId", auth, requireIdempotencyKey, async (req,res)=>{
  let deleted=null;
  await mutateDurable(store=>{
    const index=(store.partnerTransactions||[]).findIndex(row=>row.id===req.params.transactionId&&row.partnerId===req.params.id);
    if(index<0)return;
    deleted=store.partnerTransactions[index];
    store.partnerTransactions.splice(index,1);
    audit(store,req.user.id,"DELETE","PARTNER_TRANSACTION",deleted.id,{partnerId:req.params.id,amount:deleted.amount,currency:deleted.currency});
  });
  if(!deleted)return res.status(404).json({message:"العملية غير موجودة"});
  res.json({ok:true,message:"تم حذف العملية"});
});

app.post("/api/partners/:id/payments", auth, requireIdempotencyKey, async (req,res)=>{
  const {direction,amount,currency="CAD",date="",reference="",notes=""}=req.body||{};
  const numericAmount=Number(amount);

  if(!["RECEIVED","PAID"].includes(direction)){
    return res.status(400).json({message:"اتجاه الدفعة غير صحيح"});
  }
  if(!Number.isFinite(numericAmount)||numericAmount<=0){
    return res.status(400).json({message:"المبلغ غير صحيح"});
  }

  const store=readStore();
  const partner=(Array.isArray(store.partners)?store.partners:[])
    .find(item=>item?.id===req.params.id);
  if(!partner)return res.status(404).json({message:"المورد أو الشركة غير موجود"});

  const payment=await mutateDurable(currentStore=>{
    const normalizedCurrency=String(currency||partner.accountCurrency||"CAD").toUpperCase();
    const conversion=currencyConversion(currentStore,normalizedCurrency,"CAD");
    if(!conversion)throw Object.assign(new Error(`لا يوجد سعر صرف آلي لتحويل ${normalizedCurrency} إلى CAD`),{status:400,code:"MISSING_AUTOMATIC_RATE"});
    const item={
      id:id(),
      partnerId:partner.id,
      direction,
      amount:numericAmount,
      currency:normalizedCurrency,
      cadAmount:+(numericAmount*conversion.factor).toFixed(2),
      automaticRate:conversion.factor,
      automaticRateUpdatedAt:conversion.updatedAt||null,
      date:date||new Date().toISOString().slice(0,10),
      reference,
      notes,
      createdAt:now(),
      createdBy:req.user.id
    };
    currentStore.partnerPayments.push(item);
    audit(currentStore,req.user.id,"PAYMENT","PARTNER",partner.id,{
      direction,amount:numericAmount
    });
    return item;
  });

  res.status(201).json(payment);
});

app.patch("/api/partners/:id/payments/:paymentId", auth, requireIdempotencyKey, async (req,res)=>{
  const {direction,amount,currency,date,reference,notes}=req.body||{};
  let updated=null;
  await mutateDurable(store=>{
    const partner=(store.partners||[]).find(item=>item.id===req.params.id);
    if(!partner)return;
    const item=(store.partnerPayments||[]).find(row=>row.id===req.params.paymentId&&row.partnerId===partner.id);
    if(!item)return;
    const nextDirection=direction===undefined?item.direction:String(direction).toUpperCase();
    if(!["RECEIVED","PAID"].includes(nextDirection))throw Object.assign(new Error("اتجاه الدفعة غير صحيح"),{status:400});
    const nextAmount=amount===undefined?safeNumber(item.amount):Number(amount);
    if(!Number.isFinite(nextAmount)||nextAmount<=0)throw Object.assign(new Error("المبلغ غير صحيح"),{status:400});
    const nextCurrency=String(currency||item.currency||partner.accountCurrency||"CAD").toUpperCase();
    const conversion=currencyConversion(store,nextCurrency,"CAD");
    if(!conversion)throw Object.assign(new Error(`لا يوجد سعر صرف آلي لتحويل ${nextCurrency} إلى CAD`),{status:400,code:"MISSING_AUTOMATIC_RATE"});
    const before={...item};
    Object.assign(item,{direction:nextDirection,amount:nextAmount,currency:nextCurrency,cadAmount:+(nextAmount*conversion.factor).toFixed(2),automaticRate:conversion.factor,automaticRateUpdatedAt:conversion.updatedAt||null,date:date??item.date,reference:reference??item.reference,notes:notes??item.notes,updatedAt:now(),updatedBy:req.user.id});
    audit(store,req.user.id,"UPDATE","PARTNER_PAYMENT",item.id,{before,after:item,partnerId:partner.id});
    updated={...item};
  });
  if(!updated)return res.status(404).json({message:"الدفعة غير موجودة"});
  res.json(updated);
});

app.delete("/api/partners/:id/payments/:paymentId", auth, requireIdempotencyKey, async (req,res)=>{
  let deleted=null;
  await mutateDurable(store=>{
    const index=(store.partnerPayments||[]).findIndex(row=>row.id===req.params.paymentId&&row.partnerId===req.params.id);
    if(index<0)return;
    deleted=store.partnerPayments[index];
    store.partnerPayments.splice(index,1);
    audit(store,req.user.id,"DELETE","PARTNER_PAYMENT",deleted.id,{partnerId:req.params.id,amount:deleted.amount,currency:deleted.currency});
  });
  if(!deleted)return res.status(404).json({message:"الدفعة غير موجودة"});
  res.json({ok:true,message:"تم حذف الدفعة"});
});

app.get("/api/partners/:id/statement", auth, (req,res)=>{
  const store=readStore();
  const partner=(Array.isArray(store.partners)?store.partners:[])
    .find(item=>item?.id===req.params.id);

  if(!partner)return res.status(404).json({message:"المورد أو الشركة غير موجود"});

  const from=String(req.query.from||"");
  const to=String(req.query.to||"");
  const inRange=(date)=>{
    const value=String(date||"").slice(0,10);
    return (!from||value>=from)&&(!to||value<=to);
  };

  const statementCad=(amount,currency)=>{const conversion=currencyConversion(store,String(currency||"CAD").toUpperCase(),"CAD");return conversion?safeNumber(amount)*conversion.factor:0;};
  const transactions=(Array.isArray(store.partnerTransactions)?store.partnerTransactions:[])
    .filter(item=>item.partnerId===partner.id&&inRange(item.date||item.createdAt));
  const payments=(Array.isArray(store.partnerPayments)?store.partnerPayments:[])
    .filter(item=>item.partnerId===partner.id&&inRange(item.date||item.createdAt));

  const entries=[
    ...transactions.map(item=>({
      id:item.id,
      date:item.date||String(item.createdAt).slice(0,10),
      kind:item.type==="RECEIVABLE"?"دين لنا":"دين علينا",
      debit:item.type==="RECEIVABLE"?statementCad(item.amount,item.currency):0,
      credit:item.type==="PAYABLE"?statementCad(item.amount,item.currency):0,
      reference:item.reference||"",
      description:item.description||""
    })),
    ...payments.map(item=>({
      id:item.id,
      date:item.date||String(item.createdAt).slice(0,10),
      kind:item.direction==="RECEIVED"?"استلام دفعة":"دفع مبلغ",
      debit:item.direction==="PAID"?statementCad(item.amount,item.currency):0,
      credit:item.direction==="RECEIVED"?statementCad(item.amount,item.currency):0,
      reference:item.reference||"",
      description:item.notes||""
    }))
  ].sort((a,b)=>String(a.date).localeCompare(String(b.date)));

  let runningBalance=0;
  const rows=entries.map(entry=>{
    runningBalance+=safeNumber(entry.debit)-safeNumber(entry.credit);
    return {...entry,balance:+runningBalance.toFixed(2)};
  });

  res.json({
    company:{name:"شركة العبود للتجارة",nameEn:"AlAboud Trading Company"},
    partner,
    from:from||null,
    to:to||null,
    generatedAt:now(),
    rows,
    finalBalance:+runningBalance.toFixed(2)
  });
});


function aiMonthKey(value){return String(value||"").slice(0,7)}
function aiDateKey(value){return String(value||"").slice(0,10)}
function aiAnalytics(store){
  const today=new Date();
  const todayKey=today.toISOString().slice(0,10);
  const monthKey=todayKey.slice(0,7);
  const previousMonth=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth()-1,1)).toISOString().slice(0,7);
  const validTx=(store.transactions||[]).filter(t=>t&&!t.isDeleted&&t.status!=="CANCELLED");
  const expenses=(store.expenses||[]).filter(e=>e&&!e.isDeleted);
  const customers=(store.customers||[]).filter(c=>c&&!c.isDeleted).map(c=>customerSummary(store,c));
  const txProfit=rows=>rows.reduce((a,t)=>a+transactionFinancials(t).totalProfit,0);
  const expenseCad=rows=>rows.reduce((a,e)=>a+safeNumber(e.cadAmount,e.amount),0);
  const monthTx=validTx.filter(t=>aiMonthKey(t.transferDate||t.createdAt)===monthKey);
  const previousTx=validTx.filter(t=>aiMonthKey(t.transferDate||t.createdAt)===previousMonth);
  const monthExpenses=expenses.filter(e=>aiMonthKey(e.date||e.createdAt)===monthKey);
  const previousExpenses=expenses.filter(e=>aiMonthKey(e.date||e.createdAt)===previousMonth);
  const todayTx=validTx.filter(t=>aiDateKey(t.transferDate||t.createdAt)===todayKey);
  const todayExpenses=expenses.filter(e=>aiDateKey(e.date||e.createdAt)===todayKey);
  const monthNet=txProfit(monthTx)-expenseCad(monthExpenses);
  const previousNet=txProfit(previousTx)-expenseCad(previousExpenses);
  const receivables=customers.reduce((a,c)=>a+safeNumber(c.finalBalance),0);
  const overdue=customers.filter(c=>c.overdue).sort((a,b)=>b.finalBalance-a.finalBalance);
  const capital=(store.capitalMovements||[]).reduce((a,m)=>a+(m.type==="IN"?capitalCadAmount(store,m):-capitalCadAmount(store,m)),0);
  const categoryTotals={};
  for(const e of monthExpenses){const k=e.category||"Other";categoryTotals[k]=(categoryTotals[k]||0)+safeNumber(e.cadAmount,e.amount)}
  const currencyTotals={};
  for(const t of monthTx){const k=t.currency||"CAD";currencyTotals[k]=(currencyTotals[k]||0)+safeNumber(t.amount)}
  const topExpense=Object.entries(categoryTotals).sort((a,b)=>b[1]-a[1])[0]||["لا يوجد",0];
  const topCurrency=Object.entries(currencyTotals).sort((a,b)=>b[1]-a[1])[0]||["لا يوجد",0];
  const duplicateExpenses=[];
  const seen=new Map();
  for(const e of expenses){const key=[e.title,e.amount,e.currency,e.date].join('|');if(seen.has(key))duplicateExpenses.push(e);else seen.set(key,e.id)}
  const anomalies=[];
  if(duplicateExpenses.length)anomalies.push({level:"warning",title:"مصروفات مكررة محتملة",message:`تم العثور على ${duplicateExpenses.length} مصروفات متشابهة تحتاج مراجعة.`});
  if(monthExpenses.length>=3){const avg=expenseCad(monthExpenses)/monthExpenses.length;for(const e of monthExpenses){if(safeNumber(e.cadAmount,e.amount)>avg*3)anomalies.push({level:"danger",title:"مصروف غير اعتيادي",message:`المصروف ${e.title} أعلى بكثير من متوسط هذا الشهر.`})}}
  if(overdue.length)anomalies.push({level:"danger",title:"ديون متأخرة",message:`يوجد ${overdue.length} عملاء متأخرين بإجمالي ${receivables.toFixed(2)} CAD.`});
  const profitTrend=previousNet?((monthNet-previousNet)/Math.abs(previousNet))*100:(monthNet>0?100:0);
  let score=100;
  if(monthNet<0)score-=30;
  if(profitTrend<-15)score-=15;
  if(capital<safeNumber(store.notificationSettings?.lowCashLimit,5000))score-=20;
  if(overdue.length)score-=Math.min(20,overdue.length*3);
  if(anomalies.length)score-=Math.min(15,anomalies.length*3);
  score=Math.max(0,Math.min(100,Math.round(score)));
  const recentMonths=[];
  for(let i=5;i>=0;i--){const d=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth()-i,1));const key=d.toISOString().slice(0,7);const t=validTx.filter(x=>aiMonthKey(x.transferDate||x.createdAt)===key);const e=expenses.filter(x=>aiMonthKey(x.date||x.createdAt)===key);recentMonths.push({month:key,net:+(txProfit(t)-expenseCad(e)).toFixed(2),expenses:+expenseCad(e).toFixed(2),profit:+txProfit(t).toFixed(2)})}
  const values=recentMonths.map(x=>x.net);const forecast=values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
  const recommendations=[];
  if(overdue.length)recommendations.push(`ابدأ بتحصيل ديون ${overdue.slice(0,3).map(c=>c.name).join("، ")}.`);
  if(topExpense[1]>0)recommendations.push(`راجع مصروفات ${topExpense[0]} لأنها الأعلى هذا الشهر.`);
  if(profitTrend<0)recommendations.push("راجع أسعار البيع والتكاليف لأن صافي الربح أقل من الشهر الماضي.");
  if(capital<safeNumber(store.notificationSettings?.lowCashLimit,5000))recommendations.push("السيولة أقل من الحد المحدد؛ قلل المصروفات غير الضرورية مؤقتًا.");
  if(!recommendations.length)recommendations.push("الأداء مستقر. استمر في متابعة التحصيل والمصروفات يوميًا.");
  return {generatedAt:now(),healthScore:score,today:{transactions:todayTx.length,grossProfit:+txProfit(todayTx).toFixed(2),expenses:+expenseCad(todayExpenses).toFixed(2),netProfit:+(txProfit(todayTx)-expenseCad(todayExpenses)).toFixed(2)},month:{transactions:monthTx.length,grossProfit:+txProfit(monthTx).toFixed(2),expenses:+expenseCad(monthExpenses).toFixed(2),netProfit:+monthNet.toFixed(2),profitTrend:+profitTrend.toFixed(1),topExpenseCategory:topExpense[0],topCurrency:topCurrency[0]},finance:{capital:+capital.toFixed(2),receivables:+receivables.toFixed(2),overdueCount:overdue.length},forecast:{nextMonthNet:+forecast.toFixed(2),method:"متوسط آخر 6 أشهر"},anomalies:anomalies.slice(0,8),recommendations:recommendations.slice(0,6),overdueCustomers:overdue.slice(0,8),monthlyTrend:recentMonths,system:{database:process.env.DATABASE_URL?"PostgreSQL Cloud":"JSON Local",users:(store.users||[]).length,devices:(store.devices||[]).filter(d=>d.active).length,lastBackupAt:store.companySettings?.lastBackupAt||null}};
}
app.get("/api/ai/overview",auth,(req,res)=>res.json(aiAnalytics(readStore())));
app.post("/api/ai/assistant",auth,(req,res)=>{
  const question=String(req.body?.question||"").trim();
  if(!question)return res.status(400).json({message:"اكتب سؤالك أولاً"});
  const store=readStore();const a=aiAnalytics(store);const q=question.toLowerCase();let answer="";let data=[];let action=null;
  if(/ربح|ارباح|أرباح|profit/.test(q)){answer=`صافي ربح اليوم ${a.today.netProfit.toFixed(2)} CAD، وصافي ربح هذا الشهر ${a.month.netProfit.toFixed(2)} CAD. التغير عن الشهر السابق ${a.month.profitTrend.toFixed(1)}%.`;}
  else if(/مصروف|expenses?/.test(q)){answer=`مصروفات اليوم ${a.today.expenses.toFixed(2)} CAD، ومصروفات الشهر ${a.month.expenses.toFixed(2)} CAD. أعلى تصنيف هو ${a.month.topExpenseCategory}.`;data=(store.expenses||[]).slice().reverse().slice(0,10);}
  else if(/دين|متأخر|receivable/.test(q)){answer=`إجمالي الديون لنا ${a.finance.receivables.toFixed(2)} CAD، ويوجد ${a.finance.overdueCount} عملاء متأخرين.`;data=a.overdueCustomers;}
  else if(/رأس المال|راس المال|سيولة|capital/.test(q)){answer=`رأس المال المسجل حاليًا ${a.finance.capital.toFixed(2)} CAD. ${a.recommendations.find(x=>x.includes("السيولة"))||"السيولة ضمن المتابعة."}`;}
  else if(/توقع|forecast/.test(q)){answer=`التوقع التقريبي لصافي الشهر القادم هو ${a.forecast.nextMonthNet.toFixed(2)} CAD، اعتمادًا على ${a.forecast.method}.`;}
  else if(/صحة|تقييم|health/.test(q)){answer=`تقييم صحة الشركة ${a.healthScore} من 100. أهم توصية: ${a.recommendations[0]}`;}
  else if(/نسخ احتياطي|backup/.test(q)){answer="يمكنك إنشاء نسخة احتياطية الآن من الإعدادات. أوصي بإنشائها بعد أي تغييرات كبيرة.";action={type:"NAVIGATE",page:"settings"};}
  else if(/عميل/.test(q)){const name=question.replace(/.*عميل\s*/i,"").trim();const rows=(store.customers||[]).filter(c=>!c.isDeleted&&(!name||String(c.name||"").includes(name))).map(c=>customerSummary(store,c)).slice(0,10);answer=rows.length?`وجدت ${rows.length} نتيجة للعملاء.`:"لم أجد عميلًا مطابقًا.";data=rows;}
  else if(/حوال/.test(q)){data=(store.transactions||[]).filter(t=>!t.isDeleted).slice().reverse().slice(0,10);answer=`هذه أحدث ${data.length} حوالات مسجلة.`;}
  else {answer=`ملخص ذكي: صحة الشركة ${a.healthScore}/100، صافي الشهر ${a.month.netProfit.toFixed(2)} CAD، الديون لنا ${a.finance.receivables.toFixed(2)} CAD. ${a.recommendations[0]}`;}
  audit(store,req.user.id,"ASK","AI_ASSISTANT","assistant",{question:question.slice(0,250)});
  res.json({answer,data,action,overview:a});
});

app.get("/api/expenses", auth, async (req,res)=>{const store=readStore();const rows=await branchSafeRead(req,"expenses",()=>nativeRepositories.expenses.listByCompany(req.user.companyId,{orderBy:"created_at DESC"}),()=>Array.from(store.expenses).reverse());res.json(paginate(req,rows));});
app.post("/api/expenses", auth, requireIdempotencyKey, async (req,res)=>{const {title,amount,currency="CAD",exchangeRate=1,category="Other",date=new Date().toISOString().slice(0,10)}=req.body||{};const n=Number(amount),rate=Number(exchangeRate);const normalizedCurrency=String(currency||"CAD").toUpperCase();if(!title||!Number.isFinite(n)||n<=0||!Number.isFinite(rate)||rate<=0)return res.status(400).json({message:"Invalid expense"});const e=await mutateDurable(s=>{const x={id:id(),title,amount:+n.toFixed(2),currency:normalizedCurrency,exchangeRate:+rate.toFixed(6),cadAmount:+(n*rate).toFixed(2),category,date,createdAt:now(),createdBy:req.user.id};assertBalancedEntry([{account:"EXPENSE_CAD",debit:x.cadAmount},{account:"SOURCE_AMOUNT_CONVERTED",credit:+(n*rate).toFixed(2)}]);s.expenses.push(x);audit(s,req.user.id,"CREATE","EXPENSE",x.id,{currency:x.currency,exchangeRate:x.exchangeRate,cadAmount:x.cadAmount});return x;});res.status(201).json(e);});
app.put("/api/expenses/:id", auth, requireIdempotencyKey, async (req,res)=>{
  const {title,amount,currency="CAD",exchangeRate=1,category="Other",date}=req.body||{};
  const n=Number(amount),rate=Number(exchangeRate),normalizedCurrency=String(currency||"CAD").toUpperCase();
  if(!title||!date||!Number.isFinite(n)||n<=0||!Number.isFinite(rate)||rate<=0)return res.status(400).json({message:"بيانات المصروف غير صحيحة"});
  const updated=await mutateDurable(s=>{
    const rows=Array.from(s.expenses||[]);
    const index=rows.findIndex(x=>String(x.id)===String(req.params.id));
    if(index<0)return null;
    const previous=rows[index];
    const next={...previous,title:String(title).trim(),amount:+n.toFixed(2),currency:normalizedCurrency,exchangeRate:+rate.toFixed(6),cadAmount:+(n*rate).toFixed(2),category,date,updatedAt:now(),updatedBy:req.user.id};
    assertBalancedEntry([{account:"EXPENSE_CAD",debit:next.cadAmount},{account:"SOURCE_AMOUNT_CONVERTED",credit:+(n*rate).toFixed(2)}]);
    rows[index]=next;
    s.expenses=rows;
    audit(s,req.user.id,"UPDATE","EXPENSE",next.id,{before:{title:previous.title,amount:previous.amount,currency:previous.currency},after:{title:next.title,amount:next.amount,currency:next.currency}});
    return next;
  });
  if(!updated)return res.status(404).json({message:"المصروف غير موجود"});
  res.json(updated);
});
app.delete("/api/expenses/:id", auth, requireIdempotencyKey, async (req,res)=>{
  const removed=await mutateDurable(s=>{
    const rows=Array.from(s.expenses||[]);
    const index=rows.findIndex(x=>String(x.id)===String(req.params.id));
    if(index<0)return null;
    const expense=rows[index];
    s.expenses=rows.filter((_,rowIndex)=>rowIndex!==index);
    audit(s,req.user.id,"DELETE","EXPENSE",expense.id,{title:expense.title,amount:expense.amount,currency:expense.currency});
    return expense;
  });
  if(!removed)return res.status(404).json({message:"المصروف غير موجود"});
  res.json({ok:true,expense:removed});
});
app.get("/api/capital", auth, async (req,res)=>{
  const store=readStore();
  const nativeRows=await branchSafeRead(req,"capital",()=>nativeRepositories.capitalMovements.listByCompany(req.user.companyId,{orderBy:"created_at DESC"}),()=>Array.from(store.capitalMovements||[]).reverse());
  const rows=nativeRows.map(item=>{
    const currency=String(item.currency||"CAD").toUpperCase();
    const conversion=currencyConversion(store,currency,"CAD");
    const exchangeRate=Number.isFinite(Number(item.exchangeRate))?Number(item.exchangeRate):(conversion?.factor||null);
    const cadAmount=Number.isFinite(Number(item.cadAmount))?Number(item.cadAmount):(exchangeRate?safeNumber(item.amount)*exchangeRate:(currency==="CAD"?safeNumber(item.amount):null));
    return {...item,currency,baseCurrency:"CAD",exchangeRate,cadAmount:Number.isFinite(cadAmount)?+cadAmount.toFixed(2):null};
  });
  res.json(rows);
});
app.post("/api/capital", auth, requireIdempotencyKey, async (req,res)=>{
  const {type="IN",amount,currency="CAD",description="",date=new Date().toISOString().slice(0,10)}=req.body||{};
  const n=Number(amount), normalizedCurrency=String(currency||"CAD").toUpperCase();
  if(!["IN","OUT"].includes(type)||!Number.isFinite(n)||n<=0)return res.status(400).json({message:"بيانات حركة رأس المال غير صحيحة"});
  const m=await mutateDurable(s=>{
    const conversion=currencyConversion(s,normalizedCurrency,"CAD");
    if(!conversion)return {error:"لا يوجد سعر صرف لهذه العملة إلى CAD. يرجى تحديث أسعار الصرف أولًا."};
    const exchangeRate=conversion.factor;
    const x={id:id(),type,amount:+n.toFixed(2),currency:normalizedCurrency,exchangeRate:+exchangeRate.toFixed(6),baseCurrency:"CAD",cadAmount:+(n*exchangeRate).toFixed(2),conversionPath:conversion.path,rateUpdatedAt:conversion.updatedAt||null,description:String(description||""),date,createdAt:now(),createdBy:req.user.id};
    assertBalancedEntry([{account:"CAPITAL_CAD",debit:x.cadAmount},{account:"SOURCE_AMOUNT_CONVERTED",credit:+(n*exchangeRate).toFixed(2)}]);
    s.capitalMovements.push(x);audit(s,req.user.id,"CREATE","CAPITAL",x.id,{currency:x.currency,exchangeRate:x.exchangeRate,cadAmount:x.cadAmount});return x;
  });
  if(m?.error)return res.status(400).json({message:m.error});
  res.status(201).json(m);
});

app.patch("/api/capital/:id", auth, requireIdempotencyKey, async (req,res)=>{
  const {type,amount,currency,description,date}=req.body||{};
  const n=Number(amount);
  if(!["IN","OUT"].includes(type)||!Number.isFinite(n)||n<=0){
    return res.status(400).json({message:"بيانات حركة رأس المال غير صحيحة"});
  }
  const updated=await mutateDurable(store=>{
    const item=store.capitalMovements.find(entry=>entry.id===req.params.id);
    if(!item)return null;
    const normalizedCurrency=String(currency||"CAD").toUpperCase();
    const conversion=currencyConversion(store,normalizedCurrency,"CAD");
    if(!conversion)return {error:"لا يوجد سعر صرف لهذه العملة إلى CAD. يرجى تحديث أسعار الصرف أولًا."};
    item.type=type;
    item.amount=+n.toFixed(2);
    item.currency=normalizedCurrency;
    item.exchangeRate=+conversion.factor.toFixed(6);
    item.baseCurrency="CAD";
    item.cadAmount=+(n*conversion.factor).toFixed(2);
    assertBalancedEntry([{account:"CAPITAL_CAD",debit:item.cadAmount},{account:"SOURCE_AMOUNT_CONVERTED",credit:+(n*conversion.factor).toFixed(2)}]);
    item.conversionPath=conversion.path;
    item.rateUpdatedAt=conversion.updatedAt||null;
    item.description=String(description||"");
    item.date=date||new Date().toISOString().slice(0,10);
    item.updatedAt=now();
    item.updatedBy=req.user.id;
    audit(store,req.user.id,"UPDATE","CAPITAL",item.id,{type:item.type,amount:item.amount});
    return item;
  });
  if(!updated)return res.status(404).json({message:"حركة رأس المال غير موجودة"});
  if(updated.error)return res.status(400).json({message:updated.error});
  res.json(updated);
});

app.delete("/api/capital/:id", auth, requireIdempotencyKey, async (req,res)=>{
  const removed=await mutateDurable(store=>{
    const rows=Array.from(store.capitalMovements||[]);
    const item=rows.find(entry=>entry.id===req.params.id);
    if(!item)return null;
    store.capitalMovements=rows.filter(entry=>entry.id!==req.params.id);
    audit(store,req.user.id,"DELETE","CAPITAL",item.id,{type:item.type,amount:item.amount});
    return item;
  });
  if(!removed)return res.status(404).json({message:"حركة رأس المال غير موجودة"});
  res.json({message:"تم حذف حركة رأس المال",id:removed.id});
});

const publicDir = path.resolve(__dirname, "../public");
const indexFile = path.join(publicDir, "index.html");

if (!fs.existsSync(indexFile)) {
  console.error("Frontend files are missing. Run: npm run render-build");
}


const BACKUP_ARRAYS=["customers","transactions","payments","expenses","capitalMovements","exchangeRates","generalDebts","generalDebtPayments","partners","partnerTransactions","partnerPayments","partnerSyncLogs","notificationActions","monthlyInventories"];

app.get("/api/backup", auth, requirePermission("admin.only"), (req,res)=>{
  const store=readStore();
  const company=(store.companies||[]).find(item=>item.id===req.user.companyId);
  const data={};
  for(const key of BACKUP_ARRAYS)data[key]=Array.from(store[key]||[]).map(item=>({...item}));
  data.notificationSettings={...(store.notificationSettings||{})};
  const payload=createBackupEnvelope({
    company:{id:req.user.companyId,name:company?.name||""},
    data,
    createdAt:now()
  });
  const filename=`alaboud-backup-${new Date().toISOString().replace(/[:.]/g,"-")}.json`;
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Content-Disposition",`attachment; filename="${filename}"`);
  res.send(JSON.stringify(payload,null,2));
});

app.get("/api/security/status", auth, (req,res)=>{
  if(req.user.role!=="ADMIN")return res.status(403).json({message:"متاح للمدير فقط"});
  const store=readStore(); const logs=store.auditLogs||[]; let chainValid=true,prev="GENESIS";
  for(const item of logs){const copy={...item};delete copy.integrityHash;if(item.previousHash!==prev||sha256(JSON.stringify(copy))!==item.integrityHash){chainValid=false;break;}prev=item.integrityHash;}
  res.json({version:"18.0.0",passwordHashing:"scrypt",sessionHours:12,httpsRequired:IS_PROD,auditIntegrity:chainValid,activeDevices:(store.devices||[]).filter(x=>x.active!==false).length,failedLogins24h:logs.filter(x=>x.action==="LOGIN_FAILED"&&Date.now()-new Date(x.createdAt).getTime()<86400000).length,securityScore:[IS_PROD,JWT_SECRET!=="LOCAL_TRIAL_CHANGE_ME_6_0",chainValid].filter(Boolean).length===3?95:78});
});

app.post("/api/backup/encrypted", auth, requirePermission("admin.only"), rateLimit("backup",10,60*60*1000),(req,res)=>{ const password=String(req.body?.password||""); const policy=passwordPolicy(password); if(!policy.ok)return res.status(400).json({message:policy.message});
  const store=readStore(),data={};for(const key of BACKUP_ARRAYS)data[key]=Array.from(store[key]||[]).map(item=>({...item})); const payload=createBackupEnvelope({company:{id:req.user.companyId},data,createdAt:now()}); const encrypted=encryptJson(payload,password);
  mutate(root=>audit(root,req.user.id,"EXPORT_ENCRYPTED","BACKUP",id(),{ip:req.ip})); res.setHeader("Content-Disposition",`attachment; filename="alaboud-secure-backup-${Date.now()}.abs"`);res.json(encrypted);
});

app.post("/api/backup/restore", auth, requirePermission("admin.only"), async (req,res)=>{
  try{
    const payload=req.body||{};
    const verification=verifyBackupEnvelope(payload);
    if(!verification.ok){
      return res.status(400).json({message:verification.message});
    }
    await mutateDurable(store=>{
      for(const key of BACKUP_ARRAYS){
        const existing=Array.from(store[key]||[]);
        for(const item of existing)item.companyId=`RESTORED_OLD_${req.user.companyId}`;
        const rows=Array.isArray(payload.data[key])?payload.data[key]:[];
        for(const row of rows){
          const clean={...row};delete clean.companyId;
          store[key].push(clean);
        }
      }
      if(payload.data.notificationSettings&&typeof payload.data.notificationSettings==="object"){
        store.notificationSettings={...payload.data.notificationSettings};
      }
      audit(store,req.user.id,"RESTORE","BACKUP",id(),{sourceVersion:payload.version||"unknown",createdAt:payload.createdAt||null});
    });
    res.json({message:"تمت استعادة النسخة الاحتياطية بنجاح"});
  }catch(error){
    res.status(400).json({message:error.message||"تعذر استعادة النسخة الاحتياطية"});
  }
});

app.use(express.static(publicDir, {
  index: "index.html",
  maxAge: 0,
  etag: true,
  setHeaders(res, filePath){
    if(filePath.endsWith("index.html")){
      res.setHeader("Cache-Control","no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma","no-cache");
      res.setHeader("Expires","0");
    }else{
      res.setHeader("Cache-Control","no-cache");
    }
  }
}));

app.get("/", (_req, res) => {
  if (!fs.existsSync(indexFile)) {
    return res.status(503).send("Frontend build is missing");
  }
  res.sendFile(indexFile);
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  if (!fs.existsSync(indexFile)) return res.status(404).send("Not Found");
  res.setHeader("Cache-Control","no-store, no-cache, must-revalidate");
  return res.sendFile(indexFile);
});

app.use((req,res)=>{
  res.status(404).json({message:"API route not found"});
});

app.use((err,req,res,_next)=>{
  const requestId=req.requestId||req.headers["x-request-id"]||null;
  console.error("Unhandled request error",{requestId,path:req.path,method:req.method,error:err?.stack||err});
  const status=Number(err?.status||err?.statusCode)||500;
  const isDatabaseTemporary = isTransientDatabaseError(err) || status===503;
  const message = err?.publicMessage || (isDatabaseTemporary
    ? "قاعدة البيانات تعيد الاتصال حاليًا. لم يتم حفظ أي تغيير، يرجى المحاولة بعد لحظات."
    : status>=500 ? "حدث خطأ داخلي في الخادم" : (err.message||"Request failed"));
  res.status(status>=400&&status<600?status:500).json({
    message,
    code:isDatabaseTemporary?"DATABASE_TEMPORARILY_UNAVAILABLE":(err?.code||undefined),
    retryable:Boolean(isDatabaseTemporary),
    requestId
  });
});

const startupWait=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
async function initializeApplicationWithRetry(){
  const baseMs=Math.max(1000,Number(process.env.STARTUP_DB_RETRY_BASE_MS||3000));
  const maxMs=Math.max(baseMs,Number(process.env.STARTUP_DB_RETRY_MAX_MS||30000));
  while(!shuttingDown&&!serviceReady){
    startupAttempt+=1;
    try{
      await initStore();
      nativeRepositories = new NativeRepositoryRegistry({ query: getDatabaseQuery() });
      await seedAdmin();
      serviceReady=true;
      serviceStartupError=null;
      console.log(`Database initialization completed after ${startupAttempt} attempt(s)`);
      const runHourlyRateRefresh=async()=>{
        if(!serviceReady)return;
        try{
          const results=await refreshAutomaticRates("SYSTEM_HOURLY");
          const successCount=results.filter(item=>item.ok).length;
          console.log(`Hourly exchange-rate refresh: ${successCount}/${results.length} updated`);
        }catch(error){
          console.error("Hourly exchange-rate refresh failed:",error.message);
        }
      };
      setTimeout(runHourlyRateRefresh,60*1000);
      setInterval(runHourlyRateRefresh,60*60*1000);
      return;
    }catch(error){
      serviceStartupError=error;
      if(!isRecoverableOperationalError(error)) throw error;
      const delay=Math.min(maxMs,baseMs*(2**Math.min(startupAttempt-1,4)));
      console.warn(`Database startup unavailable; retrying attempt ${startupAttempt+1} in ${delay}ms:`,error?.code||error?.message||error);
      await startupWait(delay);
    }
  }
}
async function startServer(){
  serverInstance=app.listen(PORT,"0.0.0.0",()=>{
    console.log(`AlAboud Enterprise Cloud v${APP_VERSION} running on port ${PORT}`);
    console.log(`Frontend directory: ${publicDir}`);
    console.log("HTTP service is live; database initialization is running");
  });
  await initializeApplicationWithRetry();
}

let serverInstance=null;
let shuttingDown=false;
// أخطاء الاتصال العابرة بقاعدة البيانات (انقطاع مؤقت شائع في خطط الاستضافة
// المجانية) قابلة للتعافي الذاتي عبر منطق إعادة المحاولة الموجود أصلًا في
// PostgresStateAdapter، فلا داعي لإسقاط السيرفر بالكامل بسببها — هذا كان
// يسبب توقف الخدمة لثوانٍ لكل المستخدمين عند كل انقطاع عابر.
function isTransientConnectionError(error){
  return isRecoverableOperationalError(error);
}
async function shutdown(signal){
  if(shuttingDown)return;
  shuttingDown=true;
  console.log(`${signal} received: flushing database writes`);
  try{
    if(serverInstance) await new Promise(resolve=>serverInstance.close(resolve));
    await closeStore();
    process.exit(0);
  }catch(error){console.error("Graceful shutdown failed:",error);process.exit(1)}
}
process.on("SIGTERM",()=>shutdown("SIGTERM"));
process.on("SIGINT",()=>shutdown("SIGINT"));
process.on("unhandledRejection",error=>{
  if(isTransientConnectionError(error)){
    console.warn("Recoverable database rejection handled; server remains available:",error?.code||error?.message||error);
    return;
  }
  console.error("Unhandled promise rejection:",error);
  shutdown("UNHANDLED_REJECTION");
});
process.on("uncaughtException",error=>{
  if(isTransientConnectionError(error)){
    console.warn("Recoverable database exception handled; server remains available:",error?.code||error?.message||error);
    return;
  }
  console.error("Uncaught exception:",error);
  shutdown("UNCAUGHT_EXCEPTION");
});
startServer().catch(error=>{
  serviceStartupError=error;
  console.error("Server startup failed with a non-recoverable error:",error);
  if(serverInstance){
    // Keep the diagnostic HTTP endpoint available instead of entering a rapid
    // crash loop. API requests remain gated with a clear 503 response.
    return;
  }
  process.exit(1);
});
