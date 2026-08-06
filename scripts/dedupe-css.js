const fs=require('fs');
const path=require('path');
const file=path.resolve(process.argv[2]||'frontend/src/styles.css');
const source=fs.readFileSync(file,'utf8');
let i=0,buffer='',removed=0;const seen=new Set();
function skipString(text,index,quote){let j=index+1;while(j<text.length){if(text[j]==='\\'){j+=2;continue}if(text[j]===quote)return j+1;j++}return j}
function readBlock(text,start){let depth=0,j=start;while(j<text.length){const ch=text[j];if(ch==='"'||ch==="'"){j=skipString(text,j,ch);continue}if(ch==='/'&&text[j+1]==='*'){const end=text.indexOf('*/',j+2);j=end<0?text.length:end+2;continue}if(ch==='{')depth++;else if(ch==='}'&&--depth===0)return j+1;j++}return text.length}
while(i<source.length){const brace=source.indexOf('{',i);if(brace<0){buffer+=source.slice(i);break}const start=source.lastIndexOf('}',brace-1)+1;buffer+=source.slice(i,start);const end=readBlock(source,brace);const block=source.slice(start,end);const normalized=block.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\s+/g,' ').trim();if(seen.has(normalized)){removed++;}else{seen.add(normalized);buffer+=block}i=end}
fs.writeFileSync(file,buffer);console.log(`CSS_DEDUPE_REMOVED=${removed}`);
