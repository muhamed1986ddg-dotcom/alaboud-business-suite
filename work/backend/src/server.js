const express = require("express");
const helmet = require("helmet");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");
const { readStore, mutate, id, now, runWithTenant, replaceTenantData, initStore } = require("./store");

const PORT = Number(process.env.PORT || 5000);
const JWT_SECRET = process.env.JWT_SECRET || "LOCAL_TRIAL_CHANGE_ME_6_0";
const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));

app.use("/api",(_req,res,next)=>{
  res.setHeader("Cache-Control","no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma","no-cache");
  res.setHeader("Expires","0");
  res.setHeader("Surrogate-Control","no-store");
  next();
});

function seedAdmin(){
  mutate((store)=>{
    let company=store.companies.find(item=>item.slug==="alaboud-primary");
    if(!company){
      company={id:id(),name:"شركة العبود التجارية",slug:"alaboud-primary",phone:"",active:true,createdAt:now()};
      store.companies.push(company);
    }

    let admin=store.users.find(user=>user.email==="admin@alaboud.local");
    if(!admin){
      admin={id:id(),companyId:company.id,name:"System Administrator",email:"admin@alaboud.local",passwordHash:bcrypt.hashSync("Admin123!",12),role:"ADMIN",active:true,createdAt:now()};
      store.users.push(admin);
    }else if(!admin.companyId){
      admin.companyId=company.id;
    }

    const tenantArrays=["customers","transactions","payments","expenses","capitalMovements","exchangeRates","generalDebts","generalDebtPayments","partners","partnerTransactions","partnerPayments","notificationActions","auditLogs"];
    for(const key of tenantArrays){
      for(const item of store[key]||[]){
        if(item&&!item.companyId)item.companyId=company.id;
      }
    }
    if(!store.companySettings[company.id]){
      store.companySettings[company.id]={...(store.notificationSettings||{}),overdueDays:store.notificationSettings?.overdueDays||7,lowCashLimit:store.notificationSettings?.lowCashLimit||5000,whatsappTemplate:store.notificationSettings?.whatsappTemplate||""};
    }
  });
}

function auth(req,res,next){
  const h=req.headers.authorization||"";
  const token=h.startsWith("Bearer ")?h.slice(7):"";
  try{
    req.user=jwt.verify(token,JWT_SECRET);
    if(!req.user.companyId)return res.status(401).json({message:"Company account required"});
    runWithTenant(req.user.companyId,()=>next());
  }catch{
    res.status(401).json({message:"Authentication required"});
  }
}

function audit(store, userId, action, entityType, entityId, details = {}) {
  store.auditLogs.push({ id: id(), userId, action, entityType, entityId, details, createdAt: now() });
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function customerSummary(store, c) {
  const overdueThreshold = Math.max(1, safeNumber(store.notificationSettings?.overdueDays, 7));
  const transactions = (Array.isArray(store.transactions) ? store.transactions : [])
    .filter((item) => item && !item.isDeleted);
  const payments = (Array.isArray(store.payments) ? store.payments : [])
    .filter((item) => item && !item.isDeleted);

  const txs = transactions.filter(
    (transaction) => transaction.customerId === c.id && transaction.status !== "CANCELLED"
  );

  const paymentByTransaction = new Map();
  for (const payment of payments) {
    paymentByTransaction.set(
      payment.transactionId,
      safeNumber(paymentByTransaction.get(payment.transactionId)) + safeNumber(payment.amount)
    );
  }

  const oldBalance = Math.max(safeNumber(c.oldBalance), 0);
  const oldBalancePaid = Math.min(Math.max(safeNumber(c.oldBalancePaid), 0), oldBalance);

  let total = oldBalance;
  let paid = oldBalancePaid;
  let oldestUnpaidDate = "";
  let overdueTransactions = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const transaction of txs) {
    const due = safeNumber(transaction.totalCustomerDue, safeNumber(transaction.amount));
    const transactionPaid = safeNumber(paymentByTransaction.get(transaction.id));
    const remaining = Math.max(due - transactionPaid, 0);
    total += due;
    paid += transactionPaid;

    if (remaining > 0) {
      const dateText = String(transaction.transferDate || transaction.createdAt || "").slice(0, 10);
      const transactionDate = new Date(`${dateText}T00:00:00`);
      if (!Number.isNaN(transactionDate.getTime())) {
        const ageDays = Math.floor((today - transactionDate) / 86400000);
        if (ageDays > overdueThreshold) overdueTransactions += 1;
        if (!oldestUnpaidDate || dateText < oldestUnpaidDate) oldestUnpaidDate = dateText;
      }
    }
  }

  const outstanding = Math.max(total - paid, 0);
  let overdueDays = 0;
  if (oldestUnpaidDate) {
    const oldestDate = new Date(`${oldestUnpaidDate}T00:00:00`);
    overdueDays = Math.max(0, Math.floor((today - oldestDate) / 86400000));
  }

  return {
    ...c,
    name: String(c?.name || "عميل بدون اسم"),
    oldBalance:+oldBalance.toFixed(2),
    oldBalancePaid:+oldBalancePaid.toFixed(2),
    oldBalanceRemaining:+Math.max(oldBalance-oldBalancePaid,0).toFixed(2),
    totalTransactions: +total.toFixed(2),
    totalPaid: +paid.toFixed(2),
    finalBalance: +outstanding.toFixed(2),
    overdue: outstanding > 0 && overdueDays > overdueThreshold,
    overdueThreshold,
    overdueDays,
    overdueTransactions,
    oldestUnpaidDate: oldestUnpaidDate || null,
  };
}

app.get("/api/health", (_req,res)=>res.json({status:"ok",version:"16.0.14",channel:"enterprise",cloud:true}));
app.get("/api/settings/backup",auth,(req,res)=>{const s=readStore();res.json({format:"alaboud-business-suite-backup",version:"16.0.14",createdAt:now(),...Object.fromEntries(["customers","transactions","payments","expenses","capitalMovements","exchangeRates","generalDebts","generalDebtPayments","partners","partnerTransactions","partnerPayments","notificationActions","auditLogs"].map(k=>[k,[...s[k]]])),notificationSettings:{...s.notificationSettings}})});
app.post("/api/settings/restore",auth,(req,res)=>{if(req.user.role!=="ADMIN")return res.status(403).json({message:"للمسؤول فقط"});if(req.body?.format!=="alaboud-business-suite-backup")return res.status(400).json({message:"ملف غير صالح"});replaceTenantData(req.user.companyId,req.body);res.json({message:"تمت الاستعادة بنجاح"})});
app.post("/api/auth/login",(req,res)=>{
  const {email,password}=req.body||{};
  const store=readStore();
  const user=store.users.find(u=>u.email.toLowerCase()===String(email||"").toLowerCase()&&u.active);
  if(!user||!bcrypt.compareSync(String(password||""),user.passwordHash)){
    return res.status(401).json({message:"Invalid credentials"});
  }
  const company=store.companies.find(item=>item.id===user.companyId&&item.active);
  if(!company)return res.status(403).json({message:"Company account is inactive"});
  const token=jwt.sign({id:user.id,name:user.name,role:user.role,companyId:user.companyId},JWT_SECRET,{expiresIn:"30d"});
  res.json({token,user:{id:user.id,name:user.name,email:user.email,role:user.role,companyId:user.companyId,companyName:company.name}});
});

app.get("/api/auth/session",auth,(req,res)=>{
  const store=readStore();
  const user=store.users.find(item=>item.id===req.user.id&&item.active);
  const company=store.companies.find(item=>item.id===req.user.companyId&&item.active);

  if(!user||!company){
    return res.status(401).json({message:"الجلسة غير صالحة، يرجى تسجيل الدخول مجددًا"});
  }

  res.json({
    version:"16.0.7",
    user:{
      id:user.id,
      name:user.name,
      email:user.email,
      role:user.role,
      companyId:company.id,
      companyName:company.name
    },
    liveData:{
      customers:(store.customers||[]).filter(item=>!item.isDeleted).length,
      transactions:(store.transactions||[]).filter(item=>!item.isDeleted).length,
      payments:(store.payments||[]).filter(item=>!item.isDeleted).length
    }
  });
});

app.post("/api/auth/register-company",(req,res)=>{
  const ownerName=String(req.body?.ownerName||"").trim();
  const companyName=String(req.body?.companyName||"").trim();
  const email=String(req.body?.email||"").trim().toLowerCase();
  const phone=String(req.body?.phone||"").trim();
  const password=String(req.body?.password||"");
  if(!ownerName||!companyName||!email.includes("@")){
    return res.status(400).json({message:"الاسم واسم الشركة والبريد الإلكتروني مطلوبة"});
  }
  if(password.length<8)return res.status(400).json({message:"كلمة المرور يجب أن تكون 8 أحرف على الأقل"});

  try{
    const result=mutate(store=>{
      if(store.users.some(user=>String(user.email||"").toLowerCase()===email))throw new Error("البريد الإلكتروني مستخدم مسبقًا");
      const company={id:id(),name:companyName,phone,active:true,createdAt:now()};
      const user={id:id(),companyId:company.id,name:ownerName,email,passwordHash:bcrypt.hashSync(password,12),role:"ADMIN",active:true,createdAt:now()};
      store.companies.push(company);
      store.users.push(user);
      store.companySettings[company.id]={overdueDays:7,lowCashLimit:5000,whatsappTemplate:""};
      return {company,user};
    });
    const token=jwt.sign({id:result.user.id,name:result.user.name,role:result.user.role,companyId:result.company.id},JWT_SECRET,{expiresIn:"30d"});
    res.status(201).json({token,user:{id:result.user.id,name:result.user.name,email:result.user.email,role:result.user.role,companyId:result.company.id,companyName:result.company.name}});
  }catch(error){
    res.status(400).json({message:error.message||"تعذر إنشاء حساب الشركة"});
  }
});

app.post("/api/auth/change-password", auth, (req,res)=>{
  const currentPassword=String(req.body?.currentPassword||"");
  const newPassword=String(req.body?.newPassword||"");
  if(newPassword.length<8){
    return res.status(400).json({message:"كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل"});
  }

  try{
    mutate((store)=>{
      const user=store.users.find(item=>item.id===req.user.id&&item.active);
      if(!user)throw new Error("الحساب غير موجود");
      if(!bcrypt.compareSync(currentPassword,user.passwordHash)){
        throw new Error("كلمة المرور الحالية غير صحيحة");
      }
      user.passwordHash=bcrypt.hashSync(newPassword,12);
      user.updatedAt=now();
      audit(store,req.user.id,"UPDATE","USER_PASSWORD",user.id,{});
    });
    res.json({message:"تم تغيير كلمة المرور بنجاح"});
  }catch(error){
    res.status(400).json({message:error.message||"تعذر تغيير كلمة المرور"});
  }
});

app.get("/api/company-profile", auth, (req,res)=>{
  const store=readStore();
  const company=store.companies.find(item=>item.id===req.user.companyId);
  if(!company)return res.status(404).json({message:"الشركة غير موجودة"});
  res.json({id:company.id,name:company.name,phone:company.phone||"",logoDataUrl:company.logoDataUrl||""});
});

app.patch("/api/company-profile", auth, (req,res)=>{
  if(req.user.role!=="ADMIN")return res.status(403).json({message:"تعديل هوية الشركة متاح للمسؤول الكامل فقط"});
  const name=String(req.body?.name||"").trim();
  const phone=String(req.body?.phone||"").trim();
  const logoDataUrl=String(req.body?.logoDataUrl||"");
  if(!name)return res.status(400).json({message:"اسم الشركة مطلوب"});
  if(logoDataUrl && !/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(logoDataUrl)){
    return res.status(400).json({message:"صيغة الشعار غير مدعومة"});
  }
  if(logoDataUrl.length>1500000)return res.status(400).json({message:"حجم الشعار كبير جدًا"});
  const company=mutate(store=>{
    const item=store.companies.find(company=>company.id===req.user.companyId);
    if(!item)throw new Error("الشركة غير موجودة");
    item.name=name; item.phone=phone; item.logoDataUrl=logoDataUrl; item.updatedAt=now();
    return {id:item.id,name:item.name,phone:item.phone||"",logoDataUrl:item.logoDataUrl||""};
  });
  res.json(company);
});

app.post("/api/users", auth, (req,res)=>{
  if(req.user.role!=="ADMIN"){
    return res.status(403).json({message:"إنشاء الحسابات متاح للمدير فقط"});
  }

  const name=String(req.body?.name||"").trim();
  const email=String(req.body?.email||"").trim().toLowerCase();
  const password=String(req.body?.password||"");
  const role=["ADMIN","MANAGER","USER"].includes(String(req.body?.role||"").toUpperCase())
    ? String(req.body.role).toUpperCase()
    : "USER";

  if(!name||!email||!email.includes("@")){
    return res.status(400).json({message:"الاسم والبريد الإلكتروني مطلوبان"});
  }
  if(password.length<8){
    return res.status(400).json({message:"كلمة المرور يجب أن تكون 8 أحرف على الأقل"});
  }

  try{
    const created=mutate((store)=>{
      if(store.users.some(item=>String(item.email||"").toLowerCase()===email)){
        throw new Error("البريد الإلكتروني مستخدم مسبقًا");
      }
      const user={
        id:id(),
        name,
        email,
        passwordHash:bcrypt.hashSync(password,12),
        role,
        active:true,
        createdAt:now()
      };
      store.users.push(user);
      audit(store,req.user.id,"CREATE","USER",user.id,{name,email,role});
      return {id:user.id,name:user.name,email:user.email,role:user.role,active:user.active};
    });
    res.status(201).json(created);
  }catch(error){
    res.status(400).json({message:error.message||"تعذر إنشاء الحساب"});
  }
});


app.get("/api/dashboard", auth, (_req,res)=>{
  const s = readStore();
  const today = new Date().toISOString().slice(0,10);
  const todayTx = s.transactions.filter((t)=>t.createdAt.slice(0,10)===today && t.status!=="CANCELLED");
  const todayExpenses = s.expenses.filter((e)=>e.date===today).reduce((a,e)=>a+Number(e.amount),0);
  const totalProfit = todayTx.reduce((a,t)=>a+Number(t.totalProfit||0),0)-todayExpenses;
  const receivables = s.customers.reduce((a,c)=>a+customerSummary(s,c).finalBalance,0);
  const capital = s.capitalMovements.reduce((a,m)=>a+(m.type==="IN"?Number(m.amount):-Number(m.amount)),0);
  res.json({customers:s.customers.length,todayTransactions:todayTx.length,todayProfit:+totalProfit.toFixed(2),receivables:+receivables.toFixed(2),capital:+capital.toFixed(2),recent:todayTx.slice(-8).reverse()});
});



app.get("/api/notification-settings", auth, (_req,res)=>{
  const store=readStore();
  res.json({
    overdueDays:Math.max(1,safeNumber(store.notificationSettings?.overdueDays,7)),
    lowCashLimit:Math.max(0,safeNumber(store.notificationSettings?.lowCashLimit,5000)),
    whatsappTemplate:String(store.notificationSettings?.whatsappTemplate||"")
  });
});

app.patch("/api/notification-settings", auth, (req,res)=>{
  const updated=mutate((store)=>{
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
    .reduce((sum,item)=>sum+(item.type==="IN"?safeNumber(item.amount):-safeNumber(item.amount)),0);
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

app.post("/api/notification-actions", auth, (req,res)=>{
  const {customerId,action="CONTACTED",notes="",promiseDate=null,expectedAmount=null}=req.body||{};
  const saved=mutate((store)=>{
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

app.get("/api/capital-overview", auth, (req,res)=>{
  const store=readStore();
  const requestedMonth=String(req.query.month||new Date().toISOString().slice(0,7));
  const transactions=(Array.isArray(store.transactions)?store.transactions:[])
    .filter(item=>item&&!item.isDeleted&&item.status!=="CANCELLED");
  const capitalMovements=Array.isArray(store.capitalMovements)?store.capitalMovements:[];
  const expenses=Array.isArray(store.expenses)?store.expenses:[];
  const customers=Array.isArray(store.customers)?store.customers:[];
  const debts=Array.isArray(store.generalDebts)?store.generalDebts:[];
  const debtPayments=Array.isArray(store.generalDebtPayments)?store.generalDebtPayments:[];

  const capitalBalance=capitalMovements.reduce(
    (sum,item)=>sum+(item.type==="IN"?safeNumber(item.amount):-safeNumber(item.amount)),0
  );

  const monthTransactions=transactions.filter(item=>
    String(item.transferDate||item.createdAt||"").slice(0,7)===requestedMonth
  );

  const monthlyTransferValue=monthTransactions.reduce(
    (sum,item)=>sum+safeNumber(item.amount),0
  );
  const monthlyProfit=monthTransactions.reduce(
    (sum,item)=>sum+safeNumber(item.totalProfit),0
  );
  const monthlyExpenses=expenses
    .filter(item=>String(item.date||item.createdAt||"").slice(0,7)===requestedMonth)
    .reduce((sum,item)=>sum+safeNumber(item.amount),0);

  const receivables=customers.reduce(
    (sum,customer)=>sum+safeNumber(customerSummary(store,customer).finalBalance),0
  );

  const debtPaidById=new Map();
  for(const payment of debtPayments){
    debtPaidById.set(payment.debtId,safeNumber(debtPaidById.get(payment.debtId))+safeNumber(payment.amount));
  }
  let generalReceivable=0;
  let generalPayable=0;
  for(const debt of debts){
    const remaining=Math.max(safeNumber(debt.amount)-safeNumber(debtPaidById.get(debt.id)),0);
    if(debt.type==="RECEIVABLE")generalReceivable+=remaining;
    if(debt.type==="PAYABLE")generalPayable+=remaining;
  }

  const totalCapital=capitalBalance+monthlyProfit-monthlyExpenses+receivables+generalReceivable-generalPayable;
  const turnoverBase=Math.abs(capitalBalance)>0?Math.abs(capitalBalance):Math.abs(totalCapital);
  const turnoverRate=turnoverBase>0?monthlyTransferValue/turnoverBase:0;
  const averageTransfer=monthTransactions.length?monthlyTransferValue/monthTransactions.length:0;

  res.json({
    month:requestedMonth,
    capitalBalance:+capitalBalance.toFixed(2),
    totalCapital:+totalCapital.toFixed(2),
    monthlyTransferValue:+monthlyTransferValue.toFixed(2),
    monthlyTransferCount:monthTransactions.length,
    averageTransfer:+averageTransfer.toFixed(2),
    monthlyProfit:+monthlyProfit.toFixed(2),
    monthlyExpenses:+monthlyExpenses.toFixed(2),
    receivables:+receivables.toFixed(2),
    generalReceivable:+generalReceivable.toFixed(2),
    generalPayable:+generalPayable.toFixed(2),
    turnoverRate:+turnoverRate.toFixed(3)
  });
});

app.get("/api/monthly-report", auth, (req,res)=>{
  const store=readStore();
  const month=String(req.query.month||new Date().toISOString().slice(0,7));

  const transactions=(Array.isArray(store.transactions)?store.transactions:[])
    .filter(item=>item&&!item.isDeleted&&item.status!=="CANCELLED")
    .filter(item=>String(item.transferDate||item.createdAt||"").slice(0,7)===month);

  const expenses=(Array.isArray(store.expenses)?store.expenses:[])
    .filter(item=>String(item.date||item.createdAt||"").slice(0,7)===month);

  const capitalMovements=(Array.isArray(store.capitalMovements)?store.capitalMovements:[])
    .filter(item=>String(item.date||item.createdAt||"").slice(0,7)===month);

  const payments=(Array.isArray(store.payments)?store.payments:[])
    .filter(item=>item&&!item.isDeleted)
    .filter(item=>String(item.paymentDate||item.date||item.createdAt||"").slice(0,7)===month);

  const transferTotal=transactions.reduce((sum,item)=>sum+safeNumber(item.amount),0);
  const feesTotal=transactions.reduce((sum,item)=>sum+safeNumber(item.transferFee),0);
  const exchangeProfit=transactions.reduce((sum,item)=>sum+safeNumber(item.exchangeProfit),0);
  const grossProfit=transactions.reduce((sum,item)=>sum+safeNumber(item.totalProfit),0);
  const expenseTotal=expenses.reduce((sum,item)=>sum+safeNumber(item.amount),0);
  const netProfit=grossProfit-expenseTotal;
  const paidTotal=payments.reduce((sum,item)=>sum+safeNumber(item.amount),0);

  const capitalIn=capitalMovements
    .filter(item=>item.type==="IN")
    .reduce((sum,item)=>sum+safeNumber(item.amount),0);
  const capitalOut=capitalMovements
    .filter(item=>item.type!=="IN")
    .reduce((sum,item)=>sum+safeNumber(item.amount),0);

  const customerMap=new Map();
  for(const transaction of transactions){
    customerMap.set(
      transaction.customerId,
      safeNumber(customerMap.get(transaction.customerId))+safeNumber(transaction.amount)
    );
  }

  const topCustomers=Array.from(customerMap.entries())
    .map(([customerId,total])=>({
      customerId,
      customerName:(Array.isArray(store.customers)?store.customers:[]).find(c=>c.id===customerId)?.name||"-",
      total:+total.toFixed(2)
    }))
    .sort((a,b)=>b.total-a.total)
    .slice(0,10);

  const dailyMap={};
  for(const transaction of transactions){
    const date=String(transaction.transferDate||transaction.createdAt||"").slice(0,10);
    dailyMap[date] ||= {date,count:0,total:0,profit:0};
    dailyMap[date].count+=1;
    dailyMap[date].total+=safeNumber(transaction.amount);
    dailyMap[date].profit+=safeNumber(transaction.totalProfit);
  }

  const daily=Object.values(dailyMap)
    .map(item=>({
      ...item,
      total:+item.total.toFixed(2),
      profit:+item.profit.toFixed(2)
    }))
    .sort((a,b)=>a.date.localeCompare(b.date));

  res.json({
    month,
    generatedAt:now(),
    summary:{
      transferCount:transactions.length,
      transferTotal:+transferTotal.toFixed(2),
      averageTransfer:+(transactions.length?transferTotal/transactions.length:0).toFixed(2),
      largestTransfer:+(transactions.length?Math.max(...transactions.map(item=>safeNumber(item.amount))):0).toFixed(2),
      smallestTransfer:+(transactions.length?Math.min(...transactions.map(item=>safeNumber(item.amount))):0).toFixed(2),
      feesTotal:+feesTotal.toFixed(2),
      exchangeProfit:+exchangeProfit.toFixed(2),
      grossProfit:+grossProfit.toFixed(2),
      expenses:+expenseTotal.toFixed(2),
      netProfit:+netProfit.toFixed(2),
      paymentsReceived:+paidTotal.toFixed(2),
      capitalIn:+capitalIn.toFixed(2),
      capitalOut:+capitalOut.toFixed(2),
      netCapitalMovement:+(capitalIn-capitalOut).toFixed(2)
    },
    daily,
    topCustomers,
    transactions:transactions
      .slice()
      .sort((a,b)=>String(a.transferDate||a.createdAt).localeCompare(String(b.transferDate||b.createdAt)))
  });
});


app.get("/api/customers", auth, (_req,res)=>{ const s=readStore(); res.json(s.customers.map(c=>customerSummary(s,c)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))); });
app.post("/api/customers", auth, (req,res)=>{
  const {name,phone="",email="",identityNumber="",notes="",oldBalance=0}=req.body||{};
  if(!String(name).trim()) return res.status(400).json({message:"Customer name is required"});
  const customer=mutate((s)=>{const c={id:id(),name:String(name).trim(),phone,email,identityNumber,notes,oldBalance:+Math.max(safeNumber(oldBalance),0).toFixed(2),oldBalancePaid:0,createdAt:now()};s.customers.push(c);audit(s,req.user.id,"CREATE","CUSTOMER",c.id);return c;});
  res.status(201).json(customer);
});

app.patch("/api/customers/:id", auth, (req,res)=>{
  try{
    const updated=mutate((store)=>{
      const customer=(Array.isArray(store.customers)?store.customers:[])
        .find(item=>item?.id===req.params.id);
      if(!customer)return null;

      const oldData={...customer};
      const allowed=["name","phone","email","address","notes","oldBalance"];
      for(const key of allowed){
        if(req.body[key]!==undefined)customer[key]=req.body[key];
      }
      if(!String(customer.name||"").trim()){
        throw new Error("اسم العميل مطلوب");
      }
      customer.oldBalance=+Math.max(safeNumber(customer.oldBalance),0).toFixed(2);
      customer.oldBalancePaid=+Math.min(Math.max(safeNumber(customer.oldBalancePaid),0),customer.oldBalance).toFixed(2);
      customer.updatedAt=now();
      customer.updatedBy=req.user.id;
      audit(store,req.user.id,"UPDATE","CUSTOMER",customer.id,{oldData,newData:{...customer}});
      return customer;
    });

    if(!updated)return res.status(404).json({message:"العميل غير موجود"});
    res.json(updated);
  }catch(error){
    res.status(400).json({message:error.message||"تعذر تعديل العميل"});
  }
});

app.get("/api/customers/:id", auth, (req,res)=>{
  try {
    const store = readStore();
    const customers = Array.isArray(store.customers) ? store.customers : [];
    const allTransactions = (Array.isArray(store.transactions) ? store.transactions : []).filter(item=>!item?.isDeleted);
    const allPayments = (Array.isArray(store.payments) ? store.payments : []).filter(item=>!item?.isDeleted);

    const customer = customers.find((item) => item && item.id === req.params.id);
    if (!customer) return res.status(404).json({message:"العميل غير موجود"});

    const transactions = allTransactions
      .filter((transaction) => transaction && transaction.customerId === customer.id)
      .map((transaction) => {
        const paid = allPayments
          .filter((payment) => payment && payment.transactionId === transaction.id)
          .reduce((sum, payment) => sum + safeNumber(payment.amount), 0);

        const due = safeNumber(
          transaction.totalCustomerDue,
          safeNumber(transaction.amount) + safeNumber(transaction.transferFee)
        );

        return {
          ...transaction,
          number: String(transaction.number || transaction.id || "-"),
          totalCustomerDue: +due.toFixed(2),
          paid: +paid.toFixed(2),
          remaining: +Math.max(due - paid, 0).toFixed(2),
        };
      });

    const transactionIds = new Set(transactions.map((transaction) => transaction.id));
    const payments = allPayments.filter(
      (payment) => payment && transactionIds.has(payment.transactionId)
    );

    res.json({
      customer: customerSummary(store, customer),
      transactions,
      payments,
    });
  } catch (error) {
    console.error("Customer profile error:", error);
    res.status(500).json({message:"تعذر تحميل ملف العميل"});
  }
});

app.get("/api/transactions", auth, (_req,res)=>{
  const s=readStore();
  res.json(
    s.transactions
      .filter(t=>!t.isDeleted)
      .map(t=>{
        const paidAmount=s.payments
          .filter(payment=>payment.transactionId===t.id&&!payment.isDeleted)
          .reduce((sum,payment)=>sum+safeNumber(payment.amount),0);
        const remaining=Math.max(safeNumber(t.totalCustomerDue)-paidAmount,0);
        return {
          ...t,
          customerName:s.customers.find(c=>c.id===t.customerId)?.name||"-",
          paidAmount:+paidAmount.toFixed(2),
          remaining:+remaining.toFixed(2),
          paymentStatus:remaining<=0.001?"PAID":"UNPAID"
        };
      })
      .reverse()
  );
});
app.post("/api/transactions", auth, (req,res)=>{
  const {
    customerId,
    currency="USD",
    amount,
    costRate,
    finalRate,
    transferFee=0,
    feeMethod="ADD",
    rateSource="manual",
    rateUpdatedAt=null,
    status="COMPLETED",
    paymentStatus="UNPAID",
    transferDate=""
  }=req.body||{};

  const nums=[amount,costRate,finalRate,transferFee].map(Number);
  if(nums.some(n=>!Number.isFinite(n))||nums[0]<=0||nums[1]<=0||nums[2]<=0||nums[3]<0){
    return res.status(400).json({message:"قيم الحوالة غير صحيحة"});
  }

  const [a,cost,clientRate,fee]=nums;
  const normalizedCurrency=String(currency||"USD").toUpperCase();
  const baseCustomerDue=a*clientRate;
  const totalCustomerDue=feeMethod==="ADD"?baseCustomerDue+fee:baseCustomerDue;
  const beneficiaryReceives=feeMethod==="DEDUCT"?Math.max(a-fee,0):a;
  const exchangeProfit=a*(clientRate-cost);
  const totalProfit=exchangeProfit+fee;

  const tx=mutate((s)=>{
    if(!s.customers.some(c=>c.id===customerId))throw new Error("Customer not found");
    const n=s.transactions.length+1;
    const t={
      id:id(),
      number:`TRX-${new Date().getFullYear()}-${String(n).padStart(6,"0")}`,
      customerId,
      currency:normalizedCurrency,
      direction:`${normalizedCurrency}_TO_CAD`,
      amount:+a.toFixed(2),
      costRate:cost,
      finalRate:clientRate,
      rateSource,
      rateUpdatedAt,
      transferFee:+fee.toFixed(2),
      feeMethod,
      destinationAmount:+a.toFixed(2),
      beneficiaryReceives:+beneficiaryReceives.toFixed(2),
      exchangeProfit:+exchangeProfit.toFixed(2),
      totalProfit:+totalProfit.toFixed(2),
      totalCustomerDue:+totalCustomerDue.toFixed(2),
      status,
      transferDate:transferDate||new Date().toISOString().slice(0,10),
      createdAt:now(),
      createdBy:req.user.id
    };
    s.transactions.push(t);

    const normalizedPaymentStatus=String(paymentStatus||"UNPAID").toUpperCase();
    if(normalizedPaymentStatus==="PAID"){
      s.payments.push({
        id:id(),
        transactionId:t.id,
        customerId:t.customerId,
        amount:t.totalCustomerDue,
        method:"CASH",
        notes:"تم تسجيل الحوالة كمدفوعة عند الإنشاء",
        reference:"",
        paymentDate:t.transferDate,
        date:now(),
        receivedBy:req.user.id,
        isDeleted:false,
        allocationMode:"TRANSFER_INITIAL_FULL"
      });
    }

    audit(s,req.user.id,"CREATE","TRANSACTION",t.id,{
      currency:t.currency,
      costRate:t.costRate,
      finalRate:t.finalRate,
      rateSource:t.rateSource,
      totalCustomerDue:t.totalCustomerDue,
      totalProfit:t.totalProfit,
      paymentStatus:normalizedPaymentStatus
    });

    return {
      ...t,
      paidAmount:normalizedPaymentStatus==="PAID"?t.totalCustomerDue:0,
      remaining:normalizedPaymentStatus==="PAID"?0:t.totalCustomerDue,
      paymentStatus:normalizedPaymentStatus==="PAID"?"PAID":"UNPAID"
    };
  });

  res.status(201).json(tx);
});

app.post("/api/customers/:id/payments", auth, (req,res)=>{
  try{
    const {amount,method="CASH",notes="",paymentDate="",reference=""}=req.body||{};
    const requested=Number(amount);
    if(!Number.isFinite(requested)||requested<=0){
      return res.status(400).json({message:"مبلغ الدفعة غير صحيح"});
    }

    const result=mutate((store)=>{
      const customer=store.customers.find(item=>item.id===req.params.id);
      if(!customer)throw new Error("العميل غير موجود");

      const rows=store.transactions
        .filter(item=>item.customerId===customer.id&&!item.isDeleted&&item.status!=="CANCELLED")
        .sort((a,b)=>String(a.transferDate||a.createdAt||"").localeCompare(String(b.transferDate||b.createdAt||"")))
        .map(transaction=>{
          const paid=store.payments
            .filter(payment=>payment.transactionId===transaction.id&&!payment.isDeleted)
            .reduce((sum,payment)=>sum+Number(payment.amount||0),0);
          return {transaction,remaining:Math.max(Number(transaction.totalCustomerDue||0)-paid,0)};
        })
        .filter(row=>row.remaining>0.0001);

      const totalRemaining=rows.reduce((sum,row)=>sum+row.remaining,0);
      const oldBalance=Math.max(safeNumber(customer.oldBalance),0);
      const oldBalancePaid=Math.min(Math.max(safeNumber(customer.oldBalancePaid),0),oldBalance);
      const oldBalanceRemaining=Math.max(oldBalance-oldBalancePaid,0);
      const grandRemaining=totalRemaining+oldBalanceRemaining;

      if(grandRemaining<=0)throw new Error("لا يوجد رصيد مستحق على العميل");
      if(requested>grandRemaining+0.001){
        throw new Error(`الدفعة أكبر من الرصيد المتبقي (${grandRemaining.toFixed(2)} CAD)`);
      }

      let left=requested;
      const allocations=[];
      let oldBalanceAllocation=0;
      if(oldBalanceRemaining>0&&left>0.0001){
        oldBalanceAllocation=Math.min(left,oldBalanceRemaining);
        customer.oldBalancePaid=+(oldBalancePaid+oldBalanceAllocation).toFixed(2);
        left-=oldBalanceAllocation;
      }
      for(const row of rows){
        if(left<=0.0001)break;
        const allocated=Math.min(left,row.remaining);
        const payment={
          id:id(),
          transactionId:row.transaction.id,
          customerId:customer.id,
          amount:+allocated.toFixed(2),
          method,
          notes,
          reference,
          paymentDate:paymentDate||new Date().toISOString().slice(0,10),
          date:now(),
          receivedBy:req.user.id,
          isDeleted:false,
          allocationMode:"CUSTOMER_AUTO"
        };
        store.payments.push(payment);
        allocations.push(payment);
        left-=allocated;
      }

      audit(store,req.user.id,"PAYMENT","CUSTOMER",customer.id,{
        amount:+requested.toFixed(2),
        oldBalanceAllocation:+oldBalanceAllocation.toFixed(2),
        allocations:allocations.map(item=>({transactionId:item.transactionId,amount:item.amount}))
      });

      return {customerId:customer.id,amount:+requested.toFixed(2),oldBalanceAllocation:+oldBalanceAllocation.toFixed(2),allocations};
    });

    res.status(201).json(result);
  }catch(error){
    res.status(400).json({message:error.message||"تعذر إضافة الدفعة"});
  }
});

app.post("/api/transactions/:id/payments", auth, (req,res)=>{
  const {amount,method="CASH",notes="",paymentDate="",reference=""}=req.body||{}; const n=Number(amount); if(!Number.isFinite(n)||n<=0)return res.status(400).json({message:"Invalid amount"});
  const payment=mutate((s)=>{const t=s.transactions.find(x=>x.id===req.params.id);if(!t)throw new Error("Transaction not found");const already=s.payments.filter(p=>p.transactionId===t.id).reduce((a,p)=>a+Number(p.amount),0);if(already+n>Number(t.totalCustomerDue)+0.001)throw new Error("Payment exceeds remaining balance");const p={
      id:id(),
      transactionId:t.id,
      amount:+n.toFixed(2),
      method,
      notes,
      reference,
      paymentDate:paymentDate||new Date().toISOString().slice(0,10),
      date:now(),
      receivedBy:req.user.id,
      isDeleted:false
    };s.payments.push(p);audit(s,req.user.id,"PAYMENT","TRANSACTION",t.id,{amount:n});return p;});

  res.status(201).json(payment);
});

app.patch("/api/transactions/:id", auth, (req,res)=>{
  try{
    const updated=mutate((s)=>{
      const transaction=s.transactions.find(item=>item.id===req.params.id&&!item.isDeleted);
      if(!transaction)return null;

      const allowed=["currency","amount","costRate","finalRate","transferFee","feeMethod","transferDate","status","rateSource","rateUpdatedAt"];
      const oldData={...transaction};

      for(const key of allowed){
        if(req.body[key]!==undefined)transaction[key]=req.body[key];
      }

      const amount=Number(transaction.amount);
      const cost=Number(transaction.costRate);
      const finalRate=Number(transaction.finalRate);
      const fee=Number(transaction.transferFee||0);

      if(![amount,cost,finalRate,fee].every(Number.isFinite)||amount<=0||cost<=0||finalRate<=0||fee<0){
        throw new Error("قيم الحوالة غير صحيحة");
      }

      const baseCustomerDue=amount*finalRate;
      const exchangeProfit=amount*(finalRate-cost);

      transaction.currency=String(transaction.currency||"USD").toUpperCase();
      transaction.direction=`${transaction.currency}_TO_CAD`;
      transaction.destinationAmount=+amount.toFixed(2);
      transaction.beneficiaryReceives=+(transaction.feeMethod==="DEDUCT"?Math.max(amount-fee,0):amount).toFixed(2);
      transaction.exchangeProfit=+exchangeProfit.toFixed(2);
      transaction.totalProfit=+(exchangeProfit+fee).toFixed(2);
      transaction.totalCustomerDue=+(transaction.feeMethod==="ADD"?baseCustomerDue+fee:baseCustomerDue).toFixed(2);
      transaction.updatedAt=now();
      transaction.updatedBy=req.user.id;

      const paid=s.payments
        .filter(p=>p.transactionId===transaction.id&&!p.isDeleted)
        .reduce((sum,p)=>sum+Number(p.amount||0),0);
      if(paid>transaction.totalCustomerDue+0.001){
        throw new Error("لا يمكن جعل إجمالي الحوالة أقل من الدفعات المسجلة");
      }

      audit(s,req.user.id,"UPDATE","TRANSACTION",transaction.id,{oldData,newData:{...transaction}});
      return transaction;
    });

    if(!updated)return res.status(404).json({message:"الحوالة غير موجودة"});
    res.json(updated);
  }catch(error){
    res.status(400).json({message:error.message||"تعذر تعديل الحوالة"});
  }
});

app.delete("/api/transactions/:id", auth, (req,res)=>{
  const deleted=mutate((s)=>{
    const transaction=s.transactions.find(item=>item.id===req.params.id&&!item.isDeleted);
    if(!transaction)return null;
    transaction.isDeleted=true;
    transaction.deletedAt=now();
    transaction.deletedBy=req.user.id;

    for(const payment of s.payments){
      if(payment.transactionId===transaction.id&&!payment.isDeleted){
        payment.isDeleted=true;
        payment.deletedAt=now();
        payment.deletedBy=req.user.id;
      }
    }

    audit(s,req.user.id,"DELETE","TRANSACTION",transaction.id,{softDelete:true});
    return transaction;
  });

  if(!deleted)return res.status(404).json({message:"الحوالة غير موجودة"});
  res.json({message:"تم حذف الحوالة ونقلها إلى المحذوفات"});
});

app.patch("/api/payments/:id", auth, (req,res)=>{
  try{
    const updated=mutate((s)=>{
      const payment=s.payments.find(item=>item.id===req.params.id&&!item.isDeleted);
      if(!payment)return null;
      const transaction=s.transactions.find(item=>item.id===payment.transactionId&&!item.isDeleted);
      if(!transaction)throw new Error("الحوالة غير موجودة");

      const oldData={...payment};
      if(req.body.amount!==undefined)payment.amount=Number(req.body.amount);
      if(req.body.method!==undefined)payment.method=req.body.method;
      if(req.body.notes!==undefined)payment.notes=req.body.notes;
      if(req.body.reference!==undefined)payment.reference=req.body.reference;
      if(req.body.paymentDate!==undefined)payment.paymentDate=req.body.paymentDate;

      if(!Number.isFinite(payment.amount)||payment.amount<=0)throw new Error("مبلغ الدفعة غير صحيح");

      const totalPaid=s.payments
        .filter(item=>item.transactionId===transaction.id&&!item.isDeleted)
        .reduce((sum,item)=>sum+Number(item.amount||0),0);

      if(totalPaid>Number(transaction.totalCustomerDue)+0.001){
        throw new Error("إجمالي الدفعات أكبر من رصيد الحوالة");
      }

      payment.updatedAt=now();
      payment.updatedBy=req.user.id;
      audit(s,req.user.id,"UPDATE","PAYMENT",payment.id,{oldData,newData:{...payment}});
      return payment;
    });

    if(!updated)return res.status(404).json({message:"الدفعة غير موجودة"});
    res.json(updated);
  }catch(error){
    res.status(400).json({message:error.message||"تعذر تعديل الدفعة"});
  }
});

app.delete("/api/payments/:id", auth, (req,res)=>{
  const deleted=mutate((s)=>{
    const payment=s.payments.find(item=>item.id===req.params.id&&!item.isDeleted);
    if(!payment)return null;
    payment.isDeleted=true;
    payment.deletedAt=now();
    payment.deletedBy=req.user.id;
    audit(s,req.user.id,"DELETE","PAYMENT",payment.id,{softDelete:true});
    return payment;
  });

  if(!deleted)return res.status(404).json({message:"الدفعة غير موجودة"});
  res.json({message:"تم حذف الدفعة"});
});



const AUTO_RATE_PAIRS = [
  ["CAD","USD"], ["USD","CAD"], ["USD","AED"], ["AED","USD"],
  ["EUR","USD"], ["USD","EUR"], ["GBP","USD"], ["USD","GBP"]
];

const TROY_OUNCE_GRAMS = 31.1034768;
const GOLD_KARATS = [
  ["XAU24", 24/24],
  ["XAU22", 22/24],
  ["XAU21", 21/24],
  ["XAU18", 18/24]
];

async function fetchOfficialRate(baseCurrency, quoteCurrency) {
  const url = `https://api.frankfurter.dev/v2/rate/${encodeURIComponent(baseCurrency)}/${encodeURIComponent(quoteCurrency)}`;
  const response = await fetch(url, {
    headers: { "Accept": "application/json", "User-Agent": "AlAboud-Cloud/16.0.7" }
  });
  if (!response.ok) throw new Error(`Rate provider returned ${response.status}`);
  const data = await response.json();
  const rate = Number(data.rate);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Invalid rate received");
  return { rate, date: data.date || new Date().toISOString().slice(0,10) };
}

async function fetchSyrianPoundRate() {
  const response = await fetch("https://open.er-api.com/v6/latest/USD", {
    headers: { "Accept": "application/json", "User-Agent": "AlAboud-Cloud/16.0.7" }
  });
  if (!response.ok) throw new Error(`SYP provider returned ${response.status}`);
  const data = await response.json();
  if (data.result !== "success") throw new Error(data["error-type"] || "SYP provider failed");
  const rate = Number(data.rates?.SYP);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("SYP rate is unavailable");
  return {
    rate,
    updatedAt:data.time_last_update_utc || new Date().toISOString(),
    nextUpdate:data.time_next_update_utc || null
  };
}

async function fetchGoldPriceCad() {
  const response = await fetch("https://api.gold-api.com/price/XAU/CAD", {
    headers: { "Accept": "application/json", "User-Agent": "AlAboud-Cloud/16.0.7" }
  });
  if (!response.ok) throw new Error(`Gold provider returned ${response.status}`);
  const data = await response.json();
  const pricePerOunceCad = Number(data.price);
  if (!Number.isFinite(pricePerOunceCad) || pricePerOunceCad <= 0) {
    throw new Error("Gold price is unavailable");
  }
  return {
    pricePerOunceCad,
    updatedAt:data.updatedAt || new Date().toISOString()
  };
}

function saveAutomaticRate({baseCurrency,quoteCurrency,rate,source,notes,sourceDate,userId}) {
  return mutate((store)=>{
    const x = {
      id:id(),
      baseCurrency,
      quoteCurrency,
      buyRate:rate,
      sellRate:rate,
      notes,
      source,
      sourceDate:sourceDate || new Date().toISOString(),
      isAutomatic:true,
      createdAt:now(),
      createdBy:userId
    };
    store.exchangeRates.push(x);
    audit(store,userId,"AUTO_REFRESH","EXCHANGE_RATE",x.id,{
      baseCurrency,quoteCurrency,rate,source
    });
    return x;
  });
}

async function refreshAutomaticRates(userId="SYSTEM") {
  const results = [];

  for (const [baseCurrency, quoteCurrency] of AUTO_RATE_PAIRS) {
    try {
      const official = await fetchOfficialRate(baseCurrency, quoteCurrency);
      const saved = saveAutomaticRate({
        baseCurrency,
        quoteCurrency,
        rate:official.rate,
        source:"FRANKFURTER",
        notes:"تحديث تلقائي من أسعار مرجعية للبنوك المركزية",
        sourceDate:official.date,
        userId
      });
      results.push({ok:true, pair:`${baseCurrency}/${quoteCurrency}`, rate:saved.buyRate, source:"FRANKFURTER"});
    } catch (error) {
      results.push({ok:false, pair:`${baseCurrency}/${quoteCurrency}`, error:error.message});
    }
  }

  try {
    const syp = await fetchSyrianPoundRate();
    const saved = saveAutomaticRate({
      baseCurrency:"USD",
      quoteCurrency:"SYP",
      rate:syp.rate,
      source:"EXCHANGE_RATE_API",
      notes:"تحديث تلقائي لسعر USD/SYP من ExchangeRate-API",
      sourceDate:syp.updatedAt,
      userId
    });
    results.push({ok:true,pair:"USD/SYP",rate:saved.buyRate,source:"EXCHANGE_RATE_API"});
  } catch (error) {
    results.push({ok:false,pair:"USD/SYP",error:error.message});
  }

  try {
    const gold = await fetchGoldPriceCad();
    const pureGramCad = gold.pricePerOunceCad / TROY_OUNCE_GRAMS;
    for (const [baseCurrency, purity] of GOLD_KARATS) {
      const gramRate = +(pureGramCad * purity).toFixed(4);
      const saved = saveAutomaticRate({
        baseCurrency,
        quoteCurrency:"CAD",
        rate:gramRate,
        source:"GOLD_API",
        notes:`سعر غرام الذهب التلقائي — ${baseCurrency.replace("XAU","")} قيراط`,
        sourceDate:gold.updatedAt,
        userId
      });
      results.push({ok:true,pair:`${baseCurrency}/CAD`,rate:saved.buyRate,source:"GOLD_API"});
    }
  } catch (error) {
    for (const [baseCurrency] of GOLD_KARATS) {
      results.push({ok:false,pair:`${baseCurrency}/CAD`,error:error.message});
    }
  }

  return results;
}

app.get("/api/profits", auth, (req,res)=>{
  const s = readStore();
  const from = String(req.query.from || "");
  const to = String(req.query.to || "");
  const inRange = (iso) => {
    const d = String(iso || "").slice(0,10);
    return (!from || d >= from) && (!to || d <= to);
  };

  const transactions = s.transactions.filter((t)=>t.status!=="CANCELLED" && inRange(t.createdAt));
  const expenses = s.expenses.filter((e)=>inRange(e.date || e.createdAt));

  const exchangeProfit = transactions.reduce((a,t)=>a+Number(t.exchangeProfit||0),0);
  const transferFees = transactions.reduce((a,t)=>a+Number(t.transferFee||0),0);
  const grossProfit = transactions.reduce((a,t)=>a+Number(t.totalProfit||0),0);
  const totalExpenses = expenses.reduce((a,e)=>a+Number(e.amount||0),0);
  const netProfit = grossProfit-totalExpenses;

  const byMonthMap = {};
  for (const t of transactions) {
    const month = String(t.createdAt).slice(0,7);
    byMonthMap[month] ||= {month,exchangeProfit:0,transferFees:0,grossProfit:0,expenses:0,netProfit:0};
    byMonthMap[month].exchangeProfit += Number(t.exchangeProfit||0);
    byMonthMap[month].transferFees += Number(t.transferFee||0);
    byMonthMap[month].grossProfit += Number(t.totalProfit||0);
  }
  for (const e of expenses) {
    const month = String(e.date || e.createdAt).slice(0,7);
    byMonthMap[month] ||= {month,exchangeProfit:0,transferFees:0,grossProfit:0,expenses:0,netProfit:0};
    byMonthMap[month].expenses += Number(e.amount||0);
  }
  const monthly = Object.values(byMonthMap)
    .map((x)=>({...x,
      exchangeProfit:+x.exchangeProfit.toFixed(2),
      transferFees:+x.transferFees.toFixed(2),
      grossProfit:+x.grossProfit.toFixed(2),
      expenses:+x.expenses.toFixed(2),
      netProfit:+(x.grossProfit-x.expenses).toFixed(2)
    }))
    .sort((a,b)=>b.month.localeCompare(a.month));

  res.json({
    from: from || null,
    to: to || null,
    transactionCount: transactions.length,
    exchangeProfit:+exchangeProfit.toFixed(2),
    transferFees:+transferFees.toFixed(2),
    grossProfit:+grossProfit.toFixed(2),
    expenses:+totalExpenses.toFixed(2),
    netProfit:+netProfit.toFixed(2),
    monthly,
    transactions: transactions.slice().reverse()
  });
});


app.post("/api/exchange-rates/refresh", auth, async (req,res)=>{
  try {
    const results = await refreshAutomaticRates(req.user.id);
    const successCount = results.filter(x=>x.ok).length;
    res.json({
      message:`تم تحديث ${successCount} من ${results.length} أسعار تلقائية، بما فيها الليرة السورية والذهب عند توفر المصدر.`,
      successCount,
      total:results.length,
      updatedAt:now(),
      results
    });
  } catch (error) {
    res.status(502).json({message:"تعذر تحديث أسعار الصرف",error:error.message});
  }
});

app.get("/api/exchange-rates", auth, (_req,res)=>{
  const s = readStore();
  const latest = new Map();
  for (const rate of s.exchangeRates.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt))) {
    const key = `${rate.baseCurrency}_${rate.quoteCurrency}`;
    if (!latest.has(key)) latest.set(key, rate);
  }
  res.json(Array.from(latest.values()).sort((a,b)=>a.baseCurrency.localeCompare(b.baseCurrency)));
});

app.get("/api/exchange-rates/history", auth, (req,res)=>{
  const s = readStore();
  const base = String(req.query.base || "");
  const quote = String(req.query.quote || "");
  const list = s.exchangeRates.filter((r)=>
    (!base || r.baseCurrency===base) &&
    (!quote || r.quoteCurrency===quote)
  ).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  res.json(list);
});

app.post("/api/exchange-rates", auth, (req,res)=>{
  const {baseCurrency,quoteCurrency,buyRate,sellRate,notes=""}=req.body||{};
  const buy=Number(buyRate), sell=Number(sellRate);
  if(!baseCurrency||!quoteCurrency||baseCurrency===quoteCurrency||!Number.isFinite(buy)||!Number.isFinite(sell)||buy<=0||sell<=0){
    return res.status(400).json({message:"Invalid exchange rate"});
  }
  const rate=mutate((s)=>{
    const x={
      id:id(),
      baseCurrency:String(baseCurrency).toUpperCase(),
      quoteCurrency:String(quoteCurrency).toUpperCase(),
      buyRate:buy,
      sellRate:sell,
      notes,
      createdAt:now(),
      createdBy:req.user.id
    };
    s.exchangeRates.push(x);
    audit(s,req.user.id,"CREATE","EXCHANGE_RATE",x.id,{baseCurrency:x.baseCurrency,quoteCurrency:x.quoteCurrency});
    return x;
  });
  res.status(201).json(rate);
});


app.get("/api/general-debts", auth, (req,res)=>{
  const store = readStore();
  const debts = Array.isArray(store.generalDebts) ? store.generalDebts : [];
  const debtPayments = Array.isArray(store.generalDebtPayments) ? store.generalDebtPayments : [];
  const transactions = (Array.isArray(store.transactions) ? store.transactions : [])
    .filter((item)=>item && !item.isDeleted && item.status!=="CANCELLED");
  const payments = (Array.isArray(store.payments) ? store.payments : [])
    .filter((item)=>item && !item.isDeleted);
  const customers = Array.isArray(store.customers) ? store.customers : [];
  const type = String(req.query.type || "");

  const manualRows = debts.map((debt)=>{
    const paid = debtPayments
      .filter((payment)=>payment.debtId===debt.id)
      .reduce((sum,payment)=>sum+safeNumber(payment.amount),0);
    const amount = safeNumber(debt.amount);
    const remaining = Math.max(amount-paid,0);
    let status = debt.status || "OPEN";
    if (remaining <= 0) status = "PAID";
    else if (paid > 0) status = "PARTIAL";
    else if (debt.dueDate && debt.dueDate < new Date().toISOString().slice(0,10)) status = "OVERDUE";

    return {
      ...debt,
      source:"MANUAL",
      paid:+paid.toFixed(2),
      remaining:+remaining.toFixed(2),
      status,
    };
  });

  const paidByTransaction = new Map();
  for (const payment of payments) {
    paidByTransaction.set(
      payment.transactionId,
      safeNumber(paidByTransaction.get(payment.transactionId)) + safeNumber(payment.amount)
    );
  }

  const transferRows = transactions.map((transaction)=>{
    const amount = safeNumber(transaction.totalCustomerDue, transaction.amount);
    const paid = safeNumber(paidByTransaction.get(transaction.id));
    const remaining = Math.max(amount-paid,0);
    if (remaining <= 0.001) return null;
    const customer = customers.find((item)=>item.id===transaction.customerId);
    const transferDate = String(transaction.transferDate || transaction.createdAt || "").slice(0,10);
    return {
      id:`TRANSFER:${transaction.id}`,
      type:"RECEIVABLE",
      partyName:customer?.name || "عميل بدون اسم",
      amount:+amount.toFixed(2),
      currency:"CAD",
      dueDate:transferDate,
      description:`حوالة غير مدفوعة ${transaction.number || ""}`.trim(),
      reference:transaction.number || "",
      status:paid>0?"PARTIAL":"OPEN",
      source:"TRANSFER",
      transactionId:transaction.id,
      customerId:transaction.customerId,
      createdAt:transaction.createdAt || transaction.transferDate || now(),
      paid:+paid.toFixed(2),
      remaining:+remaining.toFixed(2),
    };
  }).filter(Boolean);

  const rows = [...manualRows, ...transferRows]
    .filter((debt)=>!type || debt.type===type)
    .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));

  const totalsByCurrency = {};
  for (const row of rows) {
    const currency = String(row.currency || "CAD").toUpperCase();
    if (!totalsByCurrency[currency]) totalsByCurrency[currency] = {receivable:0,payable:0,net:0};
    if (row.type==="RECEIVABLE") totalsByCurrency[currency].receivable += safeNumber(row.remaining);
    if (row.type==="PAYABLE") totalsByCurrency[currency].payable += safeNumber(row.remaining);
    totalsByCurrency[currency].net = totalsByCurrency[currency].receivable - totalsByCurrency[currency].payable;
  }
  for (const currency of Object.keys(totalsByCurrency)) {
    totalsByCurrency[currency] = {
      receivable:+totalsByCurrency[currency].receivable.toFixed(2),
      payable:+totalsByCurrency[currency].payable.toFixed(2),
      net:+totalsByCurrency[currency].net.toFixed(2),
    };
  }

  const cadTotals = totalsByCurrency.CAD || {receivable:0,payable:0,net:0};
  res.json({
    rows,
    totals:cadTotals,
    totalsByCurrency,
    automaticTransferDebts:transferRows.length
  });
});

app.post("/api/general-debts", auth, (req,res)=>{
  const {
    type,
    partyName,
    amount,
    currency="CAD",
    dueDate="",
    description="",
    reference=""
  } = req.body || {};

  const numericAmount = Number(amount);
  const normalizedCurrency = String(currency || "CAD").toUpperCase();
  const supportedDebtCurrencies = ["CAD","USD","EUR","SYP","TRY","SAR","AED","GBP"];

  if (!["RECEIVABLE","PAYABLE"].includes(type)) {
    return res.status(400).json({message:"نوع الدين غير صحيح"});
  }
  if (!partyName || !Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({message:"أدخل اسم الجهة ومبلغًا صحيحًا"});
  }
  if (!supportedDebtCurrencies.includes(normalizedCurrency)) {
    return res.status(400).json({message:"عملة الدين غير مدعومة"});
  }

  const debt = mutate((store)=>{
    const item = {
      id:id(),
      type,
      partyName:String(partyName),
      amount:numericAmount,
      currency:normalizedCurrency,
      dueDate:dueDate || "",
      description,
      reference,
      status:"OPEN",
      createdAt:now(),
      createdBy:req.user.id
    };
    store.generalDebts.push(item);
    audit(store, req.user.id, "CREATE", "GENERAL_DEBT", item.id, {
      type:item.type,
      partyName:item.partyName,
      amount:item.amount
    });
    return item;
  });

  res.status(201).json(debt);
});

app.get("/api/general-debts/:id/payments", auth, (req,res)=>{
  const store = readStore();
  const list = (Array.isArray(store.generalDebtPayments) ? store.generalDebtPayments : [])
    .filter((payment)=>payment.debtId===req.params.id)
    .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json(list);
});

app.post("/api/general-debts/:id/payments", auth, (req,res)=>{
  const numericAmount = Number(req.body?.amount);
  const paymentDate = req.body?.paymentDate || new Date().toISOString().slice(0,10);
  const notes = req.body?.notes || "";

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({message:"مبلغ الدفعة غير صحيح"});
  }

  const store = readStore();
  const debt = (Array.isArray(store.generalDebts) ? store.generalDebts : [])
    .find((item)=>item.id===req.params.id);

  if (!debt) {
    return res.status(404).json({message:"الدين غير موجود"});
  }

  const previousPaid = (Array.isArray(store.generalDebtPayments) ? store.generalDebtPayments : [])
    .filter((payment)=>payment.debtId===debt.id)
    .reduce((sum,payment)=>sum+safeNumber(payment.amount),0);

  const remaining = Math.max(safeNumber(debt.amount)-previousPaid,0);

  if (numericAmount > remaining + 0.0001) {
    return res.status(400).json({message:"الدفعة أكبر من المبلغ المتبقي"});
  }

  const payment = mutate((currentStore)=>{
    const item = {
      id:id(),
      debtId:debt.id,
      amount:numericAmount,
      paymentDate,
      notes,
      createdAt:now(),
      createdBy:req.user.id
    };
    currentStore.generalDebtPayments.push(item);
    audit(currentStore, req.user.id, "PAYMENT", "GENERAL_DEBT", debt.id, {
      amount:numericAmount,
      paymentDate
    });
    return item;
  });

  res.status(201).json(payment);
});

app.patch("/api/general-debts/:id", auth, (req,res)=>{
  const updated = mutate((store)=>{
    const debt = store.generalDebts.find((item)=>item.id===req.params.id);
    if (!debt) return null;

    if (req.body?.partyName !== undefined) debt.partyName = String(req.body.partyName);
    if (req.body?.dueDate !== undefined) debt.dueDate = req.body.dueDate || "";
    if (req.body?.description !== undefined) debt.description = req.body.description || "";
    if (req.body?.reference !== undefined) debt.reference = req.body.reference || "";
    if (req.body?.status !== undefined) debt.status = req.body.status;

    debt.updatedAt = now();
    audit(store, req.user.id, "UPDATE", "GENERAL_DEBT", debt.id, req.body);
    return debt;
  });

  if (!updated) return res.status(404).json({message:"الدين غير موجود"});
  res.json(updated);
});


app.get("/api/customers/:id/statement", auth, (req,res)=>{
  try{
    const store=readStore();
    const customer=(Array.isArray(store.customers)?store.customers:[])
      .find(item=>item?.id===req.params.id);

    if(!customer)return res.status(404).json({message:"العميل غير موجود"});

    const from=String(req.query.from||"");
    const to=String(req.query.to||"");

    const inRange=(transaction)=>{
      const date=String(transaction.transferDate||transaction.createdAt||"").slice(0,10);
      return (!from||date>=from)&&(!to||date<=to);
    };

    const allPayments=(Array.isArray(store.payments)?store.payments:[])
      .filter(payment=>payment&&!payment.isDeleted);

    const today=new Date();
    today.setHours(0,0,0,0);

    const transactions=(Array.isArray(store.transactions)?store.transactions:[])
      .filter(transaction=>
        transaction?.customerId===customer.id &&
        !transaction?.isDeleted &&
        transaction.status!=="CANCELLED" &&
        inRange(transaction)
      )
      .map(transaction=>{
        const paid=allPayments
          .filter(payment=>payment.transactionId===transaction.id)
          .reduce((sum,payment)=>sum+safeNumber(payment.amount),0);

        const usdAmount=safeNumber(transaction.amount);
        const costRate=safeNumber(transaction.costRate);
        const finalRate=safeNumber(transaction.finalRate);

        const costCad=transaction.direction==="USD_TO_CAD"
          ? usdAmount*costRate
          : usdAmount*costRate;

        const totalCad=safeNumber(
          transaction.totalCustomerDue,
          usdAmount*finalRate + safeNumber(transaction.transferFee)
        );

        const remaining=Math.max(totalCad-paid,0);
        const date=transaction.transferDate||String(transaction.createdAt||"").slice(0,10);
        const transferDate=new Date(`${date}T00:00:00`);
        const overdueDays=!Number.isNaN(transferDate.getTime())
          ? Math.max(0,Math.floor((today-transferDate)/86400000))
          : 0;

        let paymentStatus="UNPAID";
        if(remaining<=0.001)paymentStatus="PAID";
        else if(paid>0)paymentStatus="PARTIAL";
        if(remaining>0.001&&overdueDays>7)paymentStatus="OVERDUE";

        return {
          id:transaction.id,
          number:transaction.number||transaction.id,
          transferDate:date,
          usdAmount:+usdAmount.toFixed(2),
          customerRate:+finalRate.toFixed(6),
          formulaResultCad:+(usdAmount*finalRate).toFixed(2),
          costCad:+costCad.toFixed(2),
          totalCad:+totalCad.toFixed(2),
          paid:+paid.toFixed(2),
          remaining:+remaining.toFixed(2),
          status:paymentStatus,
          overdueDays,
          transferFee:+safeNumber(transaction.transferFee).toFixed(2)
        };
      })
      .sort((a,b)=>String(a.transferDate).localeCompare(String(b.transferDate)));

    const oldBalance=Math.max(safeNumber(customer.oldBalance),0);
    const oldBalancePaid=Math.min(Math.max(safeNumber(customer.oldBalancePaid),0),oldBalance);
    const oldBalanceRemaining=Math.max(oldBalance-oldBalancePaid,0);

    const totals=transactions.reduce((acc,item)=>{
      acc.usdAmount+=safeNumber(item.usdAmount);
      acc.costCad+=safeNumber(item.costCad);
      acc.totalCad+=safeNumber(item.totalCad);
      acc.formulaResultCad+=safeNumber(item.formulaResultCad);
      acc.paid+=safeNumber(item.paid);
      acc.remaining+=safeNumber(item.remaining);
      return acc;
    },{usdAmount:0,costCad:0,totalCad:0,formulaResultCad:0,paid:0,remaining:0});

    const lastActivity=transactions.length
      ? transactions[transactions.length-1].transferDate
      : null;

    res.json({
      company:(()=>{
        const company=(Array.isArray(store.companies)?store.companies:[]).find(item=>item.id===req.user.companyId);
        return {name:company?.name||"شركة العبود للتجارة",nameEn:"",logoDataUrl:company?.logoDataUrl||""};
      })(),
      customer:{
        ...customer,
        oldBalance:+oldBalance.toFixed(2),
        oldBalancePaid:+oldBalancePaid.toFixed(2),
        oldBalanceRemaining:+oldBalanceRemaining.toFixed(2),
        totalTransactions:+(totals.totalCad+oldBalance).toFixed(2),
        totalPaid:+(totals.paid+oldBalancePaid).toFixed(2),
        finalBalance:+(totals.remaining+oldBalanceRemaining).toFixed(2)
      },
      from:from||null,
      to:to||null,
      generatedAt:now(),
      lastActivity,
      transactions,
      totals:{
        usdAmount:+totals.usdAmount.toFixed(2),
        costCad:+totals.costCad.toFixed(2),
        totalCad:+totals.totalCad.toFixed(2),
        formulaResultCad:+totals.formulaResultCad.toFixed(2),
        oldBalance:+oldBalance.toFixed(2),
        oldBalancePaid:+oldBalancePaid.toFixed(2),
        oldBalanceRemaining:+oldBalanceRemaining.toFixed(2),
        paid:+(totals.paid+oldBalancePaid).toFixed(2),
        remaining:+(totals.remaining+oldBalanceRemaining).toFixed(2)
      }
    });
  }catch(error){
    console.error("Statement error:",error);
    res.status(500).json({message:"تعذر إنشاء كشف الحساب"});
  }
});

app.get("/api/transactions/:id/invoice", auth, (req,res)=>{
  try{
    const store=readStore();
    const transaction=(Array.isArray(store.transactions)?store.transactions:[])
      .find(item=>item?.id===req.params.id);

    if(!transaction)return res.status(404).json({message:"الحوالة غير موجودة"});

    const customer=(Array.isArray(store.customers)?store.customers:[])
      .find(item=>item?.id===transaction.customerId)||{name:"عميل"};

    const paid=(Array.isArray(store.payments)?store.payments:[])
      .filter(payment=>payment?.transactionId===transaction.id&&!payment?.isDeleted)
      .reduce((sum,payment)=>sum+safeNumber(payment.amount),0);

    const due=safeNumber(
      transaction.totalCustomerDue,
      safeNumber(transaction.amount)+safeNumber(transaction.transferFee)
    );

    res.json({
      company:{
        name:"شركة العبود للتجارة",
        nameEn:"AlAboud Trading Company"
      },
      invoiceNumber:transaction.number||transaction.id,
      invoiceDate:transaction.transferDate||String(transaction.createdAt||"").slice(0,10),
      customer:{
        id:customer.id,
        name:customer.name||"عميل",
        phone:customer.phone||"",
        email:customer.email||""
      },
      transaction:{
        ...transaction,
        amount:safeNumber(transaction.amount),
        costRate:safeNumber(transaction.costRate),
        finalRate:safeNumber(transaction.finalRate),
        transferFee:safeNumber(transaction.transferFee),
        totalCustomerDue:+due.toFixed(2),
        paid:+paid.toFixed(2),
        remaining:+Math.max(due-paid,0).toFixed(2)
      },
      generatedAt:now()
    });
  }catch(error){
    console.error("Invoice error:",error);
    res.status(500).json({message:"تعذر إنشاء الفاتورة"});
  }
});


app.get("/api/partners", auth, (_req,res)=>{
  const store=readStore();
  const partners=Array.isArray(store.partners)?store.partners:[];
  const transactions=Array.isArray(store.partnerTransactions)?store.partnerTransactions:[];
  const payments=Array.isArray(store.partnerPayments)?store.partnerPayments:[];

  const rows=partners.map(partner=>{
    const partnerTransactions=transactions.filter(item=>item.partnerId===partner.id);
    const partnerPayments=payments.filter(item=>item.partnerId===partner.id);

    const receivable=partnerTransactions
      .filter(item=>item.type==="RECEIVABLE")
      .reduce((sum,item)=>sum+safeNumber(item.amount),0);

    const payable=partnerTransactions
      .filter(item=>item.type==="PAYABLE")
      .reduce((sum,item)=>sum+safeNumber(item.amount),0);

    const receivedPayments=partnerPayments
      .filter(item=>item.direction==="RECEIVED")
      .reduce((sum,item)=>sum+safeNumber(item.amount),0);

    const paidPayments=partnerPayments
      .filter(item=>item.direction==="PAID")
      .reduce((sum,item)=>sum+safeNumber(item.amount),0);

    const receivableBalance=Math.max(receivable-receivedPayments,0);
    const payableBalance=Math.max(payable-paidPayments,0);

    return {
      ...partner,
      receivable:+receivableBalance.toFixed(2),
      payable:+payableBalance.toFixed(2),
      net:+(receivableBalance-payableBalance).toFixed(2)
    };
  }).sort((a,b)=>String(a.name).localeCompare(String(b.name),"ar"));

  const totals=rows.reduce((acc,item)=>{
    acc.receivable+=safeNumber(item.receivable);
    acc.payable+=safeNumber(item.payable);
    return acc;
  },{receivable:0,payable:0});

  res.json({
    rows,
    totals:{
      receivable:+totals.receivable.toFixed(2),
      payable:+totals.payable.toFixed(2),
      net:+(totals.receivable-totals.payable).toFixed(2)
    }
  });
});

app.post("/api/partners", auth, (req,res)=>{
  const {
    name,
    contactName="",
    phone="",
    whatsapp="",
    email="",
    country="",
    city="",
    address="",
    notes=""
  }=req.body||{};

  if(!name)return res.status(400).json({message:"اسم المورد أو الشركة مطلوب"});

  const partner=mutate(store=>{
    const item={
      id:id(),
      name:String(name),
      contactName,
      phone,
      whatsapp,
      email,
      country,
      city,
      address,
      notes,
      createdAt:now(),
      createdBy:req.user.id
    };
    store.partners.push(item);
    audit(store,req.user.id,"CREATE","PARTNER",item.id,{name:item.name});
    return item;
  });

  res.status(201).json(partner);
});

app.get("/api/partners/:id", auth, (req,res)=>{
  const store=readStore();
  const partner=(Array.isArray(store.partners)?store.partners:[])
    .find(item=>item?.id===req.params.id);

  if(!partner)return res.status(404).json({message:"المورد أو الشركة غير موجود"});

  const transactions=(Array.isArray(store.partnerTransactions)?store.partnerTransactions:[])
    .filter(item=>item.partnerId===partner.id)
    .sort((a,b)=>String(b.date||b.createdAt).localeCompare(String(a.date||a.createdAt)));

  const payments=(Array.isArray(store.partnerPayments)?store.partnerPayments:[])
    .filter(item=>item.partnerId===partner.id)
    .sort((a,b)=>String(b.date||b.createdAt).localeCompare(String(a.date||a.createdAt)));

  const receivable=transactions.filter(item=>item.type==="RECEIVABLE")
    .reduce((sum,item)=>sum+safeNumber(item.amount),0);
  const payable=transactions.filter(item=>item.type==="PAYABLE")
    .reduce((sum,item)=>sum+safeNumber(item.amount),0);
  const received=payments.filter(item=>item.direction==="RECEIVED")
    .reduce((sum,item)=>sum+safeNumber(item.amount),0);
  const paid=payments.filter(item=>item.direction==="PAID")
    .reduce((sum,item)=>sum+safeNumber(item.amount),0);

  res.json({
    partner,
    transactions,
    payments,
    totals:{
      receivable:+Math.max(receivable-received,0).toFixed(2),
      payable:+Math.max(payable-paid,0).toFixed(2),
      net:+(Math.max(receivable-received,0)-Math.max(payable-paid,0)).toFixed(2)
    }
  });
});

app.post("/api/partners/:id/transactions", auth, (req,res)=>{
  const {type,amount,currency="CAD",date="",dueDate="",reference="",description=""}=req.body||{};
  const numericAmount=Number(amount);

  if(!["RECEIVABLE","PAYABLE"].includes(type)){
    return res.status(400).json({message:"نوع العملية غير صحيح"});
  }
  if(!Number.isFinite(numericAmount)||numericAmount<=0){
    return res.status(400).json({message:"المبلغ غير صحيح"});
  }

  const store=readStore();
  const partner=(Array.isArray(store.partners)?store.partners:[])
    .find(item=>item?.id===req.params.id);
  if(!partner)return res.status(404).json({message:"المورد أو الشركة غير موجود"});

  const transaction=mutate(currentStore=>{
    const item={
      id:id(),
      partnerId:partner.id,
      type,
      amount:numericAmount,
      currency:String(currency).toUpperCase(),
      date:date||new Date().toISOString().slice(0,10),
      dueDate:dueDate||"",
      reference,
      description,
      createdAt:now(),
      createdBy:req.user.id
    };
    currentStore.partnerTransactions.push(item);
    audit(currentStore,req.user.id,"CREATE","PARTNER_TRANSACTION",item.id,{
      partnerId:partner.id,type,amount:numericAmount
    });
    return item;
  });

  res.status(201).json(transaction);
});

app.post("/api/partners/:id/payments", auth, (req,res)=>{
  const {direction,amount,currency="CAD",date="",reference="",notes=""}=req.body||{};
  const numericAmount=Number(amount);

  if(!["RECEIVED","PAID"].includes(direction)){
    return res.status(400).json({message:"اتجاه الدفعة غير صحيح"});
  }
  if(!Number.isFinite(numericAmount)||numericAmount<=0){
    return res.status(400).json({message:"المبلغ غير صحيح"});
  }

  const store=readStore();
  const partner=(Array.isArray(store.partners)?store.partners:[])
    .find(item=>item?.id===req.params.id);
  if(!partner)return res.status(404).json({message:"المورد أو الشركة غير موجود"});

  const payment=mutate(currentStore=>{
    const item={
      id:id(),
      partnerId:partner.id,
      direction,
      amount:numericAmount,
      currency:String(currency).toUpperCase(),
      date:date||new Date().toISOString().slice(0,10),
      reference,
      notes,
      createdAt:now(),
      createdBy:req.user.id
    };
    currentStore.partnerPayments.push(item);
    audit(currentStore,req.user.id,"PAYMENT","PARTNER",partner.id,{
      direction,amount:numericAmount
    });
    return item;
  });

  res.status(201).json(payment);
});

app.get("/api/partners/:id/statement", auth, (req,res)=>{
  const store=readStore();
  const partner=(Array.isArray(store.partners)?store.partners:[])
    .find(item=>item?.id===req.params.id);

  if(!partner)return res.status(404).json({message:"المورد أو الشركة غير موجود"});

  const from=String(req.query.from||"");
  const to=String(req.query.to||"");
  const inRange=(date)=>{
    const value=String(date||"").slice(0,10);
    return (!from||value>=from)&&(!to||value<=to);
  };

  const transactions=(Array.isArray(store.partnerTransactions)?store.partnerTransactions:[])
    .filter(item=>item.partnerId===partner.id&&inRange(item.date||item.createdAt));
  const payments=(Array.isArray(store.partnerPayments)?store.partnerPayments:[])
    .filter(item=>item.partnerId===partner.id&&inRange(item.date||item.createdAt));

  const entries=[
    ...transactions.map(item=>({
      id:item.id,
      date:item.date||String(item.createdAt).slice(0,10),
      kind:item.type==="RECEIVABLE"?"دين لنا":"دين علينا",
      debit:item.type==="RECEIVABLE"?safeNumber(item.amount):0,
      credit:item.type==="PAYABLE"?safeNumber(item.amount):0,
      reference:item.reference||"",
      description:item.description||""
    })),
    ...payments.map(item=>({
      id:item.id,
      date:item.date||String(item.createdAt).slice(0,10),
      kind:item.direction==="RECEIVED"?"استلام دفعة":"دفع مبلغ",
      debit:item.direction==="PAID"?safeNumber(item.amount):0,
      credit:item.direction==="RECEIVED"?safeNumber(item.amount):0,
      reference:item.reference||"",
      description:item.notes||""
    }))
  ].sort((a,b)=>String(a.date).localeCompare(String(b.date)));

  let runningBalance=0;
  const rows=entries.map(entry=>{
    runningBalance+=safeNumber(entry.debit)-safeNumber(entry.credit);
    return {...entry,balance:+runningBalance.toFixed(2)};
  });

  res.json({
    company:{name:"شركة العبود للتجارة",nameEn:"AlAboud Trading Company"},
    partner,
    from:from||null,
    to:to||null,
    generatedAt:now(),
    rows,
    finalBalance:+runningBalance.toFixed(2)
  });
});

app.get("/api/expenses", auth, (_req,res)=>res.json(readStore().expenses.slice().reverse()));
app.post("/api/expenses", auth, (req,res)=>{const {title,amount,currency="CAD",category="Other",date=new Date().toISOString().slice(0,10)}=req.body||{};const n=Number(amount);if(!title||!Number.isFinite(n)||n<=0)return res.status(400).json({message:"Invalid expense"});const e=mutate(s=>{const x={id:id(),title,amount:+n.toFixed(2),currency,category,date,createdAt:now(),createdBy:req.user.id};s.expenses.push(x);audit(s,req.user.id,"CREATE","EXPENSE",x.id);return x;});res.status(201).json(e);});
app.get("/api/capital", auth, (_req,res)=>res.json(readStore().capitalMovements.slice().reverse()));
app.post("/api/capital", auth, (req,res)=>{const {type="IN",amount,currency="CAD",description="",date=new Date().toISOString().slice(0,10)}=req.body||{};const n=Number(amount);if(!["IN","OUT"].includes(type)||!Number.isFinite(n)||n<=0)return res.status(400).json({message:"Invalid capital movement"});const m=mutate(s=>{const x={id:id(),type,amount:+n.toFixed(2),currency,description,date,createdAt:now(),createdBy:req.user.id};s.capitalMovements.push(x);audit(s,req.user.id,"CREATE","CAPITAL",x.id);return x;});res.status(201).json(m);});

app.patch("/api/capital/:id", auth, (req,res)=>{
  const {type,amount,currency,description,date}=req.body||{};
  const n=Number(amount);
  if(!["IN","OUT"].includes(type)||!Number.isFinite(n)||n<=0){
    return res.status(400).json({message:"بيانات حركة رأس المال غير صحيحة"});
  }
  const updated=mutate(store=>{
    const item=store.capitalMovements.find(entry=>entry.id===req.params.id);
    if(!item)return null;
    item.type=type;
    item.amount=+n.toFixed(2);
    item.currency=String(currency||"CAD").toUpperCase();
    item.description=String(description||"");
    item.date=date||new Date().toISOString().slice(0,10);
    item.updatedAt=now();
    item.updatedBy=req.user.id;
    audit(store,req.user.id,"UPDATE","CAPITAL",item.id,{type:item.type,amount:item.amount});
    return item;
  });
  if(!updated)return res.status(404).json({message:"حركة رأس المال غير موجودة"});
  res.json(updated);
});

app.delete("/api/capital/:id", auth, (req,res)=>{
  const removed=mutate(store=>{
    const index=store.capitalMovements.findIndex(entry=>entry.id===req.params.id);
    if(index<0)return null;
    const [item]=store.capitalMovements.splice(index,1);
    audit(store,req.user.id,"DELETE","CAPITAL",item.id,{type:item.type,amount:item.amount});
    return item;
  });
  if(!removed)return res.status(404).json({message:"حركة رأس المال غير موجودة"});
  res.json({message:"تم حذف حركة رأس المال",id:removed.id});
});

const publicDir = path.resolve(__dirname, "../public");
const indexFile = path.join(publicDir, "index.html");

if (!fs.existsSync(indexFile)) {
  console.error("Frontend files are missing. Run: npm run render-build");
}

app.use(express.static(publicDir, {
  index: "index.html",
  maxAge: 0,
  etag: true,
  setHeaders(res, filePath){
    if(filePath.endsWith("index.html")){
      res.setHeader("Cache-Control","no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma","no-cache");
      res.setHeader("Expires","0");
    }else{
      res.setHeader("Cache-Control","no-cache");
    }
  }
}));

app.get("/", (_req, res) => {
  if (!fs.existsSync(indexFile)) {
    return res.status(503).send("Frontend build is missing");
  }
  res.sendFile(indexFile);
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  if (!fs.existsSync(indexFile)) return res.status(404).send("Not Found");
  res.setHeader("Cache-Control","no-store, no-cache, must-revalidate");
  return res.sendFile(indexFile);
});

app.use((req,res)=>{
  res.status(404).json({message:"API route not found"});
});

app.use((err,_req,res,_next)=>{
  console.error(err);
  res.status(400).json({message:err.message||"Request failed"});
});

async function startServer(){
  await initStore();
  seedAdmin();
  app.listen(PORT,"0.0.0.0",()=>{
  console.log(`AlAboud Enterprise Cloud v16.0.7 running on port ${PORT}`);
  console.log(`Frontend directory: ${publicDir}`);

  const runHourlyRateRefresh=async()=>{
    try{
      const results=await refreshAutomaticRates("SYSTEM_HOURLY");
      const successCount=results.filter(item=>item.ok).length;
      console.log(`Hourly exchange-rate refresh: ${successCount}/${results.length} updated`);
    }catch(error){
      console.error("Hourly exchange-rate refresh failed:",error.message);
    }
  };

  setTimeout(runHourlyRateRefresh,60*1000);
  setInterval(runHourlyRateRefresh,60*60*1000);
  });
}
startServer().catch(error=>{
  console.error("Server startup failed:",error);
  process.exit(1);
});
