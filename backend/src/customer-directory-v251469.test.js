"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");

const root=path.resolve(__dirname,"../..");
const customers=fs.readFileSync(path.join(root,"frontend/src/screens/Customers.jsx"),"utf8");
const details=fs.readFileSync(path.join(root,"frontend/src/screens/CustomerDetails.jsx"),"utf8");
const toolbar=fs.readFileSync(path.join(root,"frontend/src/components/customers/CustomerToolbar.jsx"),"utf8");
const styles=fs.readFileSync(path.join(root,"frontend/src/styles.css"),"utf8");
const server=fs.readFileSync(path.join(root,"backend/src/server.js"),"utf8");
const repository=fs.readFileSync(path.join(root,"backend/src/repositories/PostgresEntityRepository.js"),"utf8");
const {customerMatchesSearch}=require("./customer-search");

assert(customers.includes("customer-directory-grid overdue-dark-scope"),"customer directory must use the overdue-customer grid design");
assert(customers.includes("overdue-customer-details expanded customer-directory-details"),"customer directory must keep overdue-style metric cards");
assert(customers.includes("customer.customerNumber||customer.identityNumber"),"customer number must be visible in the directory");
for(const preservedAction of ["open(customer.id)","resetCustomerAccount(customer)","setEditingCustomer({...customer})","deleteCustomer(customer)"]){
  assert(customers.includes(preservedAction),`customer action disappeared: ${preservedAction}`);
}

assert(toolbar.includes("بحث بالاسم أو رقم العميل أو رقم الهاتف"),"customer-number search must be explicit in the UI");
assert(server.includes("customerMatchesSearch"),"fallback customer search must use normalized matching");
assert(repository.includes("regexp_replace(COALESCE(c.phone,''),'[^0-9]','','g')"),"Postgres customer search must ignore phone formatting");
assert(customerMatchesSearch({phone:"+1 (519) 555-0100"},"١٥١٩٥٥٥"),"formatted phones must match Arabic search digits");
assert(customerMatchesSearch({customerNumber:"AB-00142"},"142"),"customer-number search must ignore formatting");

assert(details.includes('className="customer-statement-image-actions"'),"statement image buttons must share one compact row");
assert(details.includes('shareCustomerStatement("share")')&&details.includes('shareCustomerStatement("save")'),"statement share and save actions must both remain available");
assert(styles.includes("grid-template-columns:minmax(0,1fr) auto"),"save-image action must remain compact beside share-image action");

console.log("v25.14.69 customer directory and statement actions regression: OK");
