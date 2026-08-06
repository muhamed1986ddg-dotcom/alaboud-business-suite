import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const jsx=fs.readFileSync(new URL('../src/screens/CustomerDetails.jsx',import.meta.url),'utf8');
const tx=fs.readFileSync(new URL('../src/screens/Transactions.jsx',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');

test('customer ledger has dedicated mobile transfer cards',()=>{
  assert.match(jsx,/customer-transfer-mobile-cards/);
  assert.match(jsx,/customer-transfer-mobile-card/);
  assert.match(jsx,/exchangeRate\.toFixed\(4\)/);
});

test('transactions screen has mobile cards and desktop table is hidden on phones',()=>{
  assert.match(tx,/transaction-mobile-cards/);
  assert.match(css,/@media \(max-width:760px\)/);
  assert.match(css,/transaction-ledger-tablewrap[\s\S]*display:none!important/);
  assert.match(css,/overflow-x:hidden!important/);
});
