# الإصدار 18.5.1 — إصلاح ربط جاد على Render

- استبدال `playwright-chromium` بحزمة `playwright`.
- تنزيل Chromium تلقائياً أثناء تثبيت backend عبر `postinstall`.
- إجبار موصل جاد على وضع المتصفح في إعدادات Render.
- تعطيل الانتقال التلقائي إلى موصل HTTP عند غياب Chromium، حتى يظهر الخطأ الحقيقي بوضوح.
- تحديث استدعاء Playwright داخل الخادم.

بعد رفع المشروع إلى GitHub، نفّذ في Render: **Manual Deploy → Clear build cache & deploy**.
