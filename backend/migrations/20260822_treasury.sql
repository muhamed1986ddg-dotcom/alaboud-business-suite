BEGIN;

CREATE TABLE IF NOT EXISTS treasury_balances (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL DEFAULT '',
  currency VARCHAR(8) NOT NULL,
  balance NUMERIC(24,4) NOT NULL DEFAULT 0,
  total_cost_cad NUMERIC(24,4) NOT NULL DEFAULT 0,
  average_cost_cad NUMERIC(24,8) NOT NULL DEFAULT 0,
  realized_profit_cad NUMERIC(24,4) NOT NULL DEFAULT 0,
  realized_loss_cad NUMERIC(24,4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, branch_id, currency)
);

CREATE TABLE IF NOT EXISTS treasury_movements (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT,
  source_key TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_label TEXT,
  transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('IN','OUT','ADJUSTMENT')),
  direction TEXT NOT NULL CHECK (direction IN ('IN','OUT')),
  currency VARCHAR(8) NOT NULL,
  quantity NUMERIC(24,4) NOT NULL CHECK (quantity > 0),
  cost_rate_cad NUMERIC(24,8),
  average_cost_before_cad NUMERIC(24,8) NOT NULL DEFAULT 0,
  average_cost_after_cad NUMERIC(24,8) NOT NULL DEFAULT 0,
  delivery_rate_cad NUMERIC(24,8),
  realized_fx_cad NUMERIC(24,4) NOT NULL DEFAULT 0,
  balance_after NUMERIC(24,4) NOT NULL DEFAULT 0,
  total_cost_after_cad NUMERIC(24,4) NOT NULL DEFAULT 0,
  reason TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_cancelled BOOLEAN NOT NULL DEFAULT FALSE,
  cancelled_at TIMESTAMPTZ,
  cancelled_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  cancellation_reason TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS treasury_movements_source_uq
  ON treasury_movements (company_id, COALESCE(branch_id, ''), source_key);
CREATE INDEX IF NOT EXISTS treasury_movements_ledger_idx
  ON treasury_movements (company_id, branch_id, currency, occurred_at, created_at);

COMMIT;
