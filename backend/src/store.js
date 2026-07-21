const path = require("path");
const crypto = require("crypto");
const { AsyncLocalStorage } = require("async_hooks");
const DatabaseService = require("./database/DatabaseService");
const JsonFileAdapter = require("./database/adapters/JsonFileAdapter");
const PostgresStateAdapter = require("./database/adapters/PostgresStateAdapter");

const tenantContext = new AsyncLocalStorage();
const RAW_STORE = Symbol("ALABOUD_RAW_STORE");
function unwrapStore(store){
  try{return store && store[RAW_STORE] ? store[RAW_STORE] : store;}catch(_error){return store;}
}
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(__dirname, "../../data");
const dataFile = path.join(dataDir, "store.json");
const databaseUrl = String(process.env.DATABASE_URL || "").trim();

const DATA_ARRAYS = ["customers","transactions","payments","expenses","capitalMovements","exchangeRates","generalDebts","generalDebtPayments","partners","partnerTransactions","partnerPayments","partnerSyncLogs","notificationActions","auditLogs","devices"];
const emptyStore = () => ({
  companies: [], users: [], customers: [], transactions: [], payments: [], expenses: [],
  capitalMovements: [], exchangeRates: [], generalDebts: [], generalDebtPayments: [],
  partners: [], partnerTransactions: [], partnerPayments: [], partnerSyncLogs: [],
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

const jsonAdapter = new JsonFileAdapter({ dataFile, normalize: normalizeStore, emptyStore });
const postgresAdapter = databaseUrl
  ? new PostgresStateAdapter({ connectionString: databaseUrl, normalize: normalizeStore })
  : null;
const database = new DatabaseService({
  primaryAdapter: postgresAdapter || jsonAdapter,
  fallbackAdapter: postgresAdapter ? jsonAdapter : null,
  normalize: normalizeStore,
  emptyStore
});

let rootStore = emptyStore();
async function initStore(){
  rootStore = await database.init();
  if(!databaseUrl)console.warn("DATABASE_URL missing: JSON fallback active; Render redeploy may erase data");
}
function readRootStore(){return normalizeStore(rootStore)}
function writeStore(store){
  rootStore=database.replaceStore(normalizeStore(unwrapStore(store)));
  database.queueSave();
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
      if(DATA_ARRAYS.includes(prop)){
        const current=Array.isArray(target[prop])?target[prop]:[];
        const otherTenants=current.filter(item=>!item||item.companyId!==companyId);
        const tenantItems=Array.from(value||[]).map(item=>({...item,companyId}));
        target[prop]=[...otherTenants,...tenantItems];
        return true;
      }
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
async function databaseHealth(){return database.health()}
async function closeStore(){return database.close()}
module.exports={readStore,writeStore,mutate,id,now,dataFile,runWithTenant,readRootStore,initStore,databaseHealth,closeStore};
