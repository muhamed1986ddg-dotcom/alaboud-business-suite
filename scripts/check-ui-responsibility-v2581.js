const fs=require('fs');
const path=require('path');
const file=fs.readFileSync(path.join(__dirname,'..','frontend','src','screens','Transactions.jsx'),'utf8');
const forbidden=['إضافة حوالة','إضافة دفعة','إجمالي الأرباح','مجموع غير المدفوع','المتأخرة','تسديد كامل','showAddModal','unpaidSummary'];
for(const item of forbidden){if(file.includes(item)){throw new Error(`Duplicate transaction-page action remains: ${item}`)}}
const required=['جميع الحوالات','الحوالات المدفوعة','غير المدفوعة','تصدير','تعديل','حذف'];
for(const item of required){if(!file.includes(item)){throw new Error(`Required transaction function missing: ${item}`)}}
console.log('UI responsibility cleanup v25.8.1 check passed.');
