"use strict";

function registerMonthlyAccountMessagesJob(app,{crypto,readRootStore,readStore,runWithTenant,mutateDurable,id,now,customerSummary,inventoryLocalDate,isScheduledRunDue,executeMonthlyAccountMessages,sendWhatsApp,isServiceReady}){
  const run=async({triggerType="MONTHLY_ACCOUNT",companyId=null,branchId=null,force=false}={})=>{
    if(!isServiceReady())return {results:[],eligibleTenantCount:0};
    const root=readRootStore(),results=[];let eligibleTenantCount=0;
    const branches=(Array.isArray(root.branches)?root.branches:[]).filter(branch=>branch&&branch.active!==false&&branch.companyId&&(!companyId||branch.companyId===companyId)&&(!branchId||branch.id===branchId));
    for(const branch of branches)await runWithTenant(branch.companyId,branch.id,async()=>{
      const store=readStore(),local=inventoryLocalDate(store.notificationSettings||{});
      if(!force&&!isScheduledRunDue(store.notificationSettings||{},local))return;
      eligibleTenantCount+=1;
      results.push(...await executeMonthlyAccountMessages({store,companyId:branch.companyId,triggerType,force:true,local,customerSummary,mutateDurable,id,now,sendWhatsApp}));
    });
    return {results,eligibleTenantCount};
  };
  app.post("/api/jobs/monthly-account-messages",async(req,res)=>{
    const configured=String(process.env.MONTHLY_ACCOUNT_MESSAGES_JOB_SECRET||"").trim(),supplied=String(req.headers["x-alaboud-job-secret"]||"").trim();
    if(!configured||!supplied||configured.length!==supplied.length||!crypto.timingSafeEqual(Buffer.from(configured),Buffer.from(supplied)))return res.status(401).json({message:"Unauthorized scheduled job"});
    const {results,eligibleTenantCount}=await run({triggerType:"MONTHLY_ACCOUNT"});
    if(!eligibleTenantCount)return res.json({skipped:true,reason:"NOT_SCHEDULED_TIME",sent:0,failed:0,skippedDuplicates:0});
    res.json({ok:true,sent:results.filter(item=>item.status==="SENT").length,failed:results.filter(item=>item.status==="FAILED").length,skippedDuplicates:results.filter(item=>item.status==="SKIPPED_DUPLICATE").length});
  });
  return run;
}

module.exports={registerMonthlyAccountMessagesJob};
