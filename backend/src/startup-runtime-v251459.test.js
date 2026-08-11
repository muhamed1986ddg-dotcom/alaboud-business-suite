const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const server = path.join(__dirname, 'server.js');
const source = fs.readFileSync(server, 'utf8');
assert(/\{[^}]*\bmutate\b[^}]*\}\s*=\s*require\(["']\.\/store["']\)/s.test(source), 'server.js must import mutate from ./store before API middleware startup');
try { require.resolve('express', { paths: [path.dirname(server)] }); } catch {
  console.log('startup runtime v25.14.59 static fallback: OK (dependencies not installed locally)');
  process.exit(0);
}

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alaboud-startup-v251459-'));
const port = '5098';
const env = {
  ...process.env,
  NODE_ENV: 'test',
  PORT: port,
  DATA_DIR: dataDir,
  DATABASE_URL: '',
  JWT_SECRET: 'startup-runtime-regression-test-secret-251459'
};

const child = spawn(process.execPath, [server], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
let settled = false;
const timer = setTimeout(() => finish(new Error(`server did not listen within timeout\n${output}`)), 12000);

function cleanup(){
  clearTimeout(timer);
  if (!child.killed) child.kill('SIGTERM');
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {}
}
function finish(error){
  if (settled) return;
  settled = true;
  cleanup();
  if (error) {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  } else {
    console.log('startup runtime v25.14.59: OK');
  }
}
function inspect(chunk){
  output += chunk.toString();
  if (/ReferenceError|SyntaxError|TypeError:.*is not a function/.test(output)) {
    finish(new Error(`runtime startup regression detected\n${output}`));
    return;
  }
  if (output.includes(`running on port ${port}`)) finish();
}
child.stdout.on('data', inspect);
child.stderr.on('data', inspect);
child.on('exit', code => {
  if (!settled) finish(new Error(`server exited before listening (code ${code})\n${output}`));
});
