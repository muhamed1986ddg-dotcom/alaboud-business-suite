import axios from "axios";

const getResponseCache=new Map();
const DEFAULT_GET_CACHE_TTL=30000;

function cacheKey(url,config={}){
  const branchId=localStorage.getItem("alaboud_branch_id")||"main";
  const token=localStorage.getItem("afs_token")||"";
  const tokenScope=token.slice(-16);
  const params=Object.entries(config.params||{}).sort(([a],[b])=>a.localeCompare(b));
  return JSON.stringify([branchId,tokenScope,url,params]);
}

export function clearApiGetCache(){getResponseCache.clear();}

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
  config.headers["X-Alaboud-Client-Version"]="23.0.15";
  config.params={
    ...(config.params||{}),
    _live:Date.now()
  };

  return config;
});

api.interceptors.response.use(
  response=>{
    if(String(response.config?.method||"get").toLowerCase()!=="get")clearApiGetCache();
    return response;
  },
  error=>{
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
  const requestConfig={...config};delete requestConfig.cacheTtl;
  if(ttl===0)return api.get(url,requestConfig);
  const key=cacheKey(url,requestConfig);
  const current=getResponseCache.get(key);
  if(current&&current.expiresAt>Date.now())return current.promise;
  const promise=api.get(url,requestConfig).catch(error=>{getResponseCache.delete(key);throw error;});
  getResponseCache.set(key,{promise,expiresAt:Date.now()+ttl});
  return promise;
}

export default api;
