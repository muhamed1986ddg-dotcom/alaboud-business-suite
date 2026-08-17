import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {test} from "node:test";
import {fileURLToPath} from "node:url";

const testDir=path.dirname(fileURLToPath(import.meta.url));
const projectRoot=path.resolve(testDir,"../..");
const screen=fs.readFileSync(path.join(projectRoot,"frontend/src/screens/CapitalOverview.jsx"),"utf8");
const partners=fs.readFileSync(path.join(projectRoot,"frontend/src/screens/Partners.jsx"),"utf8");

test("manual budget refresh bypasses cached reads and gives visible progress",()=>{
  assert.match(screen,/import api,\{clearApiGetCache\} from"\.\.\/api"/);
  assert.match(screen,/clearApiGetCache\(\)/);
  assert.match(screen,/params:\{month,_refresh:refreshToken\}/);
  assert.match(screen,/busy=\{loading\}/);
  assert.match(screen,/busyText="جاري التحديث\.\.\."/);
  assert.match(screen,/تم تحديث الميزانية من أحدث أرصدة العملاء والشركات/);
});

test("a completed company balance sync invalidates frontend financial caches",()=>{
  assert.match(partners,/import api,\{cachedGet,clearApiGetCache\} from"\.\.\/api"/);
  assert.match(partners,/if\(job\.status==="SUCCESS"\)\{\s*clearApiGetCache\(\)/);
});
