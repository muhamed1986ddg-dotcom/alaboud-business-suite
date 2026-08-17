"use strict";

function clean(value){
  return String(value||"").trim();
}

function normalizedReference(value){
  return clean(value).toUpperCase();
}

function normalizedPartyName(value){
  return clean(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"");
}

function officialReferenceIndex(store={}){
  const references=new Map();
  const add=(value,details)=>{
    const key=normalizedReference(value);
    if(key&&!references.has(key))references.set(key,details);
  };

  for(const customer of Array.isArray(store.customers)?store.customers:[]){
    if(!customer||customer.isDeleted||!customer.id)continue;
    add(customer.id,{kind:"CUSTOMER",id:customer.id});
    add(`CUSTOMER:${customer.id}`,{kind:"CUSTOMER",id:customer.id});
    add(`CUSTOMER_OLD_BALANCE:${customer.id}`,{kind:"CUSTOMER_OLD_BALANCE",id:customer.id});
  }
  for(const transaction of Array.isArray(store.transactions)?store.transactions:[]){
    if(!transaction||transaction.isDeleted||!transaction.id)continue;
    add(transaction.id,{kind:"TRANSFER",id:transaction.id});
    add(`TRANSFER:${transaction.id}`,{kind:"TRANSFER",id:transaction.id});
    if(transaction.number)add(transaction.number,{kind:"TRANSFER",id:transaction.id});
  }
  for(const partner of Array.isArray(store.partners)?store.partners:[]){
    if(!partner||partner.isDeleted||!partner.id)continue;
    add(partner.id,{kind:"PARTNER",id:partner.id});
    add(`PARTNER:${partner.id}`,{kind:"PARTNER",id:partner.id});
    add(`PARTNER_EXTERNAL:${partner.id}`,{kind:"PARTNER_EXTERNAL",id:partner.id});
    const currencies=new Set(Object.keys(partner.externalBalances||{}));
    currencies.add(String(partner.accountCurrency||"USD").toUpperCase());
    for(const currency of currencies)add(`PARTNER_EXTERNAL:${partner.id}:${String(currency).toUpperCase()}`,{kind:"PARTNER_EXTERNAL",id:partner.id,currency:String(currency).toUpperCase()});
  }
  return references;
}

function manualDebtLinkStatus(debt,store={},referenceIndex=officialReferenceIndex(store)){
  const customers=(Array.isArray(store.customers)?store.customers:[]).filter(item=>item&&!item.isDeleted);
  const partners=(Array.isArray(store.partners)?store.partners:[]).filter(item=>item&&!item.isDeleted);
  const customerId=clean(debt?.customerId);
  const linkedPartnerId=clean(debt?.partnerId||debt?.linkedCompanyId);
  const sourceRef=normalizedReference(debt?.sourceRef);
  let directLink=null;

  if(customerId&&customers.some(item=>String(item.id)===customerId))directLink={kind:"CUSTOMER",id:customerId};
  else if(linkedPartnerId&&partners.some(item=>String(item.id)===linkedPartnerId))directLink={kind:"PARTNER",id:linkedPartnerId};
  else if(sourceRef&&referenceIndex.has(sourceRef))directLink=referenceIndex.get(sourceRef);

  if(directLink){
    return Object.freeze({
      includedInComprehensiveTotal:false,
      reviewStatus:"LINKED_DUPLICATE",
      reviewReason:`مرتبط مباشرةً بمصدر رسمي ${directLink.kind}`,
      directLink
    });
  }

  const partyKey=normalizedPartyName(debt?.partyName);
  const suspectedCustomer=partyKey&&customers.find(item=>normalizedPartyName(item.name)===partyKey);
  const suspectedPartner=partyKey&&partners.find(item=>normalizedPartyName(item.name)===partyKey);
  const explicitlyCleared=String(debt?.reviewStatus||"").toUpperCase()==="CLEARED";
  const suspected=!explicitlyCleared&&(suspectedCustomer||suspectedPartner);
  return Object.freeze({
    // Name similarity is only a review signal. It must never delete or alter a
    // historical amount, and it is not enough to exclude the debt from totals.
    includedInComprehensiveTotal:true,
    reviewStatus:suspected?"FLAGGED":"CLEAR",
    reviewReason:suspected?"تشابه اسم فقط؛ يلزم ربط مباشر أو مراجعة بشرية":"",
    directLink:null,
    suspectedEntity:suspectedCustomer?{kind:"CUSTOMER",id:suspectedCustomer.id,name:suspectedCustomer.name}:suspectedPartner?{kind:"PARTNER",id:suspectedPartner.id,name:suspectedPartner.name}:null
  });
}

function partitionManualDebts(store={},debts=store.generalDebts){
  const rows=(Array.isArray(debts)?debts:[]).filter(item=>item&&!item.isDeleted);
  const referenceIndex=officialReferenceIndex(store);
  const included=[];
  const linkedDuplicates=[];
  const reviewFlags=[];
  for(const debt of rows){
    const link=manualDebtLinkStatus(debt,store,referenceIndex);
    const row={...debt,...link};
    if(link.includedInComprehensiveTotal)included.push(row);
    else linkedDuplicates.push(row);
    if(link.reviewStatus!=="CLEAR")reviewFlags.push({
      debtId:debt.id,
      partyName:debt.partyName||"",
      reviewStatus:link.reviewStatus,
      reviewReason:link.reviewReason,
      directLink:link.directLink||null,
      suspectedEntity:link.suspectedEntity||null
    });
  }
  return Object.freeze({included,linkedDuplicates,reviewFlags});
}

module.exports={
  normalizedPartyName,
  normalizedReference,
  officialReferenceIndex,
  manualDebtLinkStatus,
  partitionManualDebts
};
