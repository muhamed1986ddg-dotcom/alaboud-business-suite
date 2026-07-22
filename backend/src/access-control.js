const ROLE_PERMISSIONS = Object.freeze({
  ADMIN: ["*"],
  MANAGER: [
    "dashboard.read","customers.read","customers.write","transactions.read","transactions.write",
    "debts.read","debts.write","expenses.read","expenses.write","capital.read","capital.write",
    "partners.read","partners.write","rates.read","rates.write","reports.read","audit.read"
  ],
  ACCOUNTANT: [
    "dashboard.read","customers.read","customers.write","transactions.read","transactions.write",
    "debts.read","debts.write","expenses.read","expenses.write","capital.read","capital.write",
    "partners.read","rates.read","reports.read"
  ],
  USER: [
    "dashboard.read","customers.read","customers.write","transactions.read","transactions.write",
    "debts.read","debts.write","expenses.read","partners.read","rates.read"
  ],
  VIEWER: [
    "dashboard.read","customers.read","transactions.read","debts.read","expenses.read",
    "capital.read","partners.read","rates.read","reports.read"
  ]
});

function normalizeRole(role){
  const value=String(role||"USER").trim().toUpperCase();
  return ROLE_PERMISSIONS[value]?value:"USER";
}

function permissionsFor(role, customPermissions=[]){
  const base=ROLE_PERMISSIONS[normalizeRole(role)]||[];
  return Array.from(new Set([...base,...(Array.isArray(customPermissions)?customPermissions:[]).map(String)]));
}

function hasPermission(user, permission){
  const permissions=permissionsFor(user?.role,user?.permissions);
  return permissions.includes("*")||permissions.includes(permission);
}

function requirePermission(permission){
  return (req,res,next)=>{
    if(!hasPermission(req.user,permission)){
      return res.status(403).json({message:"ليس لديك صلاحية لتنفيذ هذه العملية",permission});
    }
    next();
  };
}

function requiredPermissionForRequest(method, path=""){
  const verb=String(method||"GET").toUpperCase();
  const clean=String(path||"").split("?")[0].replace(/^\/api\//,"");
  const write=!['GET','HEAD','OPTIONS'].includes(verb);
  if(clean.startsWith("auth/"))return null;
  if(clean.startsWith("users")||clean.startsWith("devices")||clean.startsWith("company-profile")||clean.startsWith("security/"))return "admin.only";
  if(clean.startsWith("audit-logs"))return "audit.read";
  const groups=[
    [["dashboard","notification-settings","notifications","ai/"],"dashboard"],
    [["customers","customer-alerts","notification-actions"],"customers"],
    [["transactions","payments"],"transactions"],
    [["general-debts"],"debts"],
    [["expenses"],"expenses"],
    [["capital"],"capital"],
    [["exchange-rates"],"rates"],
    [["partners"],"partners"],
    [["profits","monthly-report","reports"],"reports"],
    [["backup","restore"],"admin"]
  ];
  for(const [prefixes,area] of groups){
    if(prefixes.some(prefix=>clean===prefix||clean.startsWith(`${prefix}/`)||clean.startsWith(prefix))){
      if(area==="admin")return "admin.only";
      return `${area}.${write?"write":"read"}`;
    }
  }
  return write?"admin.only":null;
}

module.exports={ROLE_PERMISSIONS,normalizeRole,permissionsFor,hasPermission,requirePermission,requiredPermissionForRequest};
