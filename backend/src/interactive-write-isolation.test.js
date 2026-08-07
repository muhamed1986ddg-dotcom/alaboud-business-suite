const fs=require("fs"),path=require("path"),assert=require("assert");
const s=fs.readFileSync(path.join(__dirname,"database/adapters/PostgresStateAdapter.js"),"utf8");
assert(s.includes("RELATIONAL_MIRROR_DELAY_MS || 30000"));
assert(s.includes("if (this.mirrorScheduleTimer)"));
assert(s.includes("clearTimeout(this.mirrorScheduleTimer)"));
assert(s.includes("pool?.waitingCount"));
console.log("interactive write isolation regression: OK");
