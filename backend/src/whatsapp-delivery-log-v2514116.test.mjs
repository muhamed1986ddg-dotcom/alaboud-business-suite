import test from"node:test";import assert from"node:assert/strict";import fs from"node:fs";
const routes=fs.readFileSync(new URL("./routes/notifications.js",import.meta.url),"utf8");
test("v25.14.116 exposes admin WhatsApp delivery log",()=>{
  assert.match(routes,/app\.get\("\/api\/whatsapp-delivery-log",auth,requirePermission\("admin\.only"\)/);
  assert.match(routes,/OVERDUE_WHATSAPP_MESSAGE/);
  assert.match(routes,/deliveryStatus/);
  assert.match(routes,/reminderStage/);
});
