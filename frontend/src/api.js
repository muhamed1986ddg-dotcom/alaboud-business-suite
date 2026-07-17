import axios from "axios";

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

  config.headers["X-Alaboud-Client-Version"]="15.5.0";
  config.params={
    ...(config.params||{}),
    _live:Date.now()
  };

  return config;
});

api.interceptors.response.use(
  response=>response,
  error=>{
    if(error.response?.status===401){
      localStorage.removeItem("afs_token");
      localStorage.removeItem("afs_user");
      window.dispatchEvent(new Event("alaboud-auth-expired"));
    }
    return Promise.reject(error);
  }
);

export default api;
