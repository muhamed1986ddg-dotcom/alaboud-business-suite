import {readdirSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const testsDir=dirname(fileURLToPath(import.meta.url));
const frontendDir=resolve(testsDir,"..");
const files=readdirSync(testsDir).filter(name=>name.endsWith(".test.mjs")).sort();
let failures=0;

for(const file of files){
  const result=spawnSync(process.execPath,[resolve(testsDir,file)],{cwd:frontendDir,stdio:"inherit"});
  if(result.status!==0)failures++;
}

if(failures){
  console.error(`Frontend test suite failed: ${failures}/${files.length}`);
  process.exit(1);
}
console.log(`Frontend test suite passed: ${files.length}/${files.length}`);
