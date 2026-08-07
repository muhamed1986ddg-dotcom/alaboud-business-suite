"use strict";

const { runWithOperationContext } = require("./operation-context");

function normalizeReceiptBody(value) {
  if (value === undefined) return null;
  try { return JSON.parse(JSON.stringify(value)); } catch { return null; }
}

function createIdempotencyMiddleware({ ttlMs = 5 * 60 * 1000, maxEntries = 5000, getQuery = null } = {}) {
  const entries = new Map();
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of entries) if (!value || value.expiresAt <= now) entries.delete(key);
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
  }, Math.min(ttlMs, 60_000));
  cleanup.unref?.();

  async function findCommittedReceipt(supplied, method, path) {
    const query = typeof getQuery === "function" ? getQuery() : null;
    if (!query) return null;
    try {
      const result = await query(
        `SELECT response_body, app_revision, committed_at
           FROM operation_receipts
          WHERE operation_key=$1 AND method=$2 AND path=$3 AND status='COMMITTED'
          LIMIT 1`,
        [supplied, method, path],
        {
          operation: "idempotency-receipt-preflight",
          attempts: 1,
          queryTimeoutMs: Number(process.env.PG_IDEMPOTENCY_LOOKUP_TIMEOUT_MS || 2000),
          recoveryBudgetMs: Number(process.env.PG_IDEMPOTENCY_LOOKUP_TIMEOUT_MS || 2000)
        }
      );
      return result.rows?.[0] || null;
    } catch {
      // During database recovery the durable write path will gate the request.
      // Never turn a receipt lookup failure into a second user-facing error.
      return null;
    }
  }

  return function idempotency(req, res, next) {
    const method = String(req.method || "GET").toUpperCase();
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return next();
    const supplied = String(req.get("Idempotency-Key") || "").trim();
    if (!supplied) return next();
    const path = String(req.path || "/");
    const scope = req.user?.companyId || req.get("X-Company-ID") || "public";
    const memoryKey = `${scope}:${method}:${path}:${supplied}`;
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

    const proceed = () => {
      entries.set(memoryKey, { state: "pending", expiresAt: Date.now() + ttlMs });
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        const status = res.statusCode || 200;
        if (status >= 200 && status < 500) entries.set(memoryKey, { state: "done", status, body, expiresAt: Date.now() + ttlMs });
        else entries.delete(memoryKey);
        return originalJson(body);
      };
      // Do not delete a pending entry merely because the client socket closes.
      // The server may still be completing a PostgreSQL COMMIT. Keeping it
      // pending prevents a second tap from creating a duplicate in that gap.
      res.on("finish", () => {
        const value = entries.get(memoryKey);
        if (value?.state === "pending" && res.statusCode >= 500) entries.delete(memoryKey);
      });
      return runWithOperationContext({ key: supplied, method, path }, next);
    };

    void findCommittedReceipt(supplied, method, path)
      .then((receipt) => {
        if (!receipt) return proceed();
        const body = normalizeReceiptBody(receipt.response_body) || { committed: true };
        entries.set(memoryKey, { state: "done", status: 200, body, expiresAt: Date.now() + ttlMs });
        res.setHeader("Idempotency-Replayed", "true");
        res.setHeader("X-Operation-Committed", "true");
        return res.status(200).json(body);
      })
      .catch(next);
  };
}

module.exports = { createIdempotencyMiddleware };
