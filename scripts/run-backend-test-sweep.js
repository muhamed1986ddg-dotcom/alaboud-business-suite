"use strict";

const fs=require("fs");
const path=require("path");
const {spawnSync}=require("child_process");

const root=path.resolve(__dirname,"..");
const roots=[path.join(root,"backend","src"),path.join(root,"backend","tests")];

function collect(directory){
  if(!fs.existsSync(directory))return [];
  const files=[];
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    const target=path.join(directory,entry.name);
    if(entry.isDirectory()&&entry.name!=="node_modules")files.push(...collect(target));
    else if(entry.isFile()&&entry.name.endsWith(".test.js"))files.push(target);
  }
  return files;
}

const tests=roots.flatMap(collect).sort((a,b)=>a.localeCompare(b));
const timeoutMs=Math.max(5000,Number(process.env.BACKEND_TEST_FILE_TIMEOUT_MS||30000));
let passed=0;
const failures=[];

for(const file of tests){
  const relative=path.relative(root,file).split(path.sep).join("/");
  const result=spawnSync(process.execPath,[file],{
    cwd:root,
    env:{...process.env,NODE_ENV:"test",JWT_SECRET:process.env.JWT_SECRET||"backend-sweep-test-only-secret"},
    encoding:"utf8",
    timeout:timeoutMs,
    maxBuffer:10*1024*1024,
  });
  if(result.status===0&&!result.error){
    passed+=1;
    process.stdout.write(`PASS ${relative}\n`);
    continue;
  }
  failures.push({relative,result});
  process.stderr.write(`FAIL ${relative}${result.error?.code==="ETIMEDOUT"?" (timeout)":` (exit ${result.status??"unknown"})`}\n`);
  if(result.stdout)process.stderr.write(result.stdout);
  if(result.stderr)process.stderr.write(result.stderr);
  if(result.error)process.stderr.write(`${result.error.stack||result.error}\n`);
}

console.log(`BACKEND_TEST_SWEEP passed=${passed} failed=${failures.length} total=${tests.length}`);
if(failures.length)process.exitCode=1;
