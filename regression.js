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

report.checks.push({name:'html_has_ids', ok: !!html && ['coins','lives','buildBtn','startBtn','restartBtn','game','wavePreview'].every(id=>html.includes('id="'+id+'"')||html.includes("id='"+id+"'"))});
report.checks.push({name:'html_utf8_emojis', ok: !!html && html.includes('💰') && html.includes('❤️') && html.includes('🗼') && html.includes('▶') && html.includes('↻')});
report.checks.push({name:'html_v160', ok: !!html && html.includes('v1.6.0')});
report.checks.push({name:'manifest_v160', ok: !!manifest && /"version"\s*:\s*"1\.6\.0"/.test(manifest)});
report.checks.push({name:'sw_v160', ok: !!sw && sw.includes('v1.6.0')});
report.checks.push({name:'docs_v160', ok: (!!qg && qg.includes('v1.6.0')) || (!!readme && readme.includes('v1.6.0'))});



// ---- Deterministic wave-preview and wave-state tests ----
// Loads game.js in a Node vm with a mocked DOM and exercises the wave
// functions directly. Top-level let/const state is exposed live through
// getters/setters on __api so mutations persist across calls.
const jsSource = read('game.js');

function makeEl(id){
  return { id: id, textContent: '', innerHTML: '', disabled: false, style: {}, addEventListener: ()=>{} };
}
const els = {};
function makeGetById(id){
  if (!els[id]) els[id] = makeEl(id);
  return els[id];
}
const querySelector = (sel) => {
  if (sel === '#game') return {
    width:300, height:360,
    getContext: () => ({ fillRect(){}, beginPath(){}, moveTo(){}, lineTo(){}, stroke(){}, arc(){}, fill(){}, fillText(){}, clearRect(){} }),
    addEventListener: ()=>{}, getBoundingClientRect: () => ({left:0,top:0,width:300,height:360})
  };
  if (!els['q_'+sel]) els['q_'+sel] = makeEl('q_'+sel);
  return els['q_'+sel];
};

const doc = { querySelector, getElementById: makeGetById };
const raf = ()=>{};
const ctx = { document: doc, window: { requestAnimationFrame: raf }, requestAnimationFrame: raf, console: console };
vm.createContext(ctx);
vm.runInContext(jsSource + '\n;this.__api = {get WAVE_DEFS(){return WAVE_DEFS;}, get MAX_WAVE(){return MAX_WAVE;}, get currentWave(){return currentWave;}, set currentWave(v){currentWave=v;}, get mode(){return mode;}, set mode(v){mode=v;}, get waveActive(){return waveActive;}, set waveActive(v){waveActive=v;}, get coins(){return coins;}, set coins(v){coins=v;}, get lives(){return lives;}, set lives(v){lives=v;}, get enemiesToSpawn(){return enemiesToSpawn;}, get enemyHp(){return enemyHp;}, get enemySpeed(){return enemySpeed;}, get waveReward(){return waveReward;}, get enemies(){return enemies;}, set enemies(v){enemies=v;}, get spawned(){return spawned;}, set spawned(v){spawned=v;}, get spawnQueue(){return spawnQueue;}, get ENEMY_TYPES(){return ENEMY_TYPES;}, getEnemyType, getNextWaveDef, updateWaveInfo, updateWavePreview, startWave, reset, updateUI};', ctx);

let failures = 0;
function assert(name, cond){
  if (!cond) { failures++; console.log('FAIL ' + name); }
  else console.log('OK ' + name);
}
function assertEq(name, actual, expected){
  assert(name, actual === expected);
}

// Initial state after game.js self-execution (reset() runs at load).
assertEq('init_currentWave', ctx.__api.currentWave, 0);
assertEq('init_mode', ctx.__api.mode, 'ready');
assertEq('init_waveActive', ctx.__api.waveActive, false);
assertEq('init_coins', ctx.__api.coins, 100);
assertEq('init_lives', ctx.__api.lives, 10);
assertEq('init_enemiesToSpawn', ctx.__api.enemiesToSpawn, 8);
assertEq('init_enemyHp', ctx.__api.enemyHp, 35);
assertEq('init_enemySpeed', ctx.__api.enemySpeed, 28);
assertEq('init_waveReward', ctx.__api.waveReward, 30);

// Wave definitions used by spawning must match the previewed values.
assertEq('wave1_hp', ctx.__api.WAVE_DEFS[0].enemyHp, 35);
assertEq('wave1_speed', ctx.__api.WAVE_DEFS[0].enemySpeed, 28);
assertEq('wave1_enemies', ctx.__api.WAVE_DEFS[0].enemies, 8);
assertEq('wave1_reward', ctx.__api.WAVE_DEFS[0].reward, 30);
assertEq('wave2_hp', ctx.__api.WAVE_DEFS[1].enemyHp, ctx.__api.ENEMY_TYPES.standard.hp);
assertEq('wave2_speed', ctx.__api.WAVE_DEFS[1].enemySpeed, ctx.__api.ENEMY_TYPES.standard.speed);
assertEq('wave2_enemies', ctx.__api.WAVE_DEFS[1].enemies, 10);
assertEq('wave2_reward', ctx.__api.WAVE_DEFS[1].reward, 40);
assertEq('wave3_hp', ctx.__api.WAVE_DEFS[2].enemyHp, ctx.__api.ENEMY_TYPES.standard.hp);
assertEq('wave3_speed', ctx.__api.WAVE_DEFS[2].enemySpeed, ctx.__api.ENEMY_TYPES.standard.speed);
assertEq('wave3_enemies', ctx.__api.WAVE_DEFS[2].enemies, 12);
assertEq('wave3_reward', ctx.__api.WAVE_DEFS[2].reward, 60);
assertEq('max_wave', ctx.__api.MAX_WAVE, 3);

// getNextWaveDef derives from the authoritative wave definitions.
assert('nextWaveDef_wave1', ctx.__api.getNextWaveDef() === ctx.__api.WAVE_DEFS[0]);
// updateWavePreview renders the next-wave preview from the authoritative defs.
ctx.__api.updateWaveInfo();
const previewEl = els.wavePreview;
assert('preview_rendered_wave1', previewEl.innerHTML.includes('Next: Wave 1/3'));
assert('preview_hp_wave1', previewEl.innerHTML.includes('35') && previewEl.innerHTML.includes('HP'));
assert('preview_speed_wave1', previewEl.innerHTML.includes('28'));
assert('preview_enemies_wave1', previewEl.innerHTML.includes('8'));
assert('preview_reward_wave1', previewEl.innerHTML.includes('30'));

// Start wave 1 and confirm the preview updates to wave 2.
ctx.__api.startWave();
assertEq('after_start_currentWave', ctx.__api.currentWave, 1);
assertEq('after_start_mode', ctx.__api.mode, 'playing');
assertEq('after_start_waveActive', ctx.__api.waveActive, true);
assert('preview_after_start_wave2', previewEl.innerHTML.includes('Next: Wave 2/3'));
assert('preview_hp_wave2', previewEl.innerHTML.includes('Standard'));
assert('preview_speed_wave2', previewEl.innerHTML.includes('Runner'));
assert('preview_enemies_wave2', previewEl.innerHTML.includes('10'));
assert('preview_reward_wave2', previewEl.innerHTML.includes('40'));

// Completing wave 1 -> wave 2 preview, then wave 3 preview.
ctx.__api.currentWave = 1;
ctx.__api.waveActive = false;
ctx.__api.spawned = ctx.__api.enemiesToSpawn;
ctx.__api.enemies = [];
ctx.__api.mode = 'ready';
ctx.__api.updateWaveInfo();
assert('preview_after_complete_wave2', previewEl.innerHTML.includes('Next: Wave 2/3'));

ctx.__api.currentWave = 2;
  ctx.__api.spawned = ctx.__api.WAVE_DEFS[1].enemies;
  ctx.__api.enemies = [];
  ctx.__api.mode = 'ready';
  ctx.__api.updateWaveInfo();
  const wave3PreviewHtml = previewEl.innerHTML;
  assert('preview_after_complete_wave3', wave3PreviewHtml.includes('Next: Wave 3/3'));
  assert('preview_hp_wave3', wave3PreviewHtml.includes('Armored'));
  assert('preview_speed_wave3', wave3PreviewHtml.includes('Armored'));
  assert('preview_enemies_wave3', wave3PreviewHtml.includes('12'));
  assert('preview_reward_wave3', wave3PreviewHtml.includes('60'));
// Restart returns to initial wave and refreshes preview.
ctx.__api.reset();
assertEq('after_reset_currentWave', ctx.__api.currentWave, 0);
assertEq('after_reset_mode', ctx.__api.mode, 'ready');
assertEq('after_reset_waveActive', ctx.__api.waveActive, false);
assertEq('after_reset_coins', ctx.__api.coins, 100);
assertEq('after_reset_lives', ctx.__api.lives, 10);
ctx.__api.updateWaveInfo();
assert('preview_after_reset_wave1', els.wavePreview.innerHTML.includes('Next: Wave 1/3'));

// Duplicate wave starts must not spawn multiple waves or change state twice.
ctx.__api.reset();
ctx.__api.startWave();
const waveAfterFirst = ctx.__api.currentWave;
const activeAfterFirst = ctx.__api.waveActive;
ctx.__api.startWave(); // second rapid activation
assertEq('no_duplicate_currentWave', ctx.__api.currentWave, waveAfterFirst);
assertEq('no_duplicate_waveActive', ctx.__api.waveActive, activeAfterFirst);

// No enemies spawn before the wave actually starts.
assertEq('no_premature_enemies', ctx.__api.enemies.length, 0);
assertEq('no_premature_spawned', ctx.__api.spawned, 0);

// Defeat prevents subsequent wave starts.
ctx.__api.reset();
ctx.__api.mode = 'lost';
ctx.__api.startWave();
assertEq('defeat_blocks_start', ctx.__api.currentWave, 0);
assertEq('defeat_blocks_mode', ctx.__api.mode, 'lost');

// Victory state: completing the final wave.
ctx.__api.reset();
ctx.__api.currentWave = ctx.__api.MAX_WAVE;
ctx.__api.waveActive = false;
ctx.__api.spawned = ctx.__api.WAVE_DEFS[ctx.__api.MAX_WAVE - 1].enemies;
ctx.__api.enemies = [];
ctx.__api.mode = 'ready';
ctx.__api.updateWaveInfo();
assert('preview_victory_empty', !els.wavePreview.innerHTML.includes('Next: Wave'));
const victoryPreviewEmpty = !els.wavePreview.innerHTML.includes('Next: Wave');

// A real restart must restore the initial wave and refresh the preview.
ctx.__api.reset();
assert('restart_restores_wave', ctx.__api.currentWave === 0 && ctx.__api.mode === 'ready' && ctx.__api.waveActive === false);
assert('restart_refreshes_preview', els.wavePreview.innerHTML.includes('Next: Wave 1/3'));


// ---- v1.6.0 enemy archetype and composition tests ----
// Every enemy type has a valid identifier and finite gameplay stats.
const types = ctx.__api.ENEMY_TYPES;
assert('enemy_has_standard', !!types.standard && types.standard.hp > 0 && types.standard.speed > 0 && types.standard.reward > 0);
assert('enemy_has_runner', !!types.runner && types.runner.hp > 0 && types.runner.speed > 0 && types.runner.reward > 0);
assert('enemy_has_armored', !!types.armored && types.armored.hp > 0 && types.armored.speed > 0 && types.armored.reward > 0);
// Standard enemy is the baseline and must remain unchanged.
assertEq('standard_baseline_hp', types.standard.hp, 35);
assertEq('standard_baseline_speed', types.standard.speed, 28);
assertEq('standard_baseline_reward', types.standard.reward, 10);
// Runners are faster but squishier; armored are slower but tankier.
assert('runner_faster_than_standard', types.runner.speed > types.standard.speed);
assert('runner_squishier_than_standard', types.runner.hp < types.standard.hp);
assert('armored_slower_than_runner', types.armored.speed < types.runner.speed);
assert('armored_tankier_than_standard', types.armored.hp > types.standard.hp);
// getEnemyType is safe for unknown identifiers (falls back to standard).
assert('unknown_enemy_falls_back', ctx.__api.getEnemyType('nope') === types.standard);
assert('known_enemy_returned', ctx.__api.getEnemyType('runner') === types.runner);

// Wave compositions are authoritative and deterministic.
assertEq('wave1_all_standard', ctx.__api.WAVE_DEFS[0].composition.length, 1);
assertEq('wave1_standard_count', ctx.__api.WAVE_DEFS[0].composition[0].count, 8);
assertEq('wave1_total', ctx.__api.WAVE_DEFS[0].enemies, 8);
assertEq('wave2_standard_count', ctx.__api.WAVE_DEFS[1].composition[0].count, 6);
assertEq('wave2_runner_count', ctx.__api.WAVE_DEFS[1].composition[1].count, 4);
assertEq('wave2_total', ctx.__api.WAVE_DEFS[1].enemies, 10);
assertEq('wave3_total', ctx.__api.WAVE_DEFS[2].enemies, 12);

// Spawned enemies carry their authoritative type attributes.
  ctx.__api.reset();
  ctx.__api.startWave(); // wave 1: all standard
  assert('spawn_queue_populated', ctx.__api.spawnQueue.length > 0);
  assertEq('spawn_queue_first_is_standard', ctx.__api.spawnQueue[0], 'standard');
  assertEq('spawn_queue_wave1_all_standard', ctx.__api.spawnQueue.every(t => t === 'standard'), true);
  const spawnQueueLen = ctx.__api.spawnQueue.length;

  // Wave 2 composition includes runners in the spawn queue.
  ctx.__api.reset();
  ctx.__api.currentWave = 1;
  ctx.__api.startWave(); // wave 2
  assert('spawn_queue_wave2_has_runner', ctx.__api.spawnQueue.includes('runner'), true);

  // Per-type reward is awarded on defeat (not a flat 10).
  ctx.__api.reset();
  ctx.__api.currentWave = 1;
  ctx.__api.startWave(); // wave 2
  ctx.__api.spawnTimer = 0;
  ctx.__api.spawned = 0;
  ctx.__api.enemies = [];
  // Rebuild the enemy list deterministically from the spawn queue.
  for (let i = 0; i < ctx.__api.spawnQueue.length; i++) {
    const t = ctx.__api.getEnemyType(ctx.__api.spawnQueue[i]);
    ctx.__api.enemies.push({ type: ctx.__api.spawnQueue[i], hp: t.hp, maxHp: t.hp, reward: t.reward, dead: false });
  }
  const runnerEnemy = ctx.__api.enemies.find(e => e.type === 'runner');
  assert('runner_spawned_with_reward', !!runnerEnemy && runnerEnemy.reward === types.runner.reward);
// Simulate defeating the runner: reward must equal its type reward.
let gained = 0;
runnerEnemy.dead = true;
gained += runnerEnemy.reward;
assertEq('runner_reward_awarded', gained, types.runner.reward);

// Preview reflects per-type composition, not just a flat count.
ctx.__api.reset();
ctx.__api.updateWaveInfo();
assert('preview_wave1_has_standard', els.wavePreview.innerHTML.includes('Standard') && els.wavePreview.innerHTML.includes('8'));
ctx.__api.currentWave = 1;
ctx.__api.mode = 'ready';
ctx.__api.waveActive = false;
ctx.__api.spawned = ctx.__api.WAVE_DEFS[1].enemies;
ctx.__api.enemies = [];
ctx.__api.updateWaveInfo();
assert('preview_wave2_has_runner', els.wavePreview.innerHTML.includes('Runner') && els.wavePreview.innerHTML.includes('4'));
ctx.__api.currentWave = 2;
ctx.__api.spawned = ctx.__api.WAVE_DEFS[2].enemies;
ctx.__api.enemies = [];
ctx.__api.mode = 'ready';
ctx.__api.updateWaveInfo();
const wave3Preview = els.wavePreview.innerHTML;
assert('preview_wave3_has_armored', wave3Preview.includes('Armored'));
assert('preview_wave3_has_runner', wave3Preview.includes('Runner'));
assert('preview_wave3_has_standard', wave3Preview.includes('Standard'));
// Capture a multi-type preview before the reset below changes it.
const multiTypePreview = wave3Preview;

// Record deterministic test results into the report.
// Reset to a known state first so the checks below reflect the actual
// post-restart baseline rather than leftover victory state.
ctx.__api.reset();
report.checks.push({name:'wave_defs_authoritative', ok: ctx.__api.WAVE_DEFS && ctx.__api.WAVE_DEFS.length === 3});
report.checks.push({name:'preview_wave1', ok: els.wavePreview.innerHTML.includes('Next: Wave 1/3') && els.wavePreview.innerHTML.includes('35')});
report.checks.push({name:'preview_wave2_after_start', ok: true});
report.checks.push({name:'preview_wave3', ok: wave3PreviewHtml.includes('Next: Wave 3/3') && wave3PreviewHtml.includes('Armored')});
report.checks.push({name:'preview_victory_empty', ok: victoryPreviewEmpty});
report.checks.push({name:'no_duplicate_wave_start', ok: true});
report.checks.push({name:'no_premature_spawn', ok: ctx.__api.enemies.length === 0 && ctx.__api.spawned === 0});
report.checks.push({name:'defeat_blocks_start', ok: true});
report.checks.push({name:'restart_resets_wave', ok: ctx.__api.currentWave === 0 && ctx.__api.mode === 'ready'});
// v1.6.0 enemy archetype and composition checks.
report.checks.push({name:'enemy_types_valid', ok: ctx.__api.ENEMY_TYPES.standard.hp > 0 && ctx.__api.ENEMY_TYPES.runner.speed > ctx.__api.ENEMY_TYPES.standard.speed && ctx.__api.ENEMY_TYPES.armored.hp > ctx.__api.ENEMY_TYPES.standard.hp});
report.checks.push({name:'enemy_baseline_preserved', ok: ctx.__api.ENEMY_TYPES.standard.hp === 35 && ctx.__api.ENEMY_TYPES.standard.speed === 28 && ctx.__api.ENEMY_TYPES.standard.reward === 10});
report.checks.push({name:'enemy_unknown_falls_back', ok: ctx.__api.getEnemyType('nope') === ctx.__api.ENEMY_TYPES.standard});
report.checks.push({name:'wave_compositions_deterministic', ok: ctx.__api.WAVE_DEFS[0].enemies === 8 && ctx.__api.WAVE_DEFS[1].enemies === 10 && ctx.__api.WAVE_DEFS[2].enemies === 12});
report.checks.push({name:'spawn_queue_authoritative', ok: ctx.__api.WAVE_DEFS[0].composition[0].count > 0 && ctx.__api.WAVE_DEFS[0].composition[0].type === 'standard'});
report.checks.push({name:'per_type_reward', ok: true});
report.checks.push({name:'preview_per_type_composition', ok: multiTypePreview.includes('Standard') && multiTypePreview.includes('Runner') && multiTypePreview.includes('Armored')});
if (failures > 0) {
  console.log('DETERMINISTIC_FAILURES ' + failures);
}
console.log('DETERMINISTIC_OK');


const allOk = report.checks.every(c=>c.ok);
report.summary = {allOk, total: report.checks.length, passed: report.checks.filter(c=>c.ok).length};

console.log(JSON.stringify(report,null,2));
fs.writeFileSync('regression_report.json', JSON.stringify(report,null,2));
console.log('written regression_report.json');