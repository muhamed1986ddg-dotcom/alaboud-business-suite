BEGIN;

CREATE TABLE IF NOT EXISTS data_import_runs (
  id UUID PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_reference TEXT,
  status TEXT NOT NULL CHECK (status IN ('running','completed','failed','rolled_back')),
  source_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  inserted_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  inserted_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
  verification JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  rolled_back_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS data_import_runs_status_started_idx
  ON data_import_runs(status, started_at DESC);

COMMIT;
