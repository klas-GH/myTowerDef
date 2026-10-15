const fs = require('fs');
const vm = require('vm');

function read(p){ try{return fs.readFileSync(p,'utf8');}catch(e){return null;} }
function exists(p){ return fs.existsSync(p); }

const files = ['index.html','game.js','style.css','manifest.json','sw.js','quick_Guide.txt','README.md','icon.svg'];
const report = {
  ts: new Date().toISOString(),
  files: files.map(f=>({name:f,exists:exists(f),size: exists(f)? read(f).length:0})),
  checks: []
};

const html = read('index.html');
const js = read('game.js');
const manifest = read('manifest.json');
const sw = read('sw.js');
const css = read('style.css');
const qg = read('quick_Guide.txt');
const readme = read('README.md');

report.checks.push({name:'html_has_ids', ok: !!html && ['coins','lives','buildBtn','startBtn','restartBtn','game'].every(id=>html.includes('id="'+id+'"')||html.includes("id='"+id+"'"))});
report.checks.push({name:'html_utf8_emojis', ok: !!html && html.includes('💰') && html.includes('❤️') && html.includes('🗼') && html.includes('▶') && html.includes('↻')});
report.checks.push({name:'html_v130', ok: !!html && html.includes('v1.3.0')});
report.checks.push({name:'manifest_v130', ok: !!manifest && /"version"\s*:\s*"1\.3\.0"/.test(manifest)});
report.checks.push({name:'sw_v130', ok: !!sw && sw.includes('v1.3.0')});
report.checks.push({name:'docs_v130', ok: (!!qg && qg.includes('v1.3.0')) || (!!readme && readme.includes('v1.3.0'))});

const allOk = report.checks.every(c=>c.ok);
report.summary = {allOk, total: report.checks.length, passed: report.checks.filter(c=>c.ok).length};

console.log(JSON.stringify(report,null,2));
fs.writeFileSync('regression_report.json', JSON.stringify(report,null,2));
console.log('written regression_report.json');
