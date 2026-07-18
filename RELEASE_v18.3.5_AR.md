# ALABOUD Business Suite v18.3.5

- جلب رمز الحماية `tok` مباشرة من صفحة `/log`.
- الاحتفاظ بنفس جلسة `PHPSESSID` بين GET وPOST.
- إرسال الحقول `mail`, `pass`, `tok`, `btn-login` تماماً مثل المتصفح.
- استخدام Referer الصحيح `/log` ومتابعة التحويل إلى `/log_2`.
- تحسين التحقق من نجاح تسجيل الدخول بدون نتائج رفض خاطئة.
- الحفاظ على بيانات PostgreSQL والشركات الحالية.

```bash
npm install
npm run render-build
git add .
git commit -m "v18.3.5 fix Jad CSRF token login"
git push origin main
```
