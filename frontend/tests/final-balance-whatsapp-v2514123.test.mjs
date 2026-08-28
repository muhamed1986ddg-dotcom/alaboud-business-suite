import assert from "node:assert/strict";
import {buildFinalBalanceWhatsAppMessage,DEFAULT_FINAL_BALANCE_WHATSAPP_TEMPLATE} from "../src/finalBalanceWhatsApp.js";

const positive=buildFinalBalanceWhatsAppMessage({name:"محمد",finalBalance:1250});
assert.match(positive,/السلام عليكم محمد/);
assert.match(positive,/المجموع النهائي عليكم:/);
assert.match(positive,/1250\.00 CAD/);
assert.match(positive,/أبو إسلام/);
assert(!/الحوالات|الدفعات|كشف حساب|سعر/.test(positive));

const negative=buildFinalBalanceWhatsAppMessage({name:"أحمد",finalBalance:-220.5});
assert.match(negative,/المجموع النهائي لكم:/);
assert.match(negative,/220\.50 CAD/);

const custom=buildFinalBalanceWhatsAppMessage({name:"سارة",finalBalance:88.75},"{customerName}: {balance} {currency} - {balanceDirection}");
assert.equal(custom,"سارة: 88.75 CAD - عليكم");
assert(DEFAULT_FINAL_BALANCE_WHATSAPP_TEMPLATE.includes("{balance}"));
console.log("final balance WhatsApp v25.14.123: OK");
