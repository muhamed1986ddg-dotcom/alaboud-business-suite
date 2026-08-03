# ملاحظات إصدار v23.0.20

## الإصلاحات المنفذة

- توحيد رقم الإصدار إلى 23.0.20 في المشروع والواجهة والخادم.
- حذف ملف بيانات التشغيل `data/store.json` من نسخة التوزيع.
- إضافة نموذج بيانات فارغ وآمن في `examples/store.example.json`.
- حذف `server.js` القديم من جذر المشروع.
- حذف `App_v16.0.15_FIXED.jsx` القديم.
- حذف ملفات البناء القديمة من `backend/public` و`frontend/dist`.
- منع تشغيل التخزين المحلي JSON في وضع الإنتاج عند غياب `DATABASE_URL`.
- ربط PostgreSQL في ملفات Render Blueprint.
- توليد كلمة مرور المدير الأولية عبر متغير بيئة بدل الاعتماد فقط على كلمة ثابتة.
- إضافة تنظيف دوري لسجلات Rate Limiter المنتهية.
- إضافة أوامر `dev` و`preview` للواجهة.
- نقل Vite وملحق React إلى `devDependencies`.
- تحديث `scripts/package.json` إلى الإصدار الحالي.

## التحقق

نجح فحص JavaScript للخادم عبر:

```bash
npm run check --prefix backend
```

لم يكتمل اختبار التثبيت والبناء داخل بيئة الفحص بسبب عدم توفر الحزمة `xtend@4.0.2` في مستودع npm الداخلي للبيئة. هذا ليس خطأً مثبتًا في كود المشروع. للتحقق على جهازك شغّل:

```bash
npm install
npm run render-build
npm run check --prefix backend
npm test --prefix backend
```
