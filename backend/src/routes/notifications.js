"use strict";

function registerNotificationRoutes(app,{
  auth,requirePermission,readStore,mutateDurable,safeNumber,audit,id,now,
  customerSummary,capitalCadAmount
}){
  app.get("/api/notification-settings", auth, (_req,res)=>{
    const store=readStore();
    res.json({
      overdueDays:Math.max(1,safeNumber(store.notificationSettings?.overdueDays,7)),
      lowCashLimit:Math.max(0,safeNumber(store.notificationSettings?.lowCashLimit,5000)),
      whatsappTemplate:String(store.notificationSettings?.whatsappTemplate||"")
    });
  });

  app.patch("/api/notification-settings", auth, requirePermission("admin.only"), async (req,res)=>{
    const updated=await mutateDurable((store)=>{
      store.notificationSettings ||= {};
      if(req.body?.overdueDays!==undefined){
        const value=Number(req.body.overdueDays);
        if(!Number.isFinite(value)||value<1||value>365)throw new Error("مدة التأخير يجب أن تكون بين 1 و365 يومًا");
        store.notificationSettings.overdueDays=Math.round(value);
      }
      if(req.body?.lowCashLimit!==undefined){
        const value=Number(req.body.lowCashLimit);
        if(!Number.isFinite(value)||value<0)throw new Error("حد السيولة غير صحيح");
        store.notificationSettings.lowCashLimit=value;
      }
      if(req.body?.whatsappTemplate!==undefined){
        store.notificationSettings.whatsappTemplate=String(req.body.whatsappTemplate||"");
      }
      audit(store,req.user.id,"UPDATE","NOTIFICATION_SETTINGS","global",store.notificationSettings);
      return store.notificationSettings;
    });
    res.json(updated);
  });

  app.get("/api/notifications", auth, (_req,res)=>{
    const store=readStore();
    const customers=(Array.isArray(store.customers)?store.customers:[])
      .map(customer=>customerSummary(store,customer));
    const overdue=customers
      .filter(customer=>customer.overdue)
      .sort((a,b)=>b.overdueDays-a.overdueDays);

    const capital=(Array.isArray(store.capitalMovements)?store.capitalMovements:[])
      .reduce((sum,item)=>sum+(item.type==="IN"?capitalCadAmount(store,item):-capitalCadAmount(store,item)),0);
    const lowCashLimit=Math.max(0,safeNumber(store.notificationSettings?.lowCashLimit,5000));

    const notifications=[];
    for(const customer of overdue){
      const severity=customer.overdueDays>=60?"critical":customer.overdueDays>=30?"danger":customer.overdueDays>=15?"warning":"notice";
      notifications.push({
        id:`overdue-${customer.id}`,
        type:"OVERDUE_CUSTOMER",
        severity,
        title:`تأخر دفع: ${customer.name}`,
        message:`متأخر ${customer.overdueDays} يوم — الرصيد ${customer.finalBalance.toFixed(2)} CAD`,
        customerId:customer.id,
        phone:customer.phone||"",
        amount:customer.finalBalance,
        days:customer.overdueDays
      });
    }

    if(capital<lowCashLimit){
      notifications.push({
        id:"low-capital",
        type:"LOW_CAPITAL",
        severity:"danger",
        title:"تنبيه انخفاض السيولة",
        message:`صافي حركة رأس المال ${capital.toFixed(2)} CAD أقل من الحد ${lowCashLimit.toFixed(2)} CAD`
      });
    }

    const incomplete=(Array.isArray(store.transactions)?store.transactions:[])
      .filter(item=>item&&!item.isDeleted&&item.status&&item.status!=="COMPLETED"&&item.status!=="CANCELLED");
    if(incomplete.length){
      notifications.push({
        id:"incomplete-transfers",
        type:"INCOMPLETE_TRANSFERS",
        severity:"warning",
        title:"حوالات تحتاج مراجعة",
        message:`يوجد ${incomplete.length} حوالة غير مكتملة`
      });
    }

    res.json({
      count:notifications.length,
      overdueCount:overdue.length,
      overdueTotal:+overdue.reduce((sum,item)=>sum+safeNumber(item.finalBalance),0).toFixed(2),
      notifications
    });
  });

  app.post("/api/notification-actions", auth, async (req,res)=>{
    const {customerId,action="CONTACTED",notes="",promiseDate=null,expectedAmount=null}=req.body||{};
    const saved=await mutateDurable((store)=>{
      store.notificationActions ||= [];
      const item={
        id:id(),
        customerId:customerId||null,
        action,
        notes:String(notes||""),
        promiseDate:promiseDate?String(promiseDate).slice(0,10):null,
        expectedAmount:expectedAmount===null||expectedAmount===""?null:+safeNumber(expectedAmount).toFixed(2),
        createdAt:now(),
        createdBy:req.user.id
      };
      store.notificationActions.push(item);
      audit(store,req.user.id,"CREATE","NOTIFICATION_ACTION",item.id,item);
      return item;
    });
    res.status(201).json(saved);
  });

  app.get("/api/notification-actions/:customerId", auth, (req,res)=>{
    const store=readStore();
    const rows=(Array.isArray(store.notificationActions)?store.notificationActions:[])
      .filter(item=>item?.customerId===req.params.customerId)
      .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
    res.json(rows);
  });

  app.get("/api/customer-alerts", auth, (_req,res)=>{
    const store = readStore();
    const payments=Array.isArray(store.payments)?store.payments:[];
    const actions=Array.isArray(store.notificationActions)?store.notificationActions:[];
    const today=new Date().toISOString().slice(0,10);

    const latestActionByCustomer=new Map();
    for(const action of actions){
      if(!action?.customerId)continue;
      const current=latestActionByCustomer.get(action.customerId);
      if(!current||String(action.createdAt)>String(current.createdAt)){
        latestActionByCustomer.set(action.customerId,action);
      }
    }

    const rows = (Array.isArray(store.customers) ? store.customers : [])
      .map((customer)=>{
        const summary=customerSummary(store,customer);
        const customerPayments=payments
          .filter(payment=>payment&&!payment.isDeleted)
          .filter(payment=>{
            const transaction=(Array.isArray(store.transactions)?store.transactions:[])
              .find(item=>item?.id===payment.transactionId);
            return transaction?.customerId===customer.id;
          })
          .sort((a,b)=>String(b.paymentDate||b.createdAt).localeCompare(String(a.paymentDate||a.createdAt)));
        const latestAction=latestActionByCustomer.get(customer.id)||null;
        return {
          ...summary,
          lastPaymentDate:customerPayments[0]
            ? String(customerPayments[0].paymentDate||customerPayments[0].createdAt).slice(0,10)
            : null,
          latestAction,
          promiseDate:latestAction?.promiseDate||null,
          expectedAmount:latestAction?.expectedAmount??null,
          contacted:latestAction?.action==="CONTACTED"||latestAction?.action==="PROMISE_TO_PAY"
        };
      })
      .filter((customer)=>customer.overdue)
      .sort((a,b)=>b.overdueDays-a.overdueDays);

    const expectedToday=rows.reduce((sum,item)=>{
      if(item.promiseDate!==today)return sum;
      return sum+safeNumber(item.expectedAmount,item.finalBalance);
    },0);

    const largestBalance=rows.reduce((max,item)=>safeNumber(item.finalBalance)>safeNumber(max?.finalBalance)?item:max,null);
    const oldest=rows[0]||null;

    res.json({
      count:rows.length,
      totalOverdue:+rows.reduce((sum,item)=>sum+safeNumber(item.finalBalance),0).toFixed(2),
      largestOverdueBalance:largestBalance?+safeNumber(largestBalance.finalBalance).toFixed(2):0,
      largestOverdueCustomer:largestBalance?.name||null,
      oldestCustomer:oldest?.name||null,
      oldestDays:oldest?.overdueDays||0,
      expectedToday:+expectedToday.toFixed(2),
      rows
    });
  });
}

module.exports={registerNotificationRoutes};
