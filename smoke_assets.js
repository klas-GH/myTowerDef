const fs = require('fs');
const vm = require('vm');

const images = {};
function makeImage(src) {
  if (images[src]) return images[src];
  const img = { complete: true, naturalWidth: 28, naturalHeight: 28, _src: src, onload: null, onerror: null };
  Object.defineProperty(img, 'src', {
    get() { return this._src; },
    set(v) { this._src = v; images[v] = this; }
  });
  images[src] = img;
  return img;
}
function ImageConstructor() { return makeImage(''); }

const ctx = {
  calls: [],
  clearRect() { this.calls.push(['clearRect']); },
  fillRect() { this.calls.push(['fillRect']); },
  drawImage(img) { this.calls.push(['drawImage', String((img && (img._src || img.src)) || '')]); },
  fillText() {}, strokeText() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
  stroke() {}, fill() {}, arc() {}, ellipse() {}, rect() {}, roundRect() {}, polygon() {},
  createRadialGradient() { return { addColorStop() {} }; },
  save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, transform() {},
  set fillStyle(v) {}, get fillStyle() { return ''; },
  set strokeStyle(v) {}, get strokeStyle() { return ''; },
  set lineWidth(v) {}, get lineWidth() { return 1; },
  set font(v) {}, get font() { return ''; },
  set textAlign(v) {}, get textAlign() { return 'start'; },
  set textBaseline(v) {}, get textBaseline() { return 'alphabetic'; },
  set globalAlpha(v) {}, get globalAlpha() { return 1; }
};

function el() {
  return {
    style: {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {},
    addEventListener() {}, appendChild() {}, append() {}, removeChild() {}, remove() {},
    focus() {}, setAttribute() {}, getAttribute() { return null; },
    textContent: '', innerHTML: '', hidden: false, disabled: false, children: []
  };
}

const doc = {
  querySelector: (sel) => {
    if (sel === '#game') return canvas;
    return el();
  },
  getElementById: () => el(),
  getElementsByTagName: () => [{ src: 'game.js' }],
  createElement: () => el(),
  documentElement: { classList: { add() {}, remove() {}, toggle() {} } }
};
const canvas = { width: 300, height: 360, getContext: () => ctx, addEventListener() {}, style: {} };

const win = {
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  addEventListener() {},
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  navigator: { userAgent: 'node', standalone: false },
  requestAnimationFrame: () => 0,
  setTimeout, clearTimeout, performance: { now: () => Date.now() }
};

const sandbox = {
  document: doc, window: win, console, Math, Date, setTimeout, clearTimeout,
  parseInt, parseFloat, isNaN, isFinite, JSON, Array, Object, String, Number,
  Boolean, Function, Symbol, Map, Set, Promise, Error, TypeError, RangeError,
  SyntaxError, Reflect, Intl, requestAnimationFrame: win.requestAnimationFrame,
  Image: ImageConstructor
};
sandbox.window = win;
sandbox.window.document = doc;
sandbox.window.navigator = win.navigator;
sandbox.window.localStorage = win.localStorage;
sandbox.window.matchMedia = win.matchMedia;
sandbox.window.addEventListener = win.addEventListener;

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('game.js', 'utf8'), sandbox);

sandbox.reset();
sandbox.draw();
const afterReset = ctx.calls.filter(c => c[0] === 'drawImage');
console.log('drawImage after reset+draw:', afterReset.length);
afterReset.forEach(c => console.log('  ', c[1] || '(no img)'));

const spots = vm.runInContext('spots', sandbox);
console.log('spots:', JSON.stringify(spots));
console.log('typeof placeTower:', typeof sandbox.placeTower);
sandbox.coins = 200;
const spot = spots[0];
console.log('placing at spot:', spot);
sandbox.placeTower(spot.x, spot.y);
sandbox.draw();
const afterPlace = ctx.calls.filter(c => c[0] === 'drawImage');
console.log('drawImage after placeTower+draw:', afterPlace.length);
afterPlace.slice(afterReset.length).forEach(c => console.log('  ', c[1] || '(no img)'));

sandbox.addEnemy();
sandbox.startWave();
sandbox.update(0.016);
sandbox.draw();
const afterPlay = ctx.calls.filter(c => c[0] === 'drawImage');
console.log('drawImage after play:', afterPlay.length);
afterPlay.slice(afterPlace.length).forEach(c => console.log('  ', c[1] || '(no img)'));

const bgDrawn = afterReset.some(c => c[1].includes('bg_'));
const towerDrawn = afterPlace.some(c => c[1].includes('tower_'));
const enemyDrawn = afterPlay.some(c => c[1].includes('enemy_'));
console.log('RESULT background=' + bgDrawn + ' tower=' + towerDrawn + ' enemy=' + enemyDrawn);
if (!bgDrawn || !towerDrawn || !enemyDrawn) {
  process.exitCode = 1;
} else {
  console.log('PASS');
}