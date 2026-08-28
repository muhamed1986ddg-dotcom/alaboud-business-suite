import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("zero-balance modal keeps manual Syrian WhatsApp action even after bot auto-send",()=>{
  const source=fs.readFileSync(new URL("../src/screens/Customers.jsx",import.meta.url),"utf8");
  assert.match(source,/إرسال عبر واتساب السوري/);
  assert.doesNotMatch(source,/!whatsAppSuccess\?\.autoSent&&<AppButton[^>]*whatsapp-quick-send-button/);
  assert.match(source,/تم إرسال رسالة تصفير الحساب تلقائيًا من البوت/);
});

test("Android manual wa.me routes to regular WhatsApp package",()=>{
  const source=fs.readFileSync(new URL("../../app/src/main/java/com/alaboud/businesssuite/MainActivity.kt",import.meta.url),"utf8");
  assert.match(source,/uri\.host\.equals\("wa\.me"/);
  assert.match(source,/setPackage\("com\.whatsapp"\)/);
  assert.doesNotMatch(source,/setPackage\("com\.whatsapp\.w4b"\)/);
});
