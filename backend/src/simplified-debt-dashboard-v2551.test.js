const fs=require('fs');
const path=require('path');
const file=path.join(__dirname,'../../frontend/src/screens/GeneralDebts.jsx');
const source=fs.readFileSync(file,'utf8');
function assert(value,message){if(!value)throw new Error(message)}
assert(source.includes('className="debt-numbers-only"'),'numbers-only dashboard is required');
assert(source.includes('رصيد دين العملاء'),'customer debt balance is required');
assert(source.includes('الرصيد النهائي للشركات'),'final company balance is required');
assert(source.includes('المجموع الكلي'),'grand total is required');
assert(!source.includes('<AppTable>'),'general debt page must not render detailed names table');
assert(!source.includes('بحث باسم الجهة'),'general debt page must not render party search');
console.log('simplified debt dashboard v25.5.1 test passed');
