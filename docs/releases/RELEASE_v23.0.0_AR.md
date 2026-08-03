# ALABOUD Business Suite v23.0.0 — Enterprise Stable Release

## التحسينات المنفذة

- إضافة وحدة جاهزية الإنتاج وفحص إعدادات البيئة.
- توحيد رقم الإصدار من مصدر مركزي.
- إضافة بصمة SHA-256 للنسخ الاحتياطية.
- رفض استعادة النسخ المعدلة أو التالفة.
- تحسين نقطة `/api/health` لتعرض حالة قاعدة البيانات وجاهزية الإنتاج.
- تحسين معالجة أخطاء الخادم وإضافة `requestId` دون كشف تفاصيل داخلية.
- إغلاق خادم HTTP وقاعدة البيانات بشكل منظم.
- التعامل مع `unhandledRejection` و`uncaughtException`.
- إضافة اختبار مستقل لجاهزية الإنتاج وسلامة النسخ الاحتياطية.

## متطلبات الإنتاج

يجب ضبط:

- `JWT_SECRET` بطول 32 حرفًا على الأقل.
- `DATABASE_URL`.
- `CORS_ORIGIN`.

## ملاحظات التحقق

يجب تشغيل:

```bash
npm run check --prefix backend
npm run test:production --prefix backend
npm run build
```
