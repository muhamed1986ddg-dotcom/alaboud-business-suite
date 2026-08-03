# إصدار v16.0.13 Enterprise

- إصلاح خطأ Kotlin: `Unsupported escape sequence` في `MainActivity.kt`.
- استبدال Regex المسبب للمشكلة بتنظيف آمن لاسم ملف صورة كشف الحساب دون Regex.
- تحديث إصدار تطبيق Android إلى `16.0.13` ورقم البناء إلى `160013`.
- تحديث اسم GitHub Actions واسم ملف APK الناتج إلى v16.0.13.
- إزالة النسخ المتداخلة والمكررة من مشروع Android داخل مجلدات backend وfrontend وscripts.
- الحفاظ على ملفات البيانات الحالية، بما فيها `data/store.json`.

## الرفع إلى GitHub

انسخ محتويات هذا المجلد إلى مستودع المشروع، ثم نفذ:

```bash
git add .
git commit -m "Release v16.0.13 Enterprise"
git push origin main
```
