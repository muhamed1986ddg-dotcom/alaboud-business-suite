"use strict";

const { Readable } = require("stream");
const { pipeline } = require("stream/promises");

const DEFAULT_CHUNK_BYTES = 64 * 1024;

function backupJsonStringify(payload){
  return JSON.stringify(payload, (_key, value) => typeof value === "bigint" ? value.toString() : value);
}

function *bufferChunks(buffer, chunkBytes = DEFAULT_CHUNK_BYTES){
  const size = Math.max(16 * 1024, Number(chunkBytes) || DEFAULT_CHUNK_BYTES);
  for(let offset=0; offset<buffer.length; offset+=size){
    yield buffer.subarray(offset, Math.min(offset+size, buffer.length));
  }
}

async function sendJsonAttachmentChunked(res, payload, filename, {chunkBytes=DEFAULT_CHUNK_BYTES}={}){
  const json = backupJsonStringify(payload);
  const body = Buffer.from(json, "utf8");
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${String(filename||"backup.json").replace(/[\r\n\"]/g, "_")}"`);
  res.setHeader("Cache-Control", "no-store");
  res.removeHeader?.("Content-Length");
  await pipeline(Readable.from(bufferChunks(body,chunkBytes)), res);
  return {bytes:body.length};
}

module.exports={DEFAULT_CHUNK_BYTES,backupJsonStringify,bufferChunks,sendJsonAttachmentChunked};
