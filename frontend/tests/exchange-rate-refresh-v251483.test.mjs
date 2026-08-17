import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const here=path.dirname(fileURLToPath(import.meta.url));
const source=fs.readFileSync(path.join(here,"../src/screens/ExchangeRates.jsx"),"utf8");
test("exchange-rate page does not start an hourly refresh per browser tab",()=>{
  assert.match(source,/useEffect\(\(\)=>\{load\(\)\},\[\]\);/);
  assert.doesNotMatch(source,/setInterval\([^\n]*refresh/);
});
