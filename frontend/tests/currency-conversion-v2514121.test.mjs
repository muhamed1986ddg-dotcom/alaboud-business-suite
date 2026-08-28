import test from "node:test";
import assert from "node:assert/strict";
import {cadPerCurrency,resolveCurrencyConversion,quotedRateFromCanonical} from "../src/currencyConversion.js";

const rates=[
  {id:"cad",baseCurrency:"USD",quoteCurrency:"CAD",sellRate:1.40,createdAt:"2026-08-27T10:00:00.000Z",source:"GLOBAL_USD_FEED"},
  {id:"eur",baseCurrency:"USD",quoteCurrency:"EUR",sellRate:0.92,createdAt:"2026-08-27T10:00:00.000Z",source:"GLOBAL_USD_FEED"},
  {id:"syp",baseCurrency:"USD",quoteCurrency:"SYP",sellRate:13000,createdAt:"2026-08-27T10:00:00.000Z",source:"GLOBAL_USD_FEED"},
];

test("EUR and SYP resolve to CAD through USD",()=>{
  assert.ok(Math.abs(cadPerCurrency(rates,"EUR")-(1.40/0.92))<1e-12);
  assert.ok(Math.abs(cadPerCurrency(rates,"SYP")-(1.40/13000))<1e-12);
  assert.deepEqual(resolveCurrencyConversion(rates,"EUR","CAD").path,["EUR","USD","CAD"]);
});

test("canonical CAD rate can be quoted in EUR or SYP without losing value",()=>{
  const canonical=1.40;
  assert.ok(Math.abs(quotedRateFromCanonical(rates,canonical,"EUR")-0.92)<1e-12);
  assert.ok(Math.abs(quotedRateFromCanonical(rates,canonical,"SYP")-13000)<1e-8);
});
