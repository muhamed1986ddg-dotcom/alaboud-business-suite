# ALABOUD Business Suite v22.3.4 — PostgreSQL Native Repositories

- إضافة طبقة Repository مستقلة لقراءة العملاء والشركاء وأسعار الصرف من PostgreSQL.
- المحافظة على شكل واجهات API الحالية دون تغيير.
- رجوع تلقائي وآمن إلى الذاكرة الحالية عند غياب PostgreSQL أو فشل الاستعلام.
- مفتاح تحكم: `POSTGRES_NATIVE_READS=false` لتعطيل القراءة المباشرة مؤقتًا.
- إظهار حالة Native Reads ضمن `/api/health`.
- الكتابة ما زالت تمر عبر نظام المزامنة الانتقالي لضمان التوافق وعدم فقدان البيانات.
