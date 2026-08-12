"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");

const root=path.resolve(__dirname,"../..");
const customers=fs.readFileSync(path.join(root,"frontend/src/screens/Customers.jsx"),"utf8");
const styles=fs.readFileSync(path.join(root,"frontend/src/styles.css"),"utf8");

const actionsStart=customers.indexOf('className="customer-card-actions overdue-actions customer-directory-actions"');
const actionsEnd=customers.indexOf("</article>",actionsStart);
assert(actionsStart>=0&&actionsEnd>actionsStart,"customer directory action group is missing");
const actions=customers.slice(actionsStart,actionsEnd);
const openIndex=actions.indexOf('className="customer-open-account-button"');
const resetIndex=actions.indexOf('className="customer-reset-button"');
const editIndex=actions.indexOf('className="customer-edit-button"');
const deleteIndex=actions.indexOf('className="customer-delete-button"');
assert(openIndex>=0&&openIndex<resetIndex&&resetIndex<editIndex&&editIndex<deleteIndex,"customer directory actions must stay ordered open, reset, edit, delete");
assert(actions.includes("resetCustomerAccount(customer)"),"account reset action must remain wired");

const marker="/* v25.14.71 — keep reset beside open account in the customer directory */";
const markerIndex=styles.lastIndexOf(marker);
assert(markerIndex>=0,"v25.14.71 reset layout override is missing");
assert(styles.slice(markerIndex).includes(".customer-directory-actions .customer-reset-button{\n  grid-column:auto!important;\n}"),"reset button must use one grid cell beside open account");
assert(markerIndex>styles.lastIndexOf(".customer-reset-button{grid-column:1/-1!important}"),"compact reset override must follow the legacy full-row rule");
assert(styles.includes(".customer-directory-actions{grid-template-columns:repeat(2,minmax(0,1fr))!important}"),"customer directory must keep a two-column mobile action grid");
assert(styles.includes(".customer-directory-actions button{width:100%;min-height:40px;font-size:.75rem}"),"customer directory buttons must keep the same compact size");

console.log("v25.14.71 customer directory action alignment regression: OK");
