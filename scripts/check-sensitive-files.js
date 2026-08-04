const { execFileSync } = require("node:child_process");
const path = require("node:path");

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0").filter(Boolean);

const allowed = new Set([".env.example", "examples/store.example.json"]);
const forbiddenName = [
  /(^|\/)\.env(?:\.|$)/i,
  /(^|\/)(?:backup|backups)(?:\/|$)/i,
  /(^|\/)alaboud-backup-/i,
  /\.(?:backup|bak)$/i,
  /\.(?:pem|key|p12|pfx|jks|dump|sqlite3?|db|sql|xlsx?|csv)$/i,
  /(^|\/)store\.json$/i,
  /(^|\/)data\/store.*\.json$/i,
];

const violations = tracked.filter(file => {
  const normalized = file.replaceAll("\\", "/");
  if (allowed.has(normalized)) return false;
  return forbiddenName.some(pattern => pattern.test(normalized));
});

if (violations.length) {
  console.error("Sensitive or backup files are tracked and must be removed:");
  for (const file of violations) console.error(` - ${file}`);
  process.exit(1);
}
console.log(`Sensitive-file check passed (${tracked.length} tracked files scanned).`);
