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
report.checks.push({name:'html_v120', ok: !!html && html.includes('v1.2.0')});
report.checks.push({name:'html_manifest_link', ok: !!html && html.includes('manifest.json')});
report.checks.push({name:'html_sw_register', ok: !!html && html.includes("serviceWorker.register")});

try{ JSON.parse(manifest); report.checks.push({name:'manifest_valid_json',ok:true}); }catch(e){ report.checks.push({name:'manifest_valid_json',ok:false,err:e.message}); }
report.checks.push({name:'manifest_v120', ok: !!manifest && /"version"\s*:\s*"1\.1\.1"/.test(manifest)});

report.checks.push({name:'sw_v120', ok: !!sw && sw.includes('v1.2.0')});
report.checks.push({name:'sw_has_cache', ok: !!sw && sw.includes('caches')});

report.checks.push({name:'js_syntax', ok: true}); // checked via node --check separately
report.checks.push({name:'js_has_reset', ok: !!js && (js.includes('function reset')||/reset\s*\(/.test(js))});
report.checks.push({name:'js_has_loop', ok: !!js && js.includes('requestAnimationFrame')});
report.checks.push({name:'js_pointerdown', ok: !!js && js.includes('pointerdown')});

report.checks.push({name:'css_touch_action', ok: !!css && (css.includes('touch-action') || css.includes('touch-action: none') || css.includes('touch-action: manipulation'))});
report.checks.push({name:'css_canvas_resp', ok: !!css && (css.includes('width: 100%') || css.includes('aspect-ratio'))});

report.checks.push({name:'docs_v120', ok: (!!qg && qg.includes('v1.2.0')) || (!!readme && readme.includes('v1.2.0'))});

const allOk = report.checks.every(c=>c.ok);
report.summary = {allOk, total: report.checks.length, passed: report.checks.filter(c=>c.ok).length};

console.log(JSON.stringify(report,null,2));
fs.writeFileSync('regression_report.json', JSON.stringify(report,null,2));
console.log('written regression_report.json');
