class DatabaseService {
  constructor({ primaryAdapter, fallbackAdapter = null, normalize, emptyStore, logger = console }) {
    this.primaryAdapter = primaryAdapter;
    this.fallbackAdapter = fallbackAdapter;
    this.normalize = normalize;
    this.emptyStore = emptyStore;
    this.logger = logger;
    this.adapter = null;
    this.store = this.emptyStore();
    this.initialized = false;
    this.persistChain = Promise.resolve();
    this.lastPersistError = null;
  }

  async init() {
    if (this.initialized) return this.store;

    const candidates = [this.primaryAdapter, this.fallbackAdapter].filter(Boolean);
    let lastError = null;
    for (const candidate of candidates) {
      try {
        await candidate.init();
        this.adapter = candidate;
        break;
      } catch (error) {
        lastError = error;
        this.logger.error(`Database adapter ${candidate.mode} initialization failed:`, error.message);
      }
    }
    if (!this.adapter) throw lastError || new Error("No database adapter is available");

    let loaded = await this.adapter.load();
    if (!loaded && this.fallbackAdapter && this.adapter !== this.fallbackAdapter) {
      await this.fallbackAdapter.init();
      loaded = await this.fallbackAdapter.load();
      this.store = this.normalize(loaded || this.emptyStore());
      await this.adapter.save(this.store);
      this.logger.log("Initial data migrated through DatabaseService");
    } else {
      this.store = this.normalize(loaded || this.emptyStore());
    }

    this.initialized = true;
    this.logger.log(`DatabaseService ready (${this.adapter.mode})`);
    return this.store;
  }

  getStore() {
    return this.store;
  }

  replaceStore(nextStore) {
    this.store = this.normalize(nextStore);
    return this.store;
  }

  queueSave() {
    const snapshot = JSON.parse(JSON.stringify(this.store));
    this.persistChain = this.persistChain
      .then(() => this.adapter.save(snapshot))
      .then(() => { this.lastPersistError = null; })
      .catch((error) => {
        this.lastPersistError = error;
        this.logger.error("Database persistence failed:", error.message);
      });
    return this.persistChain;
  }

  async flush() {
    await this.persistChain;
    if (this.lastPersistError) throw this.lastPersistError;
  }

  async health() {
    if (!this.initialized || !this.adapter) {
      return { ok: false, mode: "uninitialized" };
    }
    try {
      const adapterHealth = await this.adapter.health();
      return { ...adapterHealth, initialized: true, pendingWrites: false, lastPersistError: this.lastPersistError?.message || null };
    } catch (error) {
      return { ok: false, mode: this.adapter.mode, initialized: true, error: error.message };
    }
  }

  async close() {
    await this.flush();
    if (this.adapter) await this.adapter.close();
  }
}

module.exports = DatabaseService;
