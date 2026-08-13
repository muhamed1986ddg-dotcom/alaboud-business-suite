import test,{before,after} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {fileURLToPath} from "node:url";
import {createServer} from "vite";

let vite;
let revealAppEditorNow;

before(async()=>{
  vite=await createServer({root:fileURLToPath(new URL("..",import.meta.url)),server:{middlewareMode:true},appType:"custom",logLevel:"silent"});
  ({revealAppEditorNow}=await vite.ssrLoadModule("/src/shared.jsx"));
});

after(async()=>{await vite?.close();});

test("mobile edit reveal targets the rendered editor",()=>{
  let options=null;
  const editor={scrollIntoView:value=>{options=value;}};
  const doc={querySelector:selector=>selector==='[data-app-editor="transaction"]'?editor:null};
  assert.equal(revealAppEditorNow('[data-app-editor="transaction"]',doc),true);
  assert.deepEqual(options,{behavior:"smooth",block:"start",inline:"nearest"});
});

test("mobile edit reveal falls back to the application scroll container",()=>{
  let options=null;
  const appScroller={scrollTo:value=>{options=value;}};
  const doc={querySelector:selector=>selector==="main.app-main-content"?appScroller:null};
  assert.equal(revealAppEditorNow('[data-app-editor="missing"]',doc),true);
  assert.deepEqual(options,{top:0,behavior:"smooth"});
});

test("all inline edit flows reveal a visible editor",()=>{
  const source=file=>fs.readFileSync(new URL(`../src/screens/${file}`,import.meta.url),"utf8");
  const transactions=source("Transactions.jsx");
  const customerDetails=source("CustomerDetails.jsx");
  const customers=source("Customers.jsx");
  const simple=source("Simple.jsx");
  const partners=source("Partners.jsx");

  for(const marker of [
    'data-app-editor="transaction"',
    'data-app-editor="customer-transaction"',
    'data-app-editor="customer-payment"',
    'data-app-editor="customer"',
    'data-app-editor="expense"',
    'data-app-editor="partner-transaction"',
    'data-app-editor="partner-payment"',
    'data-app-editor="partner-company"'
  ]){
    assert.ok([transactions,customerDetails,customers,simple,partners].some(text=>text.includes(marker)),`missing editor marker ${marker}`);
  }
  assert.ok(partners.includes("setShowConnectionForm(true)"),"company editor must become visible before scrolling");
});

test("mobile confirmation dialogs are centered and safe-area aware",()=>{
  const css=fs.readFileSync(new URL("../src/styles/components.css",import.meta.url),"utf8");
  assert.match(css,/@media\(max-width:700px\)\{\.app-modal-backdrop\{place-items:center/);
  assert.match(css,/var\(--app-safe-bottom,0px\)/);
  assert.doesNotMatch(css,/\.app-modal-backdrop\{padding:8px;align-items:end\}/);
});
