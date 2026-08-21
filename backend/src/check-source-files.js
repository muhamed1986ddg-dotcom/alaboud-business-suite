"use strict";

const fs=require("fs");
const path=require("path");
const {spawnSync}=require("child_process");
const root=path.resolve(__dirname,"../..");
const roots=[path.join(root,"backend","src"),path.join(root,"scripts"),path.join(root,"frontend","src"),path.join(root,"frontend","tests")];
const extensions=new Set([".js",".mjs"]);
const files=[];

function walk(directory){
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    const target=path.join(directory,entry.name);
    if(entry.isDirectory())walk(target);
    else if(extensions.has(path.extname(entry.name)))files.push(target);
  }
}

for(const directory of roots)walk(directory);
for(const file of files.sort()){
  const result=spawnSync(process.execPath,["--check",file],{encoding:"utf8"});
  if(result.status!==0){
    process.stderr.write(result.stderr||result.stdout||`Syntax check failed: ${file}\n`);
    process.exit(1);
  }
  const source=fs.readFileSync(file,"utf8");
  const imports=[...source.matchAll(/(?:require\(|from\s+|import\()\s*["'](\.{1,2}\/[^"']+)["']/g)];
  for(const match of imports){
    // Regression tests sometimes search for a textual `require("...")`
    // fragment inside a quoted string. It is not an executable import.
    if(/["'`]/.test(source[match.index-1]||""))continue;
    const requested=path.resolve(path.dirname(file),match[1]);
    const candidates=[requested,...[".js",".mjs",".json",".jsx"].map(extension=>requested+extension),... ["index.js","index.mjs","index.jsx"].map(name=>path.join(requested,name))];
    if(!candidates.some(candidate=>fs.existsSync(candidate))){
      console.error(`Missing relative import in ${path.relative(root,file)}: ${match[1]}`);
      process.exit(1);
    }
  }
}
console.log(`JavaScript syntax and relative-import check passed (${files.length} files)`);
