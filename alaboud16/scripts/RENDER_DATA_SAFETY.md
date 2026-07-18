# إعداد حفظ البيانات على Render

1. افتح خدمة الويب في Render.
2. افتح Disks.
3. أضف Persistent Disk.
4. Mount Path:
   /var/data
5. افتح Environment.
6. أضف:
   DATA_DIR=/var/data
7. أعد النشر.
8. افتح البرنامج → المزيد → حماية البيانات.
9. يجب أن تظهر عبارة: التخزين الدائم مفعّل.

ملاحظة: Persistent Disk قد يحتاج خطة Render مدفوعة حسب إعداد حسابك.
