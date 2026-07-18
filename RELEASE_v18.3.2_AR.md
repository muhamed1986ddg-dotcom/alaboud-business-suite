# ALABOUD Business Suite v18.3.2

## الإصلاحات
- إصلاح انهيار الخادم `Maximum call stack size exceeded` في `backend/src/store.js`.
- منع تكرار Proxy الخاص ببيانات الشركات داخل سياق الشركة.
- ضمان التعامل مع المخزن الأصلي عند الحفظ والقراءة.
- الحفاظ على بيانات الشركات الموجودة في PostgreSQL.
- تحديث رقم الإصدار إلى v18.3.2.
- إعادة بناء واجهة الإنتاج بنجاح.

## النشر
```bash
npm run render-build
git add .
git commit -m "v18.3.2 fix company store recursion"
git push origin main
```
