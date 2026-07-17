const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, "../../data");

const dataFile = path.join(dataDir, "store.json");
const backupDir = path.join(dataDir, "backups");
const MAX_BACKUPS = Math.max(5, Number(process.env.MAX_BACKUPS || 30));

const emptyStore = () => ({
  schemaVersion: 2,
  users: [],
  customers: [],
  archivedCustomers: [],
  transactions: [],
  payments: [],
  expenses: [],
  capitalMovements: [],
  exchangeRates: [],
  generalDebts: [],
  generalDebtPayments: [],
  partners: [],
  partnerTransactions: [],
  partnerPayments: [],
  notificationSettings: {
    overdueDays: 7,
    lowCashLimit: 5000,
    whatsappTemplate: ""
  },
  notificationActions: [],
  auditLogs: [],
  metadata: {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
});

function ensureStore() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });

  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify(emptyStore(), null, 2));
  }
}

function normalizeStore(store) {
  const fresh = emptyStore();
  const normalized = store && typeof store === "object" ? store : {};

  for (const [key, defaultValue] of Object.entries(fresh)) {
    if (Array.isArray(defaultValue)) {
      if (!Array.isArray(normalized[key])) normalized[key] = [];
    } else if (defaultValue && typeof defaultValue === "object") {
      const current = normalized[key];
      normalized[key] =
        current && !Array.isArray(current) && typeof current === "object"
          ? { ...defaultValue, ...current }
          : { ...defaultValue };
    } else if (normalized[key] === undefined) {
      normalized[key] = defaultValue;
    }
  }

  normalized.schemaVersion = 2;
  normalized.metadata = {
    ...fresh.metadata,
    ...(normalized.metadata || {}),
    updatedAt: new Date().toISOString()
  };

  return normalized;
}

function readStore() {
  ensureStore();

  try {
    const raw = fs.readFileSync(dataFile, "utf8");
    return normalizeStore(JSON.parse(raw));
  } catch (error) {
    const latest = listBackups()[0];

    if (latest) {
      try {
        const restored = normalizeStore(
          JSON.parse(fs.readFileSync(path.join(backupDir, latest.filename), "utf8"))
        );
        writeStore(restored, { createBackup: false });
        return restored;
      } catch {}
    }

    const fresh = emptyStore();
    writeStore(fresh, { createBackup: false });
    return fresh;
  }
}

function backupFilename() {
  return `store-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
}

function createBackup(storeOverride = null) {
  ensureStore();

  const source =
    storeOverride ||
    (fs.existsSync(dataFile)
      ? JSON.parse(fs.readFileSync(dataFile, "utf8"))
      : emptyStore());

  const filename = backupFilename();
  const filepath = path.join(backupDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(normalizeStore(source), null, 2));
  pruneBackups();

  return { filename, filepath, createdAt: new Date().toISOString() };
}

function listBackups() {
  ensureStore();

  return fs.readdirSync(backupDir)
    .filter((name) => /^store-.*\.json$/i.test(name))
    .map((filename) => {
      const filepath = path.join(backupDir, filename);
      const stats = fs.statSync(filepath);
      return {
        filename,
        size: stats.size,
        createdAt: stats.mtime.toISOString()
      };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function pruneBackups() {
  const backups = listBackups();
  backups.slice(MAX_BACKUPS).forEach((backup) => {
    try { fs.unlinkSync(path.join(backupDir, backup.filename)); } catch {}
  });
}

function writeStore(store, options = {}) {
  ensureStore();

  const { createBackup: shouldBackup = true } = options;
  if (shouldBackup && fs.existsSync(dataFile)) createBackup();

  const normalized = normalizeStore(store);
  const tmp = `${dataFile}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(normalized, null, 2));
  fs.renameSync(tmp, dataFile);
}

function restoreBackup(filename) {
  ensureStore();

  const safeName = path.basename(String(filename || ""));
  if (!/^store-.*\.json$/i.test(safeName)) {
    throw new Error("Invalid backup filename");
  }

  const filepath = path.join(backupDir, safeName);
  if (!fs.existsSync(filepath)) throw new Error("Backup not found");

  const restored = normalizeStore(
    JSON.parse(fs.readFileSync(filepath, "utf8"))
  );

  createBackup();
  writeStore(restored, { createBackup: false });
  return restored;
}

function importStore(payload) {
  const incoming = normalizeStore(payload);
  createBackup();
  writeStore(incoming, { createBackup: false });
  return incoming;
}

function id() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

function mutate(fn) {
  const store = readStore();
  const result = fn(store);
  writeStore(store);
  return result;
}

module.exports = {
  readStore,
  writeStore,
  mutate,
  id,
  now,
  dataFile,
  dataDir,
  backupDir,
  createBackup,
  listBackups,
  restoreBackup,
  importStore
};
