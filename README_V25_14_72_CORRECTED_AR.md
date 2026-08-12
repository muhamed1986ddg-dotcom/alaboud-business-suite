# العبود للأعمال — الإصدار 25.14.72 المصحح

هذه نسخة مصدر كاملة ونظيفة للإصدار 25.14.72. لا تحتوي على `node_modules` أو مخرجات البناء أو بيانات التشغيل أو ملفات البيئة والأسرار.

## الإصلاحات الخاصة بهذه الحزمة

- تثبيت نهايات الأسطر `LF` لملفات Linux وCloud Run من خلال `.gitattributes`.
- جعل اختبارات تنسيق واجهة العملاء متوافقة مع `LF` و`CRLF`.
- إضافة `.gcloudignore` صريح لمنع رفع الملفات غير اللازمة.
- جعل Docker ينسخ ملفات الإنتاج المطلوبة فقط بدل نسخ المشروع بالكامل.
- فحص أسماء مسارات الحاوية بترميز UTF-8 قبل نشر الصورة.
- توفير سكربت PowerShell ينفذ فحوصات الإنتاج وينشر مراجعة اختبارية من دون تحويل الحركة.

## الفحص المحلي

من PowerShell داخل مجلد المشروع:

```powershell
npm ci --prefix backend --include=dev --ignore-scripts --no-audit --no-fund
npm ci --prefix frontend --include=dev --ignore-scripts --no-audit --no-fund
npm run check:sensitive
npm run check:reliability
npm run check:regressions
```

## النشر الآمن إلى Cloud Run

بعد نجاح الفحوصات:

```powershell
.\DEPLOY_CLOUD_RUN_V25_14_72.ps1
```

السكربت يستخدم `--no-traffic`، ولذلك لا يحول المستخدمين إلى النسخة الجديدة. اختبر رابط المراجعة أولًا قبل تحويل حركة الإنتاج.
