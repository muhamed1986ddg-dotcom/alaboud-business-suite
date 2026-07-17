# ALABOUD Business Suite v15.5.0 Complete

هذه نسخة مشروع ويب كاملة ونظيفة، مبنية من أفضل الملفين المرسلين.

## ما تم دمجه
- ميزات v15.3.77: مزامنة البيانات الحية، منع التخزين المؤقت، حالة الحوالة مدفوعة/غير مدفوعة، وحساب المتبقي.
- قاعدة PostgreSQL من v15.4.0 مع أداة استيراد `store.json`.
- إزالة النسخ التاريخية والمجلدات المكررة من الملف النهائي.

## النشر على Render
1. ارفع محتويات هذا المجلد إلى مستودع GitHub الخاص بالمشروع.
2. تأكد من وجود `DATABASE_URL` في Environment.
3. Build Command: `npm run render-build`
4. Start Command: `npm start`

## استيراد بيانات store.json يدويًا إلى PostgreSQL
بعد ضبط `DATABASE_URL` شغّل:

```bash
npm run import:postgres
```

الأداة تنشئ نسخة احتياطية من صف `main` الحالي قبل الاستبدال.

## مهم
لا تحذف قاعدة PostgreSQL ولا تغيّر `DATABASE_URL` عند تحديث الكود.
