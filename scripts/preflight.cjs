const fs=require('node:fs'),{spawnSync}=require('node:child_process');let failed=false;
for(const file of ['app.js','scripts/serve.cjs','scripts/build.cjs']){const r=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(r.status!==0)failed=true;}
for(const file of ['index.html','style.css','app.js','favicon.ico','package.json','package-lock.json','docs/design-and-validation.md'])if(!fs.existsSync(file)){console.error('Missing '+file);failed=true}
for(const file of ['package.json','package-lock.json'])try{JSON.parse(fs.readFileSync(file))}catch(e){console.error(e.message);failed=true}
const html=fs.readFileSync('index.html','utf8');const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);if(new Set(ids).size!==ids.length){console.error('Duplicate HTML id');failed=true}
const r=spawnSync(process.execPath,['--test',...fs.readdirSync('tests').filter(x=>x.endsWith('.test.cjs')).map(x=>'tests/'+x)],{stdio:'inherit'});if(r.status!==0)failed=true;
if(failed)process.exit(1);console.log('Preflight passed: syntax, files, JSON, DOM IDs and complete test suite');
