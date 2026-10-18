const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const $ = id => document.getElementById(id);

const W = 300;
const H = 360;
const TOTAL_ENEMIES = 8;

// Distinct tower archetypes. Combat stats live here so placement, combat,
// rendering, the placement ghost, and the upgrade panel all derive from one
// authoritative source. The Archer is the existing baseline tower.
const TOWER_TYPES = {
  archer: { id: "archer", name: "Archer", cost: 50, damage: 20, range: 85, cooldown: 0.65, color: "#60a5fa", glyph: "▲" },
  cannon: { id: "cannon", name: "Cannon", cost: 80, damage: 45, range: 75, cooldown: 1.00, color: "#f97316", glyph: "●" },
  magic:  { id: "magic",  name: "Magic",  cost: 80, damage: 28, range: 110, cooldown: 0.85, color: "#a855f7", glyph: "✦" }
};
function getTowerType(id) {
  return TOWER_TYPES[id] || TOWER_TYPES.archer;
}
// Cache for the targeting picker DOM so it is not destroyed and recreated
// every frame (which would break button clicks during an active wave). Only
// re-render when the selected tower or its targeting mode actually changes.
let panelTargetTower = null;
let panelTargetMode = null;

function renderTargetingPicker(t) {
  const targetingRow = $("targetingRow");
  const targetingPicker = $("targetingPicker");
  if (!targetingRow || !targetingPicker) return;
  // Guarded so non-DOM contexts (deterministic test harness) never crash.
  if (typeof document === "undefined" || typeof document.createElement !== "function") return;
  const currentMode = getTargetingMode(t.targeting || "first");
  const needsRender = panelTargetTower !== t || panelTargetMode !== currentMode.id;
  targetingRow.hidden = false;
  if (needsRender) {
    targetingPicker.innerHTML = "";
    for (const key of Object.keys(TARGET_MODES)) {
      const m = TARGET_MODES[key];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tmode-btn" + (m.id === currentMode.id ? " active" : "");
      btn.dataset.mode = m.id;
      btn.title = m.name + " targeting";
      btn.textContent = m.glyph + " " + m.name;
      targetingPicker.appendChild(btn);
    }
    panelTargetTower = t;
    panelTargetMode = currentMode.id;
  } else {
    // Refresh active states on existing buttons without destroying DOM.
    for (const btn of targetingPicker.children) {
      btn.classList.toggle("active", btn.dataset.mode === currentMode.id);
    }
  }
}

// Selecting a tower type always clears any existing tower selection, so the
// upgrade panel can never show a stale tower after a type switch. This
// helper is the single authoritative path for changing the type.
function selectTowerType(id) {
  selectedTowerType = id;
  selectedTower = null;
  updateUpgradePanel();
  updateTowerPicker();
}
let selectedTowerType = "archer"; // the type used for the next placement

// Configurable tower targeting priorities. Every placed tower carries its own
// `targeting` mode (default "first"); the mode only affects which enemy is
// acquired next and never changes a tower's cost, damage, range, or cooldown.
// Enemy progress is read from the authoritative `point` field (path index),
// HP from `hp`, speed from `speed`, and distance from `distance()`, so all
// four modes are supported accurately by the existing data model.
const TARGET_MODES = {
  first:   { id: "first",   name: "First",  glyph: "1️⃣" },
  strongest: { id: "strongest", name: "Strongest", glyph: "💪" },
  fastest:  { id: "fastest",  name: "Fastest",  glyph: "⚡" },
  nearest:  { id: "nearest",  name: "Nearest",  glyph: "🎯" }
};
function getTargetingMode(id) {
  return TARGET_MODES[id] || TARGET_MODES.first;
}
// Returns the single best enemy for the given tower under its targeting mode,
// or null when no valid target exists. Only living enemies inside the tower's
// effective attack range are considered. Tie-breaking is deterministic: for
// "first" the enemy furthest along the path wins; for the stat-based modes the
// best value wins, broken by path index, then by array position.
function pickTarget(tower, list) {
  if (!tower || !list || list.length === 0) return null;
  const mode = getTargetingMode(tower.targeting || "first");

  let best = null;
  let bestKey = null;
  let bestTie = null;

  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead || e.reachedBase) continue;
    if (distance(tower, e) > tower.range) continue;

    let key;
    if (mode.id === "first") {
      // First = progressed furthest along the path, so the HIGHEST point wins.
      key = -e.point;
    } else if (mode.id === "strongest") {
      key = -e.hp; // higher HP sorts first
    } else if (mode.id === "fastest") {
      key = -e.speed;
    } else { // nearest
      key = distance(tower, e);
    }
    // Deterministic tie-break: lower path index, then lower array position.
    const tie = e.point * 1000 + i;
    if (best === null || key < bestKey || (key === bestKey && tie < bestTie)) {
      best = e;
      bestKey = key;
      bestTie = tie;
    }
  }
  return best;
}
// Changes a placed tower's targeting mode immediately, without spending
// currency or granting extra attacks. Safe no-op for unknown modes.
function selectTargetingMode(tower, modeId) {
  if (!tower) return;
  if (mode === "won" || mode === "lost") return;
  const m = getTargetingMode(modeId);
  if (!m) return;
  tower.targeting = m.id;
  updateUpgradePanel();
}

// The shared overlay hosts either the selected tower's upgrade panel or the
// build menu for a tapped empty spot.
let panelOpen = false;
let buildMenuOpen = false;
let pendingBuildSpot = null;
function showPanel() {
  if (panelOpen) return; // already open; never force it back after dismissal
  const overlay = $("panelOverlay");
  const buildPanel = $("buildPanel");
  const upgradePanel = $("upgradePanel");
  if (buildPanel) buildPanel.hidden = true;
  if (upgradePanel) upgradePanel.hidden = false;
  if (overlay) overlay.hidden = false;
  buildMenuOpen = false;
  pendingBuildSpot = null;
  panelOpen = true;
}
function hidePanel() {
  const overlay = $("panelOverlay");
  if (overlay) overlay.hidden = true;
  panelOpen = false;
}
function showBuildMenu(spot) {
  pendingBuildSpot = { x: spot.x, y: spot.y };
  buildMenuOpen = true;
  updateTowerPicker();
  const overlay = $("panelOverlay");
  const buildPanel = $("buildPanel");
  const upgradePanel = $("upgradePanel");
  if (buildPanel) buildPanel.hidden = false;
  if (upgradePanel) upgradePanel.hidden = true;
  if (overlay) overlay.hidden = false;
}
function closeBuildMenu() {
  buildMenuOpen = false;
  pendingBuildSpot = null;
  const overlay = $("panelOverlay");
  const buildPanel = $("buildPanel");
  if (buildPanel) buildPanel.hidden = true;
  if (overlay) overlay.hidden = !panelOpen;
}
// Keep the overlay visible for whichever menu is active during game updates.
function refreshPanelContent() {
  const overlay = $("panelOverlay");
  if (!overlay) return;
  overlay.hidden = !buildMenuOpen && !panelOpen;
}

// Distinct enemy archetypes. Every gameplay stat (hp, speed, reward) and
// visual identity lives here so spawning, combat, rendering, and the wave
// preview all derive from a single authoritative source.
const ENEMY_TYPES = {
  standard: { id: "standard", name: "Standard", hp: 35, speed: 28, reward: 10, color: "#ef4444", glyph: "●" },
  runner:   { id: "runner",   name: "Runner",   hp: 22, speed: 40, reward: 14, color: "#f59e0b", glyph: "◆" },
  armored:  { id: "armored",  name: "Armored",  hp: 70, speed: 20, reward: 18, color: "#64748b", glyph: "⬢" }
};
function getEnemyType(id) {
  return ENEMY_TYPES[id] || ENEMY_TYPES.standard;
}

// Each wave specifies an explicit, deterministic composition of enemy types.
// The legacy `enemies`/`enemyHp`/`enemySpeed` fields are derived from the
// composition for backward compatibility; `composition` is authoritative.
function buildWaveDef(composition, reward) {
  const enemies = composition.reduce((sum, entry) => sum + entry.count, 0);
  return {
    composition: composition,
    enemies: enemies,
    enemyHp: ENEMY_TYPES.standard.hp,
    enemySpeed: ENEMY_TYPES.standard.speed,
    reward: reward
  };
}

const WAVE_DEFS = [
  buildWaveDef([{ type: "standard", count: 8 }], 30),
  buildWaveDef([{ type: "standard", count: 6 }, { type: "runner", count: 4 }], 40),
  buildWaveDef([{ type: "standard", count: 4 }, { type: "armored", count: 4 }, { type: "runner", count: 4 }], 60)
];
const MAX_WAVE = WAVE_DEFS.length;
const MAX_RUN = 50;

const LEVELS = [
  {
    name: "First Defense", theme: "jungle", ground: "#173c35", road: "#9b896a", roadEdge: "#c6b99a",
    path: [{x:-10,y:45},{x:240,y:45},{x:240,y:130},{x:65,y:130},{x:65,y:225},{x:245,y:225},{x:245,y:370}],
    spots: [{x:100,y:80},{x:195,y:85},{x:190,y:165},{x:110,y:185},{x:115,y:270},{x:200,y:280}]
  },
  {
    name: "Coral Bay", theme: "ocean", ground: "#174653", road: "#c4a878", roadEdge: "#e8d6ad",
    path: [{x:-10,y:70},{x:75,y:70},{x:75,y:150},{x:230,y:150},{x:230,y:55},{x:275,y:55},{x:275,y:255},{x:90,y:255},{x:90,y:370}],
    spots: [{x:35,y:115},{x:135,y:105},{x:185,y:195},{x:250,y:300},{x:40,y:300},{x:180,y:315}]
  },
  {
    name: "Wildflower Meadow", theme: "meadow", ground: "#31533b", road: "#b49a6c", roadEdge: "#dfc88f",
    path: [{x:-10,y:85},{x:255,y:85},{x:255,y:155},{x:45,y:155},{x:45,y:235},{x:215,y:235},{x:215,y:295},{x:80,y:295},{x:80,y:370}],
    spots: [{x:80,y:112},{x:210,y:120},{x:120,y:190},{x:260,y:200},{x:145,y:265},{x:30,y:330}]
  },
  {
    name: "Sunset Dunes", theme: "desert", ground: "#8b6841", road: "#c6a66b", roadEdge: "#f0d89b",
    path: [{x:-10,y:55},{x:55,y:55},{x:55,y:120},{x:260,y:120},{x:260,y:190},{x:105,y:190},{x:105,y:265},{x:235,y:265},{x:235,y:370}],
    spots: [{x:25,y:90},{x:145,y:80},{x:220,y:155},{x:45,y:225},{x:165,y:230},{x:280,y:315}]
  },
  {
    name: "Autumn Forest", theme: "autumn", ground: "#394432", road: "#a88b67", roadEdge: "#d8bd91",
    path: [{x:-10,y:100},{x:210,y:100},{x:210,y:55},{x:270,y:55},{x:270,y:185},{x:70,y:185},{x:70,y:260},{x:230,y:260},{x:230,y:370}],
    spots: [{x:65,y:60},{x:145,y:145},{x:245,y:140},{x:30,y:225},{x:150,y:300},{x:275,y:315}]
  },
  {
    name: "Frost Valley", theme: "snow", ground: "#425766", road: "#b6aa91", roadEdge: "#e9e4d8",
    path: [{x:-10,y:60},{x:270,y:60},{x:270,y:125},{x:35,y:125},{x:35,y:205},{x:225,y:205},{x:225,y:280},{x:100,y:280},{x:100,y:370}],
    spots: [{x:65,y:90},{x:185,y:95},{x:100,y:165},{x:265,y:245},{x:165,y:320},{x:30,y:315}]
  },
  {
    name: "Misty Swamp", theme: "swamp", ground: "#344a3d", road: "#92856b", roadEdge: "#c4b99e",
    path: [{x:-10,y:115},{x:85,y:115},{x:85,y:55},{x:245,y:55},{x:245,y:165},{x:45,y:165},{x:45,y:245},{x:265,y:245},{x:265,y:370}],
    spots: [{x:35,y:70},{x:160,y:95},{x:160,y:205},{x:105,y:285},{x:215,y:300},{x:25,y:320}]
  },
  {
    name: "Volcanic Ridge", theme: "volcano", ground: "#3e3030", road: "#8f7867", roadEdge: "#d5ae82",
    path: [{x:-10,y:75},{x:225,y:75},{x:225,y:145},{x:65,y:145},{x:65,y:215},{x:260,y:215},{x:260,y:285},{x:115,y:285},{x:115,y:370}],
    spots: [{x:75,y:105},{x:175,y:110},{x:270,y:175},{x:25,y:180},{x:190,y:255},{x:55,y:320}]
  },
  {
    name: "Ancient Temple", theme: "ruins", ground: "#4a4938", road: "#a18c6b", roadEdge: "#d2c19b",
    path: [{x:-10,y:55},{x:115,y:55},{x:115,y:105},{x:270,y:105},{x:270,y:175},{x:35,y:175},{x:35,y:245},{x:190,y:245},{x:190,y:300},{x:250,y:300},{x:250,y:370}],
    spots: [{x:65,y:85},{x:185,y:75},{x:230,y:140},{x:95,y:215},{x:235,y:215},{x:115,y:330}]
  },
  {
    name: "Crystal Cavern", theme: "crystal", ground: "#26364b", road: "#8586a0", roadEdge: "#c4c6dd",
    path: [{x:-10,y:95},{x:65,y:95},{x:65,y:55},{x:220,y:55},{x:220,y:135},{x:105,y:135},{x:105,y:220},{x:270,y:220},{x:270,y:290},{x:55,y:290},{x:55,y:370}],
    spots: [{x:25,y:155},{x:155,y:95},{x:260,y:170},{x:165,y:185},{x:195,y:255},{x:145,y:330}]
  },
  {
    name: "Moonlit Grove", theme: "moon", ground: "#26364a", road: "#958b78", roadEdge: "#cfc6ae",
    path: [{x:-10,y:65},{x:160,y:65},{x:160,y:120},{x:270,y:120},{x:270,y:200},{x:55,y:200},{x:55,y:275},{x:230,y:275},{x:230,y:370}],
    spots: [{x:45,y:100},{x:110,y:160},{x:220,y:160},{x:115,y:240},{x:275,y:320},{x:160,y:320}]
  },
  {
    name: "Canyon Pass", theme: "canyon", ground: "#76513d", road: "#bda078", roadEdge: "#e5c99a",
    path: [{x:-10,y:80},{x:270,y:80},{x:270,y:135},{x:35,y:135},{x:35,y:205},{x:235,y:205},{x:235,y:265},{x:75,y:265},{x:75,y:325},{x:250,y:325},{x:250,y:370}],
    spots: [{x:60,y:105},{x:175,y:165},{x:130,y:105},{x:275,y:235},{x:155,y:295},{x:25,y:300}]
  }
];
const MAX_LEVEL = LEVELS.length;

canvas.width = W;
canvas.height = H;

let currentLevel = 1;
let currentRun = 1;
let currentLevelData = LEVELS[0];
let path = currentLevelData.path;
let spots = currentLevelData.spots;

let coins, lives, towers, enemies, shots;
let spawned, spawnTimer, mode, spawnQueue;
let pointerPos = null; // last canvas pointer position, used for placement preview
let selectedTower = null;
let lastTime = 0;
let currentWave = 0; // 0 means not started yet
let enemiesToSpawn, enemyHp, enemySpeed, waveReward;
let waveActive = false;
let lastPreviewWave = -1; // cached next-wave number rendered in the preview
let soundContext = null;
let particles = []; // transient hit/kill effects, capped per frame

// ---- v2.1.0: Performance caps and particle budget ----
const MAX_PARTICLES = 120;
const MAX_SHOTS = 200;

// ---- v2.0.0: Persistence, Settings, Achievements ----
const SAVE_KEY = "myTowerDef.save.v2";
const SAVE_VERSION = 2;
const ACHIEVEMENTS_DEFS = {
  first_defense: { id: "first_defense", name: "First Defense", desc: "Complete Level 1" },
  all_twelve: { id: "all_twelve", name: "All Twelve", desc: "Complete all 12 levels in a round" },
  round_10: { id: "round_10", name: "Decade", desc: "Reach Round 10" },
  round_25: { id: "round_25", name: "Quarter Century", desc: "Reach Round 25" },
  legendary: { id: "legendary", name: "Legendary Defender", desc: "Complete Round 50" },
  boss_slayer: { id: "boss_slayer", name: "Boss Slayer", desc: "Defeat 10 bosses" },
  speed_demon: { id: "speed_demon", name: "Speed Demon", desc: "Defeat 100 runners" },
  tank_buster: { id: "tank_buster", name: "Tank Buster", desc: "Defeat 50 armored enemies" },
  master_archer: { id: "master_archer", name: "Master Archer", desc: "Build 20 archer towers" },
  cannon_master: { id: "cannon_master", name: "Cannon Master", desc: "Build 15 cannon towers" },
  wizard: { id: "wizard", name: "Wizard", desc: "Build 15 magic towers" },
  upgrade_artist: { id: "upgrade_artist", name: "Upgrade Artist", desc: "Upgrade 30 towers" },
  perfect_hold: { id: "perfect_hold", name: "Perfect Hold", desc: "Complete a level without losing a life" },
  big_spender: { id: "big_spender", name: "Big Spender", desc: "Spend 500 coins in a single level" }
};

let settings = { soundEnabled: true, reducedMotion: false };
let campaignState = {
  currentRun: 1,
  currentLevel: 1,
  highestRunReached: 1,
  campaignCompleted: false,
  levelsCompleted: 0
};
let statsState = {
  roundsCompleted: 0,
  enemiesDefeated: 0,
  towersBuilt: 0,
  towersUpgraded: 0,
  campaignVictories: 0,
  bossesDefeated: 0,
  runnersDefeated: 0,
  armoredDefeated: 0,
  archerBuilt: 0,
  cannonBuilt: 0,
  magicBuilt: 0,
  maxCoinsSpent: 0,
  levelCoinsSpent: 0
};
let achievements = [];

function getLevelWaveDef(waveNum, levelNum, runNum) {
  const base = WAVE_DEFS[waveNum - 1];
  if (!base) return null;
  const activeRun = runNum || currentRun;
  const countMultiplier = 1 + (levelNum - 1) * 0.045;
  const composition = base.composition.map(entry => ({
    type: entry.type,
    count: Math.ceil(entry.count * countMultiplier)
  }));
  const standard = getScaledEnemyType("standard", levelNum, activeRun, waveNum);
  return {
    composition,
    enemies: composition.reduce((total, entry) => total + entry.count, 0),
    enemyHp: standard.hp,
    enemySpeed: standard.speed,
    reward: Math.round(base.reward * (1 + (levelNum - 1) * 0.06))
  };
}

function getScaledEnemyType(typeId, levelNum, runNum, waveNum) {
  const type = getEnemyType(typeId);
  const activeRun = runNum || currentRun;
  const activeWave = waveNum || 1;
  const levelOffset = levelNum - 1;
  const runMultiplier = 1 + (activeRun - 1) * 0.01;
  const waveSpeedMultiplier = 1.10 * runMultiplier * (1 + (activeWave - 1) * 0.05);
  return {
    ...type,
    hp: Number((type.hp * 1.5 * (1 + levelOffset * 0.12) * runMultiplier).toFixed(2)),
    speed: Number((type.speed * (1 + levelOffset * 0.025) * waveSpeedMultiplier).toFixed(2)),
    reward: Math.round(type.reward * (1 + levelOffset * 0.06))
  };
}

function updateLevelHeading() {
  const heading = $("levelTitle");
  if (!heading) return;
  const number = String(currentLevel).padStart(2, "0");
  heading.textContent = "ROUND #" + currentRun + " · LEVEL " + number + " · " + currentLevelData.name.toUpperCase() + " · v2.1.0";
}

// ---- v2.0.0 Persistence ----
function loadSave() {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return false;
  let raw;
  try {
    raw = window.localStorage.getItem(SAVE_KEY);
  } catch (e) {
    console.warn("Could not read save data:", e);
    return false;
  }
  if (!raw) return false;
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.warn("Save data is corrupted, ignoring.");
    return false;
  }
  if (!data || typeof data !== "object" || data.version !== SAVE_VERSION) {
    console.warn("Save data is outdated or invalid, ignoring.");
    return false;
  }
  if (data.campaign && typeof data.campaign === "object") {
    const c = data.campaign;
    if (Number.isInteger(c.currentRun) && c.currentRun >= 1 && c.currentRun <= MAX_RUN) {
      campaignState.currentRun = c.currentRun;
    }
    if (Number.isInteger(c.currentLevel) && c.currentLevel >= 1 && c.currentLevel <= MAX_LEVEL) {
      campaignState.currentLevel = c.currentLevel;
    }
    if (Number.isInteger(c.highestRunReached) && c.highestRunReached >= 1 && c.highestRunReached <= MAX_RUN) {
      campaignState.highestRunReached = c.highestRunReached;
    }
    campaignState.campaignCompleted = !!c.campaignCompleted;
    campaignState.levelsCompleted = Number.isInteger(c.levelsCompleted) && c.levelsCompleted >= 0 && c.levelsCompleted <= MAX_LEVEL
      ? c.levelsCompleted
      : 0;
  }
  if (data.settings && typeof data.settings === "object") {
    if (typeof data.settings.soundEnabled === "boolean") settings.soundEnabled = data.settings.soundEnabled;
    if (typeof data.settings.reducedMotion === "boolean") settings.reducedMotion = data.settings.reducedMotion;
  }
  if (data.stats && typeof data.stats === "object") {
    const s = data.stats;
    for (const key of Object.keys(statsState)) {
      statsState[key] = Number.isSafeInteger(s[key]) && s[key] >= 0 ? s[key] : 0;
    }
  }
  if (Array.isArray(data.achievements)) {
    achievements = [...new Set(data.achievements.filter(a => Object.prototype.hasOwnProperty.call(ACHIEVEMENTS_DEFS, a)))];
  }
  return true;
}

function applyMotionSetting() {
  if (document.documentElement) {
    document.documentElement.classList.toggle("reduced-motion", settings.reducedMotion);
  }
}

// ---- v2.1.0: Campaign selection menu ----
// Presents all 12 levels in a readable grid so the player can see which
// levels are locked, completed, or currently selected. Derived from the
// authoritative LEVELS array so it cannot disagree with gameplay.
function showCampaignMenu() {
  const panel = $("campaignPanel");
  if (!panel) return;
  const grid = $("campaignGrid");
  if (!grid) return;
  grid.innerHTML = "";
  for (let i = 0; i < LEVELS.length; i++) {
    const level = LEVELS[i];
    const num = i + 1;
    const locked = num > campaignState.levelsCompleted + 1 && campaignState.levelsCompleted < MAX_LEVEL;
    const completed = num <= campaignState.levelsCompleted;
    const current = num === currentLevel;
    const card = document.createElement("button");
    card.type = "button";
    card.className = "campaign-card" + (current ? " current" : "") + (completed ? " completed" : "") + (locked ? " locked" : "");
    card.disabled = locked;
    card.innerHTML =
      '<span class="campaign-num">L' + String(num).padStart(2, "0") + '</span>' +
      '<span class="campaign-name">' + level.name + '</span>' +
      '<span class="campaign-status">' + (completed ? "✓" : locked ? "🔒" : "▶") + '</span>';
    card.title = locked ? "Complete the previous level first" : level.name;
    card.addEventListener("click", () => {
      if (locked) return;
      currentLevel = num;
      hideCampaignMenu();
      reset();
      $("status").textContent = "Level " + num + ": " + level.name + ". Build your defense!";
    });
    grid.appendChild(card);
  }
  panel.hidden = false;
}

function hideCampaignMenu() {
  const panel = $("campaignPanel");
  if (panel) panel.hidden = true;
}

function restoreSavedGame() {
  if (!loadSave()) return false;
  currentRun = campaignState.currentRun;
  currentLevel = campaignState.currentLevel;
  if (campaignState.levelsCompleted === currentLevel && currentLevel < MAX_LEVEL) {
    currentLevel++;
    statsState.levelCoinsSpent = 0;
  }
  applyMotionSetting();
  checkAchievements();
  return true;
}

function saveGame() {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return false;
  campaignState.currentRun = currentRun;
  campaignState.currentLevel = currentLevel;
  const data = {
    version: SAVE_VERSION,
    ts: new Date().toISOString(),
    campaign: { ...campaignState },
    settings: { ...settings },
    stats: { ...statsState },
    achievements: achievements.slice()
  };
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn("Could not save game data:", e);
    return false;
  }
}

function resetSave() {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return false;
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch (e) {
    console.warn("Could not remove save data:", e);
    return false;
  }
  campaignState = { currentRun: 1, currentLevel: 1, highestRunReached: 1, campaignCompleted: false, levelsCompleted: 0 };
  currentRun = 1;
  currentLevel = 1;
  settings = { soundEnabled: true, reducedMotion: false };
  statsState = { roundsCompleted: 0, enemiesDefeated: 0, towersBuilt: 0, towersUpgraded: 0, campaignVictories: 0, bossesDefeated: 0, runnersDefeated: 0, armoredDefeated: 0, archerBuilt: 0, cannonBuilt: 0, magicBuilt: 0, maxCoinsSpent: 0, levelCoinsSpent: 0 };
  achievements = [];
  applyMotionSetting();
  reset();
  return true;
}

function recordCoinSpend(amount) {
  statsState.levelCoinsSpent += amount;
  statsState.maxCoinsSpent = Math.max(statsState.maxCoinsSpent, statsState.levelCoinsSpent);
  if (statsState.maxCoinsSpent >= 500) awardAchievement("big_spender");
}

// ---- v2.0.0 Achievements ----
function awardAchievement(id) {
  if (!ACHIEVEMENTS_DEFS[id]) return false;
  if (achievements.includes(id)) return false;
  achievements.push(id);
  saveGame();
  return true;
}

function checkAchievements(context) {
  if (context && context.completedLevel) {
    if (context.level === 1) awardAchievement("first_defense");
    if (context.level === MAX_LEVEL) awardAchievement("all_twelve");
    if (context.perfectHold) awardAchievement("perfect_hold");
  }
  if (campaignState.highestRunReached >= 10) awardAchievement("round_10");
  if (campaignState.highestRunReached >= 25) awardAchievement("round_25");
  if (campaignState.campaignCompleted) awardAchievement("legendary");
  if (statsState.bossesDefeated >= 10) awardAchievement("boss_slayer");
  if (statsState.runnersDefeated >= 100) awardAchievement("speed_demon");
  if (statsState.armoredDefeated >= 50) awardAchievement("tank_buster");
  if (statsState.archerBuilt >= 20) awardAchievement("master_archer");
  if (statsState.cannonBuilt >= 15) awardAchievement("cannon_master");
  if (statsState.magicBuilt >= 15) awardAchievement("wizard");
  if (statsState.towersUpgraded >= 30) awardAchievement("upgrade_artist");
  if (statsState.maxCoinsSpent >= 500) awardAchievement("big_spender");
}

// ---- v2.0.0 Elite and Boss enemy variants ----
// Bosses appear on wave 3 (the final wave) of every level. They are slow,
// very high-HP enemies that reward a large bounty.
function buildBossDef(levelNum, runNum) {
  const scaled = getScaledEnemyType("armored", levelNum, runNum, 3);
  return {
    id: "boss",
    name: "Boss",
    hp: scaled.hp * 3,
    maxHp: scaled.hp * 3,
    speed: Number((scaled.speed * 0.75).toFixed(2)),
    reward: scaled.reward * 5,
    color: "#a855f7",
    glyph: "👑",
    elite: true,
    boss: true
  };
}

function unlockSound() {
  if (typeof window === "undefined") return;
  const AudioContextType = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextType) return;
  if (!soundContext) soundContext = new AudioContextType();
  if (soundContext.state === "suspended") {
    const resumeResult = soundContext.resume();
    if (resumeResult && typeof resumeResult.catch === "function") {
      resumeResult.catch(error => console.warn("Could not resume game audio:", error));
    }
  }
}

function playFireSound(towerType) {
  if (!settings.soundEnabled) return;
  if (!soundContext || soundContext.state !== "running") return;
  const now = soundContext.currentTime;
  const oscillator = soundContext.createOscillator();
  const gain = soundContext.createGain();
  const soundProfile = {
    archer: { frequency: 620, type: "triangle" },
    cannon: { frequency: 150, type: "square" },
    magic: { frequency: 880, type: "sine" }
  }[towerType] || { frequency: 620, type: "triangle" };

  oscillator.type = soundProfile.type;
  oscillator.frequency.setValueAtTime(soundProfile.frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(60, soundProfile.frequency * 0.55), now + 0.07);
  gain.gain.setValueAtTime(0.035, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  oscillator.connect(gain);
  gain.connect(soundContext.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.085);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Renders the compact tower-type picker and highlights the selected type.
function updateTowerPicker() {
  const picker = $("towerPicker");
  if (!picker || !picker.children) return;
  for (const btn of picker.children) {
    btn.classList.toggle("active", btn.dataset.type === selectedTowerType);
    const tower = getTowerType(btn.dataset.type);
    const canAfford = coins >= tower.cost;
    const costLabel = btn.querySelector(".tcost");
    btn.disabled = !canAfford || mode === "won" || mode === "lost";
    btn.title = canAfford ? tower.cost + " coins" : "Need " + (tower.cost - coins) + " more coins";
    if (costLabel) {
      costLabel.textContent = canAfford ? tower.cost + " coins" : "Need " + (tower.cost - coins) + " more";
    }
  }
}

function reset() {
  closeBuildMenu();
  hidePanel();
  currentLevelData = LEVELS[currentLevel - 1];
  path = currentLevelData.path;
  spots = currentLevelData.spots;
  coins = 80;
  lives = 6;
  towers = [];
  enemies = [];
  shots = [];
  particles = [];
  spawned = 0;
  spawnTimer = 0;
  spawnQueue = [];
  pointerPos = null;
  selectedTowerType = "archer";
  selectedTower = null;
  mode = "ready";
  currentWave = 0;
  waveActive = false;
  paused = false;
  lastPreviewWave = -1;
  const firstWave = getLevelWaveDef(1, currentLevel);
  enemiesToSpawn = firstWave.enemies;
  enemyHp = firstWave.enemyHp;
  enemySpeed = firstWave.enemySpeed;
  waveReward = firstWave.reward;

  updateLevelHeading();
  $("status").textContent = "Build your defense!";
  $("startBtn").disabled = false;
  $("startBtn").textContent = "▶ Start Wave";
  const pauseBtnEl = $("pauseBtn");
  if (pauseBtnEl) {
    pauseBtnEl.disabled = true;
    pauseBtnEl.textContent = "⏸ Pause";
  }
  updateTowerPicker();

  updateUI();
  updateUpgradePanel();
  updateWaveInfo();
}

function updateUI() {
  $("coins").textContent = coins;
  $("lives").textContent = lives;
  updateTowerPicker();
  updateUpgradePanel();
  updateWaveInfo();
}

function startWave() {
  if (mode === "won" || mode === "lost") return;
  if (waveActive) return;

  currentWave += 1;
  if (currentWave > MAX_WAVE) {
    currentWave = MAX_WAVE;
    return;
  }

  const w = getLevelWaveDef(currentWave, currentLevel);
  enemiesToSpawn = w.enemies;
  enemyHp = w.enemyHp;
  enemySpeed = w.enemySpeed;
  waveReward = w.reward;

  // Flatten the deterministic composition into an ordered spawn queue so
  // each spawned enemy carries its authoritative type attributes.
  spawnQueue = [];
  for (const entry of w.composition) {
    for (let i = 0; i < entry.count; i++) {
      spawnQueue.push(entry.type);
    }
  }

  // Boss spawns last on wave 3 (the final wave of every level).
  if (currentWave === MAX_WAVE) {
    spawnQueue.push("boss");
    enemiesToSpawn = spawnQueue.length;
  }

  mode = "playing";
  waveActive = true;
  spawned = 0;
  spawnTimer = 0;
  paused = false;
  unlockSound();

  $("status").textContent = `Wave ${currentWave}: enemies incoming!`;
  const pauseBtnEl = $("pauseBtn");
  if (pauseBtnEl) {
    pauseBtnEl.disabled = false;
    pauseBtnEl.textContent = "⏸ Pause";
  }
  $("startBtn").disabled = true;
  $("startBtn").textContent = "⚔ Wave in progress";
  updateUI();
}

function advanceLevel() {
  if (mode !== "won" || currentLevel >= MAX_LEVEL) return;
  currentLevel++;
  statsState.levelCoinsSpent = 0;
  saveGame();
  reset();
  $("status").textContent = "Level " + currentLevel + ": " + currentLevelData.name + ". Build your defense!";
}

function showRoundNotice(title, message, buttonText, campaignComplete) {
  const overlay = $("roundOverlay");
  if (!overlay) return;
  overlay.classList.toggle("campaign-complete", campaignComplete === true);
  $("roundTitle").textContent = title;
  $("roundMessage").textContent = message;
  $("roundContinue").textContent = buttonText;
  overlay.hidden = false;
  $("roundContinue").focus();
}

function closeRoundNotice() {
  const overlay = $("roundOverlay");
  if (!overlay) return;
  overlay.hidden = true;
  $("startBtn").focus();
}

function openNextRun() {
  if (currentRun >= MAX_RUN) {
    currentRun = 1;
    currentLevel = 1;
    statsState.levelCoinsSpent = 0;
    campaignState.campaignCompleted = true;
    campaignState.highestRunReached = MAX_RUN;
    statsState.campaignVictories++;
    statsState.roundsCompleted++;
    awardAchievement("legendary");
    checkAchievements();
    saveGame();
    reset();
    $("status").textContent = "All 50 rounds complete. Campaign restarted at Round #1.";
    showRoundNotice(
      "👑 LEGENDARY DEFENDER!",
      "50 rounds conquered! Your campaign begins anew at Round #1, with all 12 levels ahead and enemy difficulty reset to the Round #1 baseline. Ready to defend the realm again?",
      "Continue to Round #1",
      true
    );
    return;
  }

  currentRun++;
  if (currentRun > campaignState.highestRunReached) {
    campaignState.highestRunReached = currentRun;
  }
  currentLevel = 1;
  statsState.levelCoinsSpent = 0;
  saveGame();
  reset();
  $("status").textContent = "Round #" + currentRun + " opened. Enemy speed and HP increased!";
  showRoundNotice(
    "Round #" + currentRun + " Opened!",
    "All 12 levels are unlocked again. Enemy speed and HP are each increased by 1% for this round.",
    "Start Round #" + currentRun
  );
}

function handleStartButton() {
  if (mode === "won") {
    if (currentLevel < MAX_LEVEL) advanceLevel();
    else openNextRun();
    return;
  }
  startWave();
}

function addEnemy() {
  // Pick the next enemy type from the authoritative spawn queue. Fall back
  // to the standard archetype if the queue is empty or malformed.
  const typeKey = spawnQueue[spawned] || "standard";

  if (typeKey === "boss") {
    const b = buildBossDef(currentLevel, currentRun);
    enemies.push({
      x: path[0].x,
      y: path[0].y,
      point: 1,
      type: "boss",
      hp: b.hp,
      maxHp: b.maxHp,
      speed: b.speed,
      reward: b.reward,
      color: b.color,
      glyph: b.glyph,
      elite: true,
      boss: true
    });
    return;
  }

  const t = getScaledEnemyType(typeKey, currentLevel, currentRun, currentWave);

  enemies.push({
    x: path[0].x,
    y: path[0].y,
    point: 1,
    type: typeKey,
    hp: t.hp,
    maxHp: t.hp,
    speed: t.speed,
    reward: t.reward,
    color: t.color,
    glyph: t.glyph
  });
}

function placeTower(x, y) {
  if (mode === "won" || mode === "lost") return;

  const spot = spots.find(s => distance(s, { x, y }) < 20);

  if (!spot) {
    $("status").textContent = "Tap a green build spot.";
    return;
  }

  if (towers.some(t => distance(t, spot) < 1)) {
    $("status").textContent = "That spot is occupied!";
    return;
  }

  const t = getTowerType(selectedTowerType);
  if (coins < t.cost) {
    $("status").textContent = "Need " + t.cost + " coins for " + t.name + "!";
    return;
  }

  towers.push({
    x: spot.x,
    y: spot.y,
    type: t.id,
    range: t.range,
    damage: t.damage,
    cooldown: t.cooldown,
    baseCooldown: t.cooldown,
    level: 1,
    upgradeCost: 80,
    cost: t.cost,
    targeting: "first" // default priority; changes are free and immediate
  });

  coins -= t.cost;
  recordCoinSpend(t.cost);
  statsState.towersBuilt++;
  if (t.id === "archer") statsState.archerBuilt++;
  else if (t.id === "cannon") statsState.cannonBuilt++;
  else if (t.id === "magic") statsState.magicBuilt++;
  if (statsState.archerBuilt >= 20) awardAchievement("master_archer");
  if (statsState.cannonBuilt >= 15) awardAchievement("cannon_master");
  if (statsState.magicBuilt >= 15) awardAchievement("wizard");
  checkAchievements();
  saveGame();
  $("status").textContent = t.name + " tower built! Ready to defend.";
  updateUI();
}

// Sell/demolish a placed tower, refunding its full purchase cost plus every
// upgrade cost already spent on it. No loss, no gain — just a reset of the
// coins invested in that tower. Selling a tower that is no longer placed
// (already sold or cleared by restart) is a safe no-op: no double refund.
function sellTower(tower) {
  if (!tower || mode === "won" || mode === "lost") return;
  if (!towers.includes(tower)) return;
  // 50% refund if selling while a wave is active; 100% refund if selling
  // before any wave has started or in non-playing/preparation states.
  const wasWaveStarted = currentWave >= 1;
  const penalty = (waveActive && wasWaveStarted) ? 0.5 : 1.0;
  const refund = Math.floor(((tower.cost || 0) + (tower.totalUpgradeCost || 0)) * penalty);
  coins += refund;
  towers = towers.filter(t => t !== tower);
  if (selectedTower === tower) selectedTower = null;
  $("status").textContent = "Tower sold. +" + refund + " coins" + (penalty < 1.0 ? " (50%)" : "");
  updateUI();
  updateUpgradePanel();
}

function moveEnemy(enemy, dt) {
  let remaining = enemy.speed * dt;

  while (remaining > 0 && enemy.point < path.length) {
    const target = path[enemy.point];
    const d = distance(enemy, target);

    if (d <= remaining) {
      enemy.x = target.x;
      enemy.y = target.y;
      remaining -= d;
      enemy.point++;
    } else {
      enemy.x += (target.x - enemy.x) / d * remaining;
      enemy.y += (target.y - enemy.y) / d * remaining;
      remaining = 0;
    }
  }

  return enemy.point >= path.length;
}

function update(dt) {
  if (mode !== "playing") return;
  if (paused) {
    // While paused, only the visual particle effects decay so the player
    // can still see feedback from the moment they paused. All gameplay
    // simulation (movement, spawning, combat) is frozen.
    updateParticles(dt);
    return;
  }

  spawnTimer -= dt;

  if (spawned < enemiesToSpawn && spawnTimer <= 0) {
    addEnemy();
    spawned++;
    spawnTimer = 1;
  }

  for (const enemy of enemies) {
    if (moveEnemy(enemy, dt)) {
      enemy.reachedBase = true;
      lives--;
    }
  }

  enemies = enemies.filter(e => !e.reachedBase);
  updateUI();

  if (lives <= 0) {
    mode = "lost";
    $("status").textContent = "💥 Base destroyed! Try again.";
    $("startBtn").disabled = true;
    updateUpgradePanel();
    const goOverlay = $("gameOverOverlay");
    if (goOverlay) {
      $("gameOverTitle").textContent = "💥 Base Destroyed";
      $("gameOverMessage").textContent = "Your base was breached. Restart to try again.";
      goOverlay.hidden = false;
    }
    saveGame();
    return;
  }

  for (const tower of towers) {
    tower.cooldown -= dt;

    if (tower.cooldown > 0) continue;

    // Acquire a target according to this tower's configured priority mode.
    const target = pickTarget(tower, enemies);

    if (target) {
      shots.push({
        x: tower.x,
        y: tower.y,
        target,
        damage: tower.damage,
        speed: 220
      });

      playFireSound(tower.type);
      tower.cooldown = tower.baseCooldown;
    }
  }

  for (const shot of shots) {
    const target = shot.target;

    if (!enemies.includes(target) || target.dead) {
      shot.done = true;
      continue;
    }

    const d = distance(shot, target);
    const step = shot.speed * dt;

    if (d <= step + 5) {
      target.hp -= shot.damage;
      shot.done = true;

      // Spawn a small hit burst so combat feedback is readable even when
      // many units are present. Particles are capped per frame below.
      spawnParticles(target.x, target.y, target.boss ? "#fde68a" : "#fef08a", target.boss ? 6 : 3);

      if (target.hp <= 0) {
        target.dead = true;
        coins += target.reward;
        // Track stats and achievements for defeated enemies.
        statsState.enemiesDefeated++;
        if (target.boss) {
          statsState.bossesDefeated++;
          if (statsState.bossesDefeated >= 10) awardAchievement("boss_slayer");
        } else if (target.type === "runner") {
          statsState.runnersDefeated++;
          if (statsState.runnersDefeated >= 100) awardAchievement("speed_demon");
        } else if (target.type === "armored" || target.type === "elite_armored") {
          statsState.armoredDefeated++;
          if (statsState.armoredDefeated >= 50) awardAchievement("tank_buster");
        }
        // Distinct kill burst: larger and colored by enemy type.
        spawnParticles(target.x, target.y, target.color || "#ef4444", target.boss ? 14 : 7);
        saveGame();
      }
    } else if (d > 0) {
      shot.x += (target.x - shot.x) / d * step;
      shot.y += (target.y - shot.y) / d * step;
    }
  }

  enemies = enemies.filter(e => !e.dead);
  shots = shots.filter(s => !s.done);
  // Cap transient effects so their arrays cannot grow indefinitely.
  if (shots.length > MAX_SHOTS) shots = shots.slice(0, MAX_SHOTS);
  if (particles.length > MAX_PARTICLES) particles = particles.slice(0, MAX_PARTICLES);
  updateUI();

  if (spawned === enemiesToSpawn && enemies.length === 0) {
    waveActive = false;
    const lastWave = currentWave >= MAX_WAVE;
    mode = lastWave ? "won" : "ready";
    coins += waveReward;
    updateUI();
    updateUpgradePanel();
    updateWaveInfo();

    if (lastWave) {
      // Track campaign progress and achievements.
      campaignState.levelsCompleted = currentLevel;
      if (currentLevel >= MAX_LEVEL) {
        campaignState.campaignCompleted = true;
        statsState.campaignVictories++;
        statsState.roundsCompleted++;
        if (currentRun >= campaignState.highestRunReached) {
          campaignState.highestRunReached = currentRun;
        }
        awardAchievement("all_twelve");
        checkAchievements({ completedLevel: currentLevel, level: currentLevel, perfectHold: lives === 6 });
        saveGame();
      } else {
        checkAchievements({ completedLevel: currentLevel, level: currentLevel, perfectHold: lives === 6 });
        saveGame();
      }
      if (currentLevel < MAX_LEVEL) {
        $("status").textContent = "🏆 Level " + currentLevel + " complete! +" + waveReward + " coins";
        $("startBtn").disabled = false;
        $("startBtn").textContent = "▶ Next Level";
      } else {
        openNextRun();
        return;
      }
    } else {
      $("status").textContent = `Wave ${currentWave} complete! +${waveReward} coins`;
      $("startBtn").disabled = false;
      $("startBtn").textContent = "▶ Start Wave";
      saveGame();
    }
  }
}

function drawPolygon(points, fillColor, strokeColor, lineWidth) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (const point of points.slice(1)) {
    ctx.lineTo(point[0], point[1]);
  }
  ctx.fillStyle = fillColor;
  ctx.fill();
  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth || 1;
    ctx.stroke();
  }
}

function drawTowerIcon(x, y, type, selected) {
  const tower = getTowerType(type);
  const outline = selected ? "#fef08a" : "#0f172a";
  const tile = [
    [x - 8, y - 11], [x + 8, y - 11], [x + 11, y - 8],
    [x + 11, y + 7], [x + 7, y + 11], [x - 7, y + 11],
    [x - 11, y + 7], [x - 11, y - 8]
  ];
  drawPolygon(tile, "#1e293b", outline, selected ? 2 : 1.5);

  if (tower.id === "archer") {
    drawPolygon([[x - 6, y + 5], [x - 3, y - 4], [x + 4, y - 7], [x + 7, y - 4], [x + 4, y - 1], [x + 2, y + 6]], tower.color, "#bfdbfe", 1);
    ctx.beginPath();
    ctx.moveTo(x - 5, y - 1);
    ctx.lineTo(x + 7, y - 1);
    ctx.strokeStyle = "#f8fafc";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    drawPolygon([[x + 7, y - 3], [x + 10, y - 1], [x + 7, y + 1]], "#f8fafc");
  } else if (tower.id === "cannon") {
    ctx.beginPath();
    ctx.moveTo(x - 4, y + 5);
    ctx.lineTo(x + 4, y - 4);
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 4, y + 5);
    ctx.lineTo(x + 4, y - 4);
    ctx.strokeStyle = tower.color;
    ctx.lineWidth = 3;
    ctx.stroke();
    drawPolygon([[x + 1, y - 8], [x + 8, y - 1], [x + 5, y + 2], [x - 2, y - 5]], "#334155", "#cbd5e1", 1);
    ctx.beginPath();
    ctx.arc(x - 3, y + 6, 2, 0, Math.PI * 2);
    ctx.fillStyle = tower.color;
    ctx.fill();
  } else {
    drawPolygon([[x, y - 8], [x + 6, y - 2], [x + 4, y + 6], [x, y + 9], [x - 4, y + 6], [x - 6, y - 2]], tower.color, "#e9d5ff", 1);
    drawPolygon([[x, y - 5], [x + 3, y - 1], [x, y + 5], [x - 3, y - 1]], "#f5d0fe");
  }
}

// ---- v2.1.0: Transient combat-feedback particles ----
// Small, short-lived bursts spawned on hit and kill so combat feedback is
// readable even when many units are on screen. Particles are capped per
// frame so their array cannot grow indefinitely.
function spawnParticles(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 20 + Math.random() * 60;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.4 + Math.random() * 0.3,
      maxLife: 0.7,
      color,
      size: 1.5 + Math.random() * 2
    });
  }
}

function updateParticles(dt) {
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.92;
    p.vy *= 0.92;
    p.life -= dt;
  }
  particles = particles.filter(p => p.life > 0);
  if (particles.length > MAX_PARTICLES) particles = particles.slice(0, MAX_PARTICLES);
}

function drawParticles() {
  if (settings.reducedMotion) return;
  for (const p of particles) {
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawEnemyIcon(enemy) {
  if (enemy.type === "boss") {
    drawPolygon([
      [enemy.x, enemy.y - 13], [enemy.x + 11, enemy.y - 7],
      [enemy.x + 10, enemy.y + 5], [enemy.x, enemy.y + 13],
      [enemy.x - 10, enemy.y + 5], [enemy.x - 11, enemy.y - 7]
    ], "#581c87", "#e9d5ff", 2);
    drawPolygon([
      [enemy.x, enemy.y - 7], [enemy.x + 5, enemy.y - 4],
      [enemy.x + 5, enemy.y + 3], [enemy.x, enemy.y + 7],
      [enemy.x - 5, enemy.y + 3], [enemy.x - 5, enemy.y - 4]
    ], enemy.color || "#a855f7", "#d8b4fe", 1);
    ctx.fillStyle = "#fef08a";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(enemy.glyph || "👑", enemy.x, enemy.y - 15);
  } else if (enemy.type === "runner") {
    drawPolygon([
      [enemy.x - 9, enemy.y - 6], [enemy.x - 2, enemy.y - 5],
      [enemy.x + 2, enemy.y - 9], [enemy.x + 3, enemy.y - 4],
      [enemy.x + 9, enemy.y], [enemy.x + 3, enemy.y + 4],
      [enemy.x + 2, enemy.y + 9], [enemy.x - 2, enemy.y + 5],
      [enemy.x - 9, enemy.y + 6], [enemy.x - 6, enemy.y]
    ], enemy.color || "#f59e0b", "#78350f", 1.5);
    ctx.beginPath();
    ctx.moveTo(enemy.x - 4, enemy.y - 2);
    ctx.lineTo(enemy.x - 1, enemy.y);
    ctx.lineTo(enemy.x - 4, enemy.y + 2);
    ctx.strokeStyle = "#451a03";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else if (enemy.type === "armored") {
    drawPolygon([
      [enemy.x, enemy.y - 9], [enemy.x + 8, enemy.y - 5],
      [enemy.x + 7, enemy.y + 3], [enemy.x, enemy.y + 9],
      [enemy.x - 7, enemy.y + 3], [enemy.x - 8, enemy.y - 5]
    ], "#475569", "#cbd5e1", 2);
    drawPolygon([
      [enemy.x, enemy.y - 5], [enemy.x + 4, enemy.y - 3],
      [enemy.x + 4, enemy.y + 2], [enemy.x, enemy.y + 6],
      [enemy.x - 4, enemy.y + 2], [enemy.x - 4, enemy.y - 3]
    ], enemy.color || "#64748b", "#94a3b8", 1);
  } else {
    drawPolygon([
      [enemy.x - 8, enemy.y - 4], [enemy.x - 10, enemy.y - 9],
      [enemy.x - 3, enemy.y - 7], [enemy.x, enemy.y - 10],
      [enemy.x + 3, enemy.y - 7], [enemy.x + 10, enemy.y - 9],
      [enemy.x + 8, enemy.y - 3], [enemy.x + 8, enemy.y + 4],
      [enemy.x + 4, enemy.y + 8], [enemy.x - 4, enemy.y + 8],
      [enemy.x - 8, enemy.y + 4]
    ], enemy.color || "#ef4444", "#7f1d1d", 1.5);
    for (const eyeX of [enemy.x - 3, enemy.x + 3]) {
      ctx.beginPath();
      ctx.arc(eyeX, enemy.y, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = "#fff7ed";
      ctx.fill();
    }
  }
}

function drawMapLandmarks() {
  const entrance = { x: -2, y: path[0].y };
  const base = { x: path[path.length - 1].x, y: H - 12 };

  // Gate marks where enemies enter the path.
  ctx.fillStyle = "#78350f";
  ctx.fillRect(entrance.x + 5, entrance.y - 12, 4, 24);
  ctx.fillRect(entrance.x + 19, entrance.y - 12, 4, 24);
  drawPolygon([
    [entrance.x + 2, entrance.y - 10], [entrance.x + 7, entrance.y - 17],
    [entrance.x + 12, entrance.y - 10], [entrance.x + 17, entrance.y - 17],
    [entrance.x + 25, entrance.y - 10]
  ], "#fbbf24", "#78350f", 2);
  ctx.fillStyle = "#fde68a";
  ctx.fillRect(entrance.x + 11, entrance.y - 5, 6, 10);
  drawPolygon([
    [entrance.x + 25, entrance.y - 5],
    [entrance.x + 34, entrance.y],
    [entrance.x + 25, entrance.y + 5]
  ], "#fef3c7");

  // Fortress marks the end of the route.
  ctx.fillStyle = "#64748b";
  ctx.fillRect(base.x - 12, base.y - 16, 24, 25);
  ctx.fillRect(base.x - 17, base.y - 12, 7, 9);
  ctx.fillRect(base.x + 10, base.y - 12, 7, 9);
  drawPolygon([
    [base.x - 14, base.y - 16], [base.x - 14, base.y - 22],
    [base.x - 8, base.y - 22], [base.x - 8, base.y - 16],
    [base.x - 3, base.y - 16], [base.x - 3, base.y - 24],
    [base.x + 4, base.y - 24], [base.x + 4, base.y - 16],
    [base.x + 9, base.y - 16], [base.x + 9, base.y - 22],
    [base.x + 15, base.y - 22], [base.x + 15, base.y - 16]
  ], "#94a3b8", "#334155", 1.5);
  ctx.fillStyle = "#fbbf24";
  ctx.fillRect(base.x - 3, base.y - 5, 6, 14);
  ctx.fillStyle = "#fef3c7";
  ctx.fillRect(base.x - 1, base.y - 3, 2, 2);
}

function pointSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const projection = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return distance(point, { x: start.x + projection * dx, y: start.y + projection * dy });
}

function isNearPath(point, clearance) {
  return path.slice(1).some((end, index) => pointSegmentDistance(point, path[index], end) < clearance);
}

function drawThemeGround() {
  const palettes = {
    jungle: ["#2d7650", "#55a96a", "#f9a8d4"],
    ocean: ["#25839a", "#69c9c4", "#b9f3f0"],
    meadow: ["#6b9850", "#a3bb58", "#f9a8d4"],
    desert: ["#c39555", "#e4c477", "#f8e3a1"],
    autumn: ["#9b623c", "#c27d45", "#e7b95f"],
    snow: ["#83aebd", "#c4e3e8", "#f8fbff"],
    swamp: ["#526d49", "#819452", "#b2c478"],
    volcano: ["#815145", "#b06a4d", "#ed9b5a"],
    ruins: ["#92916a", "#bab184", "#e1d3a0"],
    crystal: ["#6e83bc", "#91b5dc", "#d6bbfa"],
    moon: ["#586d9a", "#8495bd", "#e2d3ff"],
    canyon: ["#b1744e", "#d19a64", "#efc482"]
  };
  const palette = palettes[currentLevelData.theme] || palettes.jungle;
  const [primary, secondary, detail] = palette;
  let index = 0;

  for (let row = 0; row < 11; row++) {
    for (let column = 0; column < 9; column++) {
      const point = {
        x: 18 + column * 34 + (row % 2) * 9,
        y: 17 + row * 33
      };
      if (point.x > W - 10 || point.y > H - 10 || isNearPath(point, 23) ||
          spots.some(spot => distance(point, spot) < 19)) continue;

      const size = 3 + (index % 3);
      ctx.fillStyle = index % 2 ? primary : secondary;
      if (currentLevelData.theme === "ocean" || currentLevelData.theme === "snow" ||
          currentLevelData.theme === "moon") {
        ctx.beginPath();
        ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
        ctx.fill();
        if (currentLevelData.theme === "ocean") {
          ctx.strokeStyle = detail;
          ctx.beginPath();
          ctx.arc(point.x, point.y, size + 2, Math.PI, Math.PI * 1.8);
          ctx.stroke();
        }
      } else if (currentLevelData.theme === "desert" || currentLevelData.theme === "canyon" ||
                 currentLevelData.theme === "volcano" || currentLevelData.theme === "ruins") {
        drawPolygon([
          [point.x - size, point.y + size],
          [point.x - size / 2, point.y - size],
          [point.x + size, point.y - size / 2],
          [point.x + size, point.y + size]
        ], primary, detail, 0.6);
      } else if (currentLevelData.theme === "crystal") {
        drawPolygon([
          [point.x, point.y - size * 1.5],
          [point.x + size, point.y],
          [point.x, point.y + size],
          [point.x - size, point.y]
        ], primary, detail, 0.7);
      } else {
        drawPolygon([
          [point.x - size, point.y + size],
          [point.x, point.y - size],
          [point.x + size, point.y + size]
        ], primary);
        if (currentLevelData.theme === "meadow" || currentLevelData.theme === "autumn") {
          ctx.fillStyle = detail;
          ctx.beginPath();
          ctx.arc(point.x, point.y - size, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      index++;
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = currentLevelData.ground;
  ctx.fillRect(0, 0, W, H);
  drawThemeGround();

  // Enemy path
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);

  for (const p of path.slice(1)) {
    ctx.lineTo(p.x, p.y);
  }

  ctx.lineWidth = 30;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = currentLevelData.road;
  ctx.stroke();

  ctx.lineWidth = 2;
  ctx.strokeStyle = currentLevelData.roadEdge;
  ctx.stroke();

  drawMapLandmarks();

  // Build spots
  for (const spot of spots) {
    const occupied = towers.some(t => distance(t, spot) < 1);

    ctx.beginPath();
    ctx.arc(spot.x, spot.y, 12, 0, Math.PI * 2);
    ctx.fillStyle = occupied ? "#2563eb" : "#4ade80";
    ctx.fill();

    if (!occupied) {
      ctx.fillStyle = "#14532d";
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("+", spot.x, spot.y + 5);
    }
  }

  // Lightweight placement preview: a ghost tower drawn at the pointer on the
  // nearest valid empty spot, using the selected tower type's range. Green =
  // placeable, red = blocked (occupied or unaffordable). Derived from the
  // actual placement rules, never bypasses them, skipped during waves/game over.
  if (pointerPos && mode !== "won" && mode !== "lost" && !waveActive) {
    const p = pointerPos;
    const spot = spots.find(s => distance(s, p) < 20);
    if (spot) {
      const st = getTowerType(selectedTowerType);
      const occupied = towers.some(t => distance(t, spot) < 1);
      const affordable = coins >= st.cost;
      const ok = !occupied && affordable;

      // Range ring from the selected tower type.
      ctx.beginPath();
      ctx.arc(spot.x, spot.y, st.range, 0, Math.PI * 2);
      ctx.fillStyle = ok ? "rgba(96,165,250,0.10)" : "rgba(239,68,68,0.10)";
      ctx.fill();

      drawTowerIcon(spot.x, spot.y, selectedTowerType, false);

      if (!ok) {
        ctx.fillStyle = "#fca5a5";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(occupied ? "occupied" : "need " + st.cost, spot.x, spot.y + 17);
      }
    }
  }

// Towers
for (const tower of towers) {
  ctx.beginPath();
    ctx.arc(tower.x, tower.y, tower.range, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(96,165,250,0.07)";
    ctx.fill();

    if (selectedTower === tower) {
      ctx.beginPath();
      ctx.arc(tower.x, tower.y, tower.range, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(96,165,250,0.4)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    drawTowerIcon(tower.x, tower.y, tower.type, selectedTower === tower);

    if (tower.level > 1) {
      ctx.fillStyle = "#fef08a";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(tower.level, tower.x, tower.y - 7);
    }
  }

  // Enemies and health bars
  for (const enemy of enemies) {
    drawEnemyIcon(enemy);

    const healthBarWidth = enemy.boss ? 26 : 20;
    const healthBarY = enemy.boss ? enemy.y - 21 : enemy.y - 15;
    ctx.fillStyle = "#451a1a";
    ctx.fillRect(enemy.x - healthBarWidth / 2, healthBarY, healthBarWidth, 3);

    ctx.fillStyle = "#4ade80";
    ctx.fillRect(
      enemy.x - healthBarWidth / 2,
      healthBarY,
      healthBarWidth * Math.max(0, enemy.hp / enemy.maxHp),
      3
    );

    // Bosses get a distinct purple frame and a larger HP label so their
    // threat level is readable even when many units are on screen.
    if (enemy.boss) {
      ctx.strokeStyle = "rgba(168,85,247,0.8)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(enemy.x - healthBarWidth / 2 - 1, healthBarY - 1, healthBarWidth + 2, 5);
      ctx.fillStyle = "#fde68a";
      ctx.font = "bold 8px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("BOSS", enemy.x, healthBarY - 4);
    }
  }

  // Transient combat-feedback particles (hit/kill bursts).
  drawParticles();

  // Projectiles
  ctx.fillStyle = "#fef08a";

  if (!settings.reducedMotion) {
    for (const shot of shots) {
      ctx.beginPath();
      ctx.arc(shot.x, shot.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}


function upgradeTower(){
  if(!selectedTower || mode === "won" || mode === "lost") return;
  if(selectedTower.level >= 3) return;
  if(coins < selectedTower.upgradeCost) return;
  const upgradeCost = selectedTower.upgradeCost;
  coins -= upgradeCost;
  recordCoinSpend(upgradeCost);
  statsState.towersUpgraded++;
  selectedTower.totalUpgradeCost = (selectedTower.totalUpgradeCost || 0) + selectedTower.upgradeCost;
  selectedTower.level++;
  selectedTower.range += 20;
  selectedTower.damage += 10;
  selectedTower.baseCooldown = Math.max(0.3, (selectedTower.baseCooldown || selectedTower.cooldown) - 0.05);
  selectedTower.cooldown = selectedTower.baseCooldown;
  selectedTower.upgradeCost = Math.floor(selectedTower.upgradeCost * 1.5);
  $("status").textContent = "Tower upgraded to L"+selectedTower.level+"!";
  const msgEl = $("upgradeMsg");
  if (msgEl) msgEl.textContent = "Upgrade successful!";
  updateUI();
  updateUpgradePanel();
  checkAchievements();
  saveGame();
}

function updateUpgradePanel() {
  const upgradeBtn = $("upgradeBtn");
  const sellBtn = $("sellBtn");
  const title = $("towerTitle");
  const levelPill = $("towerLevel");
  const curDmg = $("curDamage");
  const nextDmg = $("nextDamage");
  const curRng = $("curRange");
  const nextRng = $("nextRange");
  const curCd = $("curCooldown");
  const nextCd = $("nextCooldown");
  const nextCost = $("nextCost");
  const msg = $("upgradeMsg");

  if (!selectedTower) {
    title.textContent = "No tower selected";
    levelPill.textContent = "";
    curDmg.textContent = "-";
    nextDmg.textContent = "-";
    curRng.textContent = "-";
    nextRng.textContent = "-";
    curCd.textContent = "-";
    nextCd.textContent = "-";
    nextCost.textContent = "-";
    upgradeBtn.disabled = true;
    if (sellBtn) sellBtn.disabled = true;
    if (msg) msg.textContent = "";
    const targetingRow = $("targetingRow");
    if (targetingRow) targetingRow.hidden = true;
    // Reset picker cache so the next selected tower re-renders the picker.
    panelTargetTower = null;
    panelTargetMode = null;
    refreshPanelContent();
    return;
  }

  refreshPanelContent();

  const t = selectedTower;
  const tt = getTowerType(t.type);
  const maxLevel = 3;
  title.textContent = tt.name + " (Lv " + t.level + ")";
  levelPill.textContent = "Lv " + t.level + "/" + maxLevel;

  curDmg.textContent = Math.round(t.damage);
  curRng.textContent = Math.round(t.range);
  curCd.textContent = t.cooldown.toFixed(2);

  if (sellBtn) {
    const wasWaveStarted = currentWave >= 1;
    const penalty = (waveActive && wasWaveStarted) ? 0.5 : 1.0;
    const refund = Math.floor(((t.cost || 0) + (t.totalUpgradeCost || 0)) * penalty);
    sellBtn.textContent = "Sell · +" + refund + (penalty < 1.0 ? " (50%)" : "");
    sellBtn.disabled = mode === "won" || mode === "lost";
  }

  // Render the compact targeting picker for the selected tower. It shows the
  // current mode and lets the player switch freely, without spending coins.
  // Works identically during an active wave: targeting mode changes are free
  // and take effect on the next shot.
  renderTargetingPicker(t);

  if (t.level >= maxLevel) {
    nextDmg.textContent = "-";
    nextRng.textContent = "-";
    nextCd.textContent = "-";
    nextCost.textContent = "MAX";
    upgradeBtn.disabled = true;
    if (msg) msg.textContent = "Maximum level reached.";
    return;
  }

  nextDmg.textContent = Math.round(t.damage + 10);
  nextRng.textContent = Math.round(t.range + 20);
  const nextCdVal = Math.max(0.3, t.cooldown - 0.05);
  nextCd.textContent = nextCdVal.toFixed(2);
  nextCost.textContent = t.upgradeCost;

  const canUpgrade = mode !== "won" && mode !== "lost" && coins >= t.upgradeCost;
  upgradeBtn.disabled = !canUpgrade;
  if (msg) {
    if (mode === "won" || mode === "lost") {
      msg.textContent = "Game ended.";
    } else if (coins < t.upgradeCost) {
      msg.textContent = "Not enough coins for upgrade.";
    } else if (t.level >= maxLevel) {
      msg.textContent = "Maximum level reached.";
    } else {
      msg.textContent = "Upgrade available.";
    }
  }
}

function updateWaveInfo() {
  const wEl = $("waveInfo");
  if (!wEl) return;
  if (mode === "won") {
    wEl.innerHTML = '<span class="preview-title">Wave: ' + MAX_WAVE + '/' + MAX_WAVE + ' (Complete)</span>' + buildWaveTypeHtml(MAX_WAVE) + buildWaveStatsHtml(MAX_WAVE) + buildWaveCountHtml(MAX_WAVE);
    return;
  }
  if (mode === "lost") {
    wEl.innerHTML = '<span class="preview-title">Wave: ' + currentWave + '/' + MAX_WAVE + ' (Lost)</span>' + buildWaveTypeHtml(currentWave) + buildWaveStatsHtml(currentWave) + buildWaveCountHtml(currentWave);
    return;
  }
  if (waveActive) {
    const enemiesLeft = (enemiesToSpawn - spawned) + enemies.length;
    wEl.innerHTML = '<span class="preview-title">Wave: ' + currentWave + '/' + MAX_WAVE + ' (Active)</span>' + buildWaveTypeHtml(currentWave) + buildWaveStatsHtml(currentWave) + buildWaveCountHtml(currentWave, enemiesLeft);
  } else {
    if (currentWave === 0) {
      wEl.innerHTML = '<span class="preview-title">Wave: 1/' + MAX_WAVE + ' (Pending)</span>' + buildWaveTypeHtml(1) + buildWaveStatsHtml(1) + buildWaveCountHtml(1);
    } else {
      wEl.innerHTML = '<span class="preview-title">Wave: ' + currentWave + '/' + MAX_WAVE + ' (Complete)</span>' + buildWaveTypeHtml(currentWave) + buildWaveStatsHtml(currentWave) + buildWaveCountHtml(currentWave);
    }
  }
  updateWavePreview();
}

function buildWaveCountHtml(waveNum, enemiesLeft) {
  const wd = getLevelWaveDef(waveNum, currentLevel);
  if (!wd) return "";
  const remaining = enemiesLeft === undefined ? "" : " · " + enemiesLeft + " left";
  return '<span class="preview-line">' + wd.enemies + ' enemies' + remaining + '</span>';
}

// Builds the per-type enemy breakdown HTML spans (colored glyphs like the wave preview)
// for a given wave number, e.g. <span class="preview-line" style="color:#ef4444">● Standard 6</span>.
function buildWaveTypeHtml(waveNum) {
  const wd = getLevelWaveDef(waveNum, currentLevel);
  if (!wd) return "";
  const counts = Object.create(null);
  for (const entry of wd.composition) counts[entry.type] = entry.count;
  return Object.keys(ENEMY_TYPES).map(function(type) {
    const t = ENEMY_TYPES[type];
    return '<span class="preview-line" style="color:' + t.color + '">' + t.glyph + ' ' + t.name + ' ' + (counts[type] || 0) + '</span>';
  }).join('');
}

// Builds compact HP, speed, and reward details for both wave panels.
function buildWaveStatsHtml(waveNum) {
  const wd = getLevelWaveDef(waveNum, currentLevel);
  if (!wd) return "";
  return '<span class="preview-line">❤️ ' + wd.enemyHp.toFixed(1) + ' HP · ⚡ ' + wd.enemySpeed.toFixed(1) + ' · 💰 ' + wd.reward + '</span>';
}

function loop(time) {
  const dt = Math.min((time - lastTime) / 1000 || 0, 0.05);
  lastTime = time;

  update(dt);
  draw();

  requestAnimationFrame(loop);
}

// Returns the authoritative wave definition for the next wave to start.
// Returns null when no further waves remain (final wave complete or victory).
function getNextWaveDef() {
  if (mode === "won" || mode === "lost") return null;
  const nextW = (currentWave === 0) ? 1 : currentWave + 1;
  if (nextW > MAX_WAVE) return null;
  return getLevelWaveDef(nextW, currentLevel);
}

// Renders a compact preview of the next wave into the preview panel.
// Derives all values from the authoritative WAVE_DEFS used by spawning,
// so the preview always matches the enemies that will actually spawn.
function updateWavePreview() {
  const previewEl = $("wavePreview");
  if (!previewEl) return;

  const w = getNextWaveDef();
  const nextW = (currentWave === 0) ? 1 : currentWave + 1;

  if (!w) {
    lastPreviewWave = -1;
    previewEl.innerHTML =
      '<span class="preview-title">Next wave</span>' +
      '<span class="preview-line">—</span>';
    return;
  }

  // Only rewrite the DOM when the previewed wave actually changed, to avoid
  // unnecessary work during an active wave's per-frame updates.
  if (lastPreviewWave === nextW) return;
  lastPreviewWave = nextW;

  // Per-type composition lines, derived from the authoritative composition.
  previewEl.innerHTML =
    '<span class="preview-title">Next: Wave ' + nextW + '/' + MAX_WAVE + '</span>' +
    buildWaveTypeHtml(nextW) +
    buildWaveStatsHtml(nextW) +
    buildWaveCountHtml(nextW);
}

$("startBtn").addEventListener("click", handleStartButton);
$("restartBtn").addEventListener("click", reset);
const pauseBtn = $("pauseBtn");
if (pauseBtn) {
  pauseBtn.addEventListener("click", togglePause);
}

// ---- v2.1.0: Pause state ----
// Pausing freezes all gameplay-affecting simulation: enemy movement,
// projectiles, spawns, and combat timers. Resuming does not duplicate
// loops or scheduled spawns.
let paused = false;

function togglePause() {
  if (mode !== "playing") return;
  paused = !paused;
  const btn = $("pauseBtn");
  if (btn) btn.textContent = paused ? "▶ Resume" : "⏸ Pause";
  if (paused) {
    $("status").textContent = "⏸ Paused";
  } else {
    $("status").textContent = "Wave " + currentWave + ": enemies incoming!";
  }
}

function setPause(state) {
  if (mode !== "playing") return;
  paused = state;
  const btn = $("pauseBtn");
  if (btn) btn.textContent = paused ? "▶ Resume" : "⏸ Pause";
}
$("roundContinue").addEventListener("click", closeRoundNotice);

canvas.addEventListener("pointerdown", event => {
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * W / rect.width;
  const y = (event.clientY - rect.top) * H / rect.height;

  // Tapping an existing tower selects it for inspection and upgrade.
  // It must never trigger a new placement. Selecting also opens the
  // context-style upgrade popup explicitly.
  const clickedTower = towers.find(t => distance(t, { x, y }) < 15);
  if (clickedTower) {
    selectedTower = clickedTower;
    showPanel();
    updateUpgradePanel();
    $("status").textContent = `Tower Lv ${clickedTower.level} selected.`;
    return;
  }

  // Tapping an empty green spot opens the tower chooser for that location.
  const buildSpot = spots.find(s => distance(s, { x, y }) < 20);
  if (buildSpot) {
    selectedTower = null;
    hidePanel();
    updateUpgradePanel();
    showBuildMenu(buildSpot);
    return;
  }

  selectedTower = null;
  updateUpgradePanel();
  placeTower(x, y);
});

// Track the pointer so the placement preview stays synchronized with the
// actual canvas coordinates at any viewport size.
canvas.addEventListener("pointermove", event => {
  const rect = canvas.getBoundingClientRect();
  pointerPos = {
    x: (event.clientX - rect.left) * W / rect.width,
    y: (event.clientY - rect.top) * H / rect.height
  };
});

restoreSavedGame();
reset();
requestAnimationFrame(loop);

$("upgradeBtn").addEventListener("click", upgradeTower);
$("sellBtn").addEventListener("click", () => sellTower(selectedTower));

// Switch the selected tower's target priority. Changing mode is free, does
// not grant extra attacks, and never triggers placement.
const targetingPickerEl = $("targetingPicker");
if (targetingPickerEl) {
  targetingPickerEl.addEventListener("click", event => {
    if (!selectedTower) return;
    const btn = event.target.closest ? event.target.closest(".tmode-btn") : null;
    if (!btn || !btn.dataset.mode) return;
    selectTargetingMode(selectedTower, btn.dataset.mode);
    const m = getTargetingMode(selectedTower.targeting);
    $("status").textContent = "Targeting set to " + m.name + ".";
  });
}

$("towerPicker").addEventListener("click", event => {
  const btn = event.target.closest ? event.target.closest("button[data-type]") : null;
  if (!btn) return;
  const buildSpot = pendingBuildSpot;
  closeBuildMenu();
  selectTowerType(btn.dataset.type);
  if (buildSpot) placeTower(buildSpot.x, buildSpot.y);
});

// Dismiss the upgrade popup via its close button, backdrop, or Escape key.
// Taps on the backdrop (or anywhere outside the panel content) dismiss it;
// taps on panel content (upgrade, sell, targeting) stay inside the popup.
const panelOverlay = $("panelOverlay");
if (panelOverlay) {
  panelOverlay.addEventListener("pointerdown", event => {
    // Guarded so non-DOM contexts (deterministic test harness) never crash.
    if (event.target && typeof event.target.closest === "function" && event.target.closest("#upgradePanel, #buildPanel, #settingsPanel")) return; // panel content tap
    if (buildMenuOpen) closeBuildMenu();
    else hidePanel();
  });
}
const panelCloseBtn = $("panelClose");
if (panelCloseBtn) {
  panelCloseBtn.addEventListener("click", hidePanel);
}
const buildCloseBtn = $("buildClose");
if (buildCloseBtn) buildCloseBtn.addEventListener("click", closeBuildMenu);
const buildCancelBtn = $("buildCancel");
if (buildCancelBtn) buildCancelBtn.addEventListener("click", closeBuildMenu);
// Escape dismisses the popup when a tower is selected. Guarded so non-DOM
// contexts (deterministic test harness) never crash here.
// Keyboard shortcuts: 1/2/3 select tower type, Space starts wave, R restarts.
if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  document.addEventListener("keydown", event => {
    if (!$("roundOverlay").hidden) {
      if (event.key === "Escape") closeRoundNotice();
      else event.preventDefault();
      return;
    }
    if (event.key === "Escape" && buildMenuOpen) {
      closeBuildMenu();
      return;
    }
    if (event.key === "Escape" && selectedTower) {
      hidePanel();
      return;
    }
    if (event.key === "1") { selectTowerType("archer"); return; }
    if (event.key === "2") { selectTowerType("cannon"); return; }
    if (event.key === "3") { selectTowerType("magic"); return; }
    if (event.key === " " || event.code === "Space") {
      event.preventDefault();
      if (mode !== "playing" && mode !== "won" && mode !== "lost" && !waveActive) {
        startWave();
      }
      return;
    }
    if (event.key === "r" || event.key === "R") {
      reset();
      return;
    }
  });
}

// ---- v2.0.0 Settings panel ----
function showSettings() {
  closeBuildMenu();
  hidePanel();
  const panel = $("settingsPanel");
  if (!panel) return;
  const overlay = $("panelOverlay");
  const buildPanel = $("buildPanel");
  const upgradePanel = $("upgradePanel");
  if (buildPanel) buildPanel.hidden = true;
  if (upgradePanel) upgradePanel.hidden = true;
  if (overlay) overlay.hidden = false;
  const soundToggle = $("soundToggle");
  const motionToggle = $("motionToggle");
  if (soundToggle) soundToggle.checked = settings.soundEnabled;
  if (motionToggle) motionToggle.checked = settings.reducedMotion;
  renderSettingsStats();
  renderSettingsAchievements();
  panel.hidden = false;
}

function hideSettings() {
  const panel = $("settingsPanel");
  if (panel) panel.hidden = true;
  refreshPanelContent();
}

function renderSettingsStats() {
  const el = $("statsDisplay");
  if (!el) return;
  el.innerHTML =
    '<div class="stat-line">Rounds completed: ' + statsState.roundsCompleted + '</div>' +
    '<div class="stat-line">Enemies defeated: ' + statsState.enemiesDefeated + '</div>' +
    '<div class="stat-line">Towers built: ' + statsState.towersBuilt + '</div>' +
    '<div class="stat-line">Towers upgraded: ' + statsState.towersUpgraded + '</div>' +
    '<div class="stat-line">Campaign victories: ' + statsState.campaignVictories + '</div>' +
    '<div class="stat-line">Bosses defeated: ' + statsState.bossesDefeated + '</div>' +
    '<div class="stat-line">Runners defeated: ' + statsState.runnersDefeated + '</div>' +
    '<div class="stat-line">Armored defeated: ' + statsState.armoredDefeated + '</div>' +
    '<div class="stat-line">Archer towers: ' + statsState.archerBuilt + '</div>' +
    '<div class="stat-line">Cannon towers: ' + statsState.cannonBuilt + '</div>' +
    '<div class="stat-line">Magic towers: ' + statsState.magicBuilt + '</div>' +
    '<div class="stat-line">Most coins spent in a level: ' + statsState.maxCoinsSpent + '</div>';
}

function renderSettingsAchievements() {
  const el = $("achievementsDisplay");
  if (!el) return;
  let html = "";
  for (const key of Object.keys(ACHIEVEMENTS_DEFS)) {
    const def = ACHIEVEMENTS_DEFS[key];
    const unlocked = achievements.includes(key);
    html += '<div class="ach-line ' + (unlocked ? "unlocked" : "locked") + '">' +
      (unlocked ? "✓ " : "☐ ") + def.name + (unlocked ? "" : " (locked)") + '</div>';
  }
  el.innerHTML = html;
}

// Settings button and toggles
const settingsBtn = $("settingsBtn");
if (settingsBtn) {
  settingsBtn.addEventListener("click", () => {
    if ($("settingsPanel")) showSettings();
  });
}
const campaignBtn = $("campaignBtn");
if (campaignBtn) {
  campaignBtn.addEventListener("click", () => {
    if ($("campaignPanel")) showCampaignMenu();
  });
}
const campaignCloseBtn = $("campaignClose");
if (campaignCloseBtn) campaignCloseBtn.addEventListener("click", hideCampaignMenu);
const settingsCloseBtn = $("settingsClose");
if (settingsCloseBtn) settingsCloseBtn.addEventListener("click", hideSettings);
const soundToggleEl = $("soundToggle");
if (soundToggleEl) {
  soundToggleEl.addEventListener("change", () => {
    settings.soundEnabled = soundToggleEl.checked;
    saveGame();
  });
}
const motionToggleEl = $("motionToggle");
if (motionToggleEl) {
  motionToggleEl.addEventListener("change", () => {
    settings.reducedMotion = motionToggleEl.checked;
    applyMotionSetting();
    saveGame();
  });
}

// Reset progress with confirmation
const resetProgressBtn = $("resetProgressBtn");
const resetConfirmEl = $("resetConfirm");
const resetConfirmYes = $("resetConfirmYes");
const resetConfirmNo = $("resetConfirmNo");
if (resetProgressBtn) {
  resetProgressBtn.addEventListener("click", () => {
    if (resetConfirmEl) resetConfirmEl.hidden = false;
    if (resetConfirmYes) resetConfirmYes.hidden = false;
    if (resetConfirmNo) resetConfirmNo.hidden = false;
  });
}
if (resetConfirmYes) {
  resetConfirmYes.addEventListener("click", () => {
    if (!resetSave()) {
      $("status").textContent = "Could not reset saved progress. Check browser storage permissions.";
      return;
    }
    if (resetConfirmEl) resetConfirmEl.hidden = true;
    if (resetConfirmYes) resetConfirmYes.hidden = true;
    if (resetConfirmNo) resetConfirmNo.hidden = true;
    renderSettingsStats();
    renderSettingsAchievements();
    if (soundToggleEl) soundToggleEl.checked = settings.soundEnabled;
    if (motionToggleEl) motionToggleEl.checked = settings.reducedMotion;
  });
}
if (resetConfirmNo) {
  resetConfirmNo.addEventListener("click", () => {
    if (resetConfirmEl) resetConfirmEl.hidden = true;
    if (resetConfirmYes) resetConfirmYes.hidden = true;
    if (resetConfirmNo) resetConfirmNo.hidden = true;
  });
}

// Game over screen
const gameOverOverlay = $("gameOverOverlay");
const gameOverRestart = $("gameOverRestart");
if (gameOverRestart) {
  gameOverRestart.addEventListener("click", () => {
    if (gameOverOverlay) gameOverOverlay.hidden = true;
    reset();
  });
}
