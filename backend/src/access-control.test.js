const assert=require("assert");
const {permissionsFor,hasPermission,requiredPermissionForRequest}=require("./access-control");

assert(hasPermission({role:"ADMIN"},"anything.write"));
assert(hasPermission({role:"VIEWER"},"customers.read"));
assert(!hasPermission({role:"VIEWER"},"customers.write"));
assert.strictEqual(requiredPermissionForRequest("GET","/api/customers"),"customers.read");
assert.strictEqual(requiredPermissionForRequest("POST","/api/customers"),"customers.write");
assert.strictEqual(requiredPermissionForRequest("DELETE","/api/transactions/1"),"transactions.write");
assert.strictEqual(requiredPermissionForRequest("PATCH","/api/users/1"),"admin.only");
assert.strictEqual(requiredPermissionForRequest("GET","/api/audit-logs"),"audit.read");
assert.strictEqual(requiredPermissionForRequest("POST","/api/auth/logout"),null);
assert(permissionsFor("ACCOUNTANT").includes("reports.read"));
console.log("Access control selftest passed");
