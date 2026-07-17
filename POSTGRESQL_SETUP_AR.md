# إصدار PostgreSQL v15.4.0

هذه النسخة تستخدم PostgreSQL تلقائيًا عندما يكون متغير `DATABASE_URL` موجودًا في Render.

## النشر على Render

- Build Command: `npm run render-build`
- Start Command: `npm start`
- Health Check: `/api/health`
- أضف `DATABASE_URL` من قاعدة PostgreSQL إلى خدمة الويب.
- أضف `JWT_SECRET` بقيمة سرية ثابتة.

عند أول تشغيل فقط، إذا كان جدول `app_state` فارغًا، ينقل الخادم ملف `data/store.json` تلقائيًا إلى PostgreSQL. بعد ذلك تصبح PostgreSQL هي المصدر الأساسي.

## استيراد ملف بيانات قديم يدويًا

ضع ملف البيانات الحقيقي في `data/store.json` ثم نفّذ محليًا أو في Render Shell:

```bash
npm run import:postgres -- data/store.json
```

قبل الاستبدال، ينشئ السكربت نسخة احتياطية داخل جدول `app_state` باسم يبدأ بـ `backup_`.

> الملف المرفق حاليًا يحتوي على عميلين تجريبيين فقط. لا تنفذ الاستيراد حتى تحصل على ملف `store.json` الذي يحتوي على أسماء العملاء الحقيقية مثل "سحر".
