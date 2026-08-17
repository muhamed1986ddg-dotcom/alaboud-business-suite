"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const serverPath = path.join(__dirname, "server.js");
const server = fs.readFileSync(serverPath, "utf8");

assert(
  server.includes('mode:"BROWSER_BALANCE_ONLY"'),
  "JAD/Suryana browser balance-only early return is missing"
);

assert(
  server.includes('async function syncKontorunPartner(partner,{fromDate,toDate,otp,balanceOnly=false}={})'),
  "Tawasul/Kontorun balanceOnly option is missing"
);

assert(
  server.includes('if(!balanceOnly){') &&
  server.includes('api/index.php?p=mt&f=aspro'),
  "Tawasul statement request is not guarded by balanceOnly"
);

assert(
  server.includes('DAHAB_DASHBOARD_BALANCE_NOT_FOUND'),
  "Dahab dashboard-only balance guard is missing"
);

assert(
  server.includes('JAD_HTTP_BALANCE_ONLY_DISABLED'),
  "JAD HTTP balance-only protection is missing"
);

assert(
  server.includes('if(balanceOnly||!allowFallback||error?.code!=="JAD_BROWSER_UNAVAILABLE")throw error;'),
  "JAD HTTP fallback is not blocked during balance-only sync"
);

assert(
  server.includes('syncKontorunPartner(partner,{fromDate:body?.fromDate,toDate:body?.toDate,otp:body?.otp,balanceOnly})'),
  "Main partner sync does not pass balanceOnly to Tawasul"
);

assert(
  server.includes('syncJadPartner(partner,{fromDate:body?.fromDate,toDate:body?.toDate,otp:body?.otp,balanceOnly})'),
  "Main partner sync does not pass balanceOnly to JAD/Suryana"
);

console.log("v25.14.89 partner balance-only source sync: OK");