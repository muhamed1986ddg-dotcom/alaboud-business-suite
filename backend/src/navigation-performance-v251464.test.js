"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");

const root=path.resolve(__dirname,"../..");
const app=fs.readFileSync(path.join(root,"frontend/src/App.jsx"),"utf8");
const changed=process.argv[2]||"";

assert(app.includes("function warmScreenForPage(page)"),"page-specific chunk warming is required");
assert(!app.includes("Object.values(screenLoaders).map(load=>load())"),"all lazy screens must not preload after startup");
assert(app.includes("onPointerEnter={()=>warmScreenForPage(key)}"),"menu intent should warm only the selected screen");
assert(app.includes("if(!english)return;"),"Arabic renders must skip translation observer DOM walks");
for(const forbidden of ["backend/src/finance/","backend/src/store.js","backend/src/telemetry-writer.js"]){
  assert(!changed.includes(forbidden),`performance release must not change ${forbidden}`);
}
console.log("v25.14.64 navigation performance regression: OK");
