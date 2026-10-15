const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const $ = id => document.getElementById(id);

const W = 300;
const H = 360;
const TOWER_COST = 50;
const TOTAL_ENEMIES = 8;

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

canvas.width = W;
canvas.height = H;

const path = [
  { x: -10, y: 45 },
  { x: 240, y: 45 },
  { x: 240, y: 130 },
  { x: 65, y: 130 },
  { x: 65, y: 225 },
  { x: 245, y: 225 },
  { x: 245, y: 370 }
];

const spots = [
  { x: 100, y: 80 },
  { x: 195, y: 85 },
  { x: 190, y: 165 },
  { x: 110, y: 185 },
  { x: 115, y: 270 },
  { x: 200, y: 280 }
];

let coins, lives, towers, enemies, shots;
let spawned, spawnTimer, mode;
let pointerPos = null; // last canvas pointer position, used for placement preview
let selectedTower = null;
let lastTime = 0;
let currentWave = 0; // 0 means not started yet
let enemiesToSpawn, enemyHp, enemySpeed, waveReward;
let waveActive = false;
let lastPreviewWave = -1; // cached next-wave number rendered in the preview

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function reset() {
  coins = 100;
  lives = 10;
  towers = [];
  enemies = [];
  shots = [];
  spawned = 0;
  spawnTimer = 0;
  spawnQueue = [];
  pointerPos = null;
  mode = "ready";
  selectedTower = null;
  currentWave = 0;
  waveActive = false;
  enemiesToSpawn = WAVE_DEFS[0].enemies;
  enemyHp = WAVE_DEFS[0].enemyHp;
  enemySpeed = WAVE_DEFS[0].enemySpeed;
  waveReward = WAVE_DEFS[0].reward;

  $("status").textContent = "Build your defense!";
  $("startBtn").disabled = false;
  $("startBtn").textContent = "▶ Start Wave";

  updateUI();
  updateUpgradePanel();
  updateWaveInfo();
}

function updateUI() {
  $("coins").textContent = coins;
  $("lives").textContent = lives;
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

  const w = WAVE_DEFS[currentWave - 1];
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

  mode = "playing";
  waveActive = true;
  buildMode = false;
  spawned = 0;
  spawnTimer = 0;

  $("status").textContent = `Wave ${currentWave}: enemies incoming!`;
  $("startBtn").disabled = true;
  $("startBtn").textContent = "⚔ Wave in progress";
  updateUI();
}

function addEnemy() {
  // Pick the next enemy type from the authoritative spawn queue. Fall back
  // to the standard archetype if the queue is empty or malformed.
  const typeKey = spawnQueue[spawned] || "standard";
  const t = getEnemyType(typeKey);

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
  if (mode === "won" || mode === "lost" || waveActive) return;

  const spot = spots.find(s => distance(s, { x, y }) < 20);

  if (!spot) {
    $("status").textContent = "Tap a green build spot.";
    return;
  }

  if (towers.some(t => distance(t, spot) < 1)) {
    $("status").textContent = "That spot is occupied!";
    return;
  }

  if (coins < TOWER_COST) {
    $("status").textContent = "Not enough coins!";
    return;
  }

  towers.push({
    x: spot.x,
    y: spot.y,
    range: 85,
    damage: 20,
    cooldown: 0,
    level: 1,
    upgradeCost: 80
  });

  coins -= TOWER_COST;
  $("status").textContent = "Tower built! Ready to defend.";
  updateUI();
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
    return;
  }

  for (const tower of towers) {
    tower.cooldown -= dt;

    if (tower.cooldown > 0) continue;

    const target = enemies.find(e =>
      distance(tower, e) <= tower.range
    );

    if (target) {
      shots.push({
        x: tower.x,
        y: tower.y,
        target,
        damage: tower.damage,
        speed: 220
      });

      tower.cooldown = 0.65;
    }
  }

  for (const shot of shots) {
    const target = shot.target;

    if (!enemies.includes(target)) {
      shot.done = true;
      continue;
    }

    const d = distance(shot, target);
    const step = shot.speed * dt;

    if (d <= step + 5) {
      target.hp -= shot.damage;
      shot.done = true;

      if (target.hp <= 0) {
        target.dead = true;
        coins += target.reward;
      }
    } else if (d > 0) {
      shot.x += (target.x - shot.x) / d * step;
      shot.y += (target.y - shot.y) / d * step;
    }
  }

  enemies = enemies.filter(e => !e.dead);
  shots = shots.filter(s => !s.done);
  updateUI();

  if (spawned === enemiesToSpawn && enemies.length === 0) {
    waveActive = false;
    const lastWave = currentWave >= MAX_WAVE;
    mode = lastWave ? "won" : "ready";
    if (!lastWave) {
      coins += waveReward;
    } else {
      coins += waveReward;
    }
    updateUI();
    updateUpgradePanel();
    updateWaveInfo();

    if (lastWave) {
      $("status").textContent = "🏆 All waves complete! +30 coins bonus";
      $("startBtn").disabled = true;
    } else {
      $("status").textContent = `Wave ${currentWave} complete! +${waveReward} coins`;
      $("startBtn").disabled = false;
      $("startBtn").textContent = "▶ Start Wave";
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);

  // Grass background
  ctx.fillStyle = "#173c35";
  ctx.fillRect(0, 0, W, H);

  // Enemy path
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);

  for (const p of path.slice(1)) {
    ctx.lineTo(p.x, p.y);
  }

  ctx.lineWidth = 30;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#9b896a";
  ctx.stroke();

  ctx.lineWidth = 2;
  ctx.strokeStyle = "#c6b99a";
  ctx.stroke();

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
  // nearest valid empty spot. Green = placeable, red = blocked (occupied or
  // unaffordable). Derived from the actual placement rules, never bypasses
  // them, and is skipped during active waves / game over.
  if (pointerPos && mode !== "won" && mode !== "lost" && !waveActive) {
    const p = pointerPos;
    const spot = spots.find(s => distance(s, p) < 20);
    if (spot) {
      const occupied = towers.some(t => distance(t, spot) < 1);
      const affordable = coins >= TOWER_COST;
      const ok = !occupied && affordable;
      const ghostColor = ok ? "rgba(96,165,250,0.55)" : "rgba(239,68,68,0.55)";

      ctx.beginPath();
      ctx.arc(spot.x, spot.y, 13, 0, Math.PI * 2);
      ctx.fillStyle = ghostColor;
      ctx.fill();
      ctx.strokeStyle = ok ? "#4ade80" : "#f87171";
      ctx.lineWidth = 2;
      ctx.stroke();

      if (!ok) {
        ctx.fillStyle = "#fca5a5";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(occupied ? "occupied" : "need " + TOWER_COST, spot.x, spot.y + 17);
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

    ctx.beginPath();
    ctx.arc(tower.x, tower.y, 12, 0, Math.PI * 2);
    ctx.fillStyle = "#60a5fa";
    ctx.fill();
    ctx.strokeStyle = selectedTower === tower ? "#fef08a" : "#dbeafe";
    ctx.lineWidth = 2;
    ctx.stroke();
    if (tower.level > 1) {
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(tower.level, tower.x, tower.y + 3);
    }
  }

  // Enemies and health bars
  for (const enemy of enemies) {
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = enemy.color || "#ef4444";
    ctx.fill();
    ctx.strokeStyle = "rgba(15,23,42,0.55)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Type glyph distinguishes archetypes without relying on color alone.
    if (enemy.glyph) {
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(enemy.glyph, enemy.x, enemy.y + 1);
    }

    ctx.fillStyle = "#451a1a";
    ctx.fillRect(enemy.x - 10, enemy.y - 15, 20, 3);

    ctx.fillStyle = "#4ade80";
    ctx.fillRect(
      enemy.x - 10,
      enemy.y - 15,
      20 * Math.max(0, enemy.hp / enemy.maxHp),
      3
    );
  }

  // Projectiles
  ctx.fillStyle = "#fef08a";

  for (const shot of shots) {
    ctx.beginPath();
    ctx.arc(shot.x, shot.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}


function upgradeTower(){
  if(!selectedTower || mode === "won" || mode === "lost") return;
  if(selectedTower.level >= 3) return;
  if(coins < selectedTower.upgradeCost) return;
  coins -= selectedTower.upgradeCost;
  selectedTower.level++;
  selectedTower.range += 20;
  selectedTower.damage += 10;
  selectedTower.cooldown = Math.max(0.3, selectedTower.cooldown - 0.05);
  selectedTower.upgradeCost = Math.floor(selectedTower.upgradeCost * 1.5);
  $("status").textContent = "Tower upgraded to L"+selectedTower.level+"!";
  const msgEl = $("upgradeMsg");
  if (msgEl) msgEl.textContent = "Upgrade successful!";
  updateUI();
  updateUpgradePanel();
}

function updateUpgradePanel() {
  const upgradeBtn = $("upgradeBtn");
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
    if (msg) msg.textContent = "";
    return;
  }

  const t = selectedTower;
  const maxLevel = 3;
  title.textContent = `Tower (Lv ${t.level})`;
  levelPill.textContent = `Lv ${t.level}/${maxLevel}`;

  curDmg.textContent = Math.round(t.damage);
  curRng.textContent = Math.round(t.range);
  curCd.textContent = t.cooldown.toFixed(2);

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
  const nwEl = $("nextWaveInfo");
  if (!wEl && !nwEl) return;
  if (mode === "won") {
    if (wEl) wEl.textContent = "Wave: " + MAX_WAVE + "/" + MAX_WAVE + " (Complete)";
    if (nwEl) nwEl.textContent = "Next: -";
    return;
  }
  if (mode === "lost") {
    if (wEl) wEl.textContent = "Wave: " + currentWave + "/" + MAX_WAVE + " (Lost)";
    if (nwEl) nwEl.textContent = "Next: -";
    return;
  }
  if (waveActive) {
    if (wEl) wEl.textContent = "Wave: " + currentWave + "/" + MAX_WAVE + " (Active)";
    const nextW = currentWave < MAX_WAVE ? currentWave + 1 : null;
    if (nwEl) {
      if (nextW) nwEl.textContent = "Next: Wave " + nextW + " (" + WAVE_DEFS[nextW - 1].enemies + " enemies)";
      else nwEl.textContent = "Next: -";
    }
  } else {
    if (currentWave === 0) {
      if (wEl) wEl.textContent = "Wave: 1/" + MAX_WAVE + " (Pending)";
      if (nwEl) nwEl.textContent = "Next: Wave 1 (" + WAVE_DEFS[0].enemies + " enemies)";
    } else {
      if (wEl) wEl.textContent = "Wave: " + currentWave + "/" + MAX_WAVE + " (Complete)";
      const nextW2 = currentWave < MAX_WAVE ? currentWave + 1 : null;
      if (nwEl) {
        if (nextW2) nwEl.textContent = "Next: Wave " + nextW2 + " (" + WAVE_DEFS[nextW2 - 1].enemies + " enemies)";
        else nwEl.textContent = "Next: -";
      }
    }
  }
  updateWavePreview();
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
  return WAVE_DEFS[nextW - 1];
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
  const typeLines = w.composition.map(entry => {
    const t = getEnemyType(entry.type);
    return '<span class="preview-line" style="color:' + t.color + '">' + t.glyph + ' ' + t.name + ' ' + entry.count + '</span>';
  }).join('');

  previewEl.innerHTML =
    '<span class="preview-title">Next: Wave ' + nextW + '/' + MAX_WAVE + ' (' + w.enemies + ')</span>' +
    typeLines +
    '<span class="preview-line">❤️ ' + w.enemyHp + ' HP · ⚡ ' + w.enemySpeed + ' · 💰 Reward ' + w.reward + '</span>';
}

$("startBtn").addEventListener("click", startWave);
$("restartBtn").addEventListener("click", reset);

canvas.addEventListener("pointerdown", event => {
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * W / rect.width;
  const y = (event.clientY - rect.top) * H / rect.height;

  // Tapping an existing tower selects it for inspection and upgrade.
  // It must never trigger a new placement.
  const clickedTower = towers.find(t => distance(t, { x, y }) < 15);
  if (clickedTower) {
    selectedTower = clickedTower;
    updateUpgradePanel();
    $("status").textContent = `Tower Lv ${clickedTower.level} selected.`;
    return;
  }

  // Tapping empty canvas places a tower directly on a valid green spot.
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

reset();
requestAnimationFrame(loop);

$("upgradeBtn").addEventListener("click", upgradeTower);
