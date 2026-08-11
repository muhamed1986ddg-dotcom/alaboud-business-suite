CREATE TABLE IF NOT EXISTS integration_logs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  request_id TEXT,
  method TEXT,
  path TEXT,
  status_code INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  auth_type TEXT,
  actor_id TEXT,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS integration_logs_company_created_idx ON integration_logs(company_id,created_at DESC);

CREATE TABLE IF NOT EXISTS api_key_activity (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  api_key_id TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  usage_delta INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS api_key_activity_company_created_idx ON api_key_activity(company_id,used_at DESC);
