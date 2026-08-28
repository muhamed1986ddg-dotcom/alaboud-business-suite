import test from"node:test";import assert from"node:assert/strict";import fs from"node:fs";
const voice=fs.readFileSync(new URL("../src/components/VoiceCommandAssistant.jsx",import.meta.url),"utf8");
const app=fs.readFileSync(new URL("../src/App.jsx",import.meta.url),"utf8");
test("v25.14.117 voice commands are safe read/navigation first",()=>{
  assert.match(app,/VoiceCommandAssistant/);
  assert.match(voice,/SpeechRecognition\|\|window\.webkitSpeechRecognition/);
  assert.match(voice,/overdue-customers/);
  assert.match(voice,/api\.get\("\/customers"/);
  assert.match(voice,/الأوامر المالية لا تُنفذ صوتيًا/);
  assert.doesNotMatch(voice,/api\.(post|patch|put|delete)\(/);
});
test("v25.14.117 supports customer open and balance lookup",()=>{
  assert.match(voice,/extractCustomerQuery/);
  assert.match(voice,/isBalanceQuery/);
  assert.match(voice,/onOpenCustomer\(customer\.id\)/);
  assert.match(voice,/finalBalance/);
});
