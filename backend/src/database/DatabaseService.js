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
    this.pendingSnapshot = null;
    this.persisting = false;
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
    // Coalesce bursts of mutations into one latest snapshot. The old implementation
    // retained a full cloned store for every write in the promise chain, which could
    // exhaust a 512 MB Render instance during rate refreshes and imports.
    this.pendingSnapshot = structuredClone(this.store);
    if (this.persisting) return this.persistChain;

    this.persisting = true;
    this.persistChain = (async () => {
      while (this.pendingSnapshot) {
        const snapshot = this.pendingSnapshot;
        this.pendingSnapshot = null;
        try {
          await this.adapter.save(snapshot);
          this.lastPersistError = null;
        } catch (error) {
          this.lastPersistError = error;
          this.logger.error("Database persistence failed:", error.message);
        }
      }
    })().finally(() => { this.persisting = false; });
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
      return { ...adapterHealth, initialized: true, pendingWrites: this.persisting || Boolean(this.pendingSnapshot), lastPersistError: this.lastPersistError?.message || null };
    } catch (error) {
      return { ok: false, mode: this.adapter.mode, initialized: true, error: error.message };
    }
  }

  getQueryFunction() {
    if (!this.initialized || !this.adapter || typeof this.adapter.query !== "function") return null;
    return this.adapter.query.bind(this.adapter);
  }

  async close() {
    await this.flush();
    if (this.adapter) await this.adapter.close();
  }
}

module.exports = DatabaseService;
