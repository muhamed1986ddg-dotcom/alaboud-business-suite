# تقرير الإصلاح الكامل — v23.0.20

## الإصلاحات المنفذة
- تثبيت تصدير جميع الشاشات الكسولة في `frontend/src/LazyScreens.jsx` لمنع خطأ React 3068.
- توحيد إصدار الخادم والواجهة على `23.0.20`.
- تحسين تشفير بيانات الشركات الخارجية مع دعم مفاتيح قديمة عبر `LEGACY_INTEGRATION_SECRET` دون تغيير بيانات PostgreSQL.
- إضافة رسالة عربية واضحة عند تعذر فك بيانات دخول شركة بدل رسالة OpenSSL الغامضة.
- تحسين استقرار PostgreSQL بإضافة keep-alive ومعالج أخطاء للـPool وإعادة محاولة الكتابة تلقائيًا.
- منع خطأ ROLLBACK من إسقاط الخادم عندما يكون اتصال PostgreSQL ميتًا.
- تحديث أمر بناء Render ليثبت تبعيات التطوير للواجهة والخادم باستخدام `npm ci --include=dev`.
- إزالة `server.js` القديم من الجذر وملف `data/store.json` من نسخة التوزيع.
- إضافة توثيق لمتغيرات `INTEGRATION_SECRET` و`LEGACY_INTEGRATION_SECRET` و`PG_WRITE_RETRIES`.

## إعداد Render
- Root Directory: فارغ
- Build Command: `npm run render-build`
- Start Command: `npm start`

لا تغيّر `JWT_SECRET` أو `DATABASE_URL` الحاليين.
لا تضف `INTEGRATION_SECRET` جديدًا قبل اختبار النسخة. إذا بقيت بيانات الشركات القديمة غير قابلة للفك، ضع المفتاح القديم فقط في `LEGACY_INTEGRATION_SECRET` أو أعد حفظ بيانات دخول الشركات.

## التحقق
- نجح فحص Syntax الكامل للخادم: `npm run check --prefix backend`.
- تعذر إكمال Build داخل بيئة الفحص فقط لأن مستودع npm الداخلي لم يوفر الحزمة الاختيارية `yallist@3.1.1`. أمر البناء مصمم ليعمل على Render عبر npm الرسمي.
