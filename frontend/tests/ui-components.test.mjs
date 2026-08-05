import test,{before,after} from "node:test";
import assert from "node:assert/strict";
import {createServer} from "vite";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";

let vite;
let AppButton,AppModal,AppTable,AppPagination;
let shouldCloseModalFromKey,shouldCloseModalFromBackdrop;

before(async()=>{
  vite=await createServer({server:{middlewareMode:true},appType:"custom",logLevel:"silent"});
  ({default:AppButton}=await vite.ssrLoadModule("/src/components/ui/AppButton.jsx"));
  ({default:AppTable}=await vite.ssrLoadModule("/src/components/ui/AppTable.jsx"));
  ({default:AppPagination}=await vite.ssrLoadModule("/src/components/ui/AppPagination.jsx"));
  ({default:AppModal,shouldCloseModalFromKey,shouldCloseModalFromBackdrop}=await vite.ssrLoadModule("/src/components/ui/AppModal.jsx"));
});
after(async()=>{await vite?.close();});

const html=node=>renderToStaticMarkup(node);

test("AppButton renders busy and disabled states",()=>{
  const output=html(React.createElement(AppButton,{busy:true,busyText:"جارٍ الحفظ"},"حفظ"));
  assert.match(output,/disabled/);
  assert.match(output,/aria-busy="true"/);
  assert.match(output,/جارٍ الحفظ/);
});

test("AppTable renders headings, rows and custom cells",()=>{
  const output=html(React.createElement(AppTable,{columns:[{key:"name",label:"الاسم"},{key:"amount",label:"المبلغ",render:r=>`${r.amount} CAD`}],rows:[{id:1,name:"محمد",amount:25}]}));
  assert.match(output,/الاسم/);
  assert.match(output,/محمد/);
  assert.match(output,/25 CAD/);
});

test("AppTable renders loading and empty states",()=>{
  assert.match(html(React.createElement(AppTable,{loading:true})),/جاري تحميل البيانات/);
  assert.match(html(React.createElement(AppTable,{rows:[],emptyText:"لا توجد حوالات"})),/لا توجد حوالات/);
});

test("AppPagination enforces first and last page boundaries",()=>{
  const first=html(React.createElement(AppPagination,{page:1,totalPages:3}));
  assert.match(first,/السابق/);
  assert.match(first,/صفحة 1 من 3/);
  assert.match(first,/disabled/);
  const last=html(React.createElement(AppPagination,{page:3,totalPages:3}));
  assert.match(last,/صفحة 3 من 3/);
  assert.equal((last.match(/disabled/g)||[]).length,1);
});

test("AppModal renders only when open",()=>{
  assert.equal(html(React.createElement(AppModal,{open:false,title:"اختبار"})),"");
  const output=html(React.createElement(AppModal,{open:true,title:"اختبار",onClose:()=>{}},"المحتوى"));
  assert.match(output,/role="dialog"/);
  assert.match(output,/اختبار/);
  assert.match(output,/المحتوى/);
});

test("AppModal close rules respect busy and backdrop settings",()=>{
  assert.equal(shouldCloseModalFromKey("Escape",false),true);
  assert.equal(shouldCloseModalFromKey("Escape",true),false);
  assert.equal(shouldCloseModalFromKey("Enter",false),false);
  const target={};
  assert.equal(shouldCloseModalFromBackdrop(target,target,true,false),true);
  assert.equal(shouldCloseModalFromBackdrop({},target,true,false),false);
  assert.equal(shouldCloseModalFromBackdrop(target,target,false,false),false);
  assert.equal(shouldCloseModalFromBackdrop(target,target,true,true),false);
});
