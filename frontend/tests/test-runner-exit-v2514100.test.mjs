import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const source=readFileSync(resolve(dirname(fileURLToPath(import.meta.url)),"run-all.mjs"),"utf8");
assert.match(source,/if\s*\(failures\)[\s\S]*process\.exit\(1\)/,"frontend runner must fail the process when any child test fails");
assert.match(source,/result\.status\s*!==\s*0/,"frontend runner must count non-zero child exits");
console.log("frontend test runner non-zero exit regression: OK");
