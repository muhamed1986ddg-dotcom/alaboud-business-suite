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
    this.durableSaveChain = Promise.resolve();
    this.writeBehindRevision = 0;
    this.persistedRevision = 0;
    this.writeBehindRetryCount = 0;
    this.writeBehindRetryTimer = null;
    this.writeBehindLastError = null;
  }

  async init() {
    if (this.initialized) return this.store;

    // When PostgreSQL is configured, never silently promote the JSON adapter
    // to primary storage after a temporary DNS/connection failure. Render disks
    // on free web services are ephemeral, so doing that can split the live data
    // between PostgreSQL and a temporary local file. The fallback adapter is
    // used only as a migration source after the primary adapter is ready.
    const candidates = [this.primaryAdapter].filter(Boolean);
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

  async reload() {
    if (!this.initialized || !this.adapter) return this.init();
    if (this.pendingSnapshot || this.persisting) {
      const error = new Error("Cannot reload application state while writes are pending");
      error.code = "DATABASE_RELOAD_WRITES_PENDING";
      error.status = 503;
      error.retryable = true;
      throw error;
    }
    await this.durableSaveChain;
    const loaded = await this.adapter.load();
    this.store = this.normalize(loaded || this.emptyStore());
    this.lastPersistError = null;
    this.logger.log(`DatabaseService reloaded (${this.adapter.mode})`);
    return this.store;
  }

  getStore() {
    return this.store;
  }

  replaceStore(nextStore) {
    this.store = this.normalize(nextStore);
    return this.store;
  }

  saveDurable(nextStore, options = {}) {
    // Interactive writes must not wait behind the coalesced background queue.
    // mutateDurable can hand us an already-normalized private snapshot. Reuse
    // that immutable draft instead of cloning the whole financial state again.
    const ownedSnapshot = options.ownedSnapshot === true;
    const snapshot = ownedSnapshot ? nextStore : structuredClone(this.normalize(nextStore));
    const execute = async () => {
      try {
        await this.adapter.save(snapshot, { interactive: true, ...options, immutableSnapshot: ownedSnapshot });
        this.store = ownedSnapshot ? snapshot : this.normalize(snapshot);
        this.pendingSnapshot = null;
        this.lastPersistError = null;
        return this.store;
      } catch (error) {
        this.lastPersistError = error;
        throw error;
      }
    };
    const task = this.durableSaveChain.then(execute, execute);
    this.durableSaveChain = task.catch(() => undefined);
    return task;
  }

  queueSave() {
    // Responsive write-behind persistence: keep only the newest complete
    // snapshot and acknowledge the API request immediately. The queue retries
    // until PostgreSQL accepts the newest state, so bursts never create one
    // full JSON snapshot per request.
    this.pendingSnapshot = structuredClone(this.store);
    this.writeBehindRevision += 1;
    const queuedRevision = this.writeBehindRevision;
    this.startWriteBehindWorker();
    return { queued: true, revision: queuedRevision };
  }

  startWriteBehindWorker() {
    if (this.persisting || !this.pendingSnapshot) return;
    this.persisting = true;
    this.persistChain = (async () => {
      while (this.pendingSnapshot) {
        const snapshot = this.pendingSnapshot;
        const targetRevision = this.writeBehindRevision;
        this.pendingSnapshot = null;
        try {
          await this.adapter.save(snapshot, { interactive: false });
          this.persistedRevision = Math.max(this.persistedRevision, targetRevision);
          this.writeBehindRetryCount = 0;
          this.writeBehindLastError = null;
          this.lastPersistError = null;
        } catch (error) {
          this.lastPersistError = error;
          this.writeBehindLastError = error;
          this.writeBehindRetryCount += 1;
          // A newer snapshot already contains this failed mutation. Requeue the
          // failed snapshot only when no newer state is waiting.
          if (!this.pendingSnapshot) this.pendingSnapshot = snapshot;
          const base = Math.max(500, Number(process.env.WRITE_BEHIND_RETRY_BASE_MS || 1000));
          const cap = Math.max(base, Number(process.env.WRITE_BEHIND_RETRY_MAX_MS || 30000));
          const delay = Math.min(cap, base * (2 ** Math.min(this.writeBehindRetryCount - 1, 5)));
          this.logger.warn?.(`Write-behind persistence deferred; retrying in ${delay}ms: ${error.message}`);
          clearTimeout(this.writeBehindRetryTimer);
          this.writeBehindRetryTimer = setTimeout(() => { this.writeBehindRetryTimer = null; this.startWriteBehindWorker(); }, delay);
          this.writeBehindRetryTimer.unref?.();
          break;
        }
      }
    })().finally(() => {
      this.persisting = false;
      if (this.pendingSnapshot && !this.writeBehindRetryTimer) this.startWriteBehindWorker();
    });
  }

  async flush({ timeoutMs = 15000 } = {}) {
    if (this.pendingSnapshot) this.startWriteBehindWorker();
    let timer = null;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Database flush timed out")), Math.max(1, Number(timeoutMs) || 1));
    });
    try {
      // saveDurable uses a separate serialized chain from write-behind. Wait
      // for both so SIGTERM cannot close PostgreSQL while a confirmed financial
      // write is still in flight.
      await Promise.race([Promise.all([this.persistChain, this.durableSaveChain]), timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (this.lastPersistError) throw this.lastPersistError;
    if (this.pendingSnapshot || this.persisting) throw new Error("Database still has pending writes");
  }

  async health() {
    if (!this.initialized || !this.adapter) {
      return { ok: false, mode: "uninitialized" };
    }
    try {
      const adapterHealth = await this.adapter.health();
      return { ...adapterHealth, initialized: true, pendingWrites: this.persisting || Boolean(this.pendingSnapshot), queuedRevision: this.writeBehindRevision, persistedRevision: this.persistedRevision, retryCount: this.writeBehindRetryCount, lastPersistError: this.lastPersistError?.message || null };
    } catch (error) {
      return { ok: false, mode: this.adapter.mode, initialized: true, error: error.message };
    }
  }

  getQueryFunction() {
    if (!this.initialized || !this.adapter || typeof this.adapter.query !== "function") return null;
    return this.adapter.query.bind(this.adapter);
  }

  async close({ timeoutMs = Number(process.env.SHUTDOWN_FLUSH_TIMEOUT_MS || 5000), skipFlush = false } = {}) {
    const budget = Math.max(1, Number(timeoutMs) || 1);
    const deadline = Date.now() + budget;
    const remaining = () => Math.max(1, deadline - Date.now());
    clearTimeout(this.writeBehindRetryTimer);
    let firstError = null;
    if (!skipFlush) {
      try {
        await this.flush({ timeoutMs: remaining() });
      } catch (error) {
        firstError = error;
        this.logger.error("Final database flush failed:", error.message);
      }
    }
    if (this.adapter && Date.now() < deadline) {
      let timer = null;
      try {
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("Database adapter close timed out")), remaining());
        });
        await Promise.race([this.adapter.close(), timeout]);
      } catch (error) {
        if (!firstError) firstError = error;
        this.logger.error("Final database adapter close failed:", error.message);
      } finally {
        if (timer) clearTimeout(timer);
      }
    } else if (this.adapter) {
      const error = new Error("Database adapter close skipped: shutdown budget exhausted");
      if (!firstError) firstError = error;
      this.logger.error("Final database adapter close failed:", error.message);
    }
    if (firstError) throw firstError;
  }
}

module.exports = DatabaseService;
