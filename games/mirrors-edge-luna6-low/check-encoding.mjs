import fs from 'node:fs';
for (const p of ['src/main.ts','src/style.css','index.html','package.json','tsconfig.json','README.md']) {
 const b=fs.readFileSync(p); try {new TextDecoder('utf-8',{fatal:true}).decode(b); console.log(p, b[0]===0xef&&b[1]===0xbb&&b[2]===0xbf?'BOM':'UTF-8 no BOM');} catch(e){console.log(p,'INVALID UTF-8',e.message)}
}
