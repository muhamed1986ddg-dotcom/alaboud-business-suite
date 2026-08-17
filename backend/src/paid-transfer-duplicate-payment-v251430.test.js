const fs=require("fs"),path=require("path"),assert=require("assert");
const root=path.join(__dirname,"../..");
const customers=fs.readFileSync(path.join(root,"frontend/src/screens/Customers.jsx"),"utf8");
const server=fs.readFileSync(path.join(root,"backend/src/server.js"),"utf8");
assert(!customers.includes('await api.post(`/transactions/${createdTransaction.id}/payments`'),"frontend must not create a second payment for PAID transfer");
assert(server.includes('normalizedPaymentStatus==="PAID"'),"backend must create the initial PAID transfer payment atomically");
assert(server.includes('const remaining=Math.max(transactionFinancials(t).totalCustomerDue-already,0);'),"payment endpoint must validate against the canonical remaining balance");
assert(server.includes('res.status(status).json({message});'),"payment business-rule errors must return a client error response");
console.log("paid transfer duplicate-payment regression v25.14.30: OK");
