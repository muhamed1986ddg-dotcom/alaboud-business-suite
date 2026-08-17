import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {test} from "node:test";

const require=createRequire(import.meta.url);
const {customerBalanceTotals}=require("./FinancialEngine.js");
const {calculateInventoryPosition}=require("./MonthlyInventoryFinancials.js");
const {calculateCapitalOverviewFinancials}=require("./CapitalOverviewFinancials.js");

function calculateOverview(store){
  const customerBalances=customerBalanceTotals(store);
  const position=calculateInventoryPosition(store,{
    customerBalances,
    toCad:(amount)=>amount
  });
  const totalReceivables=(
    position.partnerAssets
    +position.customerReceivables
    +position.companyReceivables
    +position.manualReceivables
  );
  const totalPayables=(
    position.customerPayables
    +position.companyPayables
    +position.manualPayables
  );
  return calculateCapitalOverviewFinancials({totalReceivables,totalPayables});
}

test("capital overview recalculates customer and company balances after their values change",()=>{
  const store={
    customers:[{id:"customer-1",oldBalance:100,oldBalanceType:"RECEIVABLE"}],
    transactions:[],
    payments:[],
    partners:[{id:"company-1",name:"Test Company",accountCurrency:"CAD"}],
    partnerTransactions:[{id:"company-debt-1",partnerId:"company-1",type:"RECEIVABLE",amount:200,currency:"CAD"}],
    partnerPayments:[],
    generalDebts:[],
    generalDebtPayments:[]
  };

  const before=calculateOverview(store);
  assert.equal(before.totalReceivables,300);
  assert.equal(before.comprehensiveNetCapital,300);

  store.customers[0].oldBalance=150;
  store.partnerTransactions[0].amount=300;

  const after=calculateOverview(store);
  assert.equal(after.totalReceivables,450);
  assert.equal(after.comprehensiveNetCapital,450);
  assert.notEqual(after.comprehensiveNetCapital,before.comprehensiveNetCapital);
});
