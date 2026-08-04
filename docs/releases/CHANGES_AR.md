# التعديلات المُدمجة في v22.5.0

نفس التعديلات الثلاثة السابقة، أُعيد تطبيقها هنا لتتوافق مع بنية v22.5.0
(الجلسات، RBAC، Native Repositories مع fallback لِلذاكرة).

## 1) نسيت كلمة المرور
- `POST /api/auth/forgot-password` `{ email }`
- `POST /api/auth/reset-password` `{ email, token, newPassword }`
- رمز عشوائي 32 بايت، يُخزَّن هاشه فقط (SHA-256)، صلاحية 30 دقيقة.
- رد عام موحّد يمنع اكتشاف الحسابات المسجّلة.
- مسجّلة في سجل التدقيق (`audit`) بنفس آلية integrityHash المستخدمة في المشروع.
- بريد إلكتروني عبر `nodemailer` إن ضُبطت `SMTP_HOST`، وإلا تُطبع الرسالة في السجلات (dev mode)
  ويُعاد `devResetToken` في الاستجابة للاختبار المحلي فقط.

## 2) .env.example
أُضيفت متغيرات `APP_URL` و`SMTP_*` إلى ملف `.env.example` الموجود مسبقًا في المشروع
(الذي كان يحتوي بالفعل على إعدادات PostgreSQL الجيدة).

## 3) ترقيم الصفحات (Pagination)
دالة `paginate(req, rows)` أُضيفت وطُبّقت على:
- `GET /api/customers`
- `GET /api/transactions`
- `GET /api/expenses`

متوافقة 100% مع الواجهة الحالية: بدون `?page`/`?pageSize` تُعاد المصفوفة كما هي تمامًا.
مع `?page=1&pageSize=25` يصبح الرد `{items, total, page, pageSize, totalPages}`.

لم تُطبّق على `/api/partners` أو `/api/general-debts` لنفس السبب السابق: يُرجعان إجماليات
محسوبة على كامل البيانات، وتحتاج تصميمًا منفصلاً.

## التفعيل
```bash
npm install --prefix backend
```

## تم التحقق
`node --check backend/src/server.js` ← ناجح، لا أخطاء صياغية.
