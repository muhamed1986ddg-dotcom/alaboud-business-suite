import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const treasury=fs.readFileSync(new URL("../src/screens/Treasury.jsx",import.meta.url),"utf8");
const styles=fs.readFileSync(new URL("../src/styles.css",import.meta.url),"utf8");

test("Treasury uses vertical movement cards on phone widths",()=>{
  for(const width of [360,390,412])assert(width<=768,`${width}px must use the mobile card media query`);
  assert.match(treasury,/treasury-movement-cards/);
  assert.match(treasury,/treasury-movement-card__row/);
  for(const label of ["التاريخ والوقت","نوع الحركة","العملة","الكمية","المصدر","معرف الحوالة","سعر التكلفة","المتوسط لحظة العملية","سعر التسليم","ربح\/خسارة فرق السعر","الرصيد بعد العملية","الحالة"]){
    assert.match(treasury,new RegExp(label),`missing mobile field: ${label}`);
  }
  assert.match(styles,/@media\(max-width:768px\)/);
  assert.match(styles,/\.treasury-movements-desktop\{display:none\}/);
  assert.match(styles,/grid-template-columns:minmax\(92px,42%\) minmax\(0,1fr\)/);
});

test("Treasury cards contain long values and clear the bottom navigation",()=>{
  assert.match(styles,/\.treasury-page\{[\s\S]*?overflow-x:hidden/);
  assert.match(styles,/padding-bottom:calc\(96px \+ env\(safe-area-inset-bottom,0px\)\)/);
  assert.match(styles,/\.treasury-movement-card\{[\s\S]*?max-width:100%[\s\S]*?overflow:hidden/);
  assert.match(styles,/\.treasury-movement-card__value\{[\s\S]*?min-width:0[\s\S]*?overflow-wrap:anywhere[\s\S]*?word-break:break-word/);
});

test("Treasury keeps the desktop table and hides mobile cards by default",()=>{
  assert.match(styles,/\.treasury-movement-cards\{display:none\}/);
  assert.match(treasury,/treasury-movements-desktop/);
  assert.match(treasury,/<AppTable columns=\{columns\} rows=\{movementRows\}/);
});
