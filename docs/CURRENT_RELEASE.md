# Current Production Release

**Version:** 25.14.123

**Release focus:** Reliable customer-payment confirmation recovery without replaying financial writes.

- GET timeout: 45 seconds.
- POST/PUT/PATCH/DELETE timeout: 30 seconds.
- Ambiguous payment writes are verified with bounded backoff: 500, 1000, 1500, 2500, 4000 ms.
- COMMITTED/SUCCESS/COMPLETED are treated as success.
- FAILED/REJECTED/ROLLED_BACK are treated as confirmed failure.
- UNKNOWN/PENDING/PROCESSING are retried only inside the bounded confirmation window.
- The original financial POST is never replayed automatically.
- Customer payment buttons are guarded against double-submit and stay disabled while save/verification is active.
- Uses Android versionCode `2514123` and versionName `25.14.123`.
- Version-consistency checks are Docker-safe when `.github` or `.env.example` are excluded from the image.
- Keeps all v25.14.121 multi-currency, treasury backup, WhatsApp, Voice Phase 2, security, PostgreSQL, and production-readiness fixes.


## v25.14.123
- زر إرسال المجموع النهائي للعميل عبر WhatsApp بدون تفاصيل الحساب.
- قالب مستقل قابل للتعديل من إعدادات WhatsApp.
