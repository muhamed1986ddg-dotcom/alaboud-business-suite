const fs=require('fs');
const path=require('path');
const server=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'../../frontend/src/screens/Transactions.jsx'),'utf8');
if(!server.includes('/api/transactions/unpaid-summary'))throw new Error('missing unpaid summary endpoint');
if(!server.includes('totalCad:+totalCad.toFixed(2)'))throw new Error('summary must return CAD total');
if(!ui.includes('transaction-unpaid-total-button'))throw new Error('missing unpaid total button');
if(!ui.includes('unpaidSummary.count'))throw new Error('missing unpaid count');
console.log('unpaid transfers summary v25.4.5 test passed');
