const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'frontend/src/api.js'), 'utf8');
const currentVersion = require(path.join(root, 'package.json')).version;

assert(
  source.includes('config.timeout=method==="get"?45000:12000'),
  'write timeout must protect the UI from stalled requests'
);

assert(
  source.includes(`X-Alaboud-Client-Version"]="${currentVersion}"`),
  'client version header must match the current package version'
);

assert(
  source.includes('\u0644\u0645 \u064a\u0635\u0644 \u062a\u0623\u0643\u064a\u062f \u0627\u0644\u0639\u0645\u0644\u064a\u0629 \u062e\u0644\u0627\u0644 \u0627\u0644\u0645\u0647\u0644\u0629'),
  'timeout message must not claim a definite save failure'
);

console.log('Client durable write timeout test passed');