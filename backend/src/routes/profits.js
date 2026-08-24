"use strict";

function registerProfitRoutes(app, { auth, readStore, summarizeTransactionProfits, treasuryProfitForRange, addTransactionProfitToBucket, activeMovements, transactionFinancials, transactionFinancialView }) {
  app.get("/api/profits", auth, (req,res)=>{
    const s = readStore();
    const from = String(req.query.from || "");
    const to = String(req.query.to || "");
    const inRange = (iso) => {
      const d = String(iso || "").slice(0,10);
      return (!from || d >= from) && (!to || d <= to);
    };

    const transactions = s.transactions.filter((t)=>t&&!t.isDeleted&&t.status!=="CANCELLED" && inRange(t.transferDate||t.createdAt));
    const expenses = s.expenses.filter((e)=>e&&!e.isDeleted&&inRange(e.date || e.createdAt));
    const {exchangeProfit,transferFees,customerFees,providerFees,grossProfitBeforeProviderFees,grossProfit}=summarizeTransactionProfits(transactions);
    const totalExpenses = expenses.reduce((a,e)=>a+Number(e.cadAmount??e.amount??0),0);
    const treasuryFxProfit=treasuryProfitForRange(s,{from,to});
    const netProfit = grossProfit+treasuryFxProfit-totalExpenses;

    const byMonthMap = {};
    for (const t of transactions) {
      const month = String(t.transferDate||t.createdAt||"").slice(0,7);
      byMonthMap[month] ||= {month,exchangeProfit:0,transferFees:0,customerFees:0,providerFees:0,grossProfitBeforeProviderFees:0,grossProfit:0,treasuryFxProfit:0,expenses:0,netProfit:0};
      addTransactionProfitToBucket(byMonthMap[month],t);
    }
    for (const e of expenses) {
      const month = String(e.date || e.createdAt).slice(0,7);
      byMonthMap[month] ||= {month,exchangeProfit:0,transferFees:0,customerFees:0,providerFees:0,grossProfitBeforeProviderFees:0,grossProfit:0,treasuryFxProfit:0,expenses:0,netProfit:0};
      byMonthMap[month].expenses += Number(e.cadAmount??e.amount??0);
    }
    for(const movement of activeMovements(s)){
      if(movement.direction!=="OUT"||!inRange(movement.occurredAt||movement.createdAt))continue;
      const month=String(movement.occurredAt||movement.createdAt||"").slice(0,7);
      byMonthMap[month] ||= {month,exchangeProfit:0,transferFees:0,customerFees:0,providerFees:0,grossProfitBeforeProviderFees:0,grossProfit:0,treasuryFxProfit:0,expenses:0,netProfit:0};
      byMonthMap[month].treasuryFxProfit+=Number(movement.realizedFx||0);
    }
    const monthly = Object.values(byMonthMap).map((x)=>({...x,
      exchangeProfit:+x.exchangeProfit.toFixed(2),transferFees:+x.transferFees.toFixed(2),customerFees:+x.customerFees.toFixed(2),providerFees:+x.providerFees.toFixed(2),
      grossProfitBeforeProviderFees:+x.grossProfitBeforeProviderFees.toFixed(2),grossProfit:+x.grossProfit.toFixed(2),treasuryFxProfit:+x.treasuryFxProfit.toFixed(2),expenses:+x.expenses.toFixed(2),
      netProfit:+(x.grossProfit+x.treasuryFxProfit-x.expenses).toFixed(2)
    })).sort((a,b)=>b.month.localeCompare(a.month));

    res.json({from:from||null,to:to||null,transactionCount:transactions.length,exchangeProfit:+exchangeProfit.toFixed(2),transferFees:+transferFees.toFixed(2),customerFees:+customerFees.toFixed(2),
      providerFees:+providerFees.toFixed(2),grossProfitBeforeProviderFees:+grossProfitBeforeProviderFees.toFixed(2),grossProfit:+grossProfit.toFixed(2),treasuryFxProfit:+treasuryFxProfit.toFixed(2),
      expenses:+totalExpenses.toFixed(2),netProfit:+netProfit.toFixed(2),monthly,transactions:transactions.slice().reverse().map(item=>({...item,...transactionFinancialView(transactionFinancials(item))}))});
  });
}

module.exports={registerProfitRoutes};
