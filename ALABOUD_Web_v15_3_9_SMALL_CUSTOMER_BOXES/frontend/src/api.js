import axios from "axios";
const api=axios.create({baseURL:"/api",timeout:15000});
api.interceptors.request.use(c=>{const t=localStorage.getItem("afs_token");if(t)c.headers.Authorization=`Bearer ${t}`;return c;});
api.interceptors.response.use(r=>r,e=>{if(e.response?.status===401){localStorage.removeItem("afs_token");localStorage.removeItem("afs_user");}return Promise.reject(e);});
export default api;
