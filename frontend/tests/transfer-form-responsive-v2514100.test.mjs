import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const css=readFileSync(new URL("../src/styles.css",import.meta.url),"utf8");
const customers=readFileSync(new URL("../src/screens/Customers.jsx",import.meta.url),"utf8");

assert.match(customers,/customer-action-focus-form customer-transfer-form/);
assert.match(customers,/customer-action-focus-page customer-transfer-focus-page/);
assert.match(css,/\.customer-transfer-form\{[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
assert.match(css,/@media\(max-width:1100px\)\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
assert.match(css,/@media\(max-width:640px\)\{[\s\S]*?grid-template-columns:minmax\(0,1fr\)/);
assert.match(css,/@media\(max-width:640px\)\{[\s\S]*?\.customer-transfer-form \.transfer-calculation-grid\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
assert.match(css,/@media\(max-width:375px\)\{[\s\S]*?\.customer-transfer-form \.transfer-calculation-grid\{[\s\S]*?grid-template-columns:minmax\(0,1fr\)/);
assert.match(css,/@media\(max-width:640px\)\{[\s\S]*?min-height:0;[\s\S]*?height:auto;[\s\S]*?padding:10px 11px!important/);
assert.match(css,/@media\(max-width:640px\)\{[\s\S]*?font-size:15px;[\s\S]*?font-size:22px/);
assert.match(css,/\.customer-transfer-form>\.provider-fee-section[\s\S]*?grid-column:1 \/ -1/);
assert.match(css,/\.customer-transfer-form \.transfer-calculation-grid\{[\s\S]*?auto-fit/);
assert.match(css,/\.customer-transfer-form \.currency-field-title,[\s\S]*?overflow-wrap:anywhere/);
assert.match(css,/\.customer-transfer-form>input,[\s\S]*?max-width:100%/);
assert.match(css,/padding-bottom:calc\(var\(--mobile-nav-height\) \+ 54px \+ var\(--app-safe-bottom\)\)!important/);

console.log("responsive add-transfer form checks passed");
