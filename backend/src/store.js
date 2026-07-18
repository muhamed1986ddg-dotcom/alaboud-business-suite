const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { AsyncLocalStorage } = require("async_hooks");
const { Pool } = require("pg");

const tenantContext = new AsyncLocalStorage();
const RAW_STORE = Symbol("ALABOUD_RAW_STORE");
function unwrapStore(store){
  try{return store && store[RAW_STORE] ? store[RAW_STORE] : store;}catch(_error){return store;}
}
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(__dirname, "../../data");
const dataFile = path.join(dataDir, "store.json");
const databaseUrl = String(process.env.DATABASE_URL || "").trim();
const pool = databaseUrl ? new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false }
}) : null;

const DATA_ARRAYS = ["customers","transactions","payments","expenses","capitalMovements","exchangeRates","generalDebts","generalDebtPayments","partners","partnerTransactions","partnerPayments","notificationActions","auditLogs","devices"];
const emptyStore = () => ({
  companies: [], users: [], customers: [], transactions: [], payments: [], expenses: [],
  capitalMovements: [], exchangeRates: [], generalDebts: [], generalDebtPayments: [],
  partners: [], partnerTransactions: [], partnerPayments: [],
  notificationSettings: { overdueDays: 7, lowCashLimit: 5000, whatsappTemplate: "" },
  companySettings: {}, notificationActions: [], auditLogs: [], devices: []
});

function normalizeStore(store){
  store=unwrapStore(store);
  store=store&&typeof store==="object"?store:{};
  const fresh=emptyStore();
  for(const [key,defaultValue] of Object.entries(fresh)){
    if(Array.isArray(defaultValue)){ if(!Array.isArray(store[key]))store[key]=[]; }
    else if(defaultValue&&typeof defaultValue==="object"){
      if(!store[key]||Array.isArray(store[key])||typeof store[key]!=="object")store[key]={...defaultValue};
    }else if(store[key]===undefined)store[key]=defaultValue;
  }
  return store;
}
function readLegacyFile(){
  try{
    fs.mkdirSync(dataDir,{recursive:true});
    if(fs.existsSync(dataFile))return normalizeStore(JSON.parse(fs.readFileSync(dataFile,"utf8")));
  }catch(error){console.error("Legacy store read failed:",error.message)}
  return emptyStore();
}

let rootStore=readLegacyFile();
let persistChain=Promise.resolve();
let initialized=false;

async function persistPostgres(snapshot){
  if(!pool)return;
  await pool.query(`INSERT INTO app_state (state_key,payload,updated_at)
    VALUES ('main',$1::jsonb,NOW())
    ON CONFLICT (state_key) DO UPDATE SET payload=EXCLUDED.payload,updated_at=NOW()`,
    [JSON.stringify(snapshot)]);
}
function queuePersist(){
  if(!pool)return;
  const snapshot=JSON.parse(JSON.stringify(rootStore));
  persistChain=persistChain.then(()=>persistPostgres(snapshot))
    .catch(error=>console.error("PostgreSQL persistence failed:",error.message));
}
async function initStore(){
  if(initialized)return;
  if(pool){
    await pool.query(`CREATE TABLE IF NOT EXISTS app_state (
      state_key TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    const result=await pool.query("SELECT payload FROM app_state WHERE state_key='main'");
    if(result.rows.length){
      rootStore=normalizeStore(result.rows[0].payload);
      console.log("Persistent data loaded from PostgreSQL");
    }else{
      rootStore=normalizeStore(readLegacyFile());
      await persistPostgres(rootStore);
      console.log("Initial data migrated to PostgreSQL");
    }
  }else console.warn("DATABASE_URL missing: JSON fallback active; Render redeploy may erase data");
  initialized=true;
}
function readRootStore(){return normalizeStore(rootStore)}
function writeStore(store){
  rootStore=normalizeStore(unwrapStore(store));
  if(pool)queuePersist();
  else{
    fs.mkdirSync(dataDir,{recursive:true});
    const tmp=`${dataFile}.tmp`;
    fs.writeFileSync(tmp,JSON.stringify(rootStore,null,2));
    fs.renameSync(tmp,dataFile);
  }
}
function tenantArray(root,key,companyId){
  root=unwrapStore(root);
  const source=()=>Array.isArray(root[key])?root[key]:[];
  const visible=()=>source().filter(item=>item&&item.companyId===companyId);
  return new Proxy([],{
    get(_target,prop){
      if(prop==="push")return (...items)=>source().push(...items.map(item=>({...item,companyId})));
      if(prop==="length")return visible().length;
      if(prop===Symbol.iterator){const rows=visible();return rows[Symbol.iterator].bind(rows);}
      if(prop==="toJSON")return ()=>visible();
      if(prop==="slice")return (...args)=>visible().slice(...args);
      if(typeof prop==="string"&&/^\d+$/.test(prop))return visible()[Number(prop)];
      const rows=visible();
      const value=rows[prop];
      return typeof value==="function"?value.bind(rows):value;
    }
  });
}
function tenantView(root,companyId){
  root=unwrapStore(root);
  if(!root.companySettings[companyId])root.companySettings[companyId]={overdueDays:7,lowCashLimit:5000,whatsappTemplate:""};
  return new Proxy(root,{
    get(target,prop){
      if(prop===RAW_STORE)return target;
      if(prop==="users")return target.users.filter(user=>user.companyId===companyId);
      if(prop==="notificationSettings")return target.companySettings[companyId];
      if(DATA_ARRAYS.includes(prop))return tenantArray(target,prop,companyId);
      return target[prop];
    },
    set(target,prop,value){
      if(prop==="notificationSettings"){target.companySettings[companyId]={...value};return true}
      target[prop]=value;return true;
    }
  });
}
function readStore(){
  const context=tenantContext.getStore();
  return context?.companyId?tenantView(rootStore,context.companyId):rootStore;
}
function mutate(fn){
  const context=tenantContext.getStore();
  const view=context?.companyId?tenantView(rootStore,context.companyId):rootStore;
  const result=fn(view);
  writeStore(rootStore);
  return result;
}
function runWithTenant(companyId,fn){return tenantContext.run({companyId},fn)}
function id(){return crypto.randomUUID()}
function now(){return new Date().toISOString()}
module.exports={readStore,writeStore,mutate,id,now,dataFile,runWithTenant,readRootStore,initStore};
