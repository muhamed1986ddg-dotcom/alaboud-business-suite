"use strict";
const assert=require("assert/strict");
const http=require("http");
const {sendJsonAttachmentChunked,backupJsonStringify}=require("./backup-response");

(async()=>{
  assert.equal(backupJsonStringify({amount:123n}),'{"amount":"123"}');

  // Larger than Cloud Run's non-streaming HTTP/1 response threshold: this
  // regression test verifies that Node emits Transfer-Encoding: chunked and
  // never Content-Length for the plain backup download.
  const marker="x".repeat(33*1024*1024+1024);
  const payload={format:"ALABOUD_BACKUP",version:"25.14.96",data:{marker}};
  const server=http.createServer((req,res)=>{
    sendJsonAttachmentChunked(res,payload,"backup.json").catch(error=>res.destroy(error));
  });
  await new Promise((resolve,reject)=>server.listen(0,"127.0.0.1",error=>error?reject(error):resolve()));
  try{
    const address=server.address();
    const result=await new Promise((resolve,reject)=>{
      http.get({host:"127.0.0.1",port:address.port,path:"/"},response=>{
        const chunks=[];
        response.on("data",chunk=>chunks.push(chunk));
        response.on("end",()=>resolve({headers:response.headers,body:Buffer.concat(chunks)}));
      }).on("error",reject);
    });
    assert.equal(result.headers["content-length"],undefined);
    assert.equal(result.headers["transfer-encoding"],"chunked");
    assert(result.body.length>32*1024*1024);
    const parsed=JSON.parse(result.body.toString("utf8"));
    assert.equal(parsed.version,"25.14.96");
    assert.equal(parsed.data.marker.length,marker.length);
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
  console.log("v25.14.96 large company backup chunked streaming: OK");
})().catch(error=>{console.error(error);process.exitCode=1;});
