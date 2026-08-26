import test from"node:test";
import assert from"node:assert/strict";
import fs from"node:fs";
const settings=fs.readFileSync(new URL("../src/screens/SettingsPanel.jsx",import.meta.url),"utf8");
const routes=fs.readFileSync(new URL("../../backend/src/routes/notifications.js",import.meta.url),"utf8");
const provider=fs.readFileSync(new URL("../../backend/src/services/whatsapp-provider.js",import.meta.url),"utf8");
const overdue=fs.readFileSync(new URL("../../backend/src/services/overdue-customer-messages.js",import.meta.url),"utf8");
test("v25.14.114 WhatsApp safe overdue single-customer test",()=>{
  for(const key of["zeroBalanceWhatsAppEnabled","zeroBalanceWhatsAppTemplate","monthlyAccountWhatsAppEnabled","overdueWhatsAppEnabled","overdueFirstReminderDays","overdueSecondReminderEnabled","overdueSecondReminderDays","automaticWhatsappSenderNumber","manualWhatsappSenderNumber"])assert.match(settings,new RegExp(key));
  assert.match(routes,/\/api\/whatsapp-bot\/status/);
  assert.match(routes,/\/api\/whatsapp-bot\/test/);
  assert.match(provider,/MONTHLY_ACCOUNT/);assert.match(provider,/OVERDUE/);
  assert.match(overdue,/OVERDUE_WHATSAPP_MESSAGE/);assert.match(overdue,/OVERDUE_FIRST_REMINDER/);assert.match(overdue,/OVERDUE_SECOND_REMINDER/);assert.match(settings,/حفظ إعدادات WhatsApp/);
});

assert.match(settings,/قالب رسالة تصفير الحساب/);
assert.match(settings,/أبو إسلام/);

assert.match(settings,/اختبار آمن لرسالة عميل متأخر/);assert.match(settings,/إرسال لهذا العميل فقط/);assert.match(routes,/\/api\/overdue-whatsapp-test\/recipients/);assert.match(routes,/\/api\/overdue-whatsapp-test\/preview/);assert.match(routes,/\/api\/overdue-whatsapp-test\/send/);assert.match(routes,/testOnly:true/);
