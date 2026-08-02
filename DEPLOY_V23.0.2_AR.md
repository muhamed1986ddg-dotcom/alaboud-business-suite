# نشر الإصدار v23.0.2 على Render

## أوامر VS Code

بعد نسخ محتويات هذا المجلد فوق مستودع GitHub الحالي:

```bash
git add -A
git commit -m "Stabilize Render memory and fix 502 v23.0.2"
git push origin main
```

## إعداد Render

اجعل Build Command:

```bash
npm run render-build
```

واجعل Start Command:

```bash
npm start
```

تأكد من وجود متغيرات البيئة:

```text
NODE_ENV=production
DATABASE_URL=<Internal Database URL>
JWT_SECRET=<قيمة قوية لا تقل عن 32 حرفاً>
JAD_CONNECTOR_MODE=http
JAD_HTTP_FALLBACK=true
PG_POOL_MAX=2
```

لا تضف Chromium إلى Build Command على خطة Render المجانية. جلب جاد يعمل يدوياً بوضع HTTP، بينما جلب تواصل يبقى يدوياً من زر جلب الرصيد.

بعد ظهور Deploy live افتح:

```text
https://alaboud-business-suite-2.onrender.com/api/health
```

ويجب أن تظهر `"ok":true` و`"version":"23.0.2"`.
