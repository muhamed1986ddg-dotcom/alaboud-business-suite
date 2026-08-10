const path = require("path");
const crypto = require("crypto");
const { AsyncLocalStorage } = require("async_hooks");
const DatabaseService = require("./database/DatabaseService");
const JsonFileAdapter = require("./database/adapters/JsonFileAdapter");
const PostgresStateAdapter = require("./database/adapters/PostgresStateAdapter");
const { getOperationContext } = require("./reliability/operation-context");

const tenantContext = new AsyncLocalStorage();
const RAW_STORE = Symbol("ALABOUD_RAW_STORE");
function unwrapStore(store){
  try{return store && store[RAW_STORE] ? store[RAW_STORE] : store;}catch(_error){return store;}
}
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(__dirname, "../../data");
const dataFile = path.join(dataDir, "store.json");
const databaseUrl = String(process.env.DATABASE_URL || "").trim();
const isProduction = process.env.NODE_ENV === "production";
if(isProduction && !databaseUrl){
  throw new Error("DATABASE_URL is required in production; JSON fallback is disabled to protect persistent data");
}

const DATA_ARRAYS = ["customers","transactions","payments","expenses","capitalMovements","exchangeRates","generalDebts","generalDebtPayments","partners","partnerTransactions","partnerPayments","partnerSyncLogs","notificationActions","auditLogs","devices","apiKeys","webhooks","integrationLogs","monthlyInventories","sessions"];
const emptyStore = () => ({
  companies: [], branches: [], users: [], customers: [], transactions: [], payments: [], expenses: [],
  capitalMovements: [], exchangeRates: [], generalDebts: [], generalDebtPayments: [],
  partners: [], partnerTransactions: [], partnerPayments: [], partnerSyncLogs: [],
  notificationSettings: { overdueDays: 7, lowCashLimit: 5000, whatsappTemplate: "" },
  companySettings: {}, notificationActions: [], auditLogs: [], devices: [], apiKeys: [], webhooks: [], integrationLogs: [], monthlyInventories: [], sessions: []
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
  return database.queueSave();
}
async function writeStoreDurable(store){
  // Kept for maintenance/import paths that explicitly require a confirmed save.
  rootStore=database.replaceStore(normalizeStore(unwrapStore(store)));
  await database.saveDurable(rootStore);
  return rootStore;
}
function tenantArray(root,key,companyId,branchId){
  root=unwrapStore(root);
  const source=()=>Array.isArray(root[key])?root[key]:[];
  const visible=()=>source().filter(item=>item&&item.companyId===companyId&&(!branchId||item.branchId===branchId));
  return new Proxy([],{
    get(_target,prop){
      if(prop==="push")return (...items)=>source().push(...items.map(item=>({...item,companyId,...(branchId?{branchId}:{})})));
      if(prop==="unshift")return (...items)=>source().unshift(...items.map(item=>({...item,companyId,...(branchId?{branchId}:{})})));
      if(prop==="splice")return (start,deleteCount,...items)=>{
        const rows=visible();
        const normalizedStart=start<0?Math.max(rows.length+Number(start||0),0):Math.min(Number(start||0),rows.length);
        const count=deleteCount===undefined?rows.length-normalizedStart:Math.max(0,Number(deleteCount||0));
        const removed=rows.slice(normalizedStart,normalizedStart+count);
        const removedSet=new Set(removed);
        const src=source();
        for(let index=src.length-1;index>=0;index--)if(removedSet.has(src[index]))src.splice(index,1);
        if(items.length){
          const decorated=items.map(item=>({...item,companyId,...(branchId?{branchId}:{})}));
          const anchor=rows[normalizedStart];
          const sourceIndex=anchor?src.indexOf(anchor):src.length;
          src.splice(sourceIndex<0?src.length:sourceIndex,0,...decorated);
        }
        return removed;
      };
      if(prop==="pop")return ()=>{const rows=visible();return rows.length?tenantArray(root,key,companyId,branchId).splice(rows.length-1,1)[0]:undefined};
      if(prop==="shift")return ()=>tenantArray(root,key,companyId,branchId).splice(0,1)[0];
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
function tenantView(root,companyId,branchId){
  root=unwrapStore(root);
  if(!root.companySettings[companyId])root.companySettings[companyId]={overdueDays:7,lowCashLimit:5000,whatsappTemplate:""};
  return new Proxy(root,{
    get(target,prop){
      if(prop===RAW_STORE)return target;
      if(prop==="users")return target.users.filter(user=>user.companyId===companyId);
      if(prop==="branches")return target.branches.filter(branch=>branch.companyId===companyId);
      if(prop==="notificationSettings")return target.companySettings[companyId];
      if(DATA_ARRAYS.includes(prop))return tenantArray(target,prop,companyId,branchId);
      return target[prop];
    },
    set(target,prop,value){
      if(prop==="notificationSettings"){target.companySettings[companyId]={...value};return true}
      if(DATA_ARRAYS.includes(prop)){
        const current=Array.isArray(target[prop])?target[prop]:[];
        const otherTenants=current.filter(item=>!item||item.companyId!==companyId||(branchId&&item.branchId!==branchId));
        const tenantItems=Array.from(value||[]).map(item=>({...item,companyId,...(branchId?{branchId}:{})}));
        target[prop]=[...otherTenants,...tenantItems];
        return true;
      }
      target[prop]=value;return true;
    }
  });
}
function readStore(){
  const context=tenantContext.getStore();
  return context?.companyId?tenantView(rootStore,context.companyId,context.branchId):rootStore;
}
function mutate(fn){
  const context=tenantContext.getStore();
  const view=context?.companyId?tenantView(rootStore,context.companyId,context.branchId):rootStore;
  const result=fn(view);
  writeStore(rootStore);
  return result;
}
let durableMutationChain=Promise.resolve();
function mutateDurable(fn){
  const context=tenantContext.getStore();
  const companyId=context?.companyId||null;
  const branchId=context?.branchId||null;
  // Build every durable mutation on a private draft. The live in-memory store
  // is not touched until PostgreSQL confirms COMMIT. This keeps rollback
  // semantics while avoiding multiple full-store clones/normalizations on the
  // hot add/edit/delete path.
  const execute=async()=>{
    const draft=structuredClone(rootStore);
    const view=companyId?tenantView(draft,companyId,branchId):draft;
    const result=await fn(view);
    const normalizedDraft=normalizeStore(draft);
    const requestOperation=getOperationContext();
    const operationReceipt=requestOperation?.key ? {
      ...requestOperation,
      companyId,
      branchId,
      scopeKey:`${companyId||"public"}:${branchId||"*"}`,
      result
    } : null;
    await database.saveDurable(normalizedDraft,{operationReceipt,ownedSnapshot:true});
    rootStore=database.replaceStore(normalizedDraft);
    return result;
  };
  const task=durableMutationChain.then(execute,execute);
  durableMutationChain=task.catch(()=>undefined);
  return task;
}
function runWithTenant(companyId,branchId,fn){
  if(typeof branchId==="function")return tenantContext.run({companyId,branchId:null},branchId);
  return tenantContext.run({companyId,branchId:branchId||null},fn);
}
function id(){return crypto.randomUUID()}
function now(){return new Date().toISOString()}
async function databaseHealth(){return database.health()}
async function closeStore(){return database.close()}
function getDatabaseQuery(){return database.getQueryFunction()}
module.exports={readStore,writeStore,writeStoreDurable,mutate,mutateDurable,id,now,dataFile,runWithTenant,readRootStore,initStore,databaseHealth,closeStore,getDatabaseQuery};
