# myTowerDef v2.0.0 Changelog

## Version 2.0.0

### New Features

- **Campaign persistence**: Save/restore campaign progress, settings, achievements, and statistics using browser localStorage. Data is validated on load, with versioning for future migrations. Includes a "Reset Saved Progress" option with confirmation.

- **Settings panel**: Toggle sound effects on/off, reduced motion, and view statistics and achievements. Settings persist between sessions and update the running game immediately.

- **Game over overlay**: Dedicated game-over screen with restart button, separate from the round notice overlay.

- **Boss encounters**: Boss enemies spawn on wave 3 (the final wave) of every level. Bosses are high-HP armored enemies with a purple crown visual. They reward a large bounty and are tracked in statistics.

- **Achievements system**: 14 achievements including First Defense, All Twelve, Legendary Defender, Boss Slayer, Speed Demon, Tank Buster, Master Archer, Cannon Master, Wizard, Upgrade Artist, Perfect Hold, and Big Spender. Each achievement unlocks once and persists.

- **Statistics tracking**: Track rounds completed, enemies defeated, towers built, towers upgraded, campaign victories, bosses defeated, runners defeated, armored defeated, archer/cannon/magic towers built, and max coins spent in a single level.

- **Version display**: Updated to v2.0.0 in level title and page title.

### Bug Fixes

- **Mojibake emoji fix**: Fixed 15+ mojibake emoji sequences in game.js that were causing the "round_50_resets_to_baseline_round_one" regression test to fail. The crown emoji (👑) in the legendary defender message was mojibake, causing a string comparison failure.
- **Persistence and tracking fixes**: Restore saved campaign/settings/statistics on startup, resume after completed levels, track upgrades and per-level spending, and ensure one enemy kill awards rewards only once.
- **Achievement and boss fixes**: Enforce the 10-boss achievement threshold, unlock clean-level achievements, and give bosses their own high-HP armored stats, large bounty, and crown visual.
- **Reduced motion**: Apply the setting to interface motion and projectile visuals.

### Backward Compatibility

- All 12 levels, 3 waves per level, 50-round campaign progression preserved.
- All tower types, enemy types, wave compositions, rewards, and difficulty scaling preserved.
- 80 starting coins, Cannon cost of 80 coins preserved.
- 50% initial enemy HP increase and 10% initial speed increase preserved.
- Legendary defender victory celebration preserved.
- All 92 regression tests pass.
- Smoke test passes.

### Files Changed

- `game.js`: Added persistence, settings, achievements, boss, statistics, and game over overlay.
- `index.html`: Added settings panel and game over overlay to HTML structure.
- `style.css`: Added styles for settings panel, game over overlay, icon button, and achievement lines.