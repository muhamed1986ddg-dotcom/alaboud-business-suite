import test from"node:test";import assert from"node:assert/strict";import fs from"node:fs";
const routes=fs.readFileSync(new URL("./routes/notifications.js",import.meta.url),"utf8");
test("v25.14.114 safe single-customer overdue WhatsApp test routes",()=>{assert.match(routes,/overdue-whatsapp-test\/recipients/);assert.match(routes,/overdue-whatsapp-test\/preview/);assert.match(routes,/overdue-whatsapp-test\/send/);assert.match(routes,/testOnly:true/);});
