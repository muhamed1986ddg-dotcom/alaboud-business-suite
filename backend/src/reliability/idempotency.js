"use strict";

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
    const scope = req.user?.companyId || req.get("X-Company-ID") || "public";
    const key = `${scope}:${method}:${req.path}:${supplied}`;
    const current = entries.get(key);
    if (current?.state === "done" && current.expiresAt > Date.now()) {
      res.setHeader("Idempotency-Replayed", "true");
      return res.status(current.status).json(current.body);
    }
    if (current?.state === "pending") {
      return res.status(409).json({
        code: "DUPLICATE_OPERATION_IN_PROGRESS",
        retryable: true,
        message: "العملية نفسها قيد التنفيذ حاليًا. يرجى الانتظار وعدم الضغط مرة أخرى."
      });
    }

    entries.set(key, { state: "pending", expiresAt: Date.now() + ttlMs });
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const status = res.statusCode || 200;
      if (status >= 200 && status < 500) entries.set(key, { state: "done", status, body, expiresAt: Date.now() + ttlMs });
      else entries.delete(key);
      return originalJson(body);
    };
    res.on("close", () => {
      const value = entries.get(key);
      if (value?.state === "pending") entries.delete(key);
    });
    next();
  };
}

module.exports = { createIdempotencyMiddleware };
