import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../src/components/system/DatabaseStatus.jsx",import.meta.url),"utf8");

test("database banner follows database.ok instead of global readiness ok",()=>{
  assert.match(source,/database\.ok===true/);
  assert.doesNotMatch(source,/response\.data\?\.ok\?"connected"/);
});

test("health polling accepts 503 payload and retries quickly while reconnecting",()=>{
  assert.match(source,/validateStatus:status=>status===200\|\|status===503/);
  assert.match(source,/schedule\(3000\)/);
});
