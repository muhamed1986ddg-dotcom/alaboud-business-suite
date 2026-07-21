const fs = require("fs");
const path = require("path");

class JsonFileAdapter {
  constructor({ dataFile, normalize, emptyStore, logger = console }) {
    this.dataFile = dataFile;
    this.normalize = normalize;
    this.emptyStore = emptyStore;
    this.logger = logger;
    this.mode = "json";
  }

  async init() {
    fs.mkdirSync(path.dirname(this.dataFile), { recursive: true });
  }

  async load() {
    try {
      if (!fs.existsSync(this.dataFile)) return this.emptyStore();
      return this.normalize(JSON.parse(fs.readFileSync(this.dataFile, "utf8")));
    } catch (error) {
      this.logger.error("JSON store read failed:", error.message);
      return this.emptyStore();
    }
  }

  async save(snapshot) {
    fs.mkdirSync(path.dirname(this.dataFile), { recursive: true });
    const tmp = `${this.dataFile}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 2));
    fs.renameSync(tmp, this.dataFile);
  }

  async health() {
    return { ok: true, mode: this.mode, dataFile: this.dataFile };
  }

  async close() {}
}

module.exports = JsonFileAdapter;
