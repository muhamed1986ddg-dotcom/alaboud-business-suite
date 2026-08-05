import test,{before,after} from "node:test";
import assert from "node:assert/strict";
import {createServer} from "vite";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";

let vite;
let AppButton,AppModal,AppTable,AppPagination;
let AppBadge,AppCard,AppEmptyState,AppInput,AppLoader,AppSelect,AppStatCard,AppToolbar;
let shouldCloseModalFromKey,shouldCloseModalFromBackdrop;

before(async()=>{
  vite=await createServer({server:{middlewareMode:true},appType:"custom",logLevel:"silent"});
  ({default:AppButton}=await vite.ssrLoadModule("/src/components/ui/AppButton.jsx"));
  ({default:AppTable}=await vite.ssrLoadModule("/src/components/ui/AppTable.jsx"));
  ({default:AppPagination}=await vite.ssrLoadModule("/src/components/ui/AppPagination.jsx"));
  ({default:AppModal,shouldCloseModalFromKey,shouldCloseModalFromBackdrop}=await vite.ssrLoadModule("/src/components/ui/AppModal.jsx"));
  ({default:AppBadge}=await vite.ssrLoadModule("/src/components/ui/AppBadge.jsx"));
  ({default:AppCard}=await vite.ssrLoadModule("/src/components/ui/AppCard.jsx"));
  ({default:AppEmptyState}=await vite.ssrLoadModule("/src/components/ui/AppEmptyState.jsx"));
  ({default:AppInput}=await vite.ssrLoadModule("/src/components/ui/AppInput.jsx"));
  ({default:AppLoader}=await vite.ssrLoadModule("/src/components/ui/AppLoader.jsx"));
  ({default:AppSelect}=await vite.ssrLoadModule("/src/components/ui/AppSelect.jsx"));
  ({default:AppStatCard}=await vite.ssrLoadModule("/src/components/ui/AppStatCard.jsx"));
  ({default:AppToolbar}=await vite.ssrLoadModule("/src/components/ui/AppToolbar.jsx"));
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

test("AppBadge renders tone, custom class and content",()=>{
  const output=html(React.createElement(AppBadge,{tone:"success",className:"extra"},"نشط"));
  assert.match(output,/app-badge--success/);
  assert.match(output,/extra/);
  assert.match(output,/نشط/);
});

test("AppCard renders semantic tag, header, actions and body",()=>{
  const output=html(React.createElement(AppCard,{as:"article",title:"العنوان",subtitle:"الوصف",actions:React.createElement("button",null,"إجراء")},"المحتوى"));
  assert.match(output,/^<article/);
  assert.match(output,/العنوان/);
  assert.match(output,/الوصف/);
  assert.match(output,/إجراء/);
  assert.match(output,/المحتوى/);
});

test("AppEmptyState renders defaults and optional action",()=>{
  const basic=html(React.createElement(AppEmptyState,null));
  assert.match(basic,/لا توجد بيانات/);
  const detailed=html(React.createElement(AppEmptyState,{icon:"📄",title:"فارغ",description:"لا توجد سجلات",action:React.createElement("button",null,"إضافة")}));
  assert.match(detailed,/فارغ/);
  assert.match(detailed,/لا توجد سجلات/);
  assert.match(detailed,/إضافة/);
});

test("AppInput connects label, id, hint and error accessibility",()=>{
  const hinted=html(React.createElement(AppInput,{id:"phone",label:"الهاتف",hint:"أدخل الرقم",defaultValue:"123"}));
  assert.match(hinted,/for="phone"/);
  assert.match(hinted,/id="phone"/);
  assert.match(hinted,/أدخل الرقم/);
  assert.match(hinted,/aria-invalid="false"/);
  const invalid=html(React.createElement(AppInput,{id:"name",label:"الاسم",error:"مطلوب"}));
  assert.match(invalid,/aria-invalid="true"/);
  assert.match(invalid,/مطلوب/);
});

test("AppLoader exposes status and inline mode",()=>{
  const output=html(React.createElement(AppLoader,{label:"جارٍ الجلب",inline:true}));
  assert.match(output,/role="status"/);
  assert.match(output,/app-loader--inline/);
  assert.match(output,/جارٍ الجلب/);
});

test("AppSelect renders placeholder, string and object options",()=>{
  const output=html(React.createElement(AppSelect,{id:"currency",label:"العملة",placeholder:"اختر",options:["CAD",{value:"USD",label:"دولار أمريكي"}]}));
  assert.match(output,/for="currency"/);
  assert.match(output,/اختر/);
  assert.match(output,/value="CAD"/);
  assert.match(output,/value="USD"/);
  assert.match(output,/دولار أمريكي/);
});

test("AppStatCard renders financial value, hint and tone",()=>{
  const output=html(React.createElement(AppStatCard,{label:"الرصيد",value:"1,250 CAD",hint:"محدث الآن",tone:"warning"}));
  assert.match(output,/app-stat-card--warning/);
  assert.match(output,/الرصيد/);
  assert.match(output,/1,250 CAD/);
  assert.match(output,/محدث الآن/);
});

test("AppToolbar renders content, actions and custom class",()=>{
  const output=html(React.createElement(AppToolbar,{className:"customer-toolbar",actions:React.createElement("button",null,"إضافة")},React.createElement("span",null,"بحث")));
  assert.match(output,/customer-toolbar/);
  assert.match(output,/app-toolbar__content/);
  assert.match(output,/بحث/);
  assert.match(output,/app-toolbar__actions/);
  assert.match(output,/إضافة/);
});
