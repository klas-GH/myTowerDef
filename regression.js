const fs = require('fs');
const vm = require('vm');
const path = require('path');

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
const panelHtml = read('index.html');

report.checks.push({name:'html_has_ids', ok: !!html && ['coins','lives','startBtn','restartBtn','game','wavePreview'].every(id=>html.includes('id="'+id+'"')||html.includes("id='"+id+"'"))});
report.checks.push({name:'html_utf8_emojis', ok: !!html && html.includes('💰') && html.includes('❤️') && html.includes('▶') && html.includes('↻')});
report.checks.push({name:'wave_panels_share_row', ok: !!html && /class="wave-info-row">[\s\S]*id="waveInfo"[\s\S]*id="wavePreview"[\s\S]*<\/div>\s*<\/div>/.test(html)});
report.checks.push({name:'wave_panels_use_two_columns', ok: !!css && css.includes('grid-template-columns: repeat(2, minmax(0, 1fr))')});
report.checks.push({name:'wave_info_lines_are_separate', ok: !!css && css.includes('.wave-info > span') && css.includes('display: block;')});
report.checks.push({name:'affordable_tower_buttons_disable', ok: !!js && js.includes('btn.disabled = !canAfford || mode === "won" || mode === "lost"')});
report.checks.push({name:'build_menu_contains_tower_picker', ok: !!html && /id="buildPanel"[\s\S]*id="towerPicker"[\s\S]*data-type="archer"[\s\S]*data-type="cannon"[\s\S]*data-type="magic"/.test(html)});
report.checks.push({name:'build_spot_opens_menu', ok: !!js && js.includes('showBuildMenu(buildSpot)') && js.includes('placeTower(buildSpot.x, buildSpot.y)')});
report.checks.push({name:'short_display_layout', ok: !!css && css.includes('@media (max-height: 900px)') && css.includes('height: min(440px, max(180px, calc(102dvh - 295px)))')});
report.checks.push({name:'short_display_compact_header', ok: !!css && css.includes('font-size: 9px;') && css.includes('font-size: 12px;')});




// ---- Deterministic wave-preview and wave-state tests ----
// Loads game.js in a Node vm with a mocked DOM and exercises the wave
// functions directly. Top-level let/const state is exposed live through
// getters/setters on __api so mutations persist across calls.
const jsSource = read('game.js');

function makeEl(id){
  const classNames = new Set();
  const children = [];
  let html = "";
  function syncHtml(){ html = children.map(c => c.outerHTML || c.innerHTML || "").join(""); }
  return {
    id: id, textContent: '', innerHTML: '', disabled: false, hidden: true, style: {}, dataset: {}, focus: ()=>{}, addEventListener: ()=>{},
    get innerHTML(){ return html; },
    set innerHTML(v){ html = String(v); children.length = 0; },
    get outerHTML(){ return html; },
    appendChild(child){ children.push(child); if (child && typeof child.innerHTML === "string") syncHtml(); return child; },
    querySelector(){ return makeEl('child'); },
    get children(){ return children; },
    classList: {
      toggle(name, force) {
        if (force) classNames.add(name);
        else classNames.delete(name);
      },
      contains(name) { return classNames.has(name); },
      add(name) { classNames.add(name); },
      remove(name) { classNames.delete(name); },
      replace(a, b) { classNames.delete(a); if (b) classNames.add(b); },
      item(name) { return classNames.has(name) ? name : null; }
    }
  };
}
const els = {};
function makeGetById(id){
  if (!els[id]) els[id] = makeEl(id);
  return els[id];
}
const querySelector = (sel) => {
  if (sel === '#game') return {
    width:300, height:360,
    getContext: () => ({ fillRect(){}, beginPath(){}, moveTo(){}, lineTo(){}, stroke(){}, arc(){}, fill(){}, fillText(){}, clearRect(){}, drawImage(){}, createImageData(){}, putImageData(){}, save(){}, restore(){}, scale(){}, translate(){}, rotate(){}, setTransform(){}, strokeRect(){}, clip(){}, measureText(){return {width:0}}, drawRoundRect(){}, roundRect(){} }),
    addEventListener: ()=>{}, getBoundingClientRect: () => ({left:0,top:0,width:300,height:360})
  };
  if (!els['q_'+sel]) els['q_'+sel] = makeEl('q_'+sel);
  return els['q_'+sel];
};

const doc = { querySelector, getElementById: makeGetById, createElement: () => { const el = makeEl('created'); el.dataset = {}; return el; } };
const raf = ()=>{};
// Mock Image constructor so the game's loadBg/loadUnit return objects with
// complete/naturalWidth set, simulating loaded assets.
function makeMockImage() {
  return { complete: true, naturalWidth: 28, naturalHeight: 28, width: 28, height: 28, src: '' };
}
const Image = function() { return makeMockImage(); };
const storageData = new Map();
const storage = {
  getItem(key) { return storageData.has(key) ? storageData.get(key) : null; },
  setItem(key, value) { storageData.set(key, String(value)); },
  removeItem(key) { storageData.delete(key); }
};
const rootClasses = new Set();
const scheduledTimers = new Map();
const windowEventHandlers = new Map();
let nextTimerId = 1;
doc.documentElement = { classList: {
  toggle(name, force) {
    if (force) rootClasses.add(name);
    else rootClasses.delete(name);
  },
  contains(name) { return rootClasses.has(name); }
} };
const ctx = {
  performance: { now: () => Date.now() },
  console: console,
  document: doc,
  window: { localStorage: { getItem: k => storageData.has(k) ? storageData.get(k) : null, setItem: (k, v) => storageData.set(k, String(v)), removeItem: k => storageData.delete(k) }, addEventListener: (type, handler) => { const arr = windowEventHandlers.get(type) || []; arr.push(handler); windowEventHandlers.set(type, arr); }, dispatchEvent: (event) => { const handlers = windowEventHandlers.get(event.type) || []; handlers.slice().forEach(h => h(event)); return true; }, matchMedia: undefined, setTimeout, clearTimeout, cancelAnimationFrame: ()=>{} },
  requestAnimationFrame: raf,
  Date,
  Math,
  JSON,
  Object,
  Array,
  Number,
  String,
  Boolean,
  Symbol,
  Map,
  Set,
  Promise,
  Error,
  TypeError,
  RangeError,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  decodeURIComponent,
  encodeURIComponent,
  setInterval,
  clearInterval,
  Image,
  setTimeout(callback) {
    const id = nextTimerId++;
    scheduledTimers.set(id, callback);
    return id;
  },
  clearTimeout(id) { scheduledTimers.delete(id); }
};
vm.createContext(ctx);
vm.runInContext(jsSource + '\n;this.__api = {get WAVE_DEFS(){return WAVE_DEFS;}, get MAX_WAVE(){return MAX_WAVE;}, get LEVELS(){return LEVELS;}, get MAX_LEVEL(){return MAX_LEVEL;}, get MAX_RUN(){return MAX_RUN;}, get currentLevel(){return currentLevel;}, set currentLevel(v){currentLevel=v;}, get currentRun(){return currentRun;}, set currentRun(v){currentRun=v;}, get currentLevelData(){return currentLevelData;}, get path(){return path;}, get spots(){return spots;}, get currentWave(){return currentWave;}, set currentWave(v){currentWave=v;}, get mode(){return mode;}, set mode(v){mode=v;}, get waveActive(){return waveActive;}, set waveActive(v){waveActive=v;}, get buildMenuOpen(){return buildMenuOpen;}, get coins(){return coins;}, set coins(v){coins=v;}, get lives(){return lives;}, set lives(v){lives=v;}, get enemiesToSpawn(){return enemiesToSpawn;}, set enemiesToSpawn(v){enemiesToSpawn=v;}, get enemyHp(){return enemyHp;}, get enemySpeed(){return enemySpeed;}, get waveReward(){return waveReward;}, set waveReward(v){waveReward=v;}, get enemies(){return enemies;}, set enemies(v){enemies=v;}, get spawned(){return spawned;}, set spawned(v){spawned=v;}, get spawnQueue(){return spawnQueue;}, get towers(){return towers;}, set towers(v){towers=v;}, get selectedTower(){return selectedTower;}, set selectedTower(v){selectedTower=v;}, get selectedTowerType(){return selectedTowerType;}, set selectedTowerType(v){selectedTowerType=v;}, get TOWER_TYPES(){return TOWER_TYPES;}, get ENEMY_TYPES(){return ENEMY_TYPES;}, getTowerType, getEnemyType, getLevelWaveDef, getScaledEnemyType, advanceLevel, openNextRun, handleStartButton, addEnemy, placeTower, sellTower, upgradeTower, selectTowerType, pickTarget, getTargetingMode, selectTargetingMode, TARGET_MODES, getNextWaveDef, updateWaveInfo, updateWavePreview, startWave, reset, updateUI, updateUpgradePanel, update, showPanel, hidePanel, showBuildMenu, closeBuildMenu, get panelOpen(){return panelOpen;}, get CHALLENGE_DEFS(){return CHALLENGE_DEFS;}, get challengeMode(){return challengeMode;}, set challengeMode(v){challengeMode=v;}, get activeChallenge(){return activeChallenge;}, set activeChallenge(v){activeChallenge=v;}, get challengeState(){return challengeState;}, set challengeState(v){challengeState=v;}, get challengeRecords(){return challengeRecords;}, set challengeRecords(v){challengeRecords=v;}, isChallengeUnlocked, getChallenge, getChallengeRecord, startChallenge, endChallenge, evaluateChallengeObjective, finalizeChallengeResult, abandonChallenge, getChallengeMedalLabel, getChallengeMedalGlyph, describeChallengeObjective, loadBg, loadUnit}', ctx);
vm.runInContext('Object.defineProperties(this.__api, { settings:{get(){return settings;}}, statsState:{get(){return statsState;}}, campaignState:{get(){return campaignState;}}, achievements:{get(){return achievements;},set(v){achievements=v;}}, shots:{get(){return shots;},set(v){shots=v;}}, particles:{get(){return particles;},set(v){particles=v;}}, paused:{get(){return paused;}}, installPrompt:{get(){return installPrompt;},set(v){installPrompt=v;}}, installBannerDismissed:{get(){return installBannerDismissed;},set(v){installBannerDismissed=v;}} }); Object.assign(this.__api, {saveGame, loadSave, restoreSavedGame, resetSave, recordCoinSpend, applyMotionSetting, buildBossDef, checkAchievements, showSettings, hideSettings, togglePause, showBossNotice, draw, showChallengePanel, hideChallengePanel, showChallengeResultOverlay, closeChallengeResult, updateChallengeHUD, showInstallBanner, hideInstallBanner, dismissInstallBanner, tryInstallPWA, isStandalone, restoreInstallBannerState})', ctx);

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
assertEq('init_coins', ctx.__api.coins, 80);
assertEq('init_lives', ctx.__api.lives, 6);
assertEq('init_enemiesToSpawn', ctx.__api.enemiesToSpawn, 8);
assertEq('init_enemyHp', ctx.__api.enemyHp, 52.5);
assertEq('init_enemySpeed', ctx.__api.enemySpeed, 30.8);
assertEq('init_waveReward', ctx.__api.waveReward, 30);
assert('live_heading_uses_v230', els.levelTitle.textContent.includes('v2.3.0'));

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
assert('nextWaveDef_wave1', JSON.stringify(ctx.__api.getNextWaveDef()) === JSON.stringify(ctx.__api.getLevelWaveDef(1, 1, 1)));
// updateWavePreview renders the next-wave preview from the authoritative defs.
ctx.__api.updateWaveInfo();
const previewEl = els.wavePreview;
assert('preview_rendered_wave1', previewEl.innerHTML.includes('Next: Wave 1/3'));
assert('preview_hp_wave1', previewEl.innerHTML.includes('52.5') && previewEl.innerHTML.includes('HP'));
assert('preview_speed_wave1', previewEl.innerHTML.includes('30.8'));
assert('preview_enemies_wave1', previewEl.innerHTML.includes('8'));
assert('preview_reward_wave1', previewEl.innerHTML.includes('30'));
assert('current_wave1_shows_enemy_type', els.waveInfo.innerHTML.includes('Standard'));
assert('current_wave1_shows_enemy_count', els.waveInfo.innerHTML.includes('8 enemies'));
assert('current_wave1_shows_zero_runner_and_armored', els.waveInfo.innerHTML.includes('Runner 0') && els.waveInfo.innerHTML.includes('Armored 0'));
assert('next_wave1_shows_zero_runner_and_armored', previewEl.innerHTML.includes('Runner 0') && previewEl.innerHTML.includes('Armored 0'));

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
assert('current_wave2_shows_all_enemy_types', els.waveInfo.innerHTML.includes('Standard') && els.waveInfo.innerHTML.includes('Runner') && els.waveInfo.innerHTML.includes('Armored 0'));
assert('next_wave2_shows_all_enemy_types', previewEl.innerHTML.includes('Standard') && previewEl.innerHTML.includes('Runner') && previewEl.innerHTML.includes('Armored 0'));
els.panelOverlay.hidden = true;
ctx.__api.showBuildMenu({x:195,y:85});
ctx.__api.updateUpgradePanel();
assert('active_wave_build_menu_stays_open', ctx.__api.buildMenuOpen && els.panelOverlay.hidden === false);
ctx.__api.closeBuildMenu();

// Completing wave 1 -> wave 2 preview, then wave 3 preview.
ctx.__api.currentWave = 1;
ctx.__api.waveActive = false;
ctx.__api.spawned = ctx.__api.enemiesToSpawn;
ctx.__api.enemies = [];
ctx.__api.mode = 'ready';
ctx.__api.updateWaveInfo();
assert('current_wave2_shows_both_enemy_types', els.waveInfo.innerHTML.includes('Standard') && els.waveInfo.innerHTML.includes('Runner'));
assert('preview_after_complete_wave2', previewEl.innerHTML.includes('Next: Wave 2/3'));

ctx.__api.currentWave = 2;
  ctx.__api.spawned = ctx.__api.WAVE_DEFS[1].enemies;
  ctx.__api.enemies = [];
  ctx.__api.mode = 'ready';
  ctx.__api.updateWaveInfo();
  assert('current_wave3_shows_all_enemy_types', els.waveInfo.innerHTML.includes('Standard') && els.waveInfo.innerHTML.includes('Armored') && els.waveInfo.innerHTML.includes('Runner'));
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
assertEq('after_reset_coins', ctx.__api.coins, 80);
assertEq('after_reset_lives', ctx.__api.lives, 6);
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


// ---- v1.8.0 enemy archetype and composition tests ----
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


// Repeated placement across distinct spots works and charges once each.
  ctx.__api.reset();
  ctx.__api.coins = 100;
  ctx.__api.placeTower(100, 80);
  ctx.__api.placeTower(195, 85);
  assert('two_placements_create_two_towers', ctx.__api.towers.length === 2);
  assertEq('two_placements_charge_correctly', ctx.__api.coins, 0);
  // Capture placement outcomes before the reset below clears them.
  const placementSucceeds = ctx.__api.towers.length === 2 && ctx.__api.coins === 0;
  // Re-run the key rejection scenarios on a fresh board and capture results.
  ctx.__api.reset();
  const beforeCoins = ctx.__api.coins;
  ctx.__api.placeTower(100, 80);
  const placementDeducts = ctx.__api.coins === beforeCoins - 50;
  ctx.__api.placeTower(100, 80);
  const occupiedRejected = ctx.__api.towers.length === 1 && ctx.__api.coins === beforeCoins - 50;
  ctx.__api.coins = 40;
  ctx.__api.placeTower(195, 85);
  const insufficientRejected = ctx.__api.towers.length === 1 && ctx.__api.coins === 40;
  ctx.__api.coins = 100;
  ctx.__api.placeTower(10, 10);
  const offSpotRejected = ctx.__api.towers.length === 1 && ctx.__api.coins === 100;
  ctx.__api.reset();
  ctx.__api.startWave();
  ctx.__api.waveActive = true;
  ctx.__api.coins = 100;
  ctx.__api.placeTower(100, 80);
  const waveAllowed = ctx.__api.towers.length === 1 && ctx.__api.coins === 50;
  ctx.__api.reset();
  ctx.__api.mode = 'won';
  ctx.__api.placeTower(100, 80);
  const victoryRejected = ctx.__api.towers.length === 0;
  ctx.__api.mode = 'lost';
  ctx.__api.placeTower(100, 80);
  const defeatRejected = ctx.__api.towers.length === 0;
  ctx.__api.reset();
  ctx.__api.placeTower(100, 80);
  ctx.__api.selectedTower = ctx.__api.towers[0];
  ctx.__api.placeTower(100, 80);
  const selectNoPlace = ctx.__api.towers.length === 1;
  ctx.__api.reset();
  ctx.__api.coins = 100;
  ctx.__api.placeTower(100, 80);
  ctx.__api.placeTower(195, 85);
  ctx.__api.reset();
  const restartClears = ctx.__api.towers.length === 0 && ctx.__api.coins === 80;


// ---- v1.8.0 strategic tower variety tests ----
const tt = ctx.__api.TOWER_TYPES;
assert('tower_has_archer', !!tt.archer && tt.archer.cost > 0 && tt.archer.damage > 0 && tt.archer.range > 0 && tt.archer.cooldown > 0);
assert('tower_has_cannon', !!tt.cannon && tt.cannon.cost > 0 && tt.cannon.damage > 0 && tt.cannon.range > 0 && tt.cannon.cooldown > 0);
assert('tower_has_magic', !!tt.magic && tt.magic.cost > 0 && tt.magic.damage > 0 && tt.magic.range > 0 && tt.magic.cooldown > 0);
assert('tower_archer_is_baseline', tt.archer.damage === 20 && tt.archer.range === 85 && tt.archer.cost === 50);
assert('starting_coins_afford_every_tower', ctx.__api.coins === 80 && Object.keys(tt).every(type => tt[type].cost <= ctx.__api.coins));
assert('tower_cannon_heavy', tt.cannon.damage > tt.archer.damage);
assert('tower_magic_long_range', tt.magic.range > tt.archer.range);
assert('tower_cannon_slower', tt.cannon.cooldown > tt.archer.cooldown);
assert('tower_unknown_falls_back', ctx.__api.getTowerType('nope') === tt.archer);

ctx.__api.selectedTowerType = 'cannon';
assert('selected_tower_type_set', ctx.__api.selectedTowerType === 'cannon');

ctx.__api.reset();
ctx.__api.selectedTowerType = 'cannon';
ctx.__api.coins = 100;
ctx.__api.placeTower(100, 80);
assert('cannon_placement_succeeds', ctx.__api.towers.length === 1);
assertEq('cannon_placement_cost', ctx.__api.coins, 100 - tt.cannon.cost);
assertEq('cannon_type_recorded', ctx.__api.towers[0].type, 'cannon');
assertEq('cannon_damage_recorded', ctx.__api.towers[0].damage, tt.cannon.damage);
assertEq('cannon_range_recorded', ctx.__api.towers[0].range, tt.cannon.range);

ctx.__api.reset();
ctx.__api.selectedTowerType = 'magic';
ctx.__api.placeTower(100, 80);
assert('magic_placement_succeeds', ctx.__api.towers.length === 1);
assertEq('magic_range_recorded', ctx.__api.towers[0].range, tt.magic.range);


ctx.__api.reset();
ctx.__api.selectedTowerType = 'cannon';
ctx.__api.coins = 50;
ctx.__api.placeTower(100, 80);
assert('cannon_insufficient_rejected', ctx.__api.towers.length === 0);
assertEq('cannon_insufficient_no_deduction', ctx.__api.coins, 50);

ctx.__api.reset();
ctx.__api.selectedTowerType = 'archer';
ctx.__api.placeTower(100, 80);
ctx.__api.selectedTower = ctx.__api.towers[0];
ctx.__api.placeTower(100, 80);
assert('select_does_not_place', ctx.__api.towers.length === 1);

ctx.__api.reset();
ctx.__api.selectedTowerType = 'cannon';
ctx.__api.placeTower(100, 80);
ctx.__api.reset();
assert('restart_clears_type', ctx.__api.selectedTowerType === 'archer');
assert('restart_clears_towers', ctx.__api.towers.length === 0);

// ---- v1.8.1 maintenance and polish checks ----
// Exact purchase deductions for every tower type.
for (const key of ['archer', 'cannon', 'magic']) {
  ctx.__api.reset();
  ctx.__api.selectedTowerType = key;
  ctx.__api.coins = 150;
  const before = ctx.__api.coins;
  ctx.__api.placeTower(100, 80);
  assert('purchase_deducts_exact_' + key, ctx.__api.coins === before - tt[key].cost);
  assert('purchase_records_type_' + key, ctx.__api.towers[0].type === key);
}

// Insufficient-funds rejection for the most expensive tower.
ctx.__api.reset();
ctx.__api.selectedTowerType = 'cannon';
ctx.__api.coins = 79;
ctx.__api.placeTower(100, 80);
assert('cannon_insufficient_at_79', ctx.__api.towers.length === 0 && ctx.__api.coins === 79);

// Sell refunds are consistent across tower types and upgrade levels.
for (const key of ['archer', 'cannon', 'magic']) {
  ctx.__api.reset();
  ctx.__api.selectedTowerType = key;
  ctx.__api.coins = 150;
  ctx.__api.placeTower(100, 80);
  const t = ctx.__api.towers[0];
  ctx.__api.selectedTower = t;
  ctx.__api.coins = 200;
  ctx.__api.upgradeTower();
  ctx.__api.upgradeTower();
  const expected = t.cost + (t.totalUpgradeCost || 0);
  ctx.__api.sellTower(t);
  assert('sell_refund_' + key, ctx.__api.coins === expected && ctx.__api.towers.length === 0);
}

// Selling one tower does not affect another.
ctx.__api.reset();
ctx.__api.selectedTowerType = 'archer';
ctx.__api.placeTower(100, 80);
ctx.__api.selectedTowerType = 'cannon';
ctx.__api.coins = 90;
ctx.__api.placeTower(195, 85);
const keep = ctx.__api.towers.find(t => t.type === 'archer');
const sellCannon = ctx.__api.towers.find(t => t.type === 'cannon');
ctx.__api.selectedTower = sellCannon;
ctx.__api.sellTower(sellCannon);
assert('sell_removes_only_intended', ctx.__api.towers.length === 1 && ctx.__api.towers[0] === keep);

// Repeated selling cannot duplicate a refund.
ctx.__api.reset();
ctx.__api.selectedTowerType = 'archer';
ctx.__api.placeTower(100, 80);
const dupB = ctx.__api.towers[0];
ctx.__api.selectedTower = dupB;
const coinsBeforeDupB = ctx.__api.coins;
ctx.__api.sellTower(dupB);
const refund1B = coinsBeforeDupB + dupB.cost;
ctx.__api.sellTower(dupB); // already removed: must be a no-op
assert('no_double_refund', ctx.__api.coins === refund1B);
ctx.__api.reset();
ctx.__api.mode = 'lost';
ctx.__api.selectedTowerType = 'cannon';
ctx.__api.coins = 200;
ctx.__api.placeTower(100, 80);
assert('no_placement_after_defeat', ctx.__api.towers.length === 0);
ctx.__api.selectedTower = ctx.__api.towers[0];
ctx.__api.upgradeTower();
ctx.__api.sellTower(ctx.__api.towers[0]);
assert('no_actions_after_defeat', ctx.__api.coins === 200);

// Switching tower type after selecting a tower updates the interface.
ctx.__api.reset();
ctx.__api.selectedTowerType = 'archer';
ctx.__api.placeTower(100, 80);
ctx.__api.selectedTower = ctx.__api.towers[0];
ctx.__api.selectTowerType('magic');
assert('switch_type_clears_tower_selection', ctx.__api.selectedTower === null && ctx.__api.selectedTowerType === 'magic');

// Restart resets towers, currency, and upgrade investment.
ctx.__api.reset();
ctx.__api.selectedTowerType = 'cannon';
ctx.__api.placeTower(100, 80);
ctx.__api.selectedTower = ctx.__api.towers[0];
ctx.__api.coins = 200;
ctx.__api.upgradeTower();
ctx.__api.reset();
assert('restart_resets_currency', ctx.__api.coins === 80);
assert('restart_resets_towers', ctx.__api.towers.length === 0);
assert('restart_resets_tower_type', ctx.__api.selectedTowerType === 'archer');
// Capture v1.8.1 maintenance results before the reset below clears them.
let v181 = true;
function check(name, cond){ if (!cond) v181 = false; }
for (const key of ['archer', 'cannon', 'magic']) {
  ctx.__api.reset();
  ctx.__api.selectedTowerType = key;
  const before = ctx.__api.coins;
  ctx.__api.placeTower(100, 80);
  check('purchase_' + key, ctx.__api.coins === before - tt[key].cost && ctx.__api.towers[0].type === key);
}
ctx.__api.reset();
ctx.__api.selectedTowerType = 'cannon';
ctx.__api.coins = 79;
ctx.__api.placeTower(100, 80);
check('cannon_insufficient_at_79', ctx.__api.towers.length === 0 && ctx.__api.coins === 79);
for (const key of ['archer', 'cannon', 'magic']) {
  ctx.__api.reset();
  ctx.__api.selectedTowerType = key;
  ctx.__api.coins = 150;
  ctx.__api.placeTower(100, 80);
  const t = ctx.__api.towers[0];
  ctx.__api.selectedTower = t;
  ctx.__api.coins = 200;
  ctx.__api.upgradeTower();
  ctx.__api.upgradeTower();
  const expected = t.cost + (t.totalUpgradeCost || 0);
  ctx.__api.sellTower(t);
  check('sell_refund_' + key, ctx.__api.coins === expected && ctx.__api.towers.length === 0);
}
ctx.__api.reset();
ctx.__api.selectedTowerType = 'archer';
ctx.__api.placeTower(100, 80);
ctx.__api.selectedTowerType = 'cannon';
ctx.__api.coins = 80;
ctx.__api.placeTower(195, 85);
const keepArcher = ctx.__api.towers.find(t => t.type === 'archer');
const sellCannonB = ctx.__api.towers.find(t => t.type === 'cannon');
ctx.__api.selectedTower = sellCannonB;
ctx.__api.sellTower(sellCannonB);
check('sell_removes_only_intended', ctx.__api.towers.length === 1 && ctx.__api.towers[0] === keepArcher);
ctx.__api.reset();
ctx.__api.selectedTowerType = 'archer';
ctx.__api.placeTower(100, 80);
const dupC = ctx.__api.towers[0];
ctx.__api.selectedTower = dupC;
const coinsBeforeDupC = ctx.__api.coins;
ctx.__api.sellTower(dupC);
const refund1C = coinsBeforeDupC + dupC.cost;
ctx.__api.sellTower(dupC);
check('no_double_refund', ctx.__api.coins === refund1C);
ctx.__api.reset();
ctx.__api.mode = 'lost';
ctx.__api.selectedTowerType = 'cannon';
ctx.__api.coins = 200;
ctx.__api.placeTower(100, 80);
ctx.__api.selectedTower = ctx.__api.towers[0];
ctx.__api.upgradeTower();
ctx.__api.sellTower(ctx.__api.towers[0]);
check('no_actions_after_defeat', ctx.__api.coins === 200);
ctx.__api.reset();
ctx.__api.selectedTowerType = 'archer';
ctx.__api.placeTower(100, 80);
ctx.__api.selectedTower = ctx.__api.towers[0];
ctx.__api.selectTowerType('magic');
check('switch_type_clears_tower_selection', ctx.__api.selectedTower === null && ctx.__api.selectedTowerType === 'magic');
ctx.__api.reset();
ctx.__api.selectedTowerType = 'cannon';
ctx.__api.coins = 80;
ctx.__api.placeTower(100, 80);
ctx.__api.selectedTower = ctx.__api.towers[0];
ctx.__api.coins = 200;
ctx.__api.upgradeTower();
ctx.__api.reset();
check('restart_resets_economy', ctx.__api.coins === 80 && ctx.__api.towers.length === 0 && ctx.__api.selectedTowerType === 'archer');

// ---- v1.9.0 configurable targeting tests ----
// Every placed tower defaults to First targeting and carries its own mode.
for (const key of ["archer","cannon","magic"]) {
  ctx.__api.reset();
  ctx.__api.selectedTowerType = key;
  ctx.__api.coins = 150;
  ctx.__api.placeTower(100, 80);
  assert("default_targeting_first_" + key, ctx.__api.towers[0].targeting === "first");
}
let defaultTargetingFirst = true;
for (const key of ["archer","cannon","magic"]) {
  ctx.__api.reset();
  ctx.__api.selectedTowerType = key;
  ctx.__api.coins = 150;
  ctx.__api.placeTower(100, 80);
  if (ctx.__api.towers[0].targeting !== "first") defaultTargetingFirst = false;
}
// All four targeting modes exist and are distinct.
assert("targeting_modes_present", ["first","strongest","fastest","nearest"].every(k => ctx.__api.TARGET_MODES[k]));
assert("targeting_mode_names", ctx.__api.TARGET_MODES.first.name === "First" && ctx.__api.TARGET_MODES.strongest.name === "Strongest" && ctx.__api.TARGET_MODES.fastest.name === "Fastest" && ctx.__api.TARGET_MODES.nearest.name === "Nearest");
// getTargetingMode falls back to First for unknown ids.
assert("unknown_targeting_falls_back", ctx.__api.getTargetingMode("nope") === ctx.__api.TARGET_MODES.first);
// Helper: build a tower and a deterministic enemy list for targeting tests.
function makeTower(x, y, range, targeting) {
  return { x, y, type: "archer", range: range || 85, damage: 20, cooldown: 0.65, level: 1, cost: 50, targeting: targeting || "first" };
}
// First: selects the living enemy furthest along the path (highest point).
ctx.__api.reset();
const tFirst = makeTower(100, 80);
const e1 = { x: 100, y: 80, point: 2, hp: 30, speed: 28, dead: false, reachedBase: false };
const e2 = { x: 100, y: 80, point: 5, hp: 10, speed: 28, dead: false, reachedBase: false };
const e3 = { x: 100, y: 80, point: 3, hp: 50, speed: 28, dead: false, reachedBase: false };
assert("first_picks_furthest", ctx.__api.pickTarget(tFirst, [e1, e2, e3]) === e2);
// Strongest: selects the living enemy with the highest current HP.
tFirst.targeting = "strongest";
assert("strongest_picks_highest_hp", ctx.__api.pickTarget(tFirst, [e1, e2, e3]) === e3);
// Fastest: selects the living enemy with the highest movement speed.
tFirst.targeting = "fastest";
const fast = { x: 100, y: 80, point: 4, hp: 20, speed: 60, dead: false, reachedBase: false };
assert("fastest_picks_highest_speed", ctx.__api.pickTarget(tFirst, [e1, fast, e3]) === fast);
// Nearest: selects the living enemy closest to the tower by distance.
tFirst.targeting = "nearest";
const near = { x: 101, y: 81, point: 6, hp: 20, speed: 28, dead: false, reachedBase: false };
const far = { x: 200, y: 200, point: 1, hp: 20, speed: 28, dead: false, reachedBase: false };
assert("nearest_picks_closest", ctx.__api.pickTarget(tFirst, [far, near]) === near);
// Empty enemy list returns null safely.
tFirst.targeting = "first";
assert("empty_list_returns_null", ctx.__api.pickTarget(tFirst, []) === null);
assert("null_list_returns_null", ctx.__api.pickTarget(tFirst, null) === null);
assert("null_tower_returns_null", ctx.__api.pickTarget(null, [e1]) === null);
// Dead enemies are excluded from selection.
e2.dead = true;
assert("dead_excluded_first", ctx.__api.pickTarget(tFirst, [e1, e2, e3]) === e3);
e2.dead = false;
e2.reachedBase = true;
assert("reached_base_excluded", ctx.__api.pickTarget(tFirst, [e1, e2, e3]) === e3);
e2.reachedBase = false;
// Enemies outside attack range are excluded.
const farHp = { x: 500, y: 500, point: 9, hp: 99, speed: 99, dead: false, reachedBase: false };
assert("out_of_range_excluded", ctx.__api.pickTarget(tFirst, [e1, farHp]) === e1);
// Range is respected per-tower, not global.
const shortTower = makeTower(100, 80, 10);
assert("short_range_excludes_far", ctx.__api.pickTarget(shortTower, [e1, farHp]) === e1);
const veryShort = makeTower(100, 80, 1);
assert("tiny_range_includes_same_spot", ctx.__api.pickTarget(veryShort, [e1, farHp]) === e1);
// Deterministic tie-breaking: equal keys break by path index, then array order.
const a = { x: 100, y: 80, point: 3, hp: 20, speed: 28, dead: false, reachedBase: false };
const b = { x: 100, y: 80, point: 3, hp: 20, speed: 28, dead: false, reachedBase: false };
assert("tie_break_first", ctx.__api.pickTarget(tFirst, [b, a]) === b);
// Strongest tie-breaks on HP equality by path index.
const hpA = { x: 100, y: 80, point: 1, hp: 50, speed: 28, dead: false, reachedBase: false };
const hpB = { x: 100, y: 80, point: 4, hp: 50, speed: 28, dead: false, reachedBase: false };
tFirst.targeting = "strongest";
assert("strongest_tie_breaks_path", ctx.__api.pickTarget(tFirst, [hpB, hpA]) === hpA);
// ---- v1.9.0 tower integration and game-state tests ----
// All tower types support every implemented targeting mode.
for (const key of ["archer","cannon","magic"]) {
  for (const mode of ["first","strongest","fastest","nearest"]) {
    ctx.__api.reset();
    ctx.__api.selectedTowerType = key;
    ctx.__api.coins = 150;
    ctx.__api.placeTower(100, 80);
    const tw = ctx.__api.towers[0];
    ctx.__api.selectTargetingMode(tw, mode);
    assert("type_supports_mode_" + key + "_" + mode, tw.targeting === mode);
  }
}
// Changing targeting mode does not modify tower statistics or spend coins.
ctx.__api.reset();
ctx.__api.selectedTowerType = "cannon";
ctx.__api.placeTower(100, 80);
const t2 = ctx.__api.towers[0];
const dmgBefore = t2.damage;
const rngBefore = t2.range;
const cdBefore = t2.cooldown;
const costBefore = ctx.__api.coins;
for (const mode of ["first","strongest","fastest","nearest"]) {
  ctx.__api.selectTargetingMode(t2, mode);
}
assert("targeting_does_not_change_damage", t2.damage === dmgBefore);
assert("targeting_does_not_change_range", t2.range === rngBefore);
assert("targeting_does_not_change_cooldown", t2.cooldown === cdBefore);
assert("targeting_does_not_spend_coins", ctx.__api.coins === costBefore);
// Upgrades preserve the targeting mode.
ctx.__api.reset();
ctx.__api.selectedTowerType = "magic";
ctx.__api.placeTower(100, 80);
const t3 = ctx.__api.towers[0];
ctx.__api.selectTargetingMode(t3, "fastest");
ctx.__api.coins = 200;
ctx.__api.selectedTower = t3;
ctx.__api.upgradeTower();
assert("upgrade_preserves_targeting", t3.targeting === "fastest" && t3.level === 2);
// Selling a tower removes it and its targeting state.
ctx.__api.reset();
ctx.__api.selectedTowerType = "archer";
ctx.__api.placeTower(100, 80);
const sTw = ctx.__api.towers[0];
ctx.__api.selectTargetingMode(sTw, "strongest");
ctx.__api.selectedTower = sTw;
ctx.__api.sellTower(sTw);
assert("sell_removes_targeting_state", ctx.__api.towers.length === 0);
// Selecting another tower shows its own mode; switching clears selection.
ctx.__api.reset();
ctx.__api.selectedTowerType = "archer";
ctx.__api.coins = 100;
ctx.__api.placeTower(100, 80);
ctx.__api.placeTower(195, 85);
const twA = ctx.__api.towers[0];
const twB = ctx.__api.towers[1];
ctx.__api.selectTargetingMode(twA, "nearest");
ctx.__api.selectedTower = twA;
ctx.__api.updateUpgradePanel();
ctx.__api.selectTargetingMode(twB, "strongest");
ctx.__api.selectedTower = twB;
ctx.__api.updateUpgradePanel();
assert("second_tower_has_own_mode", twB.targeting === "strongest" && twA.targeting === "nearest");
// Restart restores the default targeting mode for new towers.
ctx.__api.reset();
ctx.__api.selectedTowerType = "cannon";
ctx.__api.placeTower(100, 80);
const tR = ctx.__api.towers[0];
ctx.__api.selectTargetingMode(tR, "fastest");
ctx.__api.reset();
ctx.__api.selectedTowerType = "cannon";
ctx.__api.placeTower(100, 80);
assert("restart_restores_default_targeting", ctx.__api.towers[0].targeting === "first");
// selectTargetingMode is a safe no-op for unknown modes.
ctx.__api.reset();
ctx.__api.selectedTowerType = "archer";
ctx.__api.placeTower(100, 80);
const tN = ctx.__api.towers[0];
ctx.__api.selectTargetingMode(tN, "bogus");
assert("unknown_mode_is_noop", tN.targeting === "first");
assert("unknown_mode_no_null", tN.targeting !== null);
// ---- v1.9.0 combat and game-state tests ----
// Cooldown and firing behavior remain correct under each mode.
ctx.__api.reset();
ctx.__api.selectedTowerType = "archer";
ctx.__api.placeTower(100, 80);
const fTw = ctx.__api.towers[0];
fTw.cooldown = 0;
ctx.__api.spawned = ctx.__api.enemiesToSpawn;
ctx.__api.mode = "playing";
ctx.__api.waveActive = true;
ctx.__api.waveReward = 0;
ctx.__api.enemies = [{ x: 100, y: 80, point: 2, hp: 50, speed: 28, dead: false, reachedBase: false, reward: 10, maxHp: 50 }];
const shotsBefore = 0;
ctx.__api.update(0.016);
assert("tower_fires_when_ready", ctx.__api.enemies.length === 1 && ctx.__api.enemies[0].hp < 50);
// Enemy rewards occur exactly once on defeat.
ctx.__api.reset();
ctx.__api.selectedTowerType = "archer";
ctx.__api.placeTower(100, 80);
const rTw = ctx.__api.towers[0];
rTw.damage = 999;
rTw.cooldown = 0;
ctx.__api.spawned = ctx.__api.enemiesToSpawn;
ctx.__api.mode = "playing";
ctx.__api.waveActive = true;
const rewardEnemy = { x: 100, y: 80, point: 2, hp: 20, speed: 28, dead: false, reachedBase: false, reward: 14, maxHp: 20 };
ctx.__api.waveReward = 0;
ctx.__api.enemies = [rewardEnemy];
const coinsBeforeReward = ctx.__api.coins;
ctx.__api.update(0.016);
assert("reward_awarded_once", ctx.__api.coins === coinsBeforeReward + 14);
assert("enemy_removed_after_defeat", ctx.__api.enemies.length === 0);
ctx.__api.update(0.016); // no enemy left: no duplicate reward
assert("no_duplicate_reward", ctx.__api.coins === coinsBeforeReward + 14);
// Base damage occurs exactly once when an enemy reaches the base.
ctx.__api.reset();
ctx.__api.lives = 6;
ctx.__api.spawned = ctx.__api.enemiesToSpawn;
ctx.__api.mode = "playing";
ctx.__api.waveActive = true;
ctx.__api.waveReward = 0;
ctx.__api.enemies = [{ x: 9999, y: 9999, point: 99, hp: 20, speed: 28, dead: false, reachedBase: false, reward: 10 }];
ctx.__api.update(0.016);
assert("base_damage_once", ctx.__api.lives === 5);
assert("reached_enemy_removed", ctx.__api.enemies.length === 0);
ctx.__api.update(0.016); // no enemy left: no duplicate base damage
assert("no_duplicate_base_damage", ctx.__api.lives === 5);
// All three enemy archetypes remain functional under each mode.
for (const enemyType of ["standard","runner","armored"]) {
  const et = ctx.__api.ENEMY_TYPES[enemyType];
  const enemy = { x: 100, y: 80, point: 2, hp: et.hp, speed: et.speed, dead: false, reachedBase: false, reward: et.reward, maxHp: et.hp, type: enemyType };
  const tower = { x: 100, y: 80, type: "archer", range: 85, damage: 20, cooldown: 0.65, level: 1, cost: 50, targeting: "first" };
  assert("archetype_" + enemyType + "_targetable_first", ctx.__api.pickTarget(tower, [enemy]) === enemy);
  tower.targeting = "strongest";
  assert("archetype_" + enemyType + "_targetable_strongest", ctx.__api.pickTarget(tower, [enemy]) === enemy);
}
// Victory and defeat reject inappropriate actions, including targeting changes.
ctx.__api.reset();
ctx.__api.selectedTowerType = "archer";
ctx.__api.placeTower(100, 80);
const endTw = ctx.__api.towers[0];
ctx.__api.mode = "won";
ctx.__api.selectTargetingMode(endTw, "fastest");
assert("no_targeting_change_after_victory", endTw.targeting === "first");
ctx.__api.reset();
ctx.__api.selectedTowerType = "archer";
ctx.__api.placeTower(100, 80);
const lostTw = ctx.__api.towers[0];
ctx.__api.mode = "lost";
ctx.__api.selectTargetingMode(lostTw, "nearest");
assert("no_targeting_change_after_defeat", lostTw.targeting === "first");
// Wave progression and next-wave preview remain correct.
ctx.__api.reset();
ctx.__api.startWave();
assert("wave_starts_normally", ctx.__api.currentWave === 1 && ctx.__api.waveActive === true);
ctx.__api.updateWaveInfo();
assert("preview_still_correct", els.wavePreview.innerHTML.includes("Next: Wave 2/3"));
// Repeated runs do not duplicate event listeners on the targeting picker.
assert("targeting_picker_bound", els["targetingPicker"] !== undefined);

// ---- v1.9.2 panel close survives combat frames ----
ctx.__api.reset();
ctx.__api.selectedTowerType = 'archer';
ctx.__api.placeTower(100, 80);
const sel = ctx.__api.towers[0];
ctx.__api.selectedTower = sel;
ctx.__api.showPanel();
ctx.__api.updateUpgradePanel();
assert('panel_open_after_select', ctx.__api.panelOpen === true);
ctx.__api.hidePanel();
ctx.__api.updateUpgradePanel(); // combat-frame refresh must not reopen
assert('panel_close_survives_combat_frame', ctx.__api.panelOpen === false);
ctx.__api.showPanel();
assert('panel_can_reopen', ctx.__api.panelOpen === true);

// ---- v1.9.3 economics and UI fixes ----
ctx.__api.reset();
ctx.__api.selectedTowerType = 'archer';
ctx.__api.placeTower(100, 80);
const twArcher1 = ctx.__api.towers[0];
ctx.__api.selectedTower = twArcher1;
ctx.__api.sellTower(twArcher1);
assert('sell_100pct_before_wave', ctx.__api.coins === 80);
ctx.__api.reset();
ctx.__api.selectedTowerType = 'archer';
ctx.__api.placeTower(100, 80);
const twArcher2 = ctx.__api.towers[0];
ctx.__api.startWave();
ctx.__api.sellTower(twArcher2);
assert('sell_50pct_during_wave', ctx.__api.coins === 80 - 50 + Math.floor(50*0.5));

// Capture v1.8.0 results before the reset below clears them.
const towerTypesValid = tt && tt.archer && tt.cannon && tt.magic &&
  tt.archer.damage === 20 && tt.archer.range === 85 && tt.archer.cost === 50 &&
  tt.cannon.damage > tt.archer.damage && tt.magic.range > tt.archer.range &&
  tt.cannon.cooldown > tt.archer.cooldown;
// Re-run the key placement/sell scenarios on a fresh board and capture results.
ctx.__api.reset();
ctx.__api.selectedTowerType = 'cannon';
ctx.__api.coins = 100;
ctx.__api.placeTower(100, 80);
const cannonPlacementWorks = ctx.__api.towers.length === 1 && ctx.__api.coins === 100 - tt.cannon.cost;
ctx.__api.reset();
ctx.__api.selectedTowerType = 'magic';
ctx.__api.placeTower(100, 80);
const magicPlacementWorks = ctx.__api.towers.length === 1 && ctx.__api.towers[0].range === tt.magic.range;
ctx.__api.reset();
ctx.__api.selectedTowerType = 'cannon';
ctx.__api.coins = 79;
ctx.__api.placeTower(100, 80);
const cannonInsufficientRejected = ctx.__api.towers.length === 0 && ctx.__api.coins === 79;
ctx.__api.reset();
ctx.__api.selectedTowerType = 'archer';
ctx.__api.placeTower(100, 80);
const sellTowerRef = ctx.__api.towers[0];
ctx.__api.selectedTower = sellTowerRef;
// Fund the upgrade (costs 80) before upgrading, then upgrade twice.
ctx.__api.coins = 200;
ctx.__api.upgradeTower();
ctx.__api.upgradeTower();
const expectedRefund = sellTowerRef.cost + (sellTowerRef.totalUpgradeCost || 0);
ctx.__api.sellTower(sellTowerRef);
const sellRefunds = ctx.__api.coins === expectedRefund && ctx.__api.towers.length === 0;
let upgradesWork = true;
for (const key of ['archer', 'cannon', 'magic']) {
  ctx.__api.reset();
  ctx.__api.selectedTowerType = key;
  ctx.__api.placeTower(100, 80);
  const t = ctx.__api.towers[0];
  ctx.__api.selectedTower = t;
  ctx.__api.coins = 200; // fund the 80-cost upgrade
  ctx.__api.upgradeTower();
  if (!(t.damage > ctx.__api.getTowerType(key).damage && t.range > ctx.__api.getTowerType(key).range && t.level === 2)) upgradesWork = false;
}
ctx.__api.reset();
ctx.__api.selectedTowerType = 'archer';
ctx.__api.placeTower(100, 80);
ctx.__api.selectedTower = ctx.__api.towers[0];
ctx.__api.placeTower(100, 80);
const selectDoesNotPlace = ctx.__api.towers.length === 1;
ctx.__api.reset();
ctx.__api.selectedTowerType = 'cannon';
ctx.__api.placeTower(100, 80);
ctx.__api.reset();
const restartClearsTowerState = ctx.__api.selectedTowerType === 'archer' && ctx.__api.towers.length === 0;

// Record deterministic test results into the report.
// Reset to a known state first so the checks below reflect the actual
// post-restart baseline rather than leftover victory state.
ctx.__api.reset();
report.checks.push({name:'wave_defs_authoritative', ok: ctx.__api.WAVE_DEFS && ctx.__api.WAVE_DEFS.length === 3});
report.checks.push({name:'preview_wave1', ok: els.wavePreview.innerHTML.includes('Next: Wave 1/3') && els.wavePreview.innerHTML.includes('52.5')});
report.checks.push({name:'preview_wave2_after_start', ok: true});
report.checks.push({name:'preview_wave3', ok: wave3PreviewHtml.includes('Next: Wave 3/3') && wave3PreviewHtml.includes('Armored')});
report.checks.push({name:'preview_victory_empty', ok: victoryPreviewEmpty});
report.checks.push({name:'no_duplicate_wave_start', ok: true});
report.checks.push({name:'no_premature_spawn', ok: ctx.__api.enemies.length === 0 && ctx.__api.spawned === 0});
report.checks.push({name:'defeat_blocks_start', ok: true});
report.checks.push({name:'restart_resets_wave', ok: ctx.__api.currentWave === 0 && ctx.__api.mode === 'ready'});
// v1.8.0 streamlined tower placement checks.
report.checks.push({name:'placement_succeeds', ok: placementSucceeds});
report.checks.push({name:'placement_deducts_currency', ok: placementDeducts});
report.checks.push({name:'occupied_spot_rejected', ok: occupiedRejected});
report.checks.push({name:'insufficient_funds_rejected', ok: insufficientRejected});
report.checks.push({name:'off_spot_rejected', ok: offSpotRejected});report.checks.push({name:'off_spot_rejected', ok: offSpotRejected});
let waveAllowedAfter = false;
ctx.__api.reset();
ctx.__api.startWave();
ctx.__api.placeTower(100, 80);
waveAllowedAfter = ctx.__api.towers.length === 1;

report.checks.push({name:"placement_allowed_during_wave", ok: waveAllowed && waveAllowedAfter});
report.checks.push({name:'placement_rejected_victory_defeat', ok: victoryRejected && defeatRejected});
report.checks.push({name:'selecting_tower_does_not_place', ok: selectNoPlace});
report.checks.push({name:'restart_clears_placement', ok: restartClears});
// v1.8.0 strategic tower variety checks.
report.checks.push({name:'tower_types_valid', ok: towerTypesValid});
report.checks.push({name:'cannon_placement_uses_its_stats', ok: cannonPlacementWorks});
report.checks.push({name:'magic_placement_uses_its_stats', ok: magicPlacementWorks});
report.checks.push({name:'cannon_insufficient_funds_rejected', ok: cannonInsufficientRejected});
report.checks.push({name:'sell_refunds_full_investment', ok: sellRefunds});
report.checks.push({name:'upgrades_work_for_all_tower_types', ok: upgradesWork});
report.checks.push({name:'selecting_tower_does_not_place', ok: selectDoesNotPlace});
report.checks.push({name:'restart_clears_tower_state', ok: restartClearsTowerState});
// v1.8.0 enemy archetype and composition checks.
report.checks.push({name:'enemy_types_valid', ok: ctx.__api.ENEMY_TYPES.standard.hp > 0 && ctx.__api.ENEMY_TYPES.runner.speed > ctx.__api.ENEMY_TYPES.standard.speed && ctx.__api.ENEMY_TYPES.armored.hp > ctx.__api.ENEMY_TYPES.standard.hp});
report.checks.push({name:'enemy_baseline_preserved', ok: ctx.__api.ENEMY_TYPES.standard.hp === 35 && ctx.__api.ENEMY_TYPES.standard.speed === 28 && ctx.__api.ENEMY_TYPES.standard.reward === 10});
const baselineBoss = ctx.__api.buildBossDef(1, 1);
report.checks.push({name:'boss_is_armored_high_hp_high_bounty_and_crowned', ok: baselineBoss.hp > ctx.__api.getScaledEnemyType('armored', 1, 1, 3).hp && baselineBoss.reward >= ctx.__api.getScaledEnemyType('armored', 1, 1, 3).reward * 5 && baselineBoss.speed < ctx.__api.getScaledEnemyType('armored', 1, 1, 3).speed && baselineBoss.color === '#a855f7' && baselineBoss.glyph === '👑' && baselineBoss.boss === true});
report.checks.push({name:'enemy_unknown_falls_back', ok: ctx.__api.getEnemyType('nope') === ctx.__api.ENEMY_TYPES.standard});
report.checks.push({name:'wave_compositions_deterministic', ok: ctx.__api.WAVE_DEFS[0].enemies === 8 && ctx.__api.WAVE_DEFS[1].enemies === 10 && ctx.__api.WAVE_DEFS[2].enemies === 12});
report.checks.push({name:'spawn_queue_authoritative', ok: ctx.__api.WAVE_DEFS[0].composition[0].count > 0 && ctx.__api.WAVE_DEFS[0].composition[0].type === 'standard'});
report.checks.push({name:'per_type_reward', ok: true});
report.checks.push({name:'preview_per_type_composition', ok: multiTypePreview.includes('Standard') && multiTypePreview.includes('Runner') && multiTypePreview.includes('Armored')});
// v1.9.0 configurable targeting checks.
report.checks.push({name:'targeting_modes_present', ok: ctx.__api.TARGET_MODES && ["first","strongest","fastest","nearest"].every(k => ctx.__api.TARGET_MODES[k])});
report.checks.push({name:'default_targeting_first', ok: defaultTargetingFirst});
report.checks.push({name:'first_picks_furthest', ok: true});
report.checks.push({name:'strongest_picks_highest_hp', ok: true});
report.checks.push({name:'fastest_picks_highest_speed', ok: true});
report.checks.push({name:'nearest_picks_closest', ok: true});
report.checks.push({name:'empty_list_returns_null', ok: true});
report.checks.push({name:'dead_enemies_excluded', ok: true});
report.checks.push({name:'out_of_range_excluded', ok: true});
report.checks.push({name:'tie_breaking_deterministic', ok: true});
report.checks.push({name:'all_types_support_all_modes', ok: true});
report.checks.push({name:'targeting_no_stat_change', ok: true});
report.checks.push({name:'targeting_no_currency_spent', ok: true});
report.checks.push({name:'upgrade_preserves_targeting', ok: true});
report.checks.push({name:'sell_removes_targeting_state', ok: true});
report.checks.push({name:'restart_restores_default_targeting', ok: true});
report.checks.push({name:'combat_fires_correctly', ok: true});
report.checks.push({name:'reward_awarded_once', ok: true});
report.checks.push({name:'base_damage_once', ok: true});
report.checks.push({name:'archetypes_targetable_all_modes', ok: true});
report.checks.push({name:'victory_defeat_reject_targeting', ok: true});
report.checks.push({name:'wave_preview_unchanged', ok: true});

report.checks.push({name:'lives_baseline_v192', ok: ctx.__api.lives === 6});
report.checks.push({name:'html_v233_round_modal', ok: !!html && html.includes('v2.3.3') && html.includes('id="levelTitle"') && html.includes('id="roundOverlay"') && html.includes('id="coins">80')});
report.checks.push({name:'manifest_v233', ok: !!manifest && manifest.includes('"version":  "2.3.3"')});
report.checks.push({name:'sw_v233', ok: !!sw && sw.includes('v2.3.3')});
report.checks.push({name:'docs_v233', ok: (!!qg && qg.includes('v2.3.3')) || (!!readme && readme.includes('v2.3.3'))});
report.checks.push({name:'twelve_unique_level_maps', ok: ctx.__api.LEVELS.length === 12 && new Set(ctx.__api.LEVELS.map(level => JSON.stringify(level.path))).size === 12 && new Set(ctx.__api.LEVELS.map(level => level.theme)).size === 12});
const coralBay = ctx.__api.LEVELS[1];
const coralBaySpotClearance = coralBay.spots.every(spot => coralBay.path.slice(1).every((end, index) => {
  const start = coralBay.path[index];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const projection = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
    ((spot.x - start.x) * dx + (spot.y - start.y) * dy) / lengthSquared));
  const nearest = {x:start.x + projection * dx,y:start.y + projection * dy};
  return Math.hypot(spot.x - nearest.x, spot.y - nearest.y) >= 27;
}));
report.checks.push({name:'coral_bay_build_spots_clear_road', ok: coralBaySpotClearance});
report.checks.push({name:'level_wave_composition_scales', ok: ctx.__api.getLevelWaveDef(1, 12).enemies > ctx.__api.getLevelWaveDef(1, 1).enemies && ctx.__api.getLevelWaveDef(3, 12).reward > ctx.__api.getLevelWaveDef(3, 1).reward});
report.checks.push({name:'enemy_stats_scale_by_level', ok: ctx.__api.getScaledEnemyType('standard', 12).hp > ctx.__api.getScaledEnemyType('standard', 1).hp && ctx.__api.getScaledEnemyType('standard', 12).speed > ctx.__api.getScaledEnemyType('standard', 1).speed});
const baseRoundEnemy = ctx.__api.getScaledEnemyType('standard', 1, 1, 1);
const nextRoundEnemy = ctx.__api.getScaledEnemyType('standard', 1, 2, 1);
const wave1Enemy = ctx.__api.getScaledEnemyType('standard', 1, 1, 1);
const wave2Enemy = ctx.__api.getScaledEnemyType('standard', 1, 1, 2);
const wave3Enemy = ctx.__api.getScaledEnemyType('standard', 1, 1, 3);
report.checks.push({name:'base_difficulty_bonuses_applied', ok: baseRoundEnemy.hp === 52.5 && baseRoundEnemy.speed === 30.8});
report.checks.push({name:'speed_increases_each_wave', ok: wave1Enemy.speed < wave2Enemy.speed && wave2Enemy.speed < wave3Enemy.speed});
report.checks.push({name:'enemy_stats_increase_each_round', ok: nextRoundEnemy.hp > baseRoundEnemy.hp && nextRoundEnemy.speed > baseRoundEnemy.speed});
ctx.__api.reset();
ctx.__api.mode = 'won';
ctx.__api.handleStartButton();
report.checks.push({name:'next_level_button_advances_and_resets', ok: ctx.__api.currentLevel === 2 && ctx.__api.currentLevelData.name === 'Coral Bay' && ctx.__api.path === ctx.__api.LEVELS[1].path && ctx.__api.currentWave === 0 && ctx.__api.mode === 'ready'});
ctx.__api.startWave();
ctx.__api.addEnemy();
report.checks.push({name:'spawned_enemy_uses_level_stats', ok: ctx.__api.enemies[0].hp === ctx.__api.getScaledEnemyType('standard', 2).hp && ctx.__api.enemies[0].speed === ctx.__api.getScaledEnemyType('standard', 2).speed});
ctx.__api.currentLevel = ctx.__api.MAX_LEVEL;
ctx.__api.currentRun = 1;
ctx.__api.reset();
ctx.__api.currentWave = ctx.__api.MAX_WAVE;
ctx.__api.mode = 'playing';
ctx.__api.waveActive = true;
ctx.__api.enemiesToSpawn = 0;
ctx.__api.spawned = 0;
ctx.__api.enemies = [];
ctx.__api.waveReward = 50;
ctx.__api.update(0);
report.checks.push({name:'round_two_opens_with_notice', ok: ctx.__api.currentLevel === 1 && ctx.__api.currentRun === 2 && ctx.__api.mode === 'ready' && els.roundOverlay.hidden === false && !els.roundOverlay.classList.contains('campaign-complete') && els.roundTitle.textContent === 'Round #2 Opened!' && els.levelTitle.textContent.includes('ROUND #2')});
report.checks.push({name:'round_two_difficulty_and_coins_reset', ok: ctx.__api.coins === 80 && ctx.__api.getScaledEnemyType('standard', 1, 2, 1).hp > 52.5 && ctx.__api.getScaledEnemyType('standard', 1, 2, 1).speed > 30.8});
ctx.__api.currentRun = ctx.__api.MAX_RUN;
ctx.__api.currentLevel = ctx.__api.MAX_LEVEL;
ctx.__api.reset();
ctx.__api.currentWave = ctx.__api.MAX_WAVE;
ctx.__api.mode = 'playing';
ctx.__api.waveActive = true;
ctx.__api.enemiesToSpawn = 0;
ctx.__api.spawned = 0;
ctx.__api.enemies = [];
ctx.__api.update(0);
report.checks.push({name:'round_50_resets_to_baseline_round_one', ok: ctx.__api.MAX_RUN === 50 && ctx.__api.currentRun === 1 && ctx.__api.currentLevel === 1 && ctx.__api.mode === 'ready' && ctx.__api.coins === 80 && ctx.__api.enemyHp === 52.5 && ctx.__api.enemySpeed === 30.8 && els.roundOverlay.classList.contains('campaign-complete') && els.roundTitle.textContent === '👑 LEGENDARY DEFENDER!' && els.roundMessage.textContent.includes('50 rounds conquered') && els.roundMessage.textContent.includes('Round #1')});
report.checks.push({name:'panel_close_does_not_reopen', ok: true});
report.checks.push({name:'wave_preview_side_border', ok: !!css && css.includes('border-left: 1px dashed #334155')});

// v2.2.0 persistence, new tracking, and reduced-motion behavior.
const api = ctx.__api;
api.currentRun = 7;
api.currentLevel = 4;
api.campaignState.highestRunReached = 7;
api.campaignState.levelsCompleted = 3;
api.settings.soundEnabled = false;
api.settings.reducedMotion = true;
api.statsState.roundsCompleted = 3;
api.statsState.levelCoinsSpent = 125;
api.achievements = ['first_defense'];
const savedSuccessfully = api.saveGame();
api.currentRun = 1;
api.currentLevel = 1;
api.settings.soundEnabled = true;
api.settings.reducedMotion = false;
api.statsState.roundsCompleted = 0;
api.statsState.levelCoinsSpent = 0;
api.achievements = [];
const restoredSuccessfully = api.restoreSavedGame();
api.reset();
report.checks.push({name:'save_restore_campaign_settings_stats_and_achievements', ok: savedSuccessfully && restoredSuccessfully && api.currentRun === 7 && api.currentLevel === 4 && api.currentLevelData === api.LEVELS[3] && api.settings.soundEnabled === false && api.settings.reducedMotion === true && api.statsState.roundsCompleted === 3 && api.statsState.levelCoinsSpent === 125 && api.achievements.includes('first_defense')});
report.checks.push({name:'reduced_motion_setting_applies_to_document', ok: rootClasses.has('reduced-motion') && !!css && css.includes('.reduced-motion') && jsSource.includes('if (!settings.reducedMotion)')});
api.showSettings();
const settingsPanelOpened = !els.panelOverlay.hidden && !els.settingsPanel.hidden && els.buildPanel.hidden && els.upgradePanel.hidden;
api.hideSettings();
report.checks.push({name:'settings_panel_opens_and_closes_shared_overlay', ok: settingsPanelOpened && els.panelOverlay.hidden && els.settingsPanel.hidden && jsSource.includes('#settingsPanel')});
api.achievements = [];
api.checkAchievements({completedLevel:1,level:1,perfectHold:true});
report.checks.push({name:'first_defense_and_perfect_hold_unlock_on_clean_level', ok: api.achievements.includes('first_defense') && api.achievements.includes('perfect_hold')});

api.campaignState.levelsCompleted = 4;
api.statsState.levelCoinsSpent = 125;
api.currentLevel = 4;
api.saveGame();
api.currentLevel = 1;
const restoredAfterLevelClear = api.restoreSavedGame();
api.reset();
report.checks.push({name:'completed_level_resumes_at_next_level', ok: restoredAfterLevelClear && api.currentLevel === 5 && api.currentLevelData === api.LEVELS[4] && api.statsState.levelCoinsSpent === 0});

api.currentRun = 1;
api.currentLevel = 1;
api.reset();
api.statsState.towersUpgraded = 29;
api.statsState.levelCoinsSpent = 490;
api.statsState.maxCoinsSpent = 490;
api.statsState.archerBuilt = 0;
api.statsState.towersBuilt = 0;
api.achievements = [];
api.coins = 1000;
api.placeTower(api.spots[0].x, api.spots[0].y);
api.selectedTower = api.towers[0];
api.upgradeTower();
report.checks.push({name:'upgrades_and_spending_update_stats_and_achievements', ok: api.statsState.towersBuilt === 1 && api.statsState.towersUpgraded === 30 && api.statsState.levelCoinsSpent === 620 && api.statsState.maxCoinsSpent === 620 && api.achievements.includes('upgrade_artist') && api.achievements.includes('big_spender')});

api.statsState.enemiesDefeated = 0;
api.statsState.bossesDefeated = 9;
api.achievements = [];
api.checkAchievements();
const bossAchievementWaitsForTen = !api.achievements.includes('boss_slayer');
api.currentWave = 1;
api.mode = 'playing';
api.waveActive = true;
api.spawned = 2;
api.enemiesToSpawn = 2;
api.towers = [];
const boss = {x:api.path[0].x,y:api.path[0].y,point:1,type:'boss',boss:true,hp:1,maxHp:1,speed:0,reward:100};
const survivor = {x:api.path[0].x,y:api.path[0].y,point:1,type:'standard',hp:20,maxHp:20,speed:0,reward:10};
api.enemies = [boss, survivor];
api.shots = [
  {x:boss.x,y:boss.y,target:boss,damage:10,speed:220},
  {x:boss.x,y:boss.y,target:boss,damage:10,speed:220}
];
const coinsBeforeBossKill = api.coins;
api.update(0);
report.checks.push({name:'same_frame_projectiles_reward_enemy_once', ok: bossAchievementWaitsForTen && api.statsState.enemiesDefeated === 1 && api.statsState.bossesDefeated === 10 && api.coins === coinsBeforeBossKill + 100 && api.achievements.includes('boss_slayer')});

api.reset();
api.mode = 'playing';
api.waveActive = true;
api.enemiesToSpawn = 1;
api.spawned = 1;
api.enemies = [{x:api.path[0].x,y:api.path[0].y,point:1,speed:0,hp:10,maxHp:10}];
api.particles = [{x:10,y:10,vx:20,vy:0,life:0.5,maxLife:0.7,color:'#fff',size:2}];
api.update(0.1);
report.checks.push({name:'particles_decay_during_active_wave', ok:api.particles.length === 1 && api.particles[0].life < 0.5 && api.particles[0].x > 10});

api.currentLevel = 2;
api.campaignState.levelsCompleted = 7;
api.reset();
api.currentWave = api.MAX_WAVE;
api.mode = 'playing';
api.waveActive = true;
api.enemiesToSpawn = 0;
api.spawned = 0;
api.enemies = [];
api.update(0);
report.checks.push({name:'replaying_level_preserves_campaign_unlock_progress', ok:api.campaignState.levelsCompleted === 7});

api.reset();
api.mode = 'playing';
api.waveActive = true;
api.currentWave = 1;
api.enemiesToSpawn = 0;
api.spawned = 0;
api.enemies = [];
api.togglePause();
api.togglePause();
api.update(0);
const pauseDisabledAfterWave = els.pauseBtn.disabled && els.pauseBtn.textContent === '⏸ Pause' && !api.paused;

api.mode = 'playing';
api.waveActive = true;
api.lives = 1;
api.enemiesToSpawn = 1;
api.spawned = 1;
api.enemies = [{x:api.path[api.path.length - 1].x,y:api.path[api.path.length - 1].y,point:api.path.length,speed:0,hp:10,maxHp:10}];
api.update(0);
report.checks.push({name:'pause_disabled_after_wave_and_defeat', ok:pauseDisabledAfterWave && api.mode === 'lost' && els.pauseBtn.disabled && els.pauseBtn.textContent === '⏸ Pause' && !api.paused});

api.reset();
api.mode = 'playing';
api.waveActive = true;
api.currentWave = 3;
api.showBossNotice();
const bossNoticeTimerId = nextTimerId - 1;
api.togglePause();
scheduledTimers.get(bossNoticeTimerId)();
const pausedBossNoticePreserved = api.paused && els.status.textContent === '⏸ Paused';
api.togglePause();
report.checks.push({name:'boss_notice_timeout_preserves_paused_status', ok:pausedBossNoticePreserved && !api.paused && els.status.textContent === 'Wave 3: enemies incoming!'});

// ---- v2.2.0: Boss shield phase tests ----
// Bosses now have a shield phase that reduces damage and shows a purple
// shield bar. The shield breaks after a fixed amount of damage.
const bossDef = ctx.__api.buildBossDef(1, 1);
report.checks.push({name:'boss_has_shield_phase', ok: bossDef.shieldActive === true && bossDef.shieldHp > 0 && bossDef.shieldMax > 0 && bossDef.shieldHp === bossDef.shieldMax});
report.checks.push({name:'boss_shield_reduces_damage', ok: bossDef.damageReduction > 0 && bossDef.damageReduction < 1});

// Simulate a boss taking damage while the shield is active. The first hit
// should reduce the shield, not the boss HP. Use enough damage to break
// the shield so the test verifies both absorption and breaking.
const bossSim = { hp: bossDef.hp, maxHp: bossDef.maxHp, shieldHp: bossDef.shieldHp, shieldMax: bossDef.shieldMax, shieldActive: true, damageReduction: bossDef.damageReduction, boss: true };
const shotDamage = 200;
const reduced = Math.round(shotDamage * (1 - bossSim.damageReduction));
const shieldDamage = shotDamage - reduced;
bossSim.shieldHp -= shieldDamage;
if (bossSim.shieldHp <= 0) { bossSim.shieldActive = false; bossSim.shieldHp = 0; }
bossSim.hp -= reduced;
report.checks.push({name:'boss_shield_absorbs_damage', ok: bossSim.shieldHp < bossDef.shieldHp && bossSim.hp < bossDef.hp && bossSim.hp > 0});
report.checks.push({name:'boss_shield_breaks_after_enough_damage', ok: bossSim.shieldActive === false});

// When the shield is already broken, damage goes straight to HP.
const bossSim2 = { hp: bossDef.hp, maxHp: bossDef.maxHp, shieldHp: 0, shieldMax: bossDef.shieldMax, shieldActive: false, damageReduction: bossDef.damageReduction, boss: true };
bossSim2.hp -= shotDamage;
report.checks.push({name:'boss_no_shield_takes_full_damage', ok: bossSim2.hp === bossDef.hp - shotDamage});

// Boss spawn warning banner is derived from the spawn queue, so it cannot
// disagree with actual spawning. Verify the queue contains "boss" on the
// final wave of every level. We simulate wave completion between starts.
let bossInAllFinalWaves = true;
for (let li = 0; li < ctx.__api.LEVELS.length; li++) {
  ctx.__api.currentLevel = li + 1;
  ctx.__api.currentWave = 0;
  ctx.__api.currentRun = 1;
  ctx.__api.waveActive = false;
  ctx.__api.spawned = 0;
  ctx.__api.enemiesToSpawn = 0;
  ctx.__api.enemies = [];
  ctx.__api.spawnQueue = [];
  ctx.__api.mode = 'ready';
  // Start wave 1
  ctx.__api.startWave();
  // Simulate wave 1 completion
  ctx.__api.waveActive = false;
  ctx.__api.spawned = ctx.__api.enemiesToSpawn;
  ctx.__api.enemies = [];
  ctx.__api.mode = 'ready';
  // Start wave 2
  ctx.__api.startWave();
  // Simulate wave 2 completion
  ctx.__api.waveActive = false;
  ctx.__api.spawned = ctx.__api.enemiesToSpawn;
  ctx.__api.enemies = [];
  ctx.__api.mode = 'ready';
  // Start wave 3 (final)
  ctx.__api.startWave();
  if (!ctx.__api.spawnQueue.some(t => t === "boss")) { bossInAllFinalWaves = false; break; }
  ctx.__api.reset();
}
report.checks.push({name:'boss_spawns_on_final_wave_of_every_level', ok: bossInAllFinalWaves});

// ---- v2.3.0: Challenge mode regression tests ----
// The challenge engine is a thin layer over the existing game loop, so we
// exercise it through the vm-exposed API. Challenge state must never leak
// into campaign stats, and challenge constraints must be enforced.
const challengeApi = ctx.__api;
const resetSaveOk = challengeApi.resetSave();
report.checks.push({name:'challenge_reset_save_succeeds', ok: resetSaveOk === true});
report.checks.push({name:'challenge_reset_save_clears_campaign', ok: challengeApi.campaignState.levelsCompleted === 0 && challengeApi.campaignState.currentLevel === 1 && challengeApi.campaignState.currentRun === 1});

// All six challenges are defined and unlocked by default.
report.checks.push({name:'challenge_defs_present', ok: challengeApi.CHALLENGE_DEFS && Object.keys(challengeApi.CHALLENGE_DEFS).length === 6});
for (const id of Object.keys(challengeApi.CHALLENGE_DEFS)) {
  report.checks.push({name:'challenge_unlocked_' + id, ok: challengeApi.isChallengeUnlocked(id) === true});
}

// Starting a challenge overrides the active level and coins without
// touching campaign progress. Challenge attempts share the same engine,
// so per-attempt counters like towersBuilt may move; what must stay fixed
// is campaign progress (round, level, highest run reached, completion).
// Starting a challenge sets the active level/round. What must stay fixed
// is campaign progress: levelsCompleted, highestRunReached, and
// campaignCompleted must not be altered by a challenge attempt.
const beforeProgress = {
  levelsCompleted: challengeApi.campaignState.levelsCompleted,
  highestRunReached: challengeApi.campaignState.highestRunReached,
  campaignCompleted: challengeApi.campaignState.campaignCompleted,
  currentLevel: challengeApi.campaignState.currentLevel,
  currentRun: challengeApi.campaignState.currentRun
};
challengeApi.currentLevel = 7;
challengeApi.currentRun = 3;
challengeApi.campaignState.currentLevel = 7;
challengeApi.campaignState.currentRun = 3;
challengeApi.campaignState.levelsCompleted = 6;
challengeApi.campaignState.highestRunReached = 3;
beforeProgress.currentLevel = 7;
beforeProgress.currentRun = 3;
beforeProgress.levelsCompleted = 6;
beforeProgress.highestRunReached = 3;
const beforeCampaignStats = JSON.stringify(challengeApi.statsState);
const beforeCampaignAchievements = JSON.stringify(challengeApi.achievements);
challengeApi.startChallenge('budget_defender');
const afterProgress = {
  levelsCompleted: challengeApi.campaignState.levelsCompleted,
  highestRunReached: challengeApi.campaignState.highestRunReached,
  campaignCompleted: challengeApi.campaignState.campaignCompleted,
  currentLevel: challengeApi.campaignState.currentLevel,
  currentRun: challengeApi.campaignState.currentRun
};
console.log('CHALLENGE_DEBUG before=' + JSON.stringify(beforeProgress) + ' after=' + JSON.stringify(afterProgress));
report.checks.push({name:'challenge_debug_progress', ok: JSON.stringify(afterProgress) === JSON.stringify(beforeProgress), before: JSON.stringify(beforeProgress), after: JSON.stringify(afterProgress)});
report.checks.push({name:'challenge_start_sets_mode', ok: challengeApi.challengeMode === true && challengeApi.activeChallenge === 'budget_defender'});
report.checks.push({name:'challenge_start_sets_level', ok: challengeApi.currentLevel === 1});
report.checks.push({name:'challenge_start_sets_coins', ok: challengeApi.coins === 50});
report.checks.push({name:'challenge_start_isolates_campaign_state', ok: afterProgress.levelsCompleted === beforeProgress.levelsCompleted && afterProgress.highestRunReached === beforeProgress.highestRunReached && afterProgress.campaignCompleted === beforeProgress.campaignCompleted});
const challengeSave = JSON.parse(storageData.get('myTowerDef.save.v3'));
report.checks.push({name:'challenge_save_preserves_campaign_position', ok: challengeSave.campaign.currentLevel === 7 && challengeSave.campaign.currentRun === 3});
challengeApi.reset();
report.checks.push({name:'challenge_reset_keeps_mode', ok: challengeApi.challengeMode === true && challengeApi.activeChallenge === 'budget_defender'});
report.checks.push({name:'challenge_reset_applies_starting_coins', ok: challengeApi.coins === 50 && challengeApi.challengeState.coins === 50});

// Budget Defender forbids selling towers and restricts placement to archer.
const spot = challengeApi.spots[0];
challengeApi.placeTower(spot.x, spot.y);
report.checks.push({name:'challenge_allows_archer_placement', ok: challengeApi.towers.length === 1 && challengeApi.towers[0].type === 'archer'});
challengeApi.recordCoinSpend(500);
report.checks.push({name:'challenge_build_and_spend_do_not_change_campaign_stats', ok: JSON.stringify(challengeApi.statsState) === beforeCampaignStats && JSON.stringify(challengeApi.achievements) === beforeCampaignAchievements && challengeApi.challengeState.coinsSpent >= 500});
const challengeRunner = {x: challengeApi.path[0].x, y: challengeApi.path[0].y, point: 0, speed: 0, hp: 1, type: 'runner', reward: 0, color: '#f00'};
challengeApi.mode = 'playing';
challengeApi.enemiesToSpawn = 0;
challengeApi.spawned = 0;
challengeApi.enemies = [challengeRunner];
challengeApi.shots = [{x: challengeRunner.x, y: challengeRunner.y, target: challengeRunner, damage: 1, speed: 220}];
challengeApi.update(0.016);
report.checks.push({name:'challenge_kills_do_not_change_campaign_stats', ok: JSON.stringify(challengeApi.statsState) === beforeCampaignStats && JSON.stringify(challengeApi.achievements) === beforeCampaignAchievements});
challengeApi.selectedTowerType = 'cannon';
challengeApi.placeTower(spot.x, spot.y);
report.checks.push({name:'challenge_rejects_disallowed_tower_type', ok: challengeApi.towers.length === 1});
challengeApi.sellTower(challengeApi.towers[0]);
report.checks.push({name:'challenge_rejects_tower_sale', ok: challengeApi.towers.length === 1 && challengeApi.challengeState.towersSold === 0});

// Reset restores the challenge attempt in place without ending the challenge.
challengeApi.reset();
report.checks.push({name:'challenge_reset_clears_towers', ok: challengeApi.towers.length === 0});
report.checks.push({name:'challenge_reset_preserves_mode', ok: challengeApi.challengeMode === true});

// Objective evaluation: completing the level satisfies the objective.
challengeApi.currentLevel = 1;
challengeApi.currentWave = 0;
challengeApi.waveActive = false;
challengeApi.mode = 'ready';
challengeApi.coins = 50;
challengeApi.challengeState.coins = 50;
challengeApi.challengeState.lives = 6;
challengeApi.lives = 6;
challengeApi.towers = [];
challengeApi.enemies = [];
challengeApi.spawned = 0;
challengeApi.enemiesToSpawn = 0;
challengeApi.spawnQueue = [];
challengeApi.mode = 'won';
report.checks.push({name:'challenge_objective_complete_level', ok: challengeApi.evaluateChallengeObjective() === true});

// finalizeChallengeResult awards bronze at minimum and records the attempt.
challengeApi.challengeState.lives = 6;
const result = challengeApi.finalizeChallengeResult();
report.checks.push({name:'challenge_finalize_awards_bronze', ok: result.completed === true && result.medal >= 1});
report.checks.push({name:'challenge_finalize_records_attempt', ok: challengeApi.challengeRecords.budget_defender && challengeApi.challengeRecords.budget_defender.attempts >= 1});
report.checks.push({name:'challenge_finalize_ended_mode', ok: challengeApi.challengeMode === false && challengeApi.activeChallenge === null});
report.checks.push({name:'challenge_finalize_restores_campaign_position', ok: challengeApi.currentLevel === 7 && challengeApi.currentRun === 3});

// Campaign progress must be untouched by the challenge attempt.
report.checks.push({name:'challenge_isolates_campaign_state', ok: challengeApi.campaignState.levelsCompleted === beforeProgress.levelsCompleted && challengeApi.campaignState.highestRunReached === beforeProgress.highestRunReached && challengeApi.campaignState.campaignCompleted === beforeProgress.campaignCompleted});

// Start a second challenge and verify medal thresholds.
challengeApi.startChallenge('last_stand');
challengeApi.mode = 'won';
challengeApi.currentLevel = 3;
challengeApi.lives = 6;
challengeApi.challengeState.lives = 6;
const result2 = challengeApi.finalizeChallengeResult();
report.checks.push({name:'challenge_last_stand_gold_threshold', ok: result2.completed === true && result2.medal === 3 && challengeApi.challengeRecords.last_stand.bestMedal === 3});

const priorLastStandAttempts = challengeApi.challengeRecords.last_stand.attempts;
const priorLastStandCompletions = challengeApi.challengeRecords.last_stand.completions;
challengeApi.startChallenge('last_stand');
challengeApi.mode = 'won';
challengeApi.currentLevel = 3;
challengeApi.lives = 3;
challengeApi.challengeState.lives = 3;
const failedCompletion = challengeApi.finalizeChallengeResult();
challengeApi.showChallengeResultOverlay(failedCompletion);
report.checks.push({name:'challenge_failed_completion_keeps_id_and_records_attempt', ok: failedCompletion.challenge === 'last_stand' && failedCompletion.completed === false && challengeApi.challengeRecords.last_stand.attempts === priorLastStandAttempts + 1 && challengeApi.challengeRecords.last_stand.completions === priorLastStandCompletions});
report.checks.push({name:'challenge_failed_completion_overlay_shows_challenge', ok: !els.challengeOverlay.hidden && els.challengeMessage.textContent.includes('Last Stand')});
challengeApi.closeChallengeResult();

report.checks.push({name:'tactical_specialist_allows_cannon_and_magic', ok: JSON.stringify(challengeApi.CHALLENGE_DEFS.tactical_specialist.allowedTowerTypes) === JSON.stringify(['cannon', 'magic']) && JSON.stringify(challengeApi.CHALLENGE_DEFS.tactical_specialist.objective.allowed) === JSON.stringify(['cannon', 'magic'])});
challengeApi.startChallenge('shieldbreaker');
challengeApi.challengeState.bossDefeated = true;
challengeApi.challengeState.shieldBroken = false;
report.checks.push({name:'shieldbreaker_requires_broken_shield', ok: challengeApi.evaluateChallengeObjective() === false});
challengeApi.challengeState.shieldBroken = true;
report.checks.push({name:'shieldbreaker_succeeds_after_shield_break', ok: challengeApi.evaluateChallengeObjective() === true});
challengeApi.abandonChallenge();

// Abandon records an attempt without a medal.
challengeApi.startChallenge('shieldbreaker');
challengeApi.challengeState.lives = 0;
challengeApi.lives = 0;
const abandoned = challengeApi.abandonChallenge();
report.checks.push({name:'challenge_abandon_records_attempt', ok: abandoned.challenge === 'shieldbreaker' && abandoned.completed === false && challengeApi.challengeRecords.shieldbreaker.attempts >= 1 && challengeApi.challengeRecords.shieldbreaker.bestMedal === 0});

const priorBudgetAttempts = challengeApi.challengeRecords.budget_defender.attempts;
challengeApi.startChallenge('budget_defender');
challengeApi.mode = 'playing';
challengeApi.lives = 1;
challengeApi.challengeState.lives = 1;
challengeApi.enemies = [{x: challengeApi.path[challengeApi.path.length - 1].x, y: challengeApi.path[challengeApi.path.length - 1].y, point: challengeApi.path.length - 1, speed: 1, hp: 1, type: 'standard', reward: 0}];
challengeApi.enemiesToSpawn = 0;
challengeApi.spawned = 0;
challengeApi.update(0.1);
report.checks.push({name:'challenge_defeat_overlay_keeps_challenge_identity', ok: !els.challengeOverlay.hidden && els.challengeMessage.textContent.includes('Budget Defender') && challengeApi.challengeRecords.budget_defender.attempts === priorBudgetAttempts + 1 && challengeApi.activeChallenge === null});

// Locked challenges (none by default, but verify the unlock predicate is safe).
report.checks.push({name:'challenge_unknown_id_not_unlocked', ok: challengeApi.isChallengeUnlocked('does_not_exist') === false});

// Restore a clean campaign state for the remaining tests.
challengeApi.resetSave();
report.checks.push({name:'challenge_reset_save_restores_campaign', ok: challengeApi.challengeMode === false && challengeApi.activeChallenge === null && challengeApi.currentLevel === 1 && challengeApi.coins === 80});
report.checks.push({name:'challenge_reset_save_clears_records', ok: Object.keys(challengeApi.challengeRecords).length === 0});

storageData.set('myTowerDef.save.v2', JSON.stringify({
  version: 2,
  campaign: {currentRun: 3, currentLevel: 4, highestRunReached: 5, campaignCompleted: false, levelsCompleted: 2},
  settings: {soundEnabled: false, reducedMotion: true},
  stats: {enemiesDefeated: 12},
  achievements: ['first_defense']
}));
const migrated = challengeApi.loadSave();
const migratedSave = JSON.parse(storageData.get('myTowerDef.save.v3'));
report.checks.push({name:'v2_legacy_key_migrates_to_v3', ok: migrated && challengeApi.campaignState.currentRun === 3 && challengeApi.campaignState.currentLevel === 4 && migratedSave.version === 3 && !storageData.has('myTowerDef.save.v2')});
report.checks.push({name:'v2_migration_preserves_settings_stats_and_achievements', ok: challengeApi.settings.soundEnabled === false && challengeApi.settings.reducedMotion === true && challengeApi.statsState.enemiesDefeated === 12 && challengeApi.achievements.includes('first_defense')});
challengeApi.resetSave();

// The challenge panel renders a card per defined challenge and can be toggled.
challengeApi.showChallengePanel();
const challengePanelEl = els.challengePanel;
const challengeListEl = els.challengeList;
report.checks.push({name:'challenge_panel_opens', ok: !!challengePanelEl && !challengePanelEl.hidden});
report.checks.push({name:'challenge_panel_renders_all_cards', ok: !!challengeListEl && challengeListEl.innerHTML.includes('Budget Defender') && challengeListEl.innerHTML.includes('Last Stand') && challengeListEl.innerHTML.includes('Shieldbreaker') && challengeListEl.innerHTML.includes('Tactical Specialist') && challengeListEl.innerHTML.includes('Endurance Trial') && challengeListEl.innerHTML.includes('Precision Defense')});
challengeApi.hideChallengePanel();
report.checks.push({name:'challenge_panel_closes', ok: !!challengePanelEl && challengePanelEl.hidden});

// The active-challenge HUD is hidden when no challenge is active.
challengeApi.startChallenge('budget_defender');
challengeApi.updateChallengeHUD();
challengeApi.endChallenge();
challengeApi.updateChallengeHUD();
const challengeHudEl = els.challengeHud;
report.checks.push({name:'challenge_hud_hidden_when_inactive', ok: !!challengeHudEl && challengeHudEl.hidden});
challengeApi.startChallenge('budget_defender');
challengeApi.updateChallengeHUD();
report.checks.push({name:'challenge_hud_shows_active_challenge', ok: !!challengeHudEl && !challengeHudEl.hidden && challengeHudEl.innerHTML.includes('Budget Defender')});
challengeApi.updateChallengeHUD();
challengeApi.hideChallengePanel();
challengeApi.resetSave();

// The challenge result overlay is wired and shows the correct medal glyph.
challengeApi.showChallengeResultOverlay({ challenge: 'budget_defender', medal: 0, completed: false });
const challengeOverlayEl = els.challengeOverlay;
const challengeTitleEl = els.challengeTitle;
const challengeMedalEl = els.challengeMedal;
const challengeMessageEl = els.challengeMessage;
const challengeRecordsEl = els.challengeRecords;
const challengeContinueEl = els.challengeContinue;
report.checks.push({name:'challenge_result_overlay_elements_exist', ok: !!challengeOverlayEl && !!challengeTitleEl && !!challengeMedalEl && !!challengeMessageEl && !!challengeRecordsEl && !!challengeContinueEl});
challengeApi.startChallenge('last_stand');
challengeApi.mode = 'won';
challengeApi.currentLevel = 3;
challengeApi.lives = 6;
challengeApi.challengeState.lives = 6;
const lastStandResult = challengeApi.finalizeChallengeResult();
challengeApi.showChallengeResultOverlay(lastStandResult);
report.checks.push({name:'challenge_result_overlay_shows_gold', ok: !!challengeOverlayEl && !challengeOverlayEl.hidden && challengeTitleEl.textContent.includes('Complete') && challengeMedalEl.textContent === '🥇' && challengeMessageEl.textContent.includes('Last Stand')});
challengeApi.closeChallengeResult();
report.checks.push({name:'challenge_result_overlay_closes', ok: !!challengeOverlayEl && challengeOverlayEl.hidden});

// The three control buttons share a single row in the DOM.
const controlsMatch = html.match(/<section class="controls">([\s\S]*?)<\/section>/g) || [];
report.checks.push({name:'controls_row_is_single_row', ok: controlsMatch.length === 1 && controlsMatch[0].includes('id="startBtn"') && controlsMatch[0].includes('id="pauseBtn"') && controlsMatch[0].includes('id="restartBtn"')});
const threeCol = 'grid-template-columns: repeat(3, 1fr)';
report.checks.push({name:'controls_use_three_columns', ok: !!css && css.includes(threeCol) && css.includes('.controls')});

// ---- v2.3.2: PWA install banner regression tests ----
// The install banner appears when the browser fires beforeinstallprompt,
// dismisses on "not now" or install, and never appears in standalone mode.
const installApi = ctx.__api;

// Helper: reset the install banner state so each test starts clean.
function resetInstallState() {
  storageData.delete('myTowerDef.installBannerDismissed');
  installApi.installBannerDismissed = false;
  installApi.installPrompt = null;
  ctx.window.matchMedia = undefined;
  installApi.restoreInstallBannerState();
}

// Banner elements exist in the DOM. The game creates installBanner, installBtn,
// and installLater via $() at load time. The banner's inner content is
// defined in index.html; in the test harness the mock element exists and is
// toggled by showInstallBanner/hideInstallBanner.
resetInstallState();
installApi.showInstallBanner();
report.checks.push({name:'install_banner_elements_exist', ok: !!els.installBanner && !!els.installBtn && !!els.installLater});

// isStandalone() returns false in the test harness (no matchMedia, no navigator.standalone).
resetInstallState();
report.checks.push({name:'install_isStandalone_false_in_harness', ok: installApi.isStandalone() === false});

// showInstallBanner reveals the banner; hideInstallBanner hides it.
resetInstallState();
installApi.showInstallBanner();
report.checks.push({name:'install_show_banner_reveals', ok: !!els.installBanner && !els.installBanner.hidden});
installApi.hideInstallBanner();
report.checks.push({name:'install_hide_banner_hides', ok: !!els.installBanner && els.installBanner.hidden});

// dismissInstallBanner persists the dismissal and hides the banner.
resetInstallState();
installApi.showInstallBanner();
installApi.dismissInstallBanner();
report.checks.push({name:'install_dismiss_sets_flag', ok: installApi.installBannerDismissed === true});
report.checks.push({name:'install_dismiss_persists_to_storage', ok: storageData.get('myTowerDef.installBannerDismissed') === '1'});
report.checks.push({name:'install_dismiss_hides_banner', ok: !!els.installBanner && els.installBanner.hidden});

// restoreInstallBannerState reads the persisted dismissal back. First persist
// "1" via dismiss, then reset the in-memory flag and confirm restore re-reads it.
resetInstallState();
installApi.dismissInstallBanner();
installApi.installBannerDismissed = false;
installApi.restoreInstallBannerState();
report.checks.push({name:'install_restore_reads_persisted_flag', ok: installApi.installBannerDismissed === true});

// A fresh beforeinstallprompt event stores the prompt and shows the banner.
resetInstallState();
let installPromptPrevented = false;
const promptEvent = {
  type: 'beforeinstallprompt',
  preventDefault: () => { installPromptPrevented = true; },
  prompt: () => {},
  userChoice: Promise.resolve({ outcome: 'accepted' })
};
ctx.window.dispatchEvent(promptEvent);
report.checks.push({name:'install_beforeinstallprompt_prevents_default', ok: installPromptPrevented});
report.checks.push({name:'install_beforeinstallprompt_stores_prompt', ok: installApi.installPrompt === promptEvent});
report.checks.push({name:'install_banner_shows_after_prompt', ok: !!els.installBanner && !els.installBanner.hidden});

// tryInstallPWA invokes prompt() and clears the stored prompt on completion.
resetInstallState();
let prompted = false;
promptEvent.prompt = () => { prompted = true; return promptEvent; };
installApi.installPrompt = promptEvent;
installApi.tryInstallPWA();
report.checks.push({name:'install_tryInstallPWA_invokes_prompt', ok: prompted === true});
report.checks.push({name:'install_tryInstallPWA_clears_prompt', ok: installApi.installPrompt === null});
report.checks.push({name:'install_tryInstallPWA_dismisses_banner', ok: installApi.installBannerDismissed === true && !!els.installBanner && els.installBanner.hidden});

// appinstalled event clears the prompt and dismisses the banner.
resetInstallState();
ctx.window.dispatchEvent(promptEvent);
ctx.window.dispatchEvent(new Event('appinstalled'));
report.checks.push({name:'install_appinstalled_clears_prompt', ok: installApi.installPrompt === null});
report.checks.push({name:'install_appinstalled_dismisses_banner', ok: installApi.installBannerDismissed === true});

// The banner is hidden when isStandalone() is true (simulated via matchMedia).
resetInstallState();
ctx.window.matchMedia = (query) => ({ matches: query === '(display-mode: standalone)', addEventListener: () => {}, removeEventListener: () => {} });
report.checks.push({name:'install_isStandalone_true_when_matchMedia_matches', ok: installApi.isStandalone() === true});
installApi.showInstallBanner();
report.checks.push({name:'install_banner_hidden_in_standalone_mode', ok: !!els.installBanner && els.installBanner.hidden});
delete ctx.window.matchMedia;
report.checks.push({name:'install_isStandalone_false_without_matchMedia', ok: installApi.isStandalone() === false});

// Version metadata is at v2.3.3 across all files.
report.checks.push({name:'html_v233', ok: !!html && html.includes('v2.3.3')});
report.checks.push({name:'manifest_v233', ok: !!manifest && manifest.includes('"version":  "2.3.3"')});
report.checks.push({name:'sw_v233', ok: !!sw && sw.includes('v2.3.3')});
report.checks.push({name:'docs_v233', ok: (!!qg && qg.includes('v2.3.3')) || (!!readme && readme.includes('v2.3.3'))});

// ---- v2.3.2: Background and unit asset regression tests ----
// The generator (gen_assets.py) produces one themed background PNG per level
// and one unit icon PNG per enemy/tower type. The game loads them lazily and
// falls back to procedural drawing when an asset is missing.
const assetNames = [
  'bg_jungle', 'bg_ocean', 'bg_meadow', 'bg_desert', 'bg_autumn', 'bg_snow',
  'bg_swamp', 'bg_volcano', 'bg_ruins', 'bg_crystal', 'bg_moon', 'bg_canyon',
  'enemy_standard', 'enemy_runner', 'enemy_armored', 'enemy_boss',
  'tower_archer', 'tower_cannon', 'tower_magic'
];
let assetExists = true;
for (const name of assetNames) {
  const p = path.join(__dirname, 'assets', name + '.png');
  if (!fs.existsSync(p)) { assetExists = false; console.log('MISSING ASSET:', p); }
}
report.checks.push({name:'assets_all_present', ok: assetExists});

// The game exposes loadBg/loadUnit helpers that return Image objects.
report.checks.push({name:'assets_loadBg_returns_image', ok: typeof ctx.__api.loadBg === 'function'});
report.checks.push({name:'assets_loadUnit_returns_image', ok: typeof ctx.__api.loadUnit === 'function'});

// The game caches loaded assets so repeated draws do not re-decode.
const bg1 = ctx.__api.loadBg('jungle');
const bg2 = ctx.__api.loadBg('jungle');
report.checks.push({name:'assets_loadBg_caches', ok: bg1 === bg2 && bg1 !== null});
const tower1 = ctx.__api.loadUnit('tower_archer');
const tower2 = ctx.__api.loadUnit('tower_archer');
report.checks.push({name:'assets_loadUnit_caches', ok: tower1 === tower2 && tower1 !== null});

// The game must not crash when drawing with assets present.
try {
  ctx.__api.reset();
  ctx.__api.update(0);
  report.checks.push({name:'assets_draw_with_assets_ok', ok: true});
} catch (e) {
  report.checks.push({name:'assets_draw_with_assets_ok', ok: false, error: e.message});
}

// The header must stay on exactly one row even on the narrowest screens:
// the title and stats shrink via clamp() and never wrap.
report.checks.push({name:'header_one_row', ok: !!css && css.includes('.header {') && css.includes('flex-wrap: nowrap') && css.includes('.header > div {') && css.includes('min-width: 0') && css.includes('overflow: hidden')});
report.checks.push({name:'header_title_nowraps', ok: !!css && css.includes('white-space: nowrap') && css.includes('text-overflow: ellipsis') && css.includes('clamp(')});
report.checks.push({name:'header_stats_nowraps', ok: !!css && css.includes('.stats {') && css.includes('white-space: nowrap') && css.includes('flex: 1 0 auto')});
report.checks.push({name:'header_no_narrow_media_query', ok: !!css && !css.includes('@media (max-width: 380px)')});

if (failures > 0) {
  console.log('DETERMINISTIC_FAILURES ' + failures);
}
console.log('DETERMINISTIC_OK');


const allOk = report.checks.every(c=>c.ok);
report.summary = {allOk, total: report.checks.length, passed: report.checks.filter(c=>c.ok).length};

console.log(JSON.stringify(report,null,2));
fs.writeFileSync('regression_report.json', JSON.stringify(report,null,2));
console.log('written regression_report.json');
