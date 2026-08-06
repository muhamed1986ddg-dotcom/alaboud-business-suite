"use strict";

function assertBalancedEntry(lines, tolerance = 0.01) {
  if (!Array.isArray(lines) || lines.length < 2) throw new Error("القيد المحاسبي يحتاج سطرين على الأقل");
  const totals = lines.reduce((acc, line) => {
    acc.debit += Number(line?.debit || 0);
    acc.credit += Number(line?.credit || 0);
    return acc;
  }, { debit: 0, credit: 0 });
  const difference = Math.abs(totals.debit - totals.credit);
  if (!Number.isFinite(difference) || difference > tolerance) {
    const error = new Error("القيد المحاسبي غير متوازن");
    error.code = "UNBALANCED_JOURNAL_ENTRY";
    error.details = { ...totals, difference };
    throw error;
  }
  return { ...totals, difference };
}

function markSoftDeleted(record, { userId, reason, at = new Date().toISOString() } = {}) {
  if (!record || typeof record !== "object") throw new TypeError("record is required");
  record.isDeleted = true;
  record.deletedAt = at;
  record.deletedBy = userId || null;
  record.deleteReason = String(reason || "").trim() || "غير محدد";
  record.updatedAt = at;
  return record;
}

module.exports = { assertBalancedEntry, markSoftDeleted };
