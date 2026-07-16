const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(__dirname, "../../data");
const dataFile = path.join(dataDir, "store.json");

const emptyStore = () => ({
  users: [], customers: [], transactions: [], payments: [], expenses: [], capitalMovements: [], exchangeRates: [], generalDebts: [], generalDebtPayments: [], partners: [], partnerTransactions: [], partnerPayments: [], notificationSettings: { overdueDays: 7, lowCashLimit: 5000, whatsappTemplate: "" }, notificationActions: [], auditLogs: []
});

function ensureStore() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, JSON.stringify(emptyStore(), null, 2));
}

function readStore() {
  ensureStore();
  try {
    const store = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    const fresh = emptyStore();
    for (const [key, defaultValue] of Object.entries(fresh)) {
      if (Array.isArray(defaultValue)) {
        if (!Array.isArray(store[key])) store[key] = [];
      } else if (defaultValue && typeof defaultValue === "object") {
        if (!store[key] || Array.isArray(store[key]) || typeof store[key] !== "object") {
          store[key] = { ...defaultValue };
        } else {
          store[key] = { ...defaultValue, ...store[key] };
        }
      } else if (store[key] === undefined) {
        store[key] = defaultValue;
      }
    }
    return store;
  }
  catch { const fresh = emptyStore(); writeStore(fresh); return fresh; }
}

function writeStore(store) {
  ensureStore();
  const tmp = `${dataFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, dataFile);
}

function id() { return crypto.randomUUID(); }
function now() { return new Date().toISOString(); }

function mutate(fn) {
  const store = readStore();
  const result = fn(store);
  writeStore(store);
  return result;
}

module.exports = { readStore, writeStore, mutate, id, now, dataFile };
