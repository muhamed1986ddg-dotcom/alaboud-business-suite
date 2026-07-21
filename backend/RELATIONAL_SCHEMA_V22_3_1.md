# Relational schema v22.3.1

This release creates the PostgreSQL relational schema while preserving the existing `app_state` JSONB compatibility layer. No production data is moved or deleted in this release.

Migrations run automatically when PostgreSQL starts and are recorded in `schema_migrations`.

Tables include companies, users, customers, partners, transactions, payments, debts, debt payments, expenses, capital movements, exchange rates, settings, audit logs, and system events.

The next release will migrate and verify existing JSONB records into these tables before changing application reads and writes.
