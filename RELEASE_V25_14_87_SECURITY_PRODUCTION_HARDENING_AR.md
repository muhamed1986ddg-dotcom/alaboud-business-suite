# v25.14.87 — Security & Production Hardening

إصدار أمني واستقرار إنتاج فقط.

- منع طباعة محتوى رسائل إعادة كلمة المرور/الرموز في سجلات production عند غياب SMTP.
- فرض HTTPS على روابط الشركاء في production مع إبقاء فحوص SSRF وDNS pinning وTLS verification.
- تشديد TLS لاتصالات PostgreSQL الشبكية (`rejectUnauthorized: true`) مع إبقاء الاتصالات المحلية/Unix socket بدون TLS، وسماح استثنائي صريح عبر `ALLOW_INSECURE_DATABASE_TLS=true`.
- فرض `BALANCE_ONLY` في مسار المزامنة: الاحتفاظ بالرصد النهائي فقط وعدم إرجاع كشف الحركات أو رسوم الكشف في هذا الوضع.
- جعل `productionReadiness()` بوابة فعلية قبل `serviceReady=true`.
- تحديث اختبارات إصدار العميل القديمة إلى 25.14.87.

لا تغييرات على معادلات الجرد أو رأس المال أو الأرباح أو الديون.
