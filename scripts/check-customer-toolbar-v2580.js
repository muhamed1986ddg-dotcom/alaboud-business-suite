const fs = require('fs');
const source = fs.readFileSync('frontend/src/screens/Customers.jsx', 'utf8');
const css = fs.readFileSync('frontend/src/styles.css', 'utf8');
const required = [
  '➕ إضافة عميل',
  '💸 إضافة حوالة',
  '💳 إضافة دفعة',
  '📋 قائمة العملاء',
  '💰 إجمالي دين العملاء',
  'customer-primary-toolbar',
  'customer-toolbar-debt'
];
for (const token of required) {
  if (!source.includes(token) && !css.includes(token)) {
    throw new Error(`Missing customer toolbar token: ${token}`);
  }
}
for (const removed of ['customer-total-debt-wrap','customer-total-debt-card','customer-total-debt-icon','customer-total-debt-copy']) {
  if (source.includes(removed) || css.includes(removed)) {
    throw new Error(`Legacy customer debt card class remains: ${removed}`);
  }
}
const order = required.slice(0,5).map((token)=>source.indexOf(token));
for (let i=1;i<order.length;i++) {
  if (order[i] <= order[i-1]) throw new Error('Customer toolbar controls are not in the requested order');
}
console.log('Customer primary toolbar v25.8.0 check passed.');
