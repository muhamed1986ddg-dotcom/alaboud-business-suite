import fs from 'node:fs';
const css=fs.readFileSync(new URL('../src/styles.css', import.meta.url),'utf8');
for (const token of ['v25.14.12 — dark readable capital turnover card','.capital-formula h3{color:#f0c95d!important','.capital-formula p:last-child strong{color:#4ade80!important','background:linear-gradient(145deg,#07111f,#0d1b2d)!important']) {
  if(!css.includes(token)) throw new Error(`missing ${token}`);
}
console.log('capital turnover dark v25.14.12 checks passed');
