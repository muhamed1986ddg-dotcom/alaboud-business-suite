import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { transferFinancialPreview } from "../src/transferFinancialPreview.js";

const close=(actual,expected)=>assert(Math.abs(Number(actual)-Number(expected))<0.000001,`expected ${expected}, got ${actual}`);

test("Dahab/Jad fee is deducted from transfer profit but not from customer due",()=>{
  const result=transferFinancialPreview({
    amount:"100",
    currency:"USD",
    costRate:"1.40",
    finalRate:"1.50",
    feeMethod:"PAID",
    transferFee:"5",
    providerFeeCompany:"دهب",
    providerFeeAmount:"0.40",
    providerFeeCurrency:"USD",
  });
  close(result.exchangeProfit,10);
  close(result.customerFee,5);
  close(result.providerFeeRateCad,1.4);
  close(result.providerFeeCad,0.56);
  close(result.grossProfitBeforeProviderFee,15);
  close(result.netProfit,14.44);
  close(result.totalCustomerDue,155);
});

test("different provider fee currency uses explicit CAD rate",()=>{
  const result=transferFinancialPreview({
    amount:"100",currency:"USD",costRate:"1.40",finalRate:"1.50",feeMethod:"SPREAD",
    providerFeeAmount:"1",providerFeeCurrency:"EUR",providerFeeRateCad:"1.55"
  });
  close(result.providerFeeCad,1.55);
  close(result.netProfit,8.45);
});

test("transaction UI sends and displays provider fee fields",()=>{
  const frontendRoot=resolve(dirname(fileURLToPath(import.meta.url)),"..");
  const customers=readFileSync(resolve(frontendRoot,"src/screens/Customers.jsx"),"utf8");
  const transactions=readFileSync(resolve(frontendRoot,"src/screens/Transactions.jsx"),"utf8");
  const reports=readFileSync(resolve(frontendRoot,"src/screens/ReportsProfits.jsx"),"utf8");
  for(const field of ["providerFeeCompany","providerFeeAmount","providerFeeCurrency","providerFeeRateCad"]){
    assert(customers.includes(field),`Customers must include ${field}`);
    assert(transactions.includes(field),`Transactions must include ${field}`);
  }
  assert(customers.includes("صافي ربح الحوالة"));
  assert(transactions.includes("أجور الشركة المنفذة"));
  assert(reports.includes("أجور دهب/جاد والشركات"));
});
