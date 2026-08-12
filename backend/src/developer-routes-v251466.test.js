"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { registerDeveloperRoutes } = require("./routes/developer");

function createAppRecorder() {
  const routes = [];
  const app = {};
  for (const method of ["get", "post", "delete"]) {
    app[method] = (routePath, ...handlers) => routes.push({ method, path: routePath, handlers });
  }
  return { app, routes };
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

async function runHandler(route, req) {
  const res = responseRecorder();
  await route.handlers.at(-1)(req, res);
  return res;
}

(async () => {
  const root = {
    apiKeys: [
      { id: "old", name: "Old", prefix: "old", keyHash: "secret-old", scopes: ["read"], createdAt: "2026-01-01T00:00:00Z" },
      { id: "new", name: "New", prefix: "new", keyHash: "secret-new", scopes: ["write"], createdAt: "2026-02-01T00:00:00Z" }
    ],
    webhooks: [{ id: "wh-1", name: "Hook", url: "https://example.com/hook", secretHash: "hidden", active: true }]
  };
  const audits = [];
  const queryCalls = [];
  const { app, routes } = createAppRecorder();
  const auth = (_req, _res, next) => next?.();
  registerDeveloperRoutes(app, {
    auth,
    readStore: () => root,
    mutateDurable: async mutate => mutate(root),
    id: () => "generated-id",
    now: () => "2026-08-12T12:00:00.000Z",
    audit: (_store, ...args) => audits.push(args),
    sha256: value => `hash:${value}`,
    generateApiKey: () => "alb_live_test_secret",
    keyPrefix: value => value.slice(0, 12),
    normalizeScopes: scopes => Array.isArray(scopes) ? scopes : ["read"],
    assertSafeWebhookUrl: async url => ({ url }),
    safeFetchWebhook: async () => ({ ok: true, status: 200 }),
    getDatabaseQuery: () => async (sql, values) => { queryCalls.push({ sql, values }); return { rows: [{ id: "log-1" }] }; },
    logger: { warn() {} }
  });

  const expected = [
    "get /api/developer/api-keys",
    "post /api/developer/api-keys",
    "post /api/developer/api-keys/:id/revoke",
    "get /api/developer/webhooks",
    "post /api/developer/webhooks",
    "post /api/developer/webhooks/:id/test",
    "delete /api/developer/webhooks/:id",
    "get /api/developer/integration-logs"
  ];
  assert.deepStrictEqual(routes.map(route => `${route.method} ${route.path}`), expected);
  assert(routes.every(route => route.handlers[0] === auth), "all developer routes must remain authenticated");

  const listKeys = routes.find(route => route.method === "get" && route.path === "/api/developer/api-keys");
  const forbidden = await runHandler(listKeys, { user: { id: "u", role: "USER" } });
  assert.strictEqual(forbidden.statusCode, 403);
  const listed = await runHandler(listKeys, { user: { id: "admin", role: "ADMIN" } });
  assert.deepStrictEqual(listed.body.map(item => item.id), ["new", "old"]);
  assert(listed.body.every(item => !("keyHash" in item)), "API key hashes must never be returned");

  const createKey = routes.find(route => route.method === "post" && route.path === "/api/developer/api-keys");
  const created = await runHandler(createKey, { user: { id: "admin", role: "ADMIN" }, body: { name: "Mobile", scopes: ["customers.read"] } });
  assert.strictEqual(created.statusCode, 201);
  assert.strictEqual(created.body.apiKey, "alb_live_test_secret");
  assert.strictEqual(root.apiKeys.at(-1).keyHash, "hash:alb_live_test_secret");
  assert.strictEqual(audits.at(-1)[1], "CREATE");

  const listWebhooks = routes.find(route => route.method === "get" && route.path === "/api/developer/webhooks");
  const webhookResponse = await runHandler(listWebhooks, { user: { id: "admin", role: "ADMIN" } });
  assert.strictEqual(webhookResponse.body[0].secretHash, undefined);

  const integrationLogs = routes.find(route => route.path === "/api/developer/integration-logs");
  const logResponse = await runHandler(integrationLogs, { user: { id: "admin", role: "ADMIN", companyId: "company-1" }, query: { limit: "9999" } });
  assert.deepStrictEqual(logResponse.body, [{ id: "log-1" }]);
  assert.deepStrictEqual(queryCalls[0].values, ["company-1", 500]);

  const serverSource = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const routeSource = fs.readFileSync(path.join(__dirname, "routes/developer.js"), "utf8");
  assert(serverSource.includes("registerDeveloperRoutes(app"), "server must register the extracted developer routes");
  assert(!serverSource.includes('app.get("/api/developer/'), "developer route handlers must not return to server.js");
  assert(!serverSource.includes('app.post("/api/developer/'), "developer route handlers must not return to server.js");
  assert(!routeSource.includes("./finance/") && !routeSource.includes("../finance/"), "developer routes must remain outside financial modules");
  const healthAt = serverSource.indexOf("registerHealthRoutes(app");
  const developerAt = serverSource.indexOf("registerDeveloperRoutes(app");
  const loginAt = serverSource.indexOf('app.post("/api/auth/login"');
  assert(healthAt >= 0 && developerAt > healthAt && loginAt > developerAt, "route registration order changed");

  console.log("v25.14.66 developer routes extraction regression: OK");
})().catch(error => { console.error(error); process.exit(1); });
