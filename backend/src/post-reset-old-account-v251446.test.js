const assert = require('assert');
const fs = require('fs');
const path = require('path');

const server = fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
const engine = fs.readFileSync(path.join(__dirname,'finance','FinancialEngine.js'),'utf8');

assert(server.includes('customer.openingBalanceUpdatedAt=updateTime'), 'PATCH must mark a newly entered old balance as post-reset');
assert(server.includes('const activeOpeningBalance=!resetTime || openingUpdatedTime>=resetTime;'), 'details must allow post-reset opening balance');
assert(server.includes('if(resetTime && openingUpdatedTime < resetTime) return null;'), 'general debts must ignore only pre-reset opening balances');
assert(engine.includes('const activeOpeningBalance = !resetTime || openingUpdatedTime >= resetTime;'), 'financial engine must include post-reset opening balance');
console.log('v25.14.46 post-reset old-account fix: OK');
