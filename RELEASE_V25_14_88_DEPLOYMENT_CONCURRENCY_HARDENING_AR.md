# v25.14.88 — Deployment & Concurrency Hardening

إصدار استقرار للنشر، بدون تغيير في معادلات الجرد أو رأس المال أو الأرباح أو الديون.

## التغييرات
- تحديث Web / Backend / Android إلى 25.14.88 وAndroid versionCode إلى 251488.
- إضافة Deployment Revision Guard لمنع عودة revision-level minScale.
- إبقاء النشر التجريبي على 0% traffic مع tag مؤقت وmax-instances=1.
- فصل فحص النشر المحلي عن فحص Docker runtime حتى لا تعتمد صورة الإنتاج على ملف PowerShell.
- تحديث Docker لاستخدام check:v251488:runtime.
- تحديث فحص التوافق التاريخي المستخدم فعليًا داخل regression ليطابق الإصدار الحي 25.14.88.

## التشغيل في الإنتاج
تم اعتماد service-level minimum instances بدل revision-level minimum instances، لتجنب بقاء revisions قديمة دافئة وتشغيل background jobs على نفس PostgreSQL.
