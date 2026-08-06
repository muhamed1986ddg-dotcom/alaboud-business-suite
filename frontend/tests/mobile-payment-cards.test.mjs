import fs from 'node:fs';
import assert from 'node:assert/strict';

const jsx=fs.readFileSync(new URL('../src/screens/CustomerDetails.jsx',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
assert.match(jsx,/customer-payment-mobile-cards/);
assert.match(jsx,/customer-payment-mobile-card/);
assert.match(jsx,/customer-payment-tablewrap/);
assert.match(jsx,/تفاصيل توزيع كل دفعة/);
assert.match(css,/\.customer-payment-tablewrap\{display:none!important\}/);
assert.match(css,/grid-template-columns:minmax\(94px,36%\) minmax\(0,1fr\)/);
console.log('mobile payment cards test passed');
