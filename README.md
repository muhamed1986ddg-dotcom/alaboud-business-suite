# ALABOUD Business Suite v15.3.67

## تحديث نشرة أسعار الصرف
- توحيد شكل أسعار العملات بين لوحة التحكم وصفحة الأسعار.
- إضافة الدولار الكندي CAD كبطاقة أساسية ثابتة.
- عرض USD وEUR وGBP وAED وTRY وSYP مقابل CAD.
- الاحتفاظ بإدخال الأسعار اليدوي وأسعار الذهب وسجل التغييرات.
- تحديث تلقائي مباشر لعملات إضافية مقابل CAD.
- الحفاظ على دمج العملاء المتأخرين داخل صفحة العملاء.
- رفع Android versionCode إلى 15367 لضمان ظهور التحديث على الهاتف.

## البناء والنشر
```bash
npm install
npm run render-build
git add .
git commit -m "Release v15.3.67 price bulletin"
git push origin main
```
