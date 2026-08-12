"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");

const root=path.resolve(__dirname,"../..");
const details=fs.readFileSync(path.join(root,"frontend/src/screens/CustomerDetails.jsx"),"utf8");
const styles=fs.readFileSync(path.join(root,"frontend/src/styles.css"),"utf8");

assert(details.includes('className="card no-print form customer-account-actions"'),"customer-account toolbar class is required");
assert(details.includes('role="toolbar" aria-label="إجراءات حساب العميل"'),"customer actions must remain an accessible toolbar");
for(const preservedAction of [
  "onClick={back}",
  "onClick={()=>onStatement(id)}",
  "onClick={()=>onAddTransfer?.(customer)}",
  "onClick={shareCustomerStatementText}",
  'shareCustomerStatement("share")',
  'shareCustomerStatement("save")'
]) assert(details.includes(preservedAction),`customer toolbar action disappeared: ${preservedAction}`);

assert(styles.includes("/* v25.14.70 — keep every customer-account action compact */"),"compact toolbar styles are missing");
assert(styles.includes(".customer-details-page>.customer-account-actions{"),"customer toolbar must have an isolated layout rule");
assert(styles.includes("display:flex!important;\n  flex-wrap:wrap!important;"),"customer toolbar must wrap compact actions");
assert(styles.includes(".customer-details-page>.customer-account-actions>.customer-statement-image-actions{"),"statement image actions must join the compact toolbar");
assert(styles.includes("width:auto!important;\n  min-width:0!important;\n  min-height:38px!important;"),"desktop customer actions must not stretch full width");
assert(styles.includes("min-height:36px!important;\n    padding:6px 8px!important;\n    font-size:.72rem!important;"),"mobile customer actions must remain compact");

console.log("v25.14.70 compact customer statement toolbar regression: OK");
