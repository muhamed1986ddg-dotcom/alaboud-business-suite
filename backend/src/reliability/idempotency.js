"use strict";

const { runWithOperationContext } = require("./operation-context");

function normalizeReceiptBody(value) {
  if (value === undefined) return null;
  try { return JSON.parse(JSON.stringify(value)); } catch { return null; }
}

function operationPath(req) {
  const original = String(req.originalUrl || req.url || req.path || "/").split("?", 1)[0] || "/";
  const withoutApi = original === "/api" ? "/" : original.startsWith("/api/") ? original.slice(4) : original;
  return withoutApi || "/";
}

function operationScopeKey(companyId) {
  return `company:${String(companyId || "public")}`;
}

function validateKey(req, res) {
  const supplied = String(req.get("Idempotency-Key") || "").trim();
  if (!supplied) {
    res.status(428).json({
      code: "IDEMPOTENCY_KEY_REQUIRED",
      retryable: false,
      message: "هذه العملية المالية تتطلب مفتاح منع تكرار. حدّث التطبيق ثم أعد المحاولة."
    });
    return null;
  }
  if (supplied.length > 200) {
    res.status(400).json({
      code: "INVALID_IDEMPOTENCY_KEY",
      retryable: false,
      message: "مفتاح منع التكرار غير صالح."
    });
    return null;
  }
  return supplied;
}

// This middleware runs before route authentication, so it intentionally does
// ONLY in-process duplicate suppression. Durable receipt replay must never be
// performed before auth, otherwise a guessed operation key could replay a
// tenant response without proving the caller belongs to that tenant.
function createIdempotencyMiddleware({ ttlMs = 5 * 60 * 1000, maxEntries = 5000 } = {}) {
  const entries = new Map();
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of entries) if (!value || value.expiresAt <= now) entries.delete(key);
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
  }, Math.min(ttlMs, 60_000));
  cleanup.unref?.();

  return function idempotency(req, res, next) {
    const method = String(req.method || "GET").toUpperCase();
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return next();
    const supplied = String(req.get("Idempotency-Key") || "").trim();
    if (!supplied) return next();
    const path = operationPath(req);
    // Before auth we cannot trust X-Company-ID. Installation + operation key
    // is sufficient for the short-lived in-memory pending guard; PostgreSQL
    // replay below is tenant-scoped after auth.
    const installation = String(req.get("X-Installation-ID") || "anonymous").slice(0, 200);
    const memoryKey = `${installation}:${method}:${path}:${supplied}`;
    const current = entries.get(memoryKey);
    if (current?.state === "done" && current.expiresAt > Date.now()) {
      res.setHeader("Idempotency-Replayed", "true");
      return res.status(current.status).json(current.body);
    }
    if (current?.state === "pending") {
      return res.status(409).json({
        code: "DUPLICATE_OPERATION_IN_PROGRESS",
        retryable: true,
        operationKey: supplied,
        message: "العملية نفسها قيد التنفيذ حاليًا. يتم التحقق من نتيجتها، يرجى عدم الضغط مرة أخرى."
      });
    }

    entries.set(memoryKey, { state: "pending", expiresAt: Date.now() + ttlMs });
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const status = res.statusCode || 200;
      if (status >= 200 && status < 500) entries.set(memoryKey, { state: "done", status, body, expiresAt: Date.now() + ttlMs });
      else entries.delete(memoryKey);
      return originalJson(body);
    };
    res.on("finish", () => {
      const value = entries.get(memoryKey);
      if (value?.state === "pending" && res.statusCode >= 500) entries.delete(memoryKey);
    });
    return runWithOperationContext({ key: supplied, method, path }, next);
  };
}

function requireIdempotencyKey(req, res, next) {
  const supplied = validateKey(req, res);
  if (!supplied) return;
  return next();
}

function createRequireIdempotencyKey({ getQuery = null } = {}) {
  return async function requireIdempotencyKey(req, res, next) {
    const supplied = validateKey(req, res);
    if (!supplied) return;
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(401).json({ message: "Authentication required" });

    const query = typeof getQuery === "function" ? getQuery() : null;
    if (!query) return next();
    const method = String(req.method || "POST").toUpperCase();
    const path = operationPath(req);
    const scopeKey = operationScopeKey(companyId);
    try {
      const result = await query(
        `SELECT response_body, app_revision, committed_at
           FROM operation_receipts
          WHERE scope_key=$1 AND operation_key=$2 AND method=$3 AND path=$4 AND status='COMMITTED'
          LIMIT 1`,
        [scopeKey, supplied, method, path],
        {
          operation: "idempotency-receipt-preflight",
          attempts: 1,
          queryTimeoutMs: Number(process.env.PG_IDEMPOTENCY_LOOKUP_TIMEOUT_MS || 2000),
          recoveryBudgetMs: Number(process.env.PG_IDEMPOTENCY_LOOKUP_TIMEOUT_MS || 2000)
        }
      );
      const receipt = result.rows?.[0];
      if (!receipt) return next();
      const body = normalizeReceiptBody(receipt.response_body) || { committed: true };
      res.setHeader("Idempotency-Replayed", "true");
      res.setHeader("X-Operation-Committed", "true");
      return res.status(200).json(body);
    } catch {
      // A lookup failure does not execute the write twice by itself. The
      // durable save path still records the receipt atomically with app_state.
      return next();
    }
  };
}

module.exports = {
  createIdempotencyMiddleware,
  createRequireIdempotencyKey,
  requireIdempotencyKey,
  operationScopeKey,
  operationPath
};
