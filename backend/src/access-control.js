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

const EXACT_PERMISSION = Object.freeze([
  ["POST", "/api/customers/:id/reset-account", "admin.only"],
  ["GET", "/api/backup", "admin.only"],
  ["POST", "/api/backup/encrypted", "admin.only"],
  ["POST", "/api/backup/restore", "admin.only"],
  ["GET", "/api/notification-settings", "dashboard.read"],
  ["PATCH", "/api/notification-settings", "admin.only"],
  ["GET", "/api/transfer-fee-settings", "dashboard.read"],
  ["PATCH", "/api/transfer-fee-settings", "admin.only"],
  ["GET", "/api/profits", "reports.read"],
  ["GET", "/api/monthly-report", "reports.read"],
  ["GET", "/api/monthly-inventory", "reports.read"],
  ["POST", "/api/monthly-inventory/preview", "reports.read"],
  ["PATCH", "/api/monthly-inventory/settings", "capital.write"],
  ["POST", "/api/monthly-inventory/close", "capital.write"],
  ["GET", "/api/capital-overview", "reports.read"],
  ["GET", "/api/company-profile", "dashboard.read"],
  ["GET", "/api/ai/overview", "reports.read"],
  ["POST", "/api/ai/assistant", "reports.read"],
  ["PATCH", "/api/company-profile", "admin.only"],
  ["GET", "/api/security/permissions", "dashboard.read"],
  ["GET", "/api/operations/:key/status", "dashboard.read"]
]);

const ADMIN_API_PREFIXES = Object.freeze([
  "/api/developer",
  "/api/devices",
  "/api/security/status"
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
  ["/api/ai", "reports"],
  ["/api/dashboard", "dashboard"],
  ["/api/notifications", "dashboard"],
  ["/api/customer-alerts", "customers"],
  ["/api/notification-actions", "customers"]
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
  const exact=EXACT_PERMISSION.find(([exactMethod, exactPath]) => {
    if(exactMethod!==verb)return false;
    const pattern="^"+exactPath.replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/:[A-Za-z][A-Za-z0-9_]*/g,"[^/]+")+"$";
    return new RegExp(pattern).test(pathname);
  });
  if (exact) return exact[2];
  if (ADMIN_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return "admin.only";
  }
  if (pathname.startsWith("/api/users") || pathname.startsWith("/api/branches") || pathname.startsWith("/api/admin")) {
    return "admin.only";
  }
  if (pathname.startsWith("/api/audit-logs") || pathname.startsWith("/api/audit")) {
    return verb === "GET" || verb === "HEAD" ? "audit.read" : "admin.only";
  }

  const resource=RESOURCE_PERMISSION.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (resource) {
    const [, permissionPrefix]=resource;
    const action=(verb === "GET" || verb === "HEAD" || verb === "OPTIONS") ? "read" : "write";
    return `${permissionPrefix}.${action}`;
  }

  // Fail-closed default: any /api route not explicitly classified above is
  // treated as admin.only rather than left unrestricted. This means a route
  // added later without being registered here stays locked down (reachable
  // only by ADMIN or a full-scope "*" API key) instead of silently becoming
  // reachable by any authenticated user or narrow-scope API key.
  if (pathname.startsWith("/api/")) return "admin.only";
  return null;
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
