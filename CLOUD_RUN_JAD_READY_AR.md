# نسخة Cloud Run الجاهزة لموصل JAD

هذه الحزمة مبنية على المشروع الكامل v25.14.28 Cloud SQL repaired.

التعديلات:
- تشغيل JAD عبر Browser Mode افتراضيًا.
- تثبيت Playwright Chromium واعتماداته داخل Docker image.
- تثبيت PLAYWRIGHT_BROWSERS_PATH=0 أثناء البناء والتشغيل.
- منع الرجوع التلقائي إلى HTTP لموصل JAD.
- تحسين تشخيص غياب Chromium.
- الحفاظ على بقية ملفات المشروع كما هي.

متغيرات Cloud Run:
- JAD_CONNECTOR_MODE=browser
- JAD_HTTP_FALLBACK=false

احتفظ بباقي متغيرات قاعدة البيانات والأسرار الموجودة لديك كما هي.
لا تضع كلمات المرور أو الأسرار داخل الكود.
