const crypto=require("crypto");
// Twelve hours is the documented default. Deployments can choose a shorter
// window through SESSION_IDLE_MINUTES, but a session must not remain idle for
// the full 30-day token lifetime by accident.
const DEFAULT_IDLE_MS=Math.max(5*60*1000,Number(process.env.SESSION_IDLE_MINUTES||720)*60*1000);

function ensureSessionStore(store){
  if(!Array.isArray(store.sessions))store.sessions=[];
  return store.sessions;
}

function createSession(store,{userId,companyId,jti,ip,userAgent,expiresAt}){
  const sessions=ensureSessionStore(store);
  const session={
    id:crypto.randomUUID(),jti,userId,companyId,
    ip:String(ip||""),userAgent:String(userAgent||"").slice(0,500),
    active:true,createdAt:new Date().toISOString(),lastSeenAt:new Date().toISOString(),
    expiresAt,revokedAt:null,revokedBy:null
  };
  sessions.push(session);
  if(sessions.length>5000)sessions.splice(0,sessions.length-5000);
  return session;
}

function validateSession(store,{jti,userId,companyId,idleMs=DEFAULT_IDLE_MS}){
  const session=ensureSessionStore(store).find(item=>item.jti===jti&&item.userId===userId&&item.companyId===companyId);
  if(!session||session.active===false)return {ok:false,reason:"REVOKED"};
  const now=Date.now();
  if(session.expiresAt&&Date.parse(session.expiresAt)<=now)return {ok:false,reason:"EXPIRED"};
  if(session.lastSeenAt&&now-Date.parse(session.lastSeenAt)>idleMs)return {ok:false,reason:"IDLE_TIMEOUT"};
  session.lastSeenAt=new Date(now).toISOString();
  return {ok:true,session};
}

function revokeSession(store,jti,revokedBy){
  const session=ensureSessionStore(store).find(item=>item.jti===jti);
  if(!session)return false;
  session.active=false;session.revokedAt=new Date().toISOString();session.revokedBy=revokedBy||null;
  return true;
}

function revokeUserSessions(store,userId,revokedBy,exceptJti=null){
  let count=0;
  for(const session of ensureSessionStore(store)){
    if(session.userId===userId&&session.active!==false&&session.jti!==exceptJti){
      session.active=false;session.revokedAt=new Date().toISOString();session.revokedBy=revokedBy||null;count++;
    }
  }
  return count;
}

function revokeBiometricForUser(store,userId){
  let count=0;
  for(const device of Array.from(store.devices||[])){
    if(device.userId!==userId)continue;
    if(device.biometricActive===true||device.biometricJti){
      device.biometricActive=false;
      device.biometricJti=null;
      device.revokedAt=new Date().toISOString();
      device.updatedAt=device.revokedAt;
      count++;
    }
  }
  return count;
}

module.exports={DEFAULT_IDLE_MS,ensureSessionStore,createSession,validateSession,revokeSession,revokeUserSessions,revokeBiometricForUser};
