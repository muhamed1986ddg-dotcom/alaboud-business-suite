const assert = require("assert");
const {
  APP_VERSION,
  createBackupEnvelope,
  verifyBackupEnvelope,
  productionReadiness
} = require("./production-readiness");

const payload = createBackupEnvelope({
  company:{ id:"company-1", name:"AlAboud" },
  data:{ customers:[{ id:"c1", name:"Test" }], transactions:[] },
  createdAt:"2026-07-22T00:00:00.000Z"
});
assert.equal(payload.version, APP_VERSION);
assert.equal(verifyBackupEnvelope(payload).ok, true);

const tampered = JSON.parse(JSON.stringify(payload));
tampered.data.customers[0].name = "Changed";
assert.equal(verifyBackupEnvelope(tampered).ok, false);

assert.equal(productionReadiness({NODE_ENV:"development"}).ok, true);
assert.equal(productionReadiness({NODE_ENV:"production"}).ok, false);
assert.equal(productionReadiness({
  NODE_ENV:"production",
  JWT_SECRET:"x".repeat(48),
  DATABASE_URL:"postgres://example",
  CORS_ORIGIN:"https://example.com"
}).ok, true);

console.log("Production readiness selftest passed");
