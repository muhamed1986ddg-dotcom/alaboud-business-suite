import assert from "node:assert/strict";
import fs from "node:fs";
const source = fs.readFileSync(new URL("../src/screens/ReportsProfits.jsx", import.meta.url), "utf8");
const vaultSource = fs.readFileSync(new URL("../src/inventoryVaultCurrencies.js", import.meta.url), "utf8");

assert(
  source.includes("🇺🇸 عرض بالدولار الأمريكي"),
  "USD display button is missing"
);

assert(
  source.includes("officialFinalInventory/Number(usdCadRate)"),
  "CAD to USD conversion must divide by USD/CAD"
);

assert(
  source.includes("هذه القيمة للعرض فقط ولا تُحفظ في الجرد"),
  "USD value must remain display-only"
);

assert(
  !source.includes("monthly-inventory/close',{vaultCash:Number(vaultCash),notes:inventoryNotes,usd"),
  "USD must never be persisted with inventory close"
);

assert(source.includes("{vaultCashByCurrency,notes:inventoryNotes}"),"inventory close must send original per-currency vault balances");
assert(source.includes("buildVaultCashRows(vaultCashByCurrency,inventoryCurrent.vaultCashExchangeRates)"),"vault preview must pass API rates to the shared calculator");
assert(vaultSource.includes("exchangeRates?.[currency]"),"shared vault calculator must use rates supplied by the inventory API");
assert(source.includes('inventoryDisplay.finalInventory??inventoryDisplay.finalValue'),"the displayed final value must come from the official backend inventory");
assert(!source.includes("+ enteredVaultCash"),"the frontend must not add converted vault cash to inventory assets");
assert(!source.includes("+ row.amount"),"raw foreign-currency balances must never be added to inventory assets");

console.log("Inventory CAD base + USD display-only regression: OK");
