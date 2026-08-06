const fs=require("fs");
const path=require("path");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const app=read("frontend/src/App.jsx");
const details=read("frontend/src/screens/CustomerDetails.jsx");
const customers=read("frontend/src/screens/Customers.jsx");
const css=read("frontend/src/styles.css");
const checks=[
  [details.includes("customer-add-transfer-button")&&details.includes("onAddTransfer?.(customer)"),"زر إضافة حوالة داخل ملف العميل"],
  [app.includes("customerTransferRequest")&&app.includes("initialTransferRequest={customerTransferRequest}"),"تمرير طلب الحوالة من ملف العميل"],
  [customers.includes("transferCustomerLocked")&&customers.includes("العميل المحدد"),"قفل العميل المحدد داخل النموذج"],
  [customers.includes("onTransferSaved?.(savedCustomerId)"),"العودة لملف العميل بعد نجاح الحفظ"],
  [css.includes(".customer-add-transfer-button")&&css.includes(".locked-transfer-customer"),"تنسيق الهاتف والعميل المقفل"]
];
const failed=checks.filter(([ok])=>!ok);
if(failed.length){failed.forEach(([,name])=>console.error("FAIL",name));process.exit(1)}
checks.forEach(([,name])=>console.log("PASS",name));
