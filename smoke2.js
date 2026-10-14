const fs = require('fs');
const vm = require('vm');

const js = fs.readFileSync('game.js','utf8');
const elem = {
  getContext: ()=>({fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){},fillText(){},clearRect(){},save(){},restore(){},setTransform(){},scale(){},translate(){},rotate(){}}),
  width:300,height:360,addEventListener:()=>{},getBoundingClientRect:()=>({left:0,top:0,width:300,height:360})
};
const btn={textContent:'',disabled:false,addEventListener:()=>{},style:{}};
const status={textContent:''},coins={textContent:''},lives={textContent:''};
const doc={querySelector:(s)=>s==='#game'?elem:btn,getElementById:(id)=>id==='coins'?coins:id==='lives'?lives:id==='status'?status:btn};
const raf=()=>{};
const ctx={document:doc,window:{requestAnimationFrame:raf},requestAnimationFrame:raf,console:console};
vm.createContext(ctx);
vm.runInContext(js,ctx);

function assert(name,cond){ if(!cond) throw new Error('FAIL '+name); console.log('OK',name); }
assert('init_coins_dom', String(coins.textContent).trim()==='100');
assert('init_lives_dom', String(lives.textContent).trim()==='10');
assert('init_status_dom', String(status.textContent).trim()==='Build your defense!');
assert('has_towers_arr', Array.isArray(ctx.towers));
assert('has_enemies_arr', Array.isArray(ctx.enemies));
assert('has_shots_arr', Array.isArray(ctx.shots));

// call reset explicitly
ctx.reset();
assert('reset_dom', String(coins.textContent).trim()==='100' && String(lives.textContent).trim()==='10' && String(status.textContent).trim()==='Build your defense!');

console.log('SMOKE2_OK');
