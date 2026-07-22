const assert = require("assert");
const { mapState } = require("./StateToRelationalMapper");

const companyId="test-company";
const source={
  format:"ALABOUD_BACKUP",company:{id:companyId,name:"Test Company"},
  data:{
    customers:[{id:"customer-1",companyId,name:"Test Customer"}],
    transactions:[{id:"transaction-1",companyId,customerId:"customer-1",amount:100,currency:"CAD",createdAt:"2026-07-01"}],
    payments:[{id:"payment-1",companyId,customerId:"customer-1",transactionId:"transaction-1",amount:25,createdAt:"2026-07-02"}],
    generalDebts:[{id:"debt-1",companyId,type:"PAYABLE",amount:50,currency:"CAD"}],
    generalDebtPayments:[],expenses:[],partners:[],auditLogs:[],
    capitalMovements:[{id:"capital-1",companyId,type:"IN",amount:500,currency:"CAD"}],
    exchangeRates:[{id:"rate-1",companyId,baseCurrency:"USD",quoteCurrency:"CAD",buyRate:1.35,sellRate:1.37}],
    companySettings:{[companyId]:{overdueDays:7}}
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
