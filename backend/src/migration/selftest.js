const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { mapState } = require("./StateToRelationalMapper");

const backupPath = path.resolve(__dirname, "../../../alaboud-backup-2026-07-21T19-27-41-945Z.json");
const source = JSON.parse(fs.readFileSync(backupPath, "utf8"));
const mapped = mapState(source);
assert.strictEqual(mapped.companies.length, 1);
assert.strictEqual(mapped.customers.length, source.data.customers.length);
assert.strictEqual(mapped.transactions.length, source.data.transactions.length);
assert.strictEqual(mapped.payments.length, source.data.payments.length);
assert.strictEqual(mapped.debts.length, source.data.generalDebts.length);
assert.strictEqual(mapped.capital_movements.length, source.data.capitalMovements.length);
assert.strictEqual(mapped.exchange_rates.length, source.data.exchangeRates.length);
assert.ok(mapped.settings.length >= 1);
assert.ok(mapped.transactions.every((row) => row.raw_payload && row.company_id));
assert.ok(mapped.debts.every((row) => ["receivable", "payable"].includes(row.direction)));
console.log("Migration mapper self-test passed", Object.fromEntries(Object.entries(mapped).map(([key, rows]) => [key, rows.length])));
