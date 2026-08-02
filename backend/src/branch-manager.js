const crypto=require("crypto");

function normalizeCode(value){return String(value||"").trim().toUpperCase().replace(/[^A-Z0-9_-]/g,"").slice(0,20)}
function createBranch(store,{companyId,name,code,address="",phone="",currency="CAD",isMain=false,createdBy=null,now=()=>new Date().toISOString()}){
  const cleanName=String(name||"").trim();const cleanCode=normalizeCode(code);
  if(!cleanName)throw new Error("BRANCH_NAME_REQUIRED");if(!cleanCode)throw new Error("BRANCH_CODE_REQUIRED");
  if((store.branches||[]).some(x=>x.companyId===companyId&&x.code===cleanCode&&x.active!==false))throw new Error("BRANCH_CODE_EXISTS");
  if(isMain)for(const branch of store.branches||[])if(branch.companyId===companyId)branch.isMain=false;
  const item={id:crypto.randomUUID(),companyId,name:cleanName,code:cleanCode,address:String(address||"").trim(),phone:String(phone||"").trim(),currency:String(currency||"CAD").toUpperCase(),isMain:Boolean(isMain),active:true,createdBy,createdAt:now()};
  store.branches.push(item);return item;
}
function resolveBranch(store,{companyId,requestedBranchId,user}){
  const companyBranches=(store.branches||[]).filter(x=>x.companyId===companyId&&x.active!==false);
  const allowed=Array.isArray(user?.branchIds)&&user.branchIds.length?companyBranches.filter(x=>user.branchIds.includes(x.id)):companyBranches;
  if(!allowed.length)return null;
  return allowed.find(x=>x.id===requestedBranchId)||allowed.find(x=>x.isMain)||allowed[0];
}
function branchSummary(root,branch){
  const rows=key=>(root[key]||[]).filter(x=>x.companyId===branch.companyId&&x.branchId===branch.id);
  const transactions=rows("transactions"),expenses=rows("expenses"),capital=rows("capitalMovements"),debts=rows("generalDebts");
  const sum=(list,field)=>list.reduce((n,x)=>n+Number(x[field]||0),0);
  return {...branch,metrics:{customers:rows("customers").length,transactions:transactions.length,transactionValueCad:+sum(transactions,"cadAmount").toFixed(2),expensesCad:+sum(expenses,"cadAmount").toFixed(2),capitalCad:+capital.reduce((n,x)=>n+(String(x.type||"").toUpperCase()==="OUT"?-1:1)*Number(x.cadAmount??x.amount??0),0).toFixed(2),openDebts:debts.filter(x=>x.status!=="PAID").length}};
}
module.exports={normalizeCode,createBranch,resolveBranch,branchSummary};
