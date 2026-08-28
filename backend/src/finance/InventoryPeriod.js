"use strict";

function inventoryScheduleDay(settings={}){
  const value=Math.trunc(Number(settings.inventoryDay));
  return Number.isFinite(value)?Math.max(1,Math.min(28,value)):20;
}

function localDateParts(value=new Date(),timeZone="America/Toronto"){
  const date=value instanceof Date?value:new Date(value);
  try{
    const parts=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date);
    const fields=Object.fromEntries(parts.map(part=>[part.type,part.value]));
    return {date:`${fields.year}-${fields.month}-${fields.day}`,time:`${fields.hour}:${fields.minute}`,year:Number(fields.year),month:Number(fields.month),day:Number(fields.day),timeZone};
  }catch(_error){
    return {date:date.toISOString().slice(0,10),time:date.toISOString().slice(11,16),year:date.getUTCFullYear(),month:date.getUTCMonth()+1,day:date.getUTCDate(),timeZone:"UTC"};
  }
}

function inventoryLocalDate(settings={},value=new Date()){
  return localDateParts(value,String(settings.timeZone||"America/Toronto"));
}

function shiftMonth(year,month,offset){
  const date=new Date(Date.UTC(year,month-1+offset,1));
  return {year:date.getUTCFullYear(),month:date.getUTCMonth()+1};
}

function dateKey(year,month,day){return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;}

function currentInventoryPeriod(settings={},value=new Date()){
  const local=inventoryLocalDate(settings,value);
  const scheduleDay=inventoryScheduleDay(settings);
  const startMonth=local.day>=scheduleDay?{year:local.year,month:local.month}:shiftMonth(local.year,local.month,-1);
  const nextMonth=shiftMonth(startMonth.year,startMonth.month,1);
  const start=dateKey(startMonth.year,startMonth.month,scheduleDay);
  const nextStart=dateKey(nextMonth.year,nextMonth.month,scheduleDay);
  const endDate=new Date(`${nextStart}T00:00:00Z`);endDate.setUTCDate(endDate.getUTCDate()-1);
  return {scheduleDay,timeZone:local.timeZone,start,nextStart,end:endDate.toISOString().slice(0,10)};
}

function previousInventoryPeriod(settings={},value=new Date()){
  const current=currentInventoryPeriod(settings,value);
  const [year,month]=current.start.split("-").map(Number);
  const previousMonth=shiftMonth(year,month,-1);
  const start=dateKey(previousMonth.year,previousMonth.month,current.scheduleDay);
  const nextStart=current.start;
  const endDate=new Date(`${nextStart}T00:00:00Z`);endDate.setUTCDate(endDate.getUTCDate()-1);
  return {...current,start,nextStart,end:endDate.toISOString().slice(0,10)};
}

function occurredLocalDate(value,timeZone){
  const text=String(value||"");
  if(/^\d{4}-\d{2}-\d{2}$/.test(text))return text;
  const parsed=new Date(text);
  return Number.isFinite(parsed.getTime())?localDateParts(parsed,timeZone).date:"";
}

module.exports={inventoryScheduleDay,inventoryLocalDate,currentInventoryPeriod,previousInventoryPeriod,occurredLocalDate};
