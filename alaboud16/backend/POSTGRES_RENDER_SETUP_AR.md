# إعداد حفظ البيانات الدائم PostgreSQL على Render

1. افتح Render.
2. New + ثم PostgreSQL.
3. أنشئ قاعدة بيانات في نفس Region لخدمة alaboud-business-suite-2.
4. افتح قاعدة البيانات وانسخ Internal Database URL.
5. افتح Web Service: alaboud-business-suite-2.
6. Environment ثم Add Environment Variable.
7. اكتب Key: DATABASE_URL
8. الصق Internal Database URL في Value.
9. Save Changes.
10. Manual Deploy ثم Deploy latest commit.

عند أول تشغيل ينشئ البرنامج جدول app_state تلقائياً.
إذا كان store.json موجوداً في النسخة وقت أول اتصال بقاعدة فارغة، ينقل بياناته الحالية إلى PostgreSQL.
بعدها PostgreSQL تصبح مصدر البيانات الدائم، ولا يحذف Deploy العملاء أو الحوالات.

مهم جداً: لا تنشئ قاعدة PostgreSQL جديدة مع كل تحديث، ولا تحذف قاعدة البيانات الحالية.
