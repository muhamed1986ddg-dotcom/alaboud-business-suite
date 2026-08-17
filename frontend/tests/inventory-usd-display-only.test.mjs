import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve("frontend/src/screens/ReportsProfits.jsx"),
  "utf8"
);

assert(
  source.includes("🇺🇸 عرض بالدولار الأمريكي"),
  "USD display button is missing"
);

assert(
  source.includes("previewFinalValue/Number(usdCadRate)"),
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

console.log("Inventory CAD base + USD display-only regression: OK");