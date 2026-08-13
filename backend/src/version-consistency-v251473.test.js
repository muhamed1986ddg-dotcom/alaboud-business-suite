const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");
const expected = "25.14.73";
const checks = [
  ["package.json", JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version],
  ["backend/package.json", JSON.parse(fs.readFileSync(path.join(root, "backend/package.json"), "utf8")).version],
  ["frontend/package.json", JSON.parse(fs.readFileSync(path.join(root, "frontend/package.json"), "utf8")).version],
  ["production-readiness", require("./production-readiness").APP_VERSION],
];

for (const [name, value] of checks) {
  assert.strictEqual(value, expected, `${name} version mismatch`);
}

assert(
  fs.readFileSync(path.join(root, "frontend/src/api.js"), "utf8").includes(`X-Alaboud-Client-Version"]="${expected}"`),
  "client header mismatch",
);
assert(
  fs.readFileSync(path.join(root, "backend/src/server.js"), "utf8").includes("version:APP_VERSION"),
  "session/runtime version must use APP_VERSION",
);
const gradle = fs.readFileSync(path.join(root, "app/build.gradle.kts"), "utf8");
assert(gradle.includes(`versionName = "${expected}"`), "Android versionName mismatch");
assert(gradle.includes("versionCode = 251473"), "Android versionCode mismatch");
assert(
  fs.readFileSync(path.join(root, "app/src/main/java/com/alaboud/businesssuite/MainActivity.kt"), "utf8").includes(`CLIENT_VERSION = "${expected}"`),
  "Android client version mismatch",
);
console.log("version consistency v25.14.73: OK");
