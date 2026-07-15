const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { AsyncLocalStorage } = require("async_hooks");

const tenantContext = new AsyncLocalStorage();
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(__dirname, "../../data");
const dataFile = path.join(dataDir, "store.json");

const DATA_ARRAYS = [
  "customers","transactions","payments","expenses","capitalMovements","exchangeRates",
  "generalDebts","generalDebtPayments","partners","partnerTransactions","partnerPayments",
  "notificationActions","auditLogs"
];

const emptyStore = () => ({
  companies: [],
  users: [],
  customers: [], transactions: [], payments: [], expenses: [], capitalMovements: [],
  exchangeRates: [], generalDebts: [], generalDebtPayments: [], partners: [],
  partnerTransactions: [], partnerPayments: [],
  notificationSettings: { overdueDays: 7, lowCashLimit: 5000, whatsappTemplate: "" },
  companySettings: {},
  notificationActions: [], auditLogs: []
});

function ensureStore(){
  fs.mkdirSync(dataDir,{recursive:true});
  if(!fs.existsSync(dataFile))fs.writeFileSync(dataFile,JSON.stringify(emptyStore(),null,2));
}

function normalizeStore(store){
  const fresh=emptyStore();
  for(const [key,defaultValue] of Object.entries(fresh)){
    if(Array.isArray(defaultValue)){
      if(!Array.isArray(store[key]))store[key]=[];
    }else if(defaultValue&&typeof defaultValue==="object"){
      if(!store[key]||Array.isArray(store[key])||typeof store[key]!=="object")store[key]={...defaultValue};
    }else if(store[key]===undefined)store[key]=defaultValue;
  }
  return store;
}

function readRootStore(){
  ensureStore();
  try{return normalizeStore(JSON.parse(fs.readFileSync(dataFile,"utf8")))}
  catch{
    const fresh=emptyStore();
    writeStore(fresh);
    return fresh;
  }
}

function writeStore(store){
  ensureStore();
  const tmp=`${dataFile}.tmp`;
  fs.writeFileSync(tmp,JSON.stringify(store,null,2));
  fs.renameSync(tmp,dataFile);
}

function tenantArray(root,key,companyId){
  const visible=()=>root[key].filter(item=>item&&item.companyId===companyId);
  return new Proxy([],{
    get(_target,prop){
      if(prop==="push")return (...items)=>root[key].push(...items.map(item=>({...item,companyId})));
      if(prop==="length")return visible().length;
      if(prop===Symbol.iterator)return visible()[Symbol.iterator].bind(visible());
      if(typeof prop==="string"&&/^\d+$/.test(prop))return visible()[Number(prop)];
      const value=visible()[prop];
      return typeof value==="function"?value.bind(visible()):value;
    }
  });
}

function tenantView(root,companyId){
  if(!root.companySettings[companyId]){
    root.companySettings[companyId]={overdueDays:7,lowCashLimit:5000,whatsappTemplate:""};
  }
  return new Proxy(root,{
    get(target,prop){
      if(prop==="users")return target.users.filter(user=>user.companyId===companyId);
      if(prop==="notificationSettings")return target.companySettings[companyId];
      if(DATA_ARRAYS.includes(prop))return tenantArray(target,prop,companyId);
      return target[prop];
    },
    set(target,prop,value){
      if(prop==="notificationSettings"){
        target.companySettings[companyId]={...value};
        return true;
      }
      target[prop]=value;
      return true;
    }
  });
}

function readStore(){
  const root=readRootStore();
  const context=tenantContext.getStore();
  return context?.companyId?tenantView(root,context.companyId):root;
}

function mutate(fn){
  const root=readRootStore();
  const context=tenantContext.getStore();
  const view=context?.companyId?tenantView(root,context.companyId):root;
  const result=fn(view);
  writeStore(root);
  return result;
}

function runWithTenant(companyId,fn){return tenantContext.run({companyId},fn)}
function id(){return crypto.randomUUID()}
function now(){return new Date().toISOString()}

module.exports={readStore,writeStore,mutate,id,now,dataFile,runWithTenant,readRootStore};
