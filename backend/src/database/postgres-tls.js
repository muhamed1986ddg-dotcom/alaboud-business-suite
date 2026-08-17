"use strict";

function postgresSslOptions(connectionString,env=process.env){
  const raw=String(connectionString||"").trim();
  if(!raw)return false;
  let url;
  try{url=new URL(raw);}catch{return {rejectUnauthorized:true};}
  const host=String(url.hostname||"").toLowerCase();
  const socketHost=String(url.searchParams.get("host")||"");
  const isLocal=host==="localhost"||host==="127.0.0.1"||host==="::1"||socketHost.startsWith("/cloudsql/")||raw.includes("host=/cloudsql/");
  if(isLocal)return false;
  if(String(env.ALLOW_INSECURE_DATABASE_TLS||"").toLowerCase()==="true")return {rejectUnauthorized:false};
  return {rejectUnauthorized:true};
}

module.exports={postgresSslOptions};
