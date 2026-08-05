-- v24.2.3: indexes for customer search, alphabetical sorting and company pagination
CREATE INDEX IF NOT EXISTS idx_customers_company_name ON customers (company_id, name);
CREATE INDEX IF NOT EXISTS idx_customers_company_created_at ON customers (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_company_phone ON customers (company_id, phone);
CREATE INDEX IF NOT EXISTS idx_customers_customer_number ON customers (company_id, ((raw_payload->>'customerNumber')));
