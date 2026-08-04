import axios from "axios";

const getResponseCache=new Map();
const DEFAULT_GET_CACHE_TTL=60000;
const PERSISTED_CACHE_PREFIX="alaboud_get_cache_v1:";
function persistedGet(key){try{const raw=sessionStorage.getItem(PERSISTED_CACHE_PREFIX+key);if(!raw)return null;const value=JSON.parse(raw);return value?.expiresAt>Date.now()?value:null}catch{return null}}
function persistedSet(key,response,expiresAt){try{sessionStorage.setItem(PERSISTED_CACHE_PREFIX+key,JSON.stringify({expiresAt,data:response.data,status:response.status,statusText:response.statusText,headers:response.headers}))}catch{}}

function cacheKey(url,config={}){
  const branchId=localStorage.getItem("alaboud_branch_id")||"main";
  const token=localStorage.getItem("afs_token")||"";
  const tokenScope=token.slice(-16);
  const params=Object.entries(config.params||{}).sort(([a],[b])=>a.localeCompare(b));
  return JSON.stringify([branchId,tokenScope,url,params]);
}

export function clearApiGetCache(){getResponseCache.clear();}
export function pruneApiGetCache(){
  const now=Date.now();
  for(const [key,value] of getResponseCache){if(value.expiresAt<=now)getResponseCache.delete(key);}
}
if(typeof document!=="undefined"){
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")pruneApiGetCache();});
}

const api=axios.create({
  baseURL:"/api",
  timeout:20000,
  headers:{
    "Cache-Control":"no-cache, no-store, must-revalidate",
    "Pragma":"no-cache",
    "Expires":"0"
  }
});

api.interceptors.request.use(config=>{
  const token=localStorage.getItem("afs_token");
  if(token)config.headers.Authorization=`Bearer ${token}`;
  const branchId=localStorage.getItem("alaboud_branch_id");
  if(branchId)config.headers["X-Branch-ID"]=branchId;

  let installationId=localStorage.getItem("alaboud_installation_id");
  if(!installationId){installationId=(crypto?.randomUUID?.()||`inst-${Date.now()}-${Math.random().toString(36).slice(2)}`);localStorage.setItem("alaboud_installation_id",installationId)}
  config.headers["X-Installation-ID"]=installationId;
  config.headers["X-Device-Name"]=navigator.userAgentData?.platform||navigator.platform||"Web Device";
  config.headers["X-Device-Platform"]=navigator.userAgent||"Web";
  config.headers["X-Alaboud-Client-Version"]="24.2.0";
  // Do not append a timestamp to every GET request. The in-memory cache below
  // already controls freshness, while cache-busting forced needless server and
  // database work on every navigation.
  return config;
});

const TOASTABLE_WRITE_ROUTES=[
  /^\/customers(?:\/|$)/,/^\/transactions(?:\/|$)/,/^\/debts(?:\/|$)/,
  /^\/expenses(?:\/|$)/,/^\/capital(?:\/|$)/,/^\/partners(?:\/|$)/,
  /^\/companies(?:\/|$)/,/^\/exchange-rates(?:\/|$)/,/^\/branches(?:\/|$)/,
  /^\/users(?:\/|$)/,/^\/notification-settings(?:\/|$)/,/^\/company-profile(?:\/|$)/,
  /^\/settings(?:\/|$)/,/^\/backup(?:\/|$)/
];

function shouldShowWriteToast(url,config={}){
  if(config.suppressToast===true)return false;
  return TOASTABLE_WRITE_ROUTES.some(pattern=>pattern.test(url));
}

function successToastMessage(method,url,response){
  const backendMessage=String(response?.data?.message||"").trim();
  if(/\/payments(?:\/|$)/.test(url)||/\/(?:settle|pay|paid)(?:\/|$)/.test(url))return backendMessage||"تم تسجيل الدفعة بنجاح";
  if(/refresh|sync|test-connection|recalculate/.test(url))return backendMessage||"تم تحديث البيانات بنجاح";
  if(method==="delete")return backendMessage||"تم الحذف بنجاح";
  if(method==="patch"||method==="put")return backendMessage||"تم التعديل بنجاح";
  return backendMessage||"تمت الإضافة بنجاح";
}

function errorToastMessage(method,error){
  const backendMessage=String(error.response?.data?.message||"").trim();
  if(backendMessage)return backendMessage;
  if(method==="delete")return "تعذر الحذف";
  if(method==="patch"||method==="put")return "تعذر التعديل";
  return "تعذر حفظ العملية";
}

function dispatchOperationToast(message,type="success"){
  if(typeof window==="undefined")return;
  window.dispatchEvent(new CustomEvent("alaboud-operation-toast",{detail:{message,type}}));
}

api.interceptors.response.use(
  response=>{
    const method=String(response.config?.method||"get").toLowerCase();
    if(method!=="get")clearApiGetCache();
    const url=String(response.config?.url||"").split("?")[0];
    if(method!=="get"&&shouldShowWriteToast(url,response.config)){
      dispatchOperationToast(successToastMessage(method,url,response),"success");
    }
    return response;
  },
  error=>{
    const method=String(error.config?.method||"get").toLowerCase();
    const url=String(error.config?.url||"").split("?")[0];
    if(method!=="get"&&shouldShowWriteToast(url,error.config)&&error.response?.status!==401){
      dispatchOperationToast(errorToastMessage(method,error),"error");
    }
    if(error.response?.status===401){
      clearApiGetCache();
      localStorage.removeItem("afs_token");
      localStorage.removeItem("afs_user");
      window.dispatchEvent(new Event("alaboud-auth-expired"));
    }
    return Promise.reject(error);
  }
);

// Reuse fresh GET responses while navigating between pages. Concurrent
// requests for the same resource share one promise; every successful write
// clears the cache through the response interceptor above.
export function cachedGet(url,config={}){
  const ttl=Number.isFinite(Number(config.cacheTtl))?Math.max(0,Number(config.cacheTtl)):DEFAULT_GET_CACHE_TTL;
  const persist=config.persistCache===true;
  const requestConfig={...config};delete requestConfig.cacheTtl;delete requestConfig.persistCache;
  if(ttl===0)return api.get(url,requestConfig);
  const key=cacheKey(url,requestConfig);
  const current=getResponseCache.get(key);
  if(current&&current.expiresAt>Date.now())return current.promise;
  if(persist){const saved=persistedGet(key);if(saved){const response={data:saved.data,status:saved.status||200,statusText:saved.statusText||"OK",headers:saved.headers||{},config:requestConfig};const promise=Promise.resolve(response);getResponseCache.set(key,{promise,expiresAt:saved.expiresAt});return promise;}}
  const expiresAt=Date.now()+ttl;
  const promise=api.get(url,requestConfig).then(response=>{if(persist)persistedSet(key,response,expiresAt);return response;}).catch(error=>{getResponseCache.delete(key);throw error;});
  getResponseCache.set(key,{promise,expiresAt});
  return promise;
}

export default api;
