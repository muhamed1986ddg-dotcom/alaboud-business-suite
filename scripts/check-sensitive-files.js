const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function listRepositoryFiles() {
  try {
    return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split("\0").filter(Boolean);
  } catch {
    const ignoredDirs = new Set([".git", "node_modules", "dist", "build", ".gradle", "coverage"]);
    const files = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else files.push(path.relative(process.cwd(), full).replaceAll("\\", "/"));
      }
    };
    walk(process.cwd());
    return files;
  }
}

const tracked = listRepositoryFiles();
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
  if (allowed.has(normalized) || /^backend\/migrations\/\d+_[^/]+\.sql$/i.test(normalized)) return false;
  return forbiddenName.some(pattern => pattern.test(normalized));
});

if (violations.length) {
  console.error("Sensitive or backup files are present and must be removed:");
  for (const file of violations) console.error(` - ${file}`);
  process.exit(1);
}
console.log(`Sensitive-file check passed (${tracked.length} files scanned).`);
