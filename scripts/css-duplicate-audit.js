const fs=require('fs');
const css=fs.readFileSync('frontend/src/styles.css','utf8');
const exact=new Map();
for(const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
 const selector=match[1].replace(/\/\*[\s\S]*?\*\//g,'').replace(/\s+/g,' ').trim();
 const body=match[2].replace(/\s+/g,' ').trim();
 if(!selector||selector.startsWith('@')||selector==='to')continue;
 const key=`${selector}{${body}}`;exact.set(key,(exact.get(key)||0)+1);
}
const duplicates=[...exact.entries()].filter(([,count])=>count>1);
const responsiveWhitelist=new Set([
 '.app.mobile-page-view aside{display:none!important;}',
 '.app.mobile-menu-view main{display:none!important;}',
 '.app.mobile-page-view .stats .card strong{font-size:27px!important;}',
 '.app.mobile-page-view .mobile-header-action span:last-child{display:none!important;}',
 '.settings-choice-grid.three{grid-template-columns:repeat(3,1fr);}',
 '.debt-currency-summary{padding:12px}'
]);
const unsafe=duplicates.filter(([rule])=>!responsiveWhitelist.has(rule));
if(unsafe.length){console.error(`Unsafe exact duplicate CSS rules: ${unsafe.length}`);process.exit(1)}
console.log(`CSS audit passed: ${duplicates.length} repeated responsive rules are explicitly reviewed; no unsafe exact duplicates.`);
