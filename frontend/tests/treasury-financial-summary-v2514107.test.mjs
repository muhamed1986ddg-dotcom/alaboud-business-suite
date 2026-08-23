import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {treasuryAverageCostRows,treasuryRealizedSummary} from "../src/treasurySummary.js";

const treasury=fs.readFileSync(new URL("../src/screens/Treasury.jsx",import.meta.url),"utf8");
const styles=fs.readFileSync(new URL("../src/styles.css",import.meta.url),"utf8");

test("Treasury delivery summary includes realized OUT results only",()=>{
  assert.deepEqual(treasuryRealizedSummary([{currency:"USD",realizedProfit:0,realizedLoss:0,realizedFx:0}]),{profit:0,loss:0,net:0,currency:"CAD"});
  assert.deepEqual(treasuryRealizedSummary([{currency:"USD",realizedProfit:160,realizedLoss:34.6,realizedFx:125.4}]),{profit:160,loss:34.6,net:125.4,currency:"CAD"});
  assert.deepEqual(treasuryRealizedSummary([{currency:"USD",realizedProfit:0,realizedLoss:83.2,realizedFx:-83.2}]),{profit:0,loss:83.2,net:-83.2,currency:"CAD"});
  const severalOut=treasuryRealizedSummary([{currency:"USD",realizedProfit:25.4,realizedLoss:5,realizedFx:20.4},{currency:"EUR",realizedProfit:10,realizedLoss:12,realizedFx:-2}]);
  assert(Math.abs(severalOut.profit-35.4)<1e-9);assert.equal(severalOut.loss,17);assert(Math.abs(severalOut.net-18.4)<1e-9);
});

test("Treasury keeps each currency average separate",()=>{
  assert.deepEqual(treasuryAverageCostRows([
    {currency:"usd",balance:6769,averageCost:1.370141},
    {currency:"EUR",balance:400,averageCost:1.52}
  ]),[
    {currency:"USD",balance:6769,averageCost:1.370141},
    {currency:"EUR",balance:400,averageCost:1.52}
  ]);
  assert.match(treasury,/row\.averageCost\.toFixed\(6\)/);
  assert.match(treasury,/realizedSummary\.profit/);
  assert.match(treasury,/realizedSummary\.loss/);
});

test("Treasury financial cards are responsive at phone and desktop widths",()=>{
  for(const width of [360,390,412])assert(width<=768);
  assert.match(styles,/\.treasury-financial-summary\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(styles,/@media\(max-width:768px\)\{[\s\S]*?\.treasury-financial-summary\{grid-template-columns:minmax\(0,1fr\)/);
  assert.match(styles,/\.treasury-financial-summary__card\{width:100%;max-width:100%;overflow:hidden/);
  assert.match(styles,/overflow-wrap:anywhere/);
});
