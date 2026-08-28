import test from"node:test";import assert from"node:assert/strict";import fs from"node:fs";
const v=fs.readFileSync(new URL("../src/components/VoiceCommandAssistant.jsx",import.meta.url),"utf8"),a=fs.readFileSync(new URL("../src/App.jsx",import.meta.url),"utf8"),c=fs.readFileSync(new URL("../src/styles.css",import.meta.url),"utf8");
test("phase2 commands",()=>{for(const x of["wantsCurrentCustomerBalance","wantsLatestTransfer","wantsOverdue","wantsRateRefresh","wantsWhatsAppReminder","PAGE_ALIASES"])assert.match(v,new RegExp(x));assert.match(v,/راجع الاسم والرقم والرصيد والنص ثم أكد الإرسال/);assert.doesNotMatch(v,/api\.(post|patch|put|delete)\(/)});
test("global launcher",()=>{assert.match(a,/currentCustomerId=\{customerId\}/);assert.match(c,/z-index:2147483000/)});
