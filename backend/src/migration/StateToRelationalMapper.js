const crypto = require("crypto");

const TABLE_ORDER = [
  "companies", "users", "customers", "partners", "transactions", "payments",
  "debts", "debt_payments", "expenses", "capital_movements", "exchange_rates",
  "settings", "audit_logs"
];

function value(...items) {
  return items.find((item) => item !== undefined && item !== null && item !== "");
}
function text(input, fallback = null) {
  const result = value(input, fallback);
  return result === null || result === undefined ? null : String(result);
}
function number(input, fallback = null) {
  if (input === null || input === undefined || input === "") return fallback;
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function bool(input, fallback = true) {
  if (input === undefined || input === null || input === "") return fallback;
  if (typeof input === "boolean") return input;
  return !["false", "0", "no", "off"].includes(String(input).toLowerCase());
}
function date(input, fallback = null) {
  const candidate = value(input, fallback);
  if (!candidate) return null;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}
function id(input, prefix = "row") {
  return text(input) || `${prefix}-${crypto.randomUUID()}`;
}
function raw(row) { return row && typeof row === "object" ? row : {}; }
function currency(input, fallback = "CAD") { return text(input, fallback).toUpperCase().slice(0, 8); }

function normalizeSource(input) {
  if (!input || typeof input !== "object") return {};
  if (input.data && typeof input.data === "object") {
    const company = input.company && typeof input.company === "object" ? input.company : null;
    return {
      ...input.data,
      companies: company ? [{ ...company, id: company.id || input.data.companyId }] : (input.data.companies || []),
      users: input.data.users || []
    };
  }
  return input;
}

function mapState(input) {
  const state = normalizeSource(input);
  const collections = Object.fromEntries(TABLE_ORDER.map((name) => [name, []]));
  const companies = Array.isArray(state.companies) ? state.companies : [];
  const users = Array.isArray(state.users) ? state.users : [];
  const inferredCompanyIds = new Set();
  for (const key of ["customers", "transactions", "payments", "expenses", "capitalMovements", "exchangeRates", "generalDebts", "generalDebtPayments", "partners", "auditLogs"]) {
    for (const row of Array.isArray(state[key]) ? state[key] : []) if (row?.companyId) inferredCompanyIds.add(String(row.companyId));
  }
  for (const row of users) if (row?.companyId) inferredCompanyIds.add(String(row.companyId));
  for (const row of companies) if (row?.id) inferredCompanyIds.add(String(row.id));
  if (!inferredCompanyIds.size) inferredCompanyIds.add("default-company");

  const companyMap = new Map(companies.map((row) => [String(row.id), row]));
  for (const companyId of inferredCompanyIds) {
    const row = companyMap.get(companyId) || {};
    collections.companies.push({
      id: companyId,
      name: text(row.name, companyId === "default-company" ? "ALABOUD" : "Company"),
      code: text(row.code), base_currency: currency(row.baseCurrency), is_active: bool(row.isActive, true),
      created_at: date(row.createdAt, new Date().toISOString()), updated_at: date(row.updatedAt, new Date().toISOString()), raw_payload: raw(row)
    });
  }

  const userIds = new Set(users.map((row) => String(row.id)));
  for (const row of users) collections.users.push({
    id: id(row.id, "user"), company_id: text(row.companyId, [...inferredCompanyIds][0]), username: text(value(row.username, row.name, row.email), "user"),
    email: text(row.email), password_hash: text(value(row.passwordHash, row.password)), role: text(row.role, "user"), is_active: bool(row.isActive, true),
    last_login_at: date(row.lastLoginAt), created_at: date(row.createdAt, new Date().toISOString()), updated_at: date(row.updatedAt, new Date().toISOString()), raw_payload: raw(row)
  });
  const safeUser = (candidate) => candidate && userIds.has(String(candidate)) ? String(candidate) : null;

  const customerRows = Array.isArray(state.customers) ? state.customers : [];
  const customerIds = new Set(customerRows.map((row) => String(row.id)));
  for (const row of customerRows) collections.customers.push({
    id: id(row.id, "customer"), company_id: text(row.companyId, [...inferredCompanyIds][0]), name: text(row.name, "Unnamed customer"), phone: text(row.phone), email: text(row.email), address: text(row.address),
    credit_limit_cad: number(row.creditLimitCad), opening_balance_cad: number(value(row.openingBalanceCad, row.oldBalance), 0), is_active: !bool(value(row.isDeleted, false), false),
    created_at: date(row.createdAt, new Date().toISOString()), updated_at: date(row.updatedAt, row.createdAt || new Date().toISOString()), raw_payload: raw(row)
  });

  const partnerRows = Array.isArray(state.partners) ? state.partners : [];
  const partnerIds = new Set(partnerRows.map((row) => String(row.id)));
  for (const row of partnerRows) collections.partners.push({
    id: id(row.id, "partner"), company_id: text(row.companyId, [...inferredCompanyIds][0]), name: text(row.name, "Unnamed partner"), connector_type: text(row.connectorType), external_account_id: text(row.externalAccountId),
    is_active: bool(value(row.isActive, row.syncEnabled), true), created_at: date(row.createdAt, new Date().toISOString()), updated_at: date(row.updatedAt, row.createdAt || new Date().toISOString()), raw_payload: raw(row)
  });

  const transactionRows = Array.isArray(state.transactions) ? state.transactions : [];
  const transactionIds = new Set(transactionRows.map((row) => String(row.id)));
  for (const row of transactionRows) collections.transactions.push({
    id: id(row.id, "transaction"), company_id: text(row.companyId, [...inferredCompanyIds][0]), customer_id: row.customerId && customerIds.has(String(row.customerId)) ? String(row.customerId) : null,
    partner_id: row.partnerId && partnerIds.has(String(row.partnerId)) ? String(row.partnerId) : null, transaction_type: text(value(row.transactionType, row.direction), "transfer").toLowerCase(),
    status: text(row.status, "pending").toLowerCase(), amount: number(row.amount, 0), currency: currency(row.currency), exchange_rate: number(value(row.exchangeRate, row.finalRate, row.costRate)),
    cad_amount: number(value(row.cadAmount, row.totalCustomerDue)), cost_cad: number(value(row.costCad, row.costAmount)), profit_cad: number(value(row.profitCad, row.totalProfit)), reference_number: text(value(row.referenceNumber, row.number, row.reference)),
    transaction_date: date(value(row.transactionDate, row.transferDate, row.date, row.createdAt), new Date().toISOString()), created_by: safeUser(row.createdBy),
    created_at: date(row.createdAt, new Date().toISOString()), updated_at: date(row.updatedAt, row.createdAt || new Date().toISOString()), raw_payload: raw(row)
  });

  for (const row of Array.isArray(state.payments) ? state.payments : []) collections.payments.push({
    id: id(row.id, "payment"), company_id: text(row.companyId, [...inferredCompanyIds][0]), customer_id: row.customerId && customerIds.has(String(row.customerId)) ? String(row.customerId) : null,
    transaction_id: row.transactionId && transactionIds.has(String(row.transactionId)) ? String(row.transactionId) : null, amount: number(row.amount, 0), currency: currency(row.currency), exchange_rate: number(row.exchangeRate), cad_amount: number(row.cadAmount),
    payment_date: date(value(row.paymentDate, row.date, row.createdAt), new Date().toISOString()), created_by: safeUser(value(row.createdBy, row.receivedBy)), created_at: date(row.createdAt, new Date().toISOString()), raw_payload: raw(row)
  });

  const debtRows = Array.isArray(state.generalDebts) ? state.generalDebts : [];
  const debtIds = new Set(debtRows.map((row) => String(row.id)));
  for (const row of debtRows) collections.debts.push({
    id: id(row.id, "debt"), company_id: text(row.companyId, [...inferredCompanyIds][0]), customer_id: row.customerId && customerIds.has(String(row.customerId)) ? String(row.customerId) : null,
    partner_id: row.partnerId && partnerIds.has(String(row.partnerId)) ? String(row.partnerId) : null, direction: String(value(row.direction, row.type, "RECEIVABLE")).toUpperCase().includes("PAYABLE") ? "payable" : "receivable",
    status: text(row.status, "open").toLowerCase(), amount: number(row.amount, 0), currency: currency(row.currency), exchange_rate: number(row.exchangeRate), cad_amount: number(row.cadAmount), due_date: date(row.dueDate),
    description: text(value(row.description, row.partyName)), created_by: safeUser(row.createdBy), created_at: date(row.createdAt, new Date().toISOString()), updated_at: date(row.updatedAt, row.createdAt || new Date().toISOString()), raw_payload: raw(row)
  });

  for (const row of Array.isArray(state.generalDebtPayments) ? state.generalDebtPayments : []) collections.debt_payments.push({
    id: id(row.id, "debt-payment"), company_id: text(row.companyId, [...inferredCompanyIds][0]), debt_id: row.debtId && debtIds.has(String(row.debtId)) ? String(row.debtId) : null,
    amount: number(row.amount, 0), currency: currency(row.currency), exchange_rate: number(row.exchangeRate), cad_amount: number(row.cadAmount), payment_date: date(value(row.paymentDate, row.date, row.createdAt), new Date().toISOString()),
    created_by: safeUser(row.createdBy), created_at: date(row.createdAt, new Date().toISOString()), raw_payload: raw(row)
  });

  for (const row of Array.isArray(state.expenses) ? state.expenses : []) collections.expenses.push({
    id: id(row.id, "expense"), company_id: text(row.companyId, [...inferredCompanyIds][0]), category: text(row.category), description: text(value(row.description, row.notes)), amount: number(row.amount, 0), currency: currency(row.currency),
    exchange_rate: number(row.exchangeRate), cad_amount: number(row.cadAmount), expense_date: date(value(row.expenseDate, row.date, row.createdAt), new Date().toISOString()), created_by: safeUser(row.createdBy),
    created_at: date(row.createdAt, new Date().toISOString()), updated_at: date(row.updatedAt, row.createdAt || new Date().toISOString()), raw_payload: raw(row)
  });

  for (const row of Array.isArray(state.capitalMovements) ? state.capitalMovements : []) collections.capital_movements.push({
    id: id(row.id, "capital"), company_id: text(row.companyId, [...inferredCompanyIds][0]), movement_type: text(row.type, "addition").toLowerCase(), amount: number(row.amount, 0), currency: currency(row.currency),
    exchange_rate: number(row.exchangeRate), cad_amount: number(row.cadAmount), description: text(row.description), movement_date: date(value(row.movementDate, row.date, row.createdAt), new Date().toISOString()),
    created_by: safeUser(row.createdBy), created_at: date(row.createdAt, new Date().toISOString()), raw_payload: raw(row)
  });

  for (const row of Array.isArray(state.exchangeRates) ? state.exchangeRates : []) collections.exchange_rates.push({
    id: id(row.id, "rate"), company_id: text(row.companyId, [...inferredCompanyIds][0]), base_currency: currency(row.baseCurrency), quote_currency: currency(row.quoteCurrency), buy_rate: number(row.buyRate), sell_rate: number(row.sellRate),
    source: text(row.source), effective_at: date(value(row.effectiveAt, row.sourceDate, row.createdAt), new Date().toISOString()), created_at: date(row.createdAt, new Date().toISOString()), raw_payload: raw(row)
  });

  const settingsByCompany = state.companySettings && typeof state.companySettings === "object" ? state.companySettings : {};
  for (const companyId of inferredCompanyIds) {
    const notification = settingsByCompany[companyId] || state.notificationSettings;
    if (notification && typeof notification === "object") collections.settings.push({ company_id: companyId, setting_key: "notificationSettings", setting_value: notification, updated_at: new Date().toISOString() });
  }

  for (const row of Array.isArray(state.auditLogs) ? state.auditLogs : []) collections.audit_logs.push({
    company_id: text(row.companyId), user_id: safeUser(row.userId || row.createdBy), action: text(row.action, "unknown"), entity_type: text(row.entityType), entity_id: text(row.entityId),
    ip_address: text(row.ipAddress), details: raw(row.details || row), created_at: date(row.createdAt, new Date().toISOString())
  });

  return collections;
}

module.exports = { mapState, normalizeSource, TABLE_ORDER };
