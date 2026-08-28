CREATE TABLE IF NOT EXISTS security_rate_limit_buckets (
  bucket_key TEXT NOT NULL,
  window_start BIGINT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_security_rate_limit_buckets_expires_at
  ON security_rate_limit_buckets(expires_at);
