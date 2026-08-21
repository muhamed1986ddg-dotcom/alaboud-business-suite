"use strict";

const dns = require("dns").promises;
const http = require("http");
const https = require("https");
const net = require("net");

function isPrivateIpv4(value){
  const p=String(value||"").split(".").map(Number);
  if(p.length!==4||p.some(part=>!Number.isInteger(part)||part<0||part>255))return true;
  return p[0]===10
    ||p[0]===127
    ||p[0]===0
    ||(p[0]===169&&p[1]===254)
    ||(p[0]===172&&p[1]>=16&&p[1]<=31)
    ||(p[0]===192&&p[1]===168)
    ||(p[0]===100&&p[1]>=64&&p[1]<=127)
    ||p[0]>=224;
}

function mappedIpv4FromIpv6(value){
  const dotted=String(value||"").match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if(dotted&&net.isIP(dotted[1])===4)return dotted[1];

  const hex=String(value||"").match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if(!hex)return null;

  const high=parseInt(hex[1],16);
  const low=parseInt(hex[2],16);
  return `${(high>>8)&255}.${high&255}.${(low>>8)&255}.${low&255}`;
}

function isPrivateIp(address){
  const value=String(address||"").trim().toLowerCase();
  if(!value)return true;

  if(net.isIP(value)===4)return isPrivateIpv4(value);

  if(net.isIP(value)===6){
    const mapped=mappedIpv4FromIpv6(value);
    if(mapped)return isPrivateIpv4(mapped);

    return value==="::1"
      ||value==="::"
      ||value.startsWith("fc")
      ||value.startsWith("fd")
      ||value.startsWith("fe8")
      ||value.startsWith("fe9")
      ||value.startsWith("fea")
      ||value.startsWith("feb");
  }

  return true;
}

async function assertSafePartnerUrl(rawUrl,{lookup=dns.lookup,production=process.env.NODE_ENV==="production"}={}){
  const parsed=new URL(String(rawUrl||"").trim());
  if(!["https:","http:"].includes(parsed.protocol))throw new Error("PARTNER_URL_PROTOCOL");
  if(production&&parsed.protocol!=="https:")throw new Error("PARTNER_HTTPS_REQUIRED");
  if(parsed.username||parsed.password)throw new Error("PARTNER_URL_CREDENTIALS");
  const hostname=String(parsed.hostname||"").toLowerCase();
  if(!hostname||hostname==="localhost"||hostname.endsWith(".localhost")||hostname.endsWith(".local")||hostname.endsWith(".internal"))throw new Error("PARTNER_PRIVATE_HOST");
  const addresses=net.isIP(hostname)?[{address:hostname}]:await lookup(hostname,{all:true,verbatim:true});
  if(!addresses.length||addresses.some(item=>isPrivateIp(item.address)))throw new Error("PARTNER_PRIVATE_IP");
  const address=addresses.find(item=>net.isIP(item.address)===4)?.address||addresses[0].address;
  return {
    url:parsed.toString(),protocol:parsed.protocol,hostname,address,
    port:parsed.port?Number(parsed.port):(parsed.protocol==="https:"?443:80),
    hostHeader:parsed.host,
    path:`${parsed.pathname||"/"}${parsed.search||""}`
  };
}

async function pinnedPartnerFetch(rawUrl,options={}){
  const safe=await assertSafePartnerUrl(rawUrl,options.networkOptions);
  const transport=safe.protocol==="https:"?https:http;
  const headers={...(options.headers||{})};
  delete headers.Cookie; delete headers.cookie;
  if(options.cookie)headers.Cookie=String(options.cookie);
  headers.Host=safe.hostHeader;
  const body=options.body===undefined||options.body===null?null:(Buffer.isBuffer(options.body)?options.body:Buffer.from(String(options.body)));
  if(body&&!Object.keys(headers).some(name=>name.toLowerCase()==="content-length"))headers["Content-Length"]=String(body.length);
  const maxBytes=Math.max(1024*1024,Number(process.env.PARTNER_MAX_RESPONSE_BYTES||20*1024*1024));
  return new Promise((resolve,reject)=>{
    const req=transport.request({
      host:safe.address,
      port:safe.port,
      servername:safe.protocol==="https:"?safe.hostname:undefined,
      rejectUnauthorized:true,
      path:safe.path,
      method:String(options.method||"GET").toUpperCase(),
      headers,
      timeout:Number(process.env.PARTNER_HTTP_TIMEOUT_MS||20000)
    },incoming=>{
      const chunks=[];let size=0;
      incoming.on("data",chunk=>{
        size+=chunk.length;
        if(size>maxBytes){req.destroy(new Error("PARTNER_RESPONSE_TOO_LARGE"));return;}
        chunks.push(chunk);
      });
      incoming.on("end",()=>{
        const payload=Buffer.concat(chunks);
        const headerBag={
          get(name){const value=incoming.headers[String(name||"").toLowerCase()];return Array.isArray(value)?value.join(", "):value??null;},
          getSetCookie(){const value=incoming.headers["set-cookie"];return Array.isArray(value)?value:(value?[String(value)]:[]);}
        };
        resolve({
          status:Number(incoming.statusCode||0),
          ok:Number(incoming.statusCode||0)>=200&&Number(incoming.statusCode||0)<300,
          headers:headerBag,
          async text(){return payload.toString("utf8");},
          async json(){return JSON.parse(payload.toString("utf8"));},
          async arrayBuffer(){return payload.buffer.slice(payload.byteOffset,payload.byteOffset+payload.byteLength);}
        });
      });
    });
    req.on("timeout",()=>req.destroy(new Error("PARTNER_HTTP_TIMEOUT")));
    req.on("error",reject);
    if(body)req.write(body);
    req.end();
  });
}

module.exports={isPrivateIp,assertSafePartnerUrl,pinnedPartnerFetch};
