const fs = require('fs');
const vm = require('vm');

function read(p){ try{return fs.readFileSync(p,'utf8');}catch(e){return null;} }
const js = read('game.js');

const elem = {
  getContext: ()=>({fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){},fillText(){},clearRect(){}}),
  width: 300,
  height: 360,
  addEventListener: ()=>{},
  getBoundingClientRect: ()=>({left:0,top:0,width:300,height:360})
};
const btn = {textContent:'',disabled:false,addEventListener:()=>{},style:{}};
const status={textContent:''}, coins={textContent:''}, lives={textContent:''};
const doc = {
  querySelector: (s)=> s==='#game'?elem:btn,
  getElementById: (id)=> id==='coins'?coins : id==='lives'?lives : id==='status'?status : btn
};
const raf=()=>{};
const ctx={document:doc,window:{requestAnimationFrame:raf},requestAnimationFrame:raf,console:console,Math:Math};
vm.createContext(ctx);
vm.runInContext(js,ctx);

function assert(name,cond){ if(!cond) throw new Error('FAIL '+name); console.log('OK',name); }
assert('init_coins', coins.textContent==='100');
assert('init_lives', lives.textContent==='10');
assert('has_towers', Array.isArray(ctx.towers));
assert('has_enemies', Array.isArray(ctx.enemies));
assert('has_shots', Array.isArray(ctx.shots));
if(typeof ctx.startWave==='function') ctx.startWave();
assert('mode_playing', ctx.mode==='playing');
if(typeof ctx.reset==='function') ctx.reset();
assert('reset_clean', ctx.enemies.length===0 && ctx.towers.length===0 && ctx.shots.length===0 && ctx.mode==='ready');
console.log('ALL_OK');
