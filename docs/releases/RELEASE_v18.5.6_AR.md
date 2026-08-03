# الإصدار v18.5.6 — تثبيت Chromium داخل المشروع على Render

- تثبيت Chromium داخل `backend/node_modules/playwright-core/.local-browsers` عبر `PLAYWRIGHT_BROWSERS_PATH=0`.
- تنفيذ تنزيل Chromium صراحة أثناء `render-build` بدل الاعتماد على postinstall فقط.
- إضافة متغير Render `PLAYWRIGHT_BROWSERS_PATH=0`.
- إبقاء موصل جاد على وضع browser وتعطيل HTTP fallback.
