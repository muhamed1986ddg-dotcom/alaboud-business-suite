const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(__dirname, "../../data");
const dataFile = path.join(dataDir, "store.json");

const emptyStore = () => ({
  users: [], customers: [], transactions: [], payments: [], expenses: [], capitalMovements: [], exchangeRates: [], generalDebts: [], generalDebtPayments: [], partners: [], partnerTransactions: [], partnerPayments: [], auditLogs: []
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
    for (const key of Object.keys(fresh)) {
      if (!Array.isArray(store[key])) store[key] = [];
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
