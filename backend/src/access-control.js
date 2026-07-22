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

module.exports={ROLE_PERMISSIONS,normalizeRole,permissionsFor,hasPermission,requirePermission};
