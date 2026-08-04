const assert = require("assert");
const { mapState } = require("./StateToRelationalMapper");

// Self-contained fixture: the test must never depend on a private production backup.
const source = {
  company: { id: "company-1", name: "ALABOUD", baseCurrency: "CAD" },
  data: {
    customers: [{ id: "customer-1", companyId: "company-1", name: "Test Customer", phone: "+15190000000" }],
    partners: [{ id: "partner-1", companyId: "company-1", name: "Test Partner" }],
    transactions: [{ id: "txn-1", companyId: "company-1", customerId: "customer-1", partnerId: "partner-1", amount: 100, currency: "USD" }],
    payments: [{ id: "payment-1", companyId: "company-1", customerId: "customer-1", transactionId: "txn-1", amount: 25, currency: "USD" }],
    generalDebts: [
      { id: "debt-1", companyId: "company-1", customerId: "customer-1", type: "RECEIVABLE", amount: 50, currency: "CAD" },
      { id: "debt-2", companyId: "company-1", partnerId: "partner-1", type: "PAYABLE", amount: 20, currency: "CAD" }
    ],
    generalDebtPayments: [{ id: "debt-payment-1", companyId: "company-1", debtId: "debt-1", amount: 10, currency: "CAD" }],
    expenses: [{ id: "expense-1", companyId: "company-1", amount: 5, currency: "CAD" }],
    capitalMovements: [{ id: "capital-1", companyId: "company-1", amount: 1000, currency: "CAD" }],
    exchangeRates: [{ id: "rate-1", companyId: "company-1", baseCurrency: "USD", quoteCurrency: "CAD", buyRate: 1.35, sellRate: 1.36 }],
    notificationSettings: { enabled: true },
    auditLogs: []
  }
};

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
