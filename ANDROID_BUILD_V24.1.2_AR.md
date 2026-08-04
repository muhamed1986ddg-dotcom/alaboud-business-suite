# v24.1.2 — إصلاح بناء Android وأسماء APK

- توحيد إصدار Root وFrontend وBackend وAndroid إلى 24.1.2.
- تحديث Android versionCode إلى 24102 وversionName إلى 24.1.2.
- جعل GitHub Actions يقرأ الإصدار تلقائياً من app/build.gradle.kts.
- تسمية ملف Artifact وملف APK تلقائياً حسب الإصدار الحالي.
- إضافة ملخص Build يعرض versionName وversionCode واسم APK وحجمه وSHA-256.
- تحديث Verify Project إلى Node.js 22.
- إزالة مكتبة SwipeRefreshLayout غير المستخدمة من تطبيق Android.
- تحديث إصدار User-Agent والنسخة الظاهرة في موارد Android.
