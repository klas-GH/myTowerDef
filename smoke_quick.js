const fs = require('fs');
const vm = require('vm');

const js = fs.readFileSync('game.js','utf8');
const elem = {
  getContext: ()=>({fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){},fillText(){},clearRect(){}}),
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
assert('init_coins', String(coins.textContent).trim()==='100');
assert('init_lives', String(lives.textContent).trim()==='6');
assert('init_status', String(status.textContent).trim()==='Build your defense!');
if(typeof ctx.reset==='function') ctx.reset();
assert('reset_ok', String(coins.textContent).trim()==='100' && String(lives.textContent).trim()==='6');
console.log('SMOKE_OK');
