const fs=require('fs');
const assert=require('assert');
const dashboard=fs.readFileSync('frontend/src/screens/Dashboard.jsx','utf8');
const transactions=fs.readFileSync('frontend/src/screens/Transactions.jsx','utf8');
const customers=fs.readFileSync('frontend/src/screens/Customers.jsx','utf8')+fs.readFileSync('frontend/src/components/customers/CustomerToolbar.jsx','utf8');
const css=fs.readFileSync('frontend/src/styles.css','utf8');
assert(!dashboard.includes('className="premium-quick"'),'Dashboard shortcut strip must be removed');
assert(!css.includes('.premium-quick'),'Dead premium shortcut CSS must be removed');
for(const label of ['إضافة حوالة','إضافة دفعة','مجموع غير المدفوع','إجمالي الأرباح']){
  assert(!transactions.includes(label),`Transactions must not own duplicated action: ${label}`);
}
for(const label of ['إضافة عميل','إضافة حوالة','إضافة دفعة','قائمة العملاء','إجمالي دين العملاء']){
  assert(customers.includes(label),`Customers must retain primary action: ${label}`);
}
console.log('Global duplicate button cleanup v25.10.0 check passed.');
