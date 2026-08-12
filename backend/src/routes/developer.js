"use strict";

const crypto = require("crypto");

function registerDeveloperRoutes(app, {
  auth,
  readStore,
  mutateDurable,
  id,
  now,
  audit,
  sha256,
  generateApiKey,
  keyPrefix,
  normalizeScopes,
  assertSafeWebhookUrl,
  safeFetchWebhook,
  getDatabaseQuery,
  logger = console
}) {
  const requireAdmin = (req, res) => {
    if (req.user?.role === "ADMIN") return true;
    res.status(403).json({ message: "هذه الصفحة للمسؤول فقط" });
    return false;
  };

  app.get("/api/developer/api-keys", auth, (req, res) => {
    if (!requireAdmin(req, res)) return;
    const rows = (readStore().apiKeys || []).map(item => ({
      id: item.id,
      name: item.name,
      prefix: item.prefix,
      scopes: item.scopes,
      active: item.active !== false,
      expiresAt: item.expiresAt || null,
      lastUsedAt: item.lastUsedAt || null,
      usageCount: item.usageCount || 0,
      createdAt: item.createdAt
    }));
    res.json(rows.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))));
  });

  app.post("/api/developer/api-keys", auth, async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ message: "اسم المفتاح مطلوب" });
    const rawKey = generateApiKey();
    const record = {
      id: id(),
      name,
      prefix: keyPrefix(rawKey),
      keyHash: sha256(rawKey),
      scopes: normalizeScopes(req.body?.scopes),
      active: true,
      expiresAt: req.body?.expiresAt || null,
      createdBy: req.user.id,
      createdAt: now()
    };
    await mutateDurable(store => {
      store.apiKeys.push(record);
      audit(store, req.user.id, "CREATE", "API_KEY", record.id, { name: record.name, scopes: record.scopes });
    });
    res.status(201).json({
      id: record.id,
      name: record.name,
      prefix: record.prefix,
      scopes: record.scopes,
      expiresAt: record.expiresAt,
      apiKey: rawKey,
      message: "احفظ المفتاح الآن؛ لن يظهر كاملًا مرة أخرى"
    });
  });

  app.post("/api/developer/api-keys/:id/revoke", auth, async (req, res) => {
    if (!requireAdmin(req, res)) return;
    let found = false;
    await mutateDurable(store => {
      const item = store.apiKeys.find(candidate => candidate.id === req.params.id);
      if (item) {
        item.active = false;
        item.revokedAt = now();
        item.revokedBy = req.user.id;
        found = true;
        audit(store, req.user.id, "REVOKE", "API_KEY", item.id, { name: item.name });
      }
    });
    if (!found) return res.status(404).json({ message: "المفتاح غير موجود" });
    res.json({ message: "تم إلغاء المفتاح" });
  });

  app.get("/api/developer/webhooks", auth, (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json((readStore().webhooks || []).map(({ secretHash, ...item }) => item));
  });

  app.post("/api/developer/webhooks", auth, async (req, res) => {
    if (!requireAdmin(req, res)) return;
    let url = String(req.body?.url || "").trim();
    const name = String(req.body?.name || "").trim();
    try {
      ({ url } = await assertSafeWebhookUrl(url));
    } catch {
      return res.status(400).json({ message: "رابط Webhook غير صالح أو يشير إلى شبكة داخلية" });
    }
    const secret = crypto.randomBytes(24).toString("base64url");
    const item = {
      id: id(),
      name: name || "Webhook",
      url,
      events: normalizeScopes(req.body?.events || ["transaction.created"]),
      secretHash: sha256(secret),
      active: true,
      createdBy: req.user.id,
      createdAt: now()
    };
    await mutateDurable(store => {
      store.webhooks.push(item);
      audit(store, req.user.id, "CREATE", "WEBHOOK", item.id, { url: item.url, events: item.events });
    });
    res.status(201).json({ ...item, secretHash: undefined, secret, message: "احفظ السر الآن؛ لن يظهر مرة أخرى" });
  });

  app.post("/api/developer/webhooks/:id/test", auth, async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const item = (readStore().webhooks || []).find(candidate => candidate.id === req.params.id && candidate.active !== false);
    if (!item) return res.status(404).json({ message: "Webhook غير موجود" });
    const payload = { event: "webhook.test", id: crypto.randomUUID(), createdAt: now(), data: { companyId: req.user.companyId } };
    try {
      const response = await safeFetchWebhook(item.url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-alaboud-event": "webhook.test" },
        body: JSON.stringify(payload),
        timeoutMs: 10000
      });
      await mutateDurable(store => {
        const webhook = store.webhooks.find(candidate => candidate.id === item.id);
        if (webhook) {
          webhook.lastTestAt = now();
          webhook.lastStatus = response.status;
        }
      });
      return res.status(response.ok ? 200 : 502).json({ ok: response.ok, status: response.status });
    } catch (error) {
      const rejected = ["WEBHOOK_PROTOCOL", "WEBHOOK_CREDENTIALS", "WEBHOOK_PRIVATE_HOST", "WEBHOOK_PRIVATE_IP"].includes(error.message);
      return res.status(rejected ? 400 : 502).json({
        ok: false,
        message: rejected ? "تم رفض رابط Webhook لأنه يشير إلى شبكة داخلية أو عنوان غير آمن" : error.message
      });
    }
  });

  app.delete("/api/developer/webhooks/:id", auth, async (req, res) => {
    if (!requireAdmin(req, res)) return;
    let found = false;
    await mutateDurable(store => {
      const item = store.webhooks.find(candidate => candidate.id === req.params.id);
      if (item) {
        item.active = false;
        item.updatedAt = now();
        found = true;
        audit(store, req.user.id, "DISABLE", "WEBHOOK", item.id, { url: item.url });
      }
    });
    if (!found) return res.status(404).json({ message: "Webhook غير موجود" });
    res.json({ message: "تم تعطيل Webhook" });
  });

  app.get("/api/developer/integration-logs", auth, async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    try {
      const query = getDatabaseQuery();
      if (!query) throw new Error("DATABASE_QUERY_UNAVAILABLE");
      const result = await query(
        "SELECT id,company_id AS \"companyId\",request_id AS \"requestId\",method,path,status_code AS \"statusCode\",duration_ms AS \"durationMs\",auth_type AS \"authType\",actor_id AS \"actorId\",ip,created_at AS \"createdAt\" FROM integration_logs WHERE company_id=$1 ORDER BY created_at DESC LIMIT $2",
        [req.user.companyId, limit]
      );
      return res.json(result.rows || []);
    } catch (error) {
      logger.warn("Integration log query failed:", error.message);
      return res.status(503).json({ message: "سجل التكامل غير متاح مؤقتًا", retryable: true });
    }
  });
}

module.exports = { registerDeveloperRoutes };
