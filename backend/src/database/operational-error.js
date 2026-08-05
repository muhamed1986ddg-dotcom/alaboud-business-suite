"use strict";

const TRANSIENT_CODES = new Set([
  "57P01", "57P02", "57P03",
  "08000", "08001", "08003", "08004", "08006", "08007", "08P01",
  "ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT",
  "DATABASE_TEMPORARILY_UNAVAILABLE"
]);

const TRANSIENT_MESSAGES = [
  "connection terminated",
  "connection closed",
  "connection reset",
  "client has encountered a connection error",
  "client is not queryable",
  "econnreset",
  "econnrefused",
  "socket hang up",
  "database system is in recovery mode",
  "database system is not yet accepting connections",
  "consistent recovery state has not been yet reached",
  "terminating connection due to administrator command"
];

function isTransientDatabaseError(error, seen = new Set()) {
  if (!error || seen.has(error)) return false;
  if (typeof error === "object") seen.add(error);

  const code = String(error.code || "").toUpperCase();
  const message = String(error.message || error || "").toLowerCase();
  const status = Number(error.status || error.statusCode || 0);

  if (TRANSIENT_CODES.has(code) || code.startsWith("08")) return true;
  if (status === 503 && (code === "DATABASE_TEMPORARILY_UNAVAILABLE" || error.retryable === true)) return true;
  if (TRANSIENT_MESSAGES.some((fragment) => message.includes(fragment))) return true;

  return isTransientDatabaseError(error.cause, seen) ||
    isTransientDatabaseError(error.originalError, seen) ||
    isTransientDatabaseError(error.parent, seen);
}

function isRecoverableOperationalError(error) {
  return isTransientDatabaseError(error) ||
    (Number(error?.status || error?.statusCode || 0) === 503 && error?.fatal !== true);
}

module.exports = { isTransientDatabaseError, isRecoverableOperationalError };
