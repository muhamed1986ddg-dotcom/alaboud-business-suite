import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
import path from "node:path";
import {test} from "node:test";
import {fileURLToPath} from "node:url";

const require=createRequire(import.meta.url);
const {customerReceiptsTotal}=require("./FinancialEngine.js");
const server=fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),"..","server.js"),"utf8");

test("monthly report uses the canonical deduplicated receipt total",()=>{
  assert.match(server,/const paidTotal=customerReceiptsTotal\(payments\);/);
});

test("monthly receipts count the customer receipt once instead of adding its allocations again",()=>{
  const payments=[
    {id:"receipt",customerId:"c1",recordType:"CUSTOMER_PAYMENT_RECEIPT",paymentBatchId:"batch-1",originalAmount:100,amount:100},
    {id:"allocation-1",customerId:"c1",recordType:"PAYMENT_ALLOCATION",paymentBatchId:"batch-1",transactionId:"t1",amount:60},
    {id:"allocation-2",customerId:"c1",recordType:"PAYMENT_ALLOCATION",paymentBatchId:"batch-1",transactionId:"t2",amount:40},
    {id:"standalone",customerId:"c2",transactionId:"t3",amount:25}
  ];
  assert.equal(customerReceiptsTotal(payments),125);
});

test("legacy allocation batches use originalAmount once when it is repeated on child rows",()=>{
  const payments=[
    {id:"a1",customerId:"c1",allocationMode:"CUSTOMER_AUTO",paymentBatchId:"legacy",originalAmount:100,amount:60},
    {id:"a2",customerId:"c1",allocationMode:"CUSTOMER_AUTO",paymentBatchId:"legacy",originalAmount:100,amount:40}
  ];
  assert.equal(customerReceiptsTotal(payments),100);
});
