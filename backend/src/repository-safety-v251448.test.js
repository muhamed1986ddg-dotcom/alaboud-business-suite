const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const sensitiveCheck = fs.readFileSync(path.join(root, 'scripts/check-sensitive-files.js'), 'utf8');

for (const rule of [
  '.env',
  'local.properties',
  '*.pem',
  '*.jks',
  'store.json',
  'backups/',
  '*.csv',
  'node_modules/',
  'frontend/dist/'
]) {
  assert(gitignore.includes(rule), `.gitignore missing rule: ${rule}`);
}
assert(gitignore.includes('!backend/migrations/*.sql'), 'SQL migrations must remain trackable');
assert.equal(pkg.scripts['check:sensitive'], 'node scripts/check-sensitive-files.js');
assert(pkg.scripts.build.startsWith('npm run check:sensitive && '), 'build must run sensitive check first');
for (const marker of ['service-account', 'local\\.properties', 'bash|zsh']) {
  assert(sensitiveCheck.includes(marker), `sensitive-file check missing marker: ${marker}`);
}
console.log('v25.14.48 repository safety guard: OK');
