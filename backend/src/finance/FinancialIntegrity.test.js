"use strict";
const assert = require("assert");
const { assertBalancedEntry, markSoftDeleted } = require("./FinancialIntegrity");

assert.deepEqual(assertBalancedEntry([{ debit: 100 }, { credit: 100 }]), { debit: 100, credit: 100, difference: 0 });
assert.deepEqual(assertBalancedEntry([{ debit: 100 }, { credit: 60 }, { credit: 40 }]), { debit: 100, credit: 100, difference: 0 });
assert.throws(() => assertBalancedEntry([{ debit: 100 }, { credit: 99.98 }]), /غير متوازن/);
assert.throws(() => assertBalancedEntry([{ debit: -1 }, { credit: -1 }]), /غير صالح/);
assert.throws(() => assertBalancedEntry([{ debit: 50, credit: 50 }, { credit: 0 }]), /مدينًا ودائنًا/);
assert.throws(() => assertBalancedEntry([{ debit: Number.NaN }, { credit: 1 }]), /غير صالح/);
const record={id:"x"};markSoftDeleted(record,{userId:"u",reason:"test",at:"2026-01-01T00:00:00.000Z"});
assert.equal(record.isDeleted,true);assert.equal(record.deletedBy,"u");
console.log("financial integrity tests passed");
