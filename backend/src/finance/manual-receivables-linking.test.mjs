import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {test} from "node:test";

const require=createRequire(import.meta.url);
const {partitionManualDebts}=require("./DebtLinking.js");
const {calculateReceivableSummary}=require("./ReceivableSummary.js");

test("manual receivables and payables are included symmetrically",()=>{
  const summary=calculateReceivableSummary({
    customerReceivable:100,
    companyReceivable:50,
    manualReceivable:25,
    customerPayable:20,
    companyPayable:10,
    manualPayable:5
  });
  assert.deepEqual({receivable:summary.receivable,payable:summary.payable,net:summary.net},{receivable:175,payable:35,net:140});
});

test("only direct identifiers exclude duplicates; legacy name matches stay included and flagged",()=>{
  const store={
    customers:[{id:"c1",name:"أحمد"}],
    partners:[{id:"p1",name:"شركة جاد",accountCurrency:"USD"}],
    transactions:[{id:"t1",number:"TRX-001",customerId:"c1"}],
    generalDebts:[
      {id:"independent",type:"RECEIVABLE",partyName:"جهة مستقلة",amount:100},
      {id:"customer-link",type:"RECEIVABLE",partyName:"قيد مرتبط",amount:40,customerId:"c1"},
      {id:"transfer-link",type:"RECEIVABLE",partyName:"قيد حوالة",amount:30,sourceRef:"TRANSFER:t1"},
      {id:"legacy-name",type:"RECEIVABLE",partyName:"أحمد",amount:20},
      {id:"manual-payable",type:"PAYABLE",partyName:"مورد مستقل",amount:50}
    ]
  };

  const result=partitionManualDebts(store);
  assert.deepEqual(result.included.map(item=>item.id),["independent","legacy-name","manual-payable"]);
  assert.deepEqual(result.linkedDuplicates.map(item=>item.id),["customer-link","transfer-link"]);
  assert.equal(result.reviewFlags.find(item=>item.debtId==="legacy-name")?.reviewStatus,"FLAGGED");
  assert.equal(result.reviewFlags.find(item=>item.debtId==="customer-link")?.reviewStatus,"LINKED_DUPLICATE");
});
