const crypto = require('crypto');

const API_VERSION = 'v1';
const DEFAULT_SCOPES = ['customers.read','transactions.read','payments.read','debts.read','exchange.read'];

function hashKey(value){return crypto.createHash('sha256').update(String(value||'')).digest('hex');}
function generateApiKey(){return `alb_live_${crypto.randomBytes(30).toString('base64url')}`;}
function keyPrefix(value){return String(value||'').slice(0,16);}
function normalizeScopes(scopes){
  const source=Array.isArray(scopes)?scopes:DEFAULT_SCOPES;
  return [...new Set(source.map(x=>String(x||'').trim()).filter(Boolean))].slice(0,50);
}
function safeEqualHex(a,b){
  try{const aa=Buffer.from(String(a||''),'hex');const bb=Buffer.from(String(b||''),'hex');return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);}catch{return false;}
}
function verifyApiKey(store, rawKey){
  if(!rawKey)return null;
  const digest=hashKey(rawKey);
  const record=(store.apiKeys||[]).find(item=>item.active!==false&&safeEqualHex(item.keyHash,digest));
  if(!record)return null;
  if(record.expiresAt&&new Date(record.expiresAt).getTime()<=Date.now())return null;
  return record;
}
function apiKeyMiddleware({readStore,mutate,now}){
  return (req,res,next)=>{
    const raw=String(req.get('x-api-key')||'').trim();
    if(!raw)return next();
    const record=verifyApiKey(readStore(),raw);
    if(!record)return res.status(401).json({message:'API key غير صالح أو منتهي الصلاحية'});
    const scopes=record.scopes||[];
    const resourceAliases={'general-debts':'debts','exchange-rates':'exchange','customer-payments':'payments'};
    const segment=String(req.path||'').replace(/^\/api(?:\/v1)?\//,'').split('/')[0];
    const resource=resourceAliases[segment]||segment;
    const isRead=['GET','HEAD','OPTIONS'].includes(req.method);
    const allowed=scopes.includes('*')||scopes.includes(`${resource}.${isRead?'read':'write'}`)||(isRead&&scopes.includes('read'))||(!isRead&&scopes.includes('write'));
    if(segment&& !['health','openapi.json','docs'].includes(segment) && !allowed)return res.status(403).json({message:`API key لا يملك صلاحية ${resource}.${isRead?'read':'write'}`});
    req.apiKeyRecord=record;
    req.apiKeyUser={id:`api-key:${record.id}`,name:record.name||'API Key',role:'API_KEY',companyId:record.companyId,permissions:scopes};
    mutate(store=>{const item=(store.apiKeys||[]).find(x=>x.id===record.id);if(item){item.lastUsedAt=now();item.lastUsedIp=req.ip;item.usageCount=(item.usageCount||0)+1;}});
    next();
  };
}
function requireScope(scope){
  return (req,res,next)=>{
    if(!req.apiKeyRecord)return next();
    if((req.apiKeyRecord.scopes||[]).includes('*')||(req.apiKeyRecord.scopes||[]).includes(scope))return next();
    return res.status(403).json({message:`API key يحتاج الصلاحية: ${scope}`});
  };
}
function versionAliasMiddleware(req,_res,next){
  if(req.url==='/api/v1')req.url='/api';
  else if(req.url.startsWith('/api/v1/'))req.url=`/api/${req.url.slice('/api/v1/'.length)}`;
  next();
}
function integrationLogger({mutate,now,id}){
  return (req,res,next)=>{
    if(!req.path.startsWith('/api'))return next();
    const started=Date.now();
    res.on('finish',()=>{
      const companyId=req.user?.companyId||req.apiKeyRecord?.companyId||null;
      if(!companyId)return;
      mutate(store=>{
        if(!Array.isArray(store.integrationLogs))store.integrationLogs=[];
        store.integrationLogs.push({id:id(),companyId,requestId:req.requestId,method:req.method,path:req.originalUrl,statusCode:res.statusCode,durationMs:Date.now()-started,authType:req.apiKeyRecord?'API_KEY':(req.user?'SESSION':'ANONYMOUS'),actorId:req.apiKeyRecord?.id||req.user?.id||null,ip:req.ip,userAgent:req.get('user-agent')||'',createdAt:now()});
        if(store.integrationLogs.length>5000)store.integrationLogs.splice(0,store.integrationLogs.length-5000);
      });
    });
    next();
  };
}
function openApiDocument(){
  return {
    openapi:'3.1.0',
    info:{title:'ALABOUD Business Suite API',version:'22.8.0',description:'REST API Platform for ALABOUD Business Suite'},
    servers:[{url:'/api/v1',description:'Versioned API'},{url:'/api',description:'Legacy-compatible API'}],
    components:{securitySchemes:{BearerAuth:{type:'http',scheme:'bearer',bearerFormat:'JWT'},ApiKeyAuth:{type:'apiKey',in:'header',name:'X-API-Key'}}},
    security:[{BearerAuth:[]},{ApiKeyAuth:[]}],
    paths:{
      '/health':{get:{summary:'System health',security:[],responses:{'200':{description:'Healthy'}}}},
      '/branches':{get:{summary:'List accessible branches',parameters:[{name:'X-Branch-ID',in:'header',required:false,schema:{type:'string'}}],responses:{'200':{description:'Branch list'}}},post:{summary:'Create branch',responses:{'201':{description:'Branch created'}}}},
      '/branches/network-summary':{get:{summary:'Consolidated branch network summary',responses:{'200':{description:'Network metrics'}}}},
      '/customers':{get:{summary:'List customers',responses:{'200':{description:'Customer list'}}}},
      '/transactions':{get:{summary:'List transactions',responses:{'200':{description:'Transaction list'}}}},
      '/exchange-rates':{get:{summary:'List exchange rates',responses:{'200':{description:'Exchange rates'}}}},
      '/developer/api-keys':{get:{summary:'List API keys',responses:{'200':{description:'API key metadata'}}},post:{summary:'Create API key',responses:{'201':{description:'Key created; secret returned once'}}}},
      '/developer/webhooks':{get:{summary:'List webhooks',responses:{'200':{description:'Webhook list'}}},post:{summary:'Create webhook',responses:{'201':{description:'Webhook created'}}}},
      '/developer/integration-logs':{get:{summary:'List integration logs',responses:{'200':{description:'Integration logs'}}}}
    }
  };
}
function docsHtml(){return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ALABOUD API Docs</title><style>body{font-family:system-ui;background:#0b1220;color:#e5e7eb;margin:0;padding:32px}.card{max-width:980px;margin:auto;background:#111827;border:1px solid #334155;border-radius:18px;padding:28px}code,pre{background:#020617;border-radius:10px;padding:12px;display:block;overflow:auto}a{color:#60a5fa}.badge{display:inline-block;background:#064e3b;color:#a7f3d0;padding:5px 10px;border-radius:999px}</style></head><body><div class="card"><span class="badge">OpenAPI 3.1</span><h1>ALABOUD Business Suite API v22.8.0</h1><p>المسار الموصى به: <code>/api/v1</code></p><p>المصادقة عبر JWT Bearer أو الترويسة <code>X-API-Key</code>.</p><h2>ملف OpenAPI</h2><p><a href="/api/openapi.json">/api/openapi.json</a></p><h2>مثال</h2><pre>curl -H "X-API-Key: alb_live_..." ${'${location.origin}'}/api/v1/customers</pre><h2>إدارة التكامل</h2><p>استخدم المسارات <code>/api/developer/api-keys</code> و <code>/api/developer/webhooks</code> و <code>/api/developer/integration-logs</code> من حساب ADMIN.</p></div></body></html>`;}
module.exports={API_VERSION,DEFAULT_SCOPES,hashKey,generateApiKey,keyPrefix,normalizeScopes,verifyApiKey,apiKeyMiddleware,requireScope,versionAliasMiddleware,integrationLogger,openApiDocument,docsHtml};
