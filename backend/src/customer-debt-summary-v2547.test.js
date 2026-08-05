const fs=require('fs');
const server=fs.readFileSync(require('path').join(__dirname,'server.js'),'utf8');
const screen=fs.readFileSync(require('path').join(__dirname,'../../frontend/src/screens/Customers.jsx'),'utf8');
if(!server.includes('/api/customers/debt-summary'))throw new Error('missing customer debt summary route');
if(!server.includes('totalDebtCad:+totalDebtCad.toFixed(2)'))throw new Error('summary must return full CAD debt');
if(!screen.includes('إجمالي دين العملاء'))throw new Error('missing customer debt card');
if(screen.includes('متبقي الصفحة (CAD)'))throw new Error('old page-only remaining card must be removed');
console.log('customer debt summary v25.4.7 test passed');
