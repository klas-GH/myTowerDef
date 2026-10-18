# myTowerDef Changelog

## Version 2.2.0

### New Features

- **Boss shield phase**: Bosses now have a shield phase that absorbs a portion of incoming damage. While the shield is active, the boss takes 70% reduced damage and the excess damage is applied to the shield HP. When the shield breaks, the boss becomes fully vulnerable. A purple shield bar appears above the boss health bar while the shield is active, with a "SHIELD" label.

- **Boss spawn warning banner**: A purple banner appears at the top of the canvas when a boss is queued to spawn on the final wave, so players can prepare their defenses. The banner is derived from the actual spawn queue so it cannot disagree with spawning.

- **Boss spawn notification**: When the boss actually spawns, a transient "👑 BOSS APPROACHING — focus fire!" message appears in the status bar for 2.5 seconds.

### Bug Fixes

- **Regression test pattern fix**: The `manifest_v2200` regression check was still asserting against the old `"version":  "2.1.0"` string. Updated to check for `"version":  "2.2.0"`.

### Backward Compatibility

- All 12 levels, 3 waves per level, 50-round campaign progression preserved.
- All tower types, enemy types, wave compositions, rewards, and difficulty scaling preserved.
- 80 starting coins, Cannon cost of 80 coins preserved.
- 50% initial enemy HP increase and 10% initial speed increase preserved.
- Legendary defender victory celebration preserved.
- All 102 regression tests pass.
- Smoke test passes.
- Save-data version remains at 2 (no schema change).

### Files Changed

- `game.js`: Added boss shield phase, boss spawn warning banner, boss spawn notification.
- `regression.js`: Added 6 new tests for boss shield phase and boss spawning on all 12 final waves.
- `README.md`: Updated version to 2.2.0.
- `featuresOpt.txt`: Updated version to 2.2.0.
- `quick_Guide.txt`: Updated version to 2.2.0.
- `manifest.json`: Updated version to 2.2.0.
- `sw.js`: Updated cache version to mytd-v2.2.0.

## Version 2.1.0

### New Features

- **Pause state**: New Pause button in the controls bar. Pausing freezes all gameplay-affecting simulation (enemy movement, projectiles, spawns, combat timers) while visual particle effects continue to decay so the player can still see feedback. Resuming does not duplicate loops or scheduled spawns. The pause button is disabled when not in an active wave.

- **Campaign selection menu**: New 🗺 Campaign button in the header opens a grid of all 12 levels. Each card shows the level number, name, and status (locked, completed, or current). Locked levels are disabled and cannot be selected through the UI. The menu is dismissible via its close button or the shared overlay backdrop.

- **Combat feedback particles**: New transient particle system that spawns small bursts on enemy hit and kill events. Particles have velocity, friction, and lifetime decay. They are capped at 120 per frame so their array cannot grow indefinitely. Particles are disabled when reduced-motion is enabled.

- **Boss visual enhancements**: Bosses now get a distinct purple health-bar frame, a "BOSS" label above their health bar, and a larger kill burst on defeat. Boss hit feedback uses a gold color to distinguish it from normal enemy hits.

- **Particle and shot caps**: Added MAX_PARTICLES (120) and MAX_SHOTS (200) constants that cap the transient effect arrays after each frame's filter, preventing unbounded growth during long waves with many units.

### Bug Fixes

- **Regression test pattern fix**: The `manifest_v2100` regression check was still asserting against the old `"version":  "2.0.0"` string. Updated to check for `"version":  "2.1.0"`.
- **Combat particle updates**: Particle motion and lifetime now update during active waves as well as while paused.
- **Campaign unlock preservation**: Replaying a completed level no longer reduces campaign completion progress or relocks later levels.
- **Pause control state**: The pause button is reset and disabled when a wave ends or the base is defeated.

### Backward Compatibility

- All 12 levels, 3 waves per level, 50-round campaign progression preserved.
- All tower types, enemy types, wave compositions, rewards, and difficulty scaling preserved.
- 80 starting coins, Cannon cost of 80 coins preserved.
- 50% initial enemy HP increase and 10% initial speed increase preserved.
- Legendary defender victory celebration preserved.
- All 93 regression tests pass.
- Smoke test passes.
- Save-data version remains at 2 (no schema change).

### Files Changed

- `game.js`: Added pause state, particle system, particle/shot caps, campaign selection menu, boss visual enhancements.
- `index.html`: Added campaign button to header, campaign panel section, pause button to controls.
- `style.css`: Added campaign panel, campaign grid, campaign card styles.
- `regression.js`: Updated version checks to v2.1.0.
- `README.md`: Updated version to 2.1.0.
- `featuresOpt.txt`: Updated version to 2.1.0.
- `quick_Guide.txt`: Updated version to 2.1.0.
- `manifest.json`: Updated version to 2.1.0.
- `sw.js`: Updated cache version to mytd-v2.1.0.

## Version 2.0.0

### New Features

- **Campaign persistence**: Save/restore campaign progress, settings, achievements, and statistics using browser localStorage. Data is validated on load, with versioning for future migrations. Includes a "Reset Saved Progress" option with confirmation.

- **Settings panel**: Toggle sound effects on/off, reduced motion, and view statistics and achievements. Settings persist between sessions and update the running game immediately.

- **Game over overlay**: Dedicated game-over screen with restart button, separate from the round notice overlay.

- **Boss encounters**: Boss enemies spawn on wave 3 (the final wave) of every level. Bosses are high-HP armored enemies with a purple crown visual. They reward a large bounty and are tracked in statistics.

- **Achievements system**: 14 achievements including First Defense, All Twelve, Legendary Defender, Boss Slayer, Speed Demon, Tank Buster, Master Archer, Cannon Master, Wizard, Upgrade Artist, and more.

- **Statistics tracking**: Rounds completed, enemies defeated, towers built/upgraded, campaign victories, bosses/runners/armored defeated, per-type tower counts, max coins spent.

### Bug Fixes

- **Mojibake emoji fix**: Fixed 15+ mojibake emoji sequences in game.js that were causing the "round_50_resets_to_baseline_round_one" regression test to fail.

### Files Changed

- `game.js`: Added persistence, settings, achievements, boss, statistics, and game over overlay.
- `index.html`: Added settings panel and game over overlay to HTML structure.
- `style.css`: Added styles for settings panel, game over overlay, icon button, and achievement lines.
- `regression.js`: Updated version checks from v1.9.32 to v2.0.0.
- `README.md`: Updated version to 2.0.0.
- `featuresOpt.txt`: Updated version to 2.0.0.
- `quick_Guide.txt`: Updated version to 2.0.0.
- `manifest.json`: Updated version to 2.0.0.
- `sw.js`: Updated version to 2.0.0.
- `CHANGELOG.md`: New file documenting v2.0.0 changes.