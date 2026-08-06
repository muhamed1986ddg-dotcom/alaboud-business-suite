"use strict";
const assert = require("assert");
const { money, rate, formatMoney, multiplyAmountByRate } = require("./Money");
const { assertBalancedEntry, markSoftDeleted } = require("./FinancialIntegrity");

assert.equal(formatMoney(money("0.1") + money("0.2")), "0.3000");
assert.equal(formatMoney(multiplyAmountByRate("100", "1.47")), "147.0000");
assert.deepEqual(assertBalancedEntry([{ debit: 100 }, { credit: 100 }]), { debit: 100, credit: 100, difference: 0 });
assert.throws(() => assertBalancedEntry([{ debit: 100 }, { credit: 99.98 }]), /غير متوازن/);
const row = markSoftDeleted({ id: "x" }, { userId: "u", reason: "تصحيح" });
assert.equal(row.isDeleted, true); assert.equal(row.deletedBy, "u"); assert.equal(row.deleteReason, "تصحيح");
assert.equal(rate("1.47000000"), 147000000n);
console.log("Financial integrity tests passed");
