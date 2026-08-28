import test from"node:test";import assert from"node:assert/strict";import fs from"node:fs";
const source=fs.readFileSync(new URL("../src/screens/Customers.jsx",import.meta.url),"utf8");
test("v25.14.116 removes stale deleted customer cards immediately",()=>{
  assert.match(source,/setList\(current=>current\.filter\(item=>item\.id!==customer\.id\)\)/);
  assert.match(source,/requestError\.response\?\.status===404/);
  assert.match(source,/تم تنظيف بطاقة العميل القديمة/);
  assert.match(source,/api\.get\(`\/customers\/\$\{customer\.id\}`/);
});
