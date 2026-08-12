"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { registerNotificationRoutes } = require("./routes/notifications");

function createAppRecorder(){
  const routes=[];
  const app={};
  for(const method of ["get","post","patch"]){
    app[method]=(routePath,...handlers)=>routes.push({method,path:routePath,handlers});
  }
  return {app,routes};
}

function responseRecorder(){
  return {
    statusCode:200,
    body:undefined,
    status(code){this.statusCode=code;return this;},
    json(body){this.body=body;return this;}
  };
}

async function runHandler(route,req){
  const res=responseRecorder();
  await route.handlers.at(-1)(req,res);
  return res;
}

(async()=>{
  const today=new Date().toISOString().slice(0,10);
  const root={
    notificationSettings:{overdueDays:7,lowCashLimit:500,whatsappTemplate:"hello"},
    customers:[{id:"customer-1",name:"Customer",phone:"+15190000000"}],
    capitalMovements:[{id:"capital-1",type:"IN",cadAmount:100}],
    transactions:[{id:"transaction-1",customerId:"customer-1",status:"PENDING"}],
    payments:[{id:"payment-1",transactionId:"transaction-1",paymentDate:"2026-08-10"}],
    notificationActions:[{
      id:"action-old",customerId:"customer-1",action:"CONTACTED",promiseDate:null,
      createdAt:"2026-08-10T00:00:00.000Z"
    },{
      id:"action-new",customerId:"customer-1",action:"PROMISE_TO_PAY",promiseDate:today,
      expectedAmount:25,createdAt:"2026-08-11T00:00:00.000Z"
    }]
  };
  const audits=[];
  const auth=(_req,_res,next)=>next?.();
  const adminPermission=(_req,_res,next)=>next?.();
  const requiredPermissions=[];
  const {app,routes}=createAppRecorder();
  registerNotificationRoutes(app,{
    auth,
    requirePermission:permission=>{requiredPermissions.push(permission);return adminPermission;},
    readStore:()=>root,
    mutateDurable:async mutate=>mutate(root),
    safeNumber:(value,fallback=0)=>{const number=Number(value);return Number.isFinite(number)?number:fallback;},
    audit:(_store,...args)=>audits.push(args),
    id:()=>"generated-action",
    now:()=>"2026-08-12T12:00:00.000Z",
    customerSummary:(_store,customer)=>({...customer,overdue:true,overdueDays:61,finalBalance:100}),
    capitalCadAmount:(_store,item)=>Number(item.cadAmount||0)
  });

  const expected=[
    "get /api/notification-settings",
    "patch /api/notification-settings",
    "get /api/notifications",
    "post /api/notification-actions",
    "get /api/notification-actions/:customerId",
    "get /api/customer-alerts"
  ];
  assert.deepStrictEqual(routes.map(route=>`${route.method} ${route.path}`),expected);
  assert(routes.every(route=>route.handlers[0]===auth),"all notification routes must remain authenticated");
  assert.deepStrictEqual(requiredPermissions,["admin.only"]);
  assert.strictEqual(routes.find(route=>route.method==="patch").handlers[1],adminPermission,"settings write must keep admin permission middleware");

  const settings=await runHandler(routes.find(route=>route.method==="get"&&route.path==="/api/notification-settings"),{});
  assert.deepStrictEqual(settings.body,{overdueDays:7,lowCashLimit:500,whatsappTemplate:"hello"});

  const patchSettings=routes.find(route=>route.method==="patch"&&route.path==="/api/notification-settings");
  const updated=await runHandler(patchSettings,{user:{id:"admin"},body:{overdueDays:15,lowCashLimit:750,whatsappTemplate:"updated"}});
  assert.deepStrictEqual(updated.body,{overdueDays:15,lowCashLimit:750,whatsappTemplate:"updated"});
  assert.strictEqual(audits.at(-1)[1],"UPDATE");

  const notifications=await runHandler(routes.find(route=>route.path==="/api/notifications"),{});
  assert.strictEqual(notifications.body.count,3);
  assert.strictEqual(notifications.body.overdueCount,1);
  assert.strictEqual(notifications.body.overdueTotal,100);
  assert.deepStrictEqual(notifications.body.notifications.map(item=>item.type),["OVERDUE_CUSTOMER","LOW_CAPITAL","INCOMPLETE_TRANSFERS"]);
  assert.strictEqual(notifications.body.notifications[0].severity,"critical");

  const createAction=routes.find(route=>route.method==="post"&&route.path==="/api/notification-actions");
  const created=await runHandler(createAction,{user:{id:"admin"},body:{customerId:"customer-1",notes:"call",promiseDate:today,expectedAmount:"42.25"}});
  assert.strictEqual(created.statusCode,201);
  assert.strictEqual(created.body.id,"generated-action");
  assert.strictEqual(created.body.expectedAmount,42.25);
  assert.strictEqual(root.notificationActions.at(-1).createdBy,"admin");

  const actionHistory=await runHandler(routes.find(route=>route.path==="/api/notification-actions/:customerId"),{params:{customerId:"customer-1"}});
  assert.deepStrictEqual(actionHistory.body.map(item=>item.id),["generated-action","action-new","action-old"]);

  const alerts=await runHandler(routes.find(route=>route.path==="/api/customer-alerts"),{});
  assert.strictEqual(alerts.body.count,1);
  assert.strictEqual(alerts.body.totalOverdue,100);
  assert.strictEqual(alerts.body.expectedToday,42.25);
  assert.strictEqual(alerts.body.rows[0].lastPaymentDate,"2026-08-10");
  assert.strictEqual(alerts.body.rows[0].contacted,true);

  const serverSource=fs.readFileSync(path.join(__dirname,"server.js"),"utf8");
  const routeSource=fs.readFileSync(path.join(__dirname,"routes/notifications.js"),"utf8");
  assert(serverSource.includes('require("./routes/notifications")'),"server must import notification routes");
  assert(serverSource.includes("registerNotificationRoutes(app"),"server must register notification routes");
  for(const route of expected){
    const [method,routePath]=route.split(" ");
    assert(!serverSource.includes(`app.${method}("${routePath}"`),`${routePath} handler must not return to server.js`);
  }
  assert(!routeSource.includes('require("../finance/')&&!routeSource.includes("require('../finance/"),"notification routes must receive existing financial helpers through dependency injection");
  const dashboardAt=serverSource.indexOf('app.get("/api/dashboard"');
  const notificationAt=serverSource.indexOf("registerNotificationRoutes(app");
  const capitalAt=serverSource.indexOf('app.get("/api/capital-overview"');
  assert(dashboardAt>=0&&notificationAt>dashboardAt&&capitalAt>notificationAt,"notification route registration order changed");
  assert(serverSource.split(/\r?\n/).length<=6020,"server.js notification extraction unexpectedly regressed");

  console.log("v25.14.68 notification routes extraction regression: OK");
})().catch(error=>{console.error(error);process.exit(1);});
