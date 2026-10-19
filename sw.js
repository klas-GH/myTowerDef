const CACHE="mytd-v2.3.8";
const GAME_ASSETS=[
  "assets/bg_autumn.png","assets/bg_canyon.png","assets/bg_crystal.png",
  "assets/bg_desert.png","assets/bg_jungle.png","assets/bg_meadow.png",
  "assets/bg_moon.png","assets/bg_ocean.png","assets/bg_ruins.png",
  "assets/bg_snow.png","assets/bg_swamp.png","assets/bg_volcano.png",
  "assets/enemy_armored.png","assets/enemy_boss.png","assets/enemy_runner.png",
  "assets/enemy_standard.png","assets/tower_archer.png","assets/tower_cannon.png",
  "assets/tower_magic.png"
];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll([".","index.html","style.css","game.js","icon.svg","manifest.json",...GAME_ASSETS])).then(()=>self.skipWaiting()));});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",e=>{e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));});