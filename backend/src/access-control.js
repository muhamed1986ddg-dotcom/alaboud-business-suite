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

const PUBLIC_API_PREFIXES = Object.freeze([
  "/api/auth/",
  "/api/health",
  "/api/public/"
]);

const RESOURCE_PERMISSION = Object.freeze([
  ["/api/customers", "customers"],
  ["/api/transactions", "transactions"],
  ["/api/payments", "transactions"],
  ["/api/debts", "debts"],
  ["/api/general-debts", "debts"],
  ["/api/expenses", "expenses"],
  ["/api/capital", "capital"],
  ["/api/partners", "partners"],
  ["/api/companies", "partners"],
  ["/api/exchange-rates", "rates"],
  ["/api/rates", "rates"],
  ["/api/reports", "reports"],
  ["/api/dashboard", "dashboard"]
]);

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

function requiredPermissionForRequest(method, requestPath){
  const verb=String(method||"GET").toUpperCase();
  const pathname=String(requestPath||"").split("?")[0].replace(/\/+$/, "") || "/";

  if (PUBLIC_API_PREFIXES.some((prefix) => pathname === prefix.replace(/\/$/, "") || pathname.startsWith(prefix))) {
    return null;
  }
  if (pathname.startsWith("/api/users") || pathname.startsWith("/api/branches") || pathname.startsWith("/api/admin")) {
    return "admin.only";
  }
  if (pathname.startsWith("/api/audit-logs") || pathname.startsWith("/api/audit")) {
    return verb === "GET" || verb === "HEAD" ? "audit.read" : "admin.only";
  }

  const resource=RESOURCE_PERMISSION.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (!resource) return null;
  const [, permissionPrefix]=resource;
  const action=(verb === "GET" || verb === "HEAD" || verb === "OPTIONS") ? "read" : "write";
  return `${permissionPrefix}.${action}`;
}

function requirePermission(permission){
  return (req,res,next)=>{
    if(!hasPermission(req.user,permission)){
      return res.status(403).json({message:"ليس لديك صلاحية لتنفيذ هذه العملية",permission});
    }
    next();
  };
}

module.exports={
  ROLE_PERMISSIONS,
  normalizeRole,
  permissionsFor,
  hasPermission,
  requiredPermissionForRequest,
  requirePermission
};
