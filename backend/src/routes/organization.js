"use strict";

function registerOrganizationRoutes(app, {
  auth,
  requirePermission,
  readStore,
  readRootStore,
  branchSummary,
  mutateDurable,
  createBranch,
  now,
  audit,
  passwordPolicy,
  hashPassword,
  id,
  revokeUserSessions,
  revokeBiometricForUser
}) {
  app.get("/api/security/permissions", auth, (req,res)=>res.json({role:req.user.role,permissions:req.user.permissions||[]}));

  app.get("/api/audit-logs", auth, requirePermission("audit.read"), (req,res)=>{
    const limit=Math.min(500,Math.max(1,Number(req.query.limit)||100));
    const action=String(req.query.action||"").toUpperCase();
    const entityType=String(req.query.entityType||"").toUpperCase();
    const auditStore=readStore();
    const userMap=new Map((auditStore.users||[]).map(user=>[user.id,user.name||user.email||user.id]));
    let logs=(auditStore.auditLogs||[]).slice().map(item=>({...item,userName:item.userName||userMap.get(item.userId)||item.userId}));
    if(action)logs=logs.filter(item=>String(item.action||"").toUpperCase()===action);
    if(entityType)logs=logs.filter(item=>String(item.entityType||"").toUpperCase()===entityType);
    res.json(logs.sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||""))).slice(0,limit));
  });

  app.get("/api/branches",auth,(req,res)=>{
    const root=readRootStore();const user=root.users.find(x=>x.id===req.user.id)||req.user;
    const allowed=(root.branches||[]).filter(x=>x.companyId===req.user.companyId&&x.active!==false&&(!Array.isArray(user.branchIds)||!user.branchIds.length||user.branchIds.includes(x.id)));
    res.json(allowed.map(branch=>branchSummary(root,branch)));
  });
  app.post("/api/branches",auth,async (req,res)=>{
    // Branch administration is intentionally ADMIN-only, matching the
    // centralized access-control policy and the settings UI.
    if(req.user.role!=="ADMIN")return res.status(403).json({message:"Branch administration requires ADMIN"});
    if(!["ADMIN","MANAGER"].includes(req.user.role))return res.status(403).json({message:"إنشاء الفروع متاح للمدير فقط"});
    try{let branch;await mutateDurable(root=>{branch=createBranch(root,{companyId:req.user.companyId,name:req.body?.name,code:req.body?.code,address:req.body?.address,phone:req.body?.phone,currency:req.body?.currency,isMain:req.body?.isMain,createdBy:req.user.id,now});audit(root,req.user.id,"CREATE","BRANCH",branch.id,{name:branch.name,code:branch.code});});res.status(201).json(branch);}catch(error){const messages={BRANCH_NAME_REQUIRED:"اسم الفرع مطلوب",BRANCH_CODE_REQUIRED:"رمز الفرع مطلوب",BRANCH_CODE_EXISTS:"رمز الفرع مستخدم مسبقًا"};res.status(400).json({message:messages[error.message]||error.message});}
  });
  app.patch("/api/branches/:id",auth,async (req,res)=>{
    if(req.user.role!=="ADMIN")return res.status(403).json({message:"Branch administration requires ADMIN"});
    if(!["ADMIN","MANAGER"].includes(req.user.role))return res.status(403).json({message:"تعديل الفروع متاح للمدير فقط"});let branch;await mutateDurable(root=>{branch=(root.branches||[]).find(x=>x.id===req.params.id&&x.companyId===req.user.companyId);if(!branch)return;if(req.body?.isMain){for(const x of root.branches)if(x.companyId===req.user.companyId)x.isMain=false;}for(const key of ["name","address","phone","currency","active","isMain"])if(req.body?.[key]!==undefined)branch[key]=req.body[key];branch.updatedAt=now();audit(root,req.user.id,"UPDATE","BRANCH",branch.id,{name:branch.name});});if(!branch)return res.status(404).json({message:"الفرع غير موجود"});res.json(branch);
  });
  app.get("/api/branches/current",auth,(req,res)=>res.json(req.branch));
  app.get("/api/branches/network-summary",auth,(req,res)=>{const root=readRootStore();const rows=(root.branches||[]).filter(x=>x.companyId===req.user.companyId&&x.active!==false).map(x=>branchSummary(root,x));res.json({branches:rows,totals:rows.reduce((a,x)=>({customers:a.customers+x.metrics.customers,transactions:a.transactions+x.metrics.transactions,transactionValueCad:+(a.transactionValueCad+x.metrics.transactionValueCad).toFixed(2),expensesCad:+(a.expensesCad+x.metrics.expensesCad).toFixed(2)}),{customers:0,transactions:0,transactionValueCad:0,expensesCad:0})});});

  app.get("/api/company-profile", auth, (req,res)=>{
    const store=readStore();
    const company=store.companies.find(item=>item.id===req.user.companyId);
    if(!company)return res.status(404).json({message:"الشركة غير موجودة"});
    res.json({id:company.id,name:company.name,phone:company.phone||"",logoDataUrl:company.logoDataUrl||""});
  });

  app.patch("/api/company-profile", auth, async (req,res)=>{
    if(req.user.role!=="ADMIN")return res.status(403).json({message:"تعديل هوية الشركة متاح للمسؤول الكامل فقط"});
    const name=String(req.body?.name||"").trim();
    const phone=String(req.body?.phone||"").trim();
    const logoDataUrl=String(req.body?.logoDataUrl||"");
    if(!name)return res.status(400).json({message:"اسم الشركة مطلوب"});
    if(logoDataUrl && !/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(logoDataUrl)){
      return res.status(400).json({message:"صيغة الشعار غير مدعومة"});
    }
    if(logoDataUrl.length>1500000)return res.status(400).json({message:"حجم الشعار كبير جدًا"});
    const company=await mutateDurable(store=>{
      const item=store.companies.find(company=>company.id===req.user.companyId);
      if(!item)throw new Error("الشركة غير موجودة");
      item.name=name; item.phone=phone; item.logoDataUrl=logoDataUrl; item.updatedAt=now();
      return {id:item.id,name:item.name,phone:item.phone||"",logoDataUrl:item.logoDataUrl||""};
    });
    res.json(company);
  });

  app.post("/api/users", auth, async (req,res)=>{
    if(req.user.role!=="ADMIN")return res.status(403).json({message:"إنشاء الحسابات متاح للمدير فقط"});
    const name=String(req.body?.name||"").trim();
    const email=String(req.body?.email||"").trim().toLowerCase();
    const password=String(req.body?.password||"");
    const role=["ADMIN","MANAGER","ACCOUNTANT","USER","VIEWER"].includes(String(req.body?.role||"").toUpperCase())?String(req.body.role).toUpperCase():"USER";
    if(!name||!email||!email.includes("@"))return res.status(400).json({message:"الاسم والبريد الإلكتروني مطلوبان"});
    { const policy=passwordPolicy(password); if(!policy.ok)return res.status(400).json({message:policy.message}); }
    try{
      const created=await mutateDurable((store)=>{
        if(store.users.some(item=>String(item.email||"").toLowerCase()===email))throw new Error("البريد الإلكتروني مستخدم مسبقًا");
        const user={id:id(),companyId:req.user.companyId,name,email,passwordHash:hashPassword(password),role,active:true,createdAt:now()};
        store.users.push(user);
        audit(store,req.user.id,"CREATE","USER",user.id,{name,email,role});
        return {id:user.id,name:user.name,email:user.email,role:user.role,active:user.active};
      });
      res.status(201).json(created);
    }catch(error){res.status(400).json({message:error.message||"تعذر إنشاء الحساب"});}
  });

  app.get("/api/users", auth, (req,res)=>{
    if(req.user.role!=="ADMIN")return res.status(403).json({message:"إدارة المستخدمين متاحة للمدير فقط"});
    const users=readStore().users.map(user=>({id:user.id,name:user.name,email:user.email,role:user.role,active:user.active!==false,createdAt:user.createdAt,lastLoginAt:user.lastLoginAt||null}));
    res.json(users);
  });

  app.patch("/api/users/:id", auth, async (req,res)=>{
    if(req.user.role!=="ADMIN")return res.status(403).json({message:"إدارة المستخدمين متاحة للمدير فقط"});
    try{
      const updated=await mutateDurable(store=>{
        const user=store.users.find(item=>item.id===req.params.id);
        if(!user)throw new Error("المستخدم غير موجود");
        if(user.id===req.user.id&&req.body?.active===false)throw new Error("لا يمكنك تعطيل حسابك الحالي");
        if(req.body?.name!==undefined)user.name=String(req.body.name||"").trim()||user.name;
        if(req.body?.role!==undefined&&["ADMIN","MANAGER","ACCOUNTANT","USER","VIEWER"].includes(String(req.body.role).toUpperCase()))user.role=String(req.body.role).toUpperCase();
        if(req.body?.active!==undefined)user.active=Boolean(req.body.active);
        let revokedSessions=0,revokedBiometric=0;
        if(req.body?.password!==undefined){
          const policy=passwordPolicy(String(req.body.password));
          if(!policy.ok)throw new Error(policy.message);
          user.passwordHash=hashPassword(String(req.body.password));
          user.mustChangePassword=true;
          revokedSessions=revokeUserSessions(store,user.id,req.user.id,null);
          revokedBiometric=revokeBiometricForUser(store,user.id);
        }else if(req.body?.active===false){
          revokedSessions=revokeUserSessions(store,user.id,req.user.id,null);
          revokedBiometric=revokeBiometricForUser(store,user.id);
        }
        user.updatedAt=now();
        audit(store,req.user.id,"UPDATE","USER",user.id,{role:user.role,active:user.active,revokedSessions,revokedBiometric});
        return {id:user.id,name:user.name,email:user.email,role:user.role,active:user.active!==false,lastLoginAt:user.lastLoginAt||null};
      });
      res.json(updated);
    }catch(error){res.status(400).json({message:error.message||"تعذر تحديث المستخدم"});}
  });

  app.get("/api/devices", auth, (req,res)=>{
    if(req.user.role!=="ADMIN")return res.status(403).json({message:"إدارة الأجهزة متاحة للمدير فقط"});
    res.json((readStore().devices||[]).slice().sort((a,b)=>String(b.lastSeenAt||"").localeCompare(String(a.lastSeenAt||""))));
  });

  app.patch("/api/devices/:id", auth, async (req,res)=>{
    if(req.user.role!=="ADMIN")return res.status(403).json({message:"إدارة الأجهزة متاحة للمدير فقط"});
    try{
      const device=await mutateDurable(store=>{
        const item=(store.devices||[]).find(row=>row.id===req.params.id);
        if(!item)throw new Error("الجهاز غير موجود");
        if(req.body?.active!==undefined)item.active=Boolean(req.body.active);
        if(req.body?.deviceName!==undefined)item.deviceName=String(req.body.deviceName||"").slice(0,120);
        item.updatedAt=now();
        audit(store,req.user.id,"UPDATE","DEVICE",item.id,{active:item.active});
        return item;
      });
      res.json(device);
    }catch(error){res.status(400).json({message:error.message||"تعذر تحديث الجهاز"});}
  });

  app.get("/api/legal/privacy", (_req,res)=>res.json({version:"1.0",updatedAt:"2026-07-18",title:"سياسة الخصوصية",content:"يجمع النظام معلومات الحساب ومعرّف التثبيت ونوع الجهاز وإصدار التطبيق وتاريخ أول وآخر استخدام لأغراض الأمان وإدارة التراخيص فقط. لا تُباع البيانات ولا تُشارك مع جهات خارجية، ولا يتم جمع كلمات المرور بصورتها الأصلية. يتحمل مدير الشركة مسؤولية بيانات العملاء المسجلة داخل النظام."}));
  app.get("/api/legal/terms", (_req,res)=>res.json({version:"1.0",updatedAt:"2026-07-18",title:"شروط الاستخدام",content:"استخدام البرنامج مخصص للحسابات والأجهزة المصرح بها. يمنع نسخ البرنامج أو إعادة بيعه أو محاولة تجاوز الحماية دون إذن. المستخدم مسؤول عن صحة البيانات والنسخ الاحتياطية والالتزام بالقوانين المحلية."}));
}

module.exports={registerOrganizationRoutes};
