"use strict";

function normalizeCustomerSearchDigits(value){
  return String(value||"")
    .replace(/[٠-٩]/g,digit=>String(digit.charCodeAt(0)-0x0660))
    .replace(/[۰-۹]/g,digit=>String(digit.charCodeAt(0)-0x06f0))
    .replace(/\D/g,"");
}

function customerMatchesSearch(customer,search,fields=["name","phone","customerNumber","identityNumber"]){
  const lowered=String(search||"").trim().toLowerCase();
  if(!lowered)return true;
  if(fields.some(field=>String(customer?.[field]||"").toLowerCase().includes(lowered)))return true;
  const digitSearch=normalizeCustomerSearchDigits(search);
  if(!digitSearch)return false;
  return fields.filter(field=>field!=="name")
    .some(field=>normalizeCustomerSearchDigits(customer?.[field]).includes(digitSearch));
}

module.exports={normalizeCustomerSearchDigits,customerMatchesSearch};
