const assert=require("assert");
const {permissionsFor,hasPermission,requiredPermissionForRequest}=require("./access-control");

assert(hasPermission({role:"ADMIN"},"anything.write"));
assert(hasPermission({role:"VIEWER"},"customers.read"));
assert(!hasPermission({role:"VIEWER"},"customers.write"));
assert(!hasPermission({role:"VIEWER"},"admin.only"));
assert.strictEqual(requiredPermissionForRequest("GET","/api/customers"),"customers.read");
assert.strictEqual(requiredPermissionForRequest("POST","/api/customers"),"customers.write");
assert.strictEqual(requiredPermissionForRequest("DELETE","/api/transactions/1"),"transactions.write");
assert.strictEqual(requiredPermissionForRequest("PATCH","/api/users/1"),"admin.only");
assert.strictEqual(requiredPermissionForRequest("GET","/api/audit-logs"),"audit.read");
assert.strictEqual(requiredPermissionForRequest("GET","/api/backup"),"admin.only");
assert.strictEqual(requiredPermissionForRequest("POST","/api/backup/restore"),"admin.only");
assert.strictEqual(requiredPermissionForRequest("PATCH","/api/notification-settings"),"admin.only");
assert.strictEqual(requiredPermissionForRequest("GET","/api/notification-settings"),"dashboard.read");
assert.strictEqual(requiredPermissionForRequest("GET","/api/transfer-fee-settings"),"dashboard.read");
assert.strictEqual(requiredPermissionForRequest("PATCH","/api/transfer-fee-settings"),"admin.only");
assert.strictEqual(requiredPermissionForRequest("GET","/api/profits"),"reports.read");
assert.strictEqual(requiredPermissionForRequest("GET","/api/monthly-report"),"reports.read");
assert.strictEqual(requiredPermissionForRequest("GET","/api/capital-overview"),"reports.read");
assert.strictEqual(requiredPermissionForRequest("POST","/api/ai/assistant"),"reports.read");
assert.strictEqual(requiredPermissionForRequest("GET","/api/developer/api-keys"),"admin.only");
assert.strictEqual(requiredPermissionForRequest("GET","/api/devices"),"admin.only");
assert.strictEqual(requiredPermissionForRequest("POST","/api/auth/logout"),null);
assert.strictEqual(requiredPermissionForRequest("GET","/api/operations/operation-key-123/status"),"dashboard.read");
assert(hasPermission({role:"USER"},requiredPermissionForRequest("GET","/api/operations/operation-key-123/status")),"non-admin users with dashboard.read may inspect operation status");
assert.strictEqual(requiredPermissionForRequest("POST","/api/branches"),"admin.only");
assert(!hasPermission({role:"MANAGER"},requiredPermissionForRequest("POST","/api/branches")),"branch administration remains ADMIN-only");
// Fail-closed default: any /api route not explicitly classified must require
// admin.only rather than falling through unrestricted (see server.js weakness
// #4 fix). Non-/api routes are unaffected.
assert.strictEqual(requiredPermissionForRequest("GET","/api/some-future-unregistered-route"),"admin.only");
assert.strictEqual(requiredPermissionForRequest("POST","/api/another-unknown-thing/123"),"admin.only");
assert.strictEqual(requiredPermissionForRequest("GET","/"),null);
assert(permissionsFor("ACCOUNTANT").includes("reports.read"));
console.log("Access control selftest passed");
