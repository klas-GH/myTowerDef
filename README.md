# myTowerDef

A lightweight, mobile-first tower defense mini-game.

- Version: 2.3.2
- Run: open index.html in a browser (or use Live Server)
- Controls: pick a tower type, tap a green spot to place it, Start Wave, Restart
- Towers: Archer (50, fast), Cannon (80, heavy, slow), Magic (80, long range)
- Targeting: tap a tower to select it, then pick its target priority (First / Strongest / Fastest / Nearest) from the upgrade panel. Changes are free and affect which enemy it attacks next.
- Sell: tap a tower to select it, then Sell refunds its full purchase + upgrade cost.
- Wave preview: the wave panel shows the next wave's enemy types, counts, and reward before you start it.
- Enemies: Standard (red), Runner (fast, low HP), Armored (slow, high HP). Each awards its own reward on defeat.
- Levels: clear three waves to unlock the next of 12 maps, each with its own route, build spots, and scenery. Enemy numbers and stats rise as levels progress.
- Audio: enable sound on the first wave start; towers play a quiet firing sound.
- Difficulty: start with 80 coins + 3% per level above 1; all three towers are affordable. Enemies begin 50% tougher and 10% faster, and move 5% faster on each successive wave.
- Replay: complete all 12 levels to open the next round. Enemy HP and speed rise 1% per round; after Round 50, a special victory popup celebrates the clear and announces the restart at Round #1.
- Challenges (v2.3.0): tap the 🏆 button to open the challenge panel. Each challenge is a self-contained attempt on a specific level with its own starting coins, tower restrictions, and objective. Completing a challenge awards Bronze, Silver, or Gold medals based on lives remaining; your best medal and attempt count persist across reloads. Challenge attempts never touch campaign progress, achievements, or statistics.
- Assets: index.html, style.css, game.js, icon.svg, manifest.json, sw.js
