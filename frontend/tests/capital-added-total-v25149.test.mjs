import fs from 'node:fs';
import assert from 'node:assert/strict';
const src=fs.readFileSync(new URL('../src/screens/CapitalOverview.jsx', import.meta.url),'utf8');
assert.match(src,/totalAddedCapital=movements\.filter\(item=>item\.type==="IN"/);
assert.match(src,/💰 مجموع الإضافات/);
assert.match(src,/إجمالي رأس المال المضاف/);
assert.match(src,/money\(totalAddedCapital\)/);
console.log('capital added total v25.14.10 checks passed');
