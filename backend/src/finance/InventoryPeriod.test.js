"use strict";
const assert=require("assert");
const {currentInventoryPeriod,previousInventoryPeriod,occurredLocalDate}=require("./InventoryPeriod");

const settings={inventoryDay:20,timeZone:"America/Toronto"};
assert.deepEqual(currentInventoryPeriod(settings,new Date("2026-08-25T12:00:00Z")),{
  scheduleDay:20,timeZone:"America/Toronto",start:"2026-08-20",nextStart:"2026-09-20",end:"2026-09-19"
});
assert.deepEqual(currentInventoryPeriod(settings,new Date("2026-08-10T12:00:00Z")),{
  scheduleDay:20,timeZone:"America/Toronto",start:"2026-07-20",nextStart:"2026-08-20",end:"2026-08-19"
});
assert.equal(occurredLocalDate("2026-08-20T04:00:00.000Z","America/Toronto"),"2026-08-20");
assert.equal(occurredLocalDate("2026-08-20","America/Toronto"),"2026-08-20");
assert.deepEqual(previousInventoryPeriod(settings,new Date("2026-08-25T12:00:00Z")),{
  scheduleDay:20,timeZone:"America/Toronto",start:"2026-07-20",nextStart:"2026-08-20",end:"2026-08-19"
});
console.log("Inventory period tests passed");
