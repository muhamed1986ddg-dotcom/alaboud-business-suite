export const DEFAULT_FINAL_BALANCE_WHATSAPP_TEMPLATE=`السلام عليكم {customerName}

المجموع النهائي {balanceDirection}:
{balance} CAD

أبو إسلام`;

export function buildFinalBalanceWhatsAppMessage(customer={},template=""){
  const name=String(customer?.name||"عميل").trim()||"عميل";
  const raw=Number(customer?.finalBalance||0);
  const finite=Number.isFinite(raw)?raw:0;
  const balance=Math.abs(finite).toFixed(2);
  const signedBalance=finite.toFixed(2);
  const balanceDirection=finite>0?"عليكم":finite<0?"لكم":"لحسابكم";
  const source=String(template||"").trim()||DEFAULT_FINAL_BALANCE_WHATSAPP_TEMPLATE;
  return source
    .replace(/\{customerName\}/g,name)
    .replace(/\{name\}/g,name)
    .replace(/\{balanceDirection\}/g,balanceDirection)
    .replace(/\{balanceAbs\}/g,balance)
    .replace(/\{balance\}/g,balance)
    .replace(/\{signedBalance\}/g,signedBalance)
    .replace(/\{currency\}/g,"CAD");
}
