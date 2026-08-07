const fs=require("fs"),path=require("path"),assert=require("assert");
const s=fs.readFileSync(path.join(__dirname,"database/adapters/PostgresStateAdapter.js"),"utf8");
assert(!s.includes("pg_advisory_xact_lock(hashtext('alaboud:app_state:main'))"));
assert(s.includes("VALUES ('main',$1::jsonb,1,NOW())"));
assert(s.includes("INSERT INTO operation_receipts"));
console.log("edit/delete lock regression: OK");
