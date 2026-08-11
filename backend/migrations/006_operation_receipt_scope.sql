-- v25.14.57: make durable idempotency receipts tenant-scoped and compatible
-- with both fresh databases and databases created by older releases.
CREATE TABLE IF NOT EXISTS operation_receipts (
  operation_key TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  company_id TEXT,
  branch_id TEXT,
  status TEXT NOT NULL DEFAULT 'COMMITTED',
  response_body JSONB,
  app_revision BIGINT,
  committed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scope_key TEXT NOT NULL DEFAULT 'public:*'
);

ALTER TABLE operation_receipts ADD COLUMN IF NOT EXISTS scope_key TEXT;
UPDATE operation_receipts
   SET scope_key = 'company:' || company_id
 WHERE company_id IS NOT NULL
   AND (scope_key IS NULL OR scope_key = '' OR scope_key = 'public:*');
UPDATE operation_receipts
   SET scope_key = 'public:*'
 WHERE scope_key IS NULL OR scope_key = '';
ALTER TABLE operation_receipts ALTER COLUMN scope_key SET DEFAULT 'public:*';
ALTER TABLE operation_receipts ALTER COLUMN scope_key SET NOT NULL;

-- Older fresh installs used operation_key as a global primary key. Remove only
-- that legacy single-column PK so identical UUIDs in different tenants are not
-- artificially coupled. The composite unique index below becomes authoritative.
DO $$
DECLARE pk_name text;
BEGIN
  SELECT c.conname INTO pk_name
    FROM pg_constraint c
   WHERE c.conrelid = 'operation_receipts'::regclass
     AND c.contype = 'p'
     AND pg_get_constraintdef(c.oid) = 'PRIMARY KEY (operation_key)'
   LIMIT 1;
  IF pk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE operation_receipts DROP CONSTRAINT %I', pk_name);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_operation_receipts_scope_key
  ON operation_receipts(scope_key, operation_key, method, path);
CREATE INDEX IF NOT EXISTS idx_operation_receipts_committed_at
  ON operation_receipts(committed_at);
