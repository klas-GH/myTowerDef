const fs = require('fs');
const vm = require('vm');

const code = fs.readFileSync('game.js','utf8');
const elem = {
  getContext: ()=>({fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){},fillText(){},clearRect(){},save(){},restore(){},setTransform(){},scale(){},translate(){},rotate(){}}),
  width:300,height:360,addEventListener:()=>{},getBoundingClientRect:()=>({left:0,top:0,width:300,height:360})
};
const btn={textContent:'',disabled:false,addEventListener:()=>{},style:{}};
const status={textContent:''},coins={textContent:''},lives={textContent:''};
const doc={querySelector:(s)=>s==='#game'?elem:btn,getElementById:(id)=>id==='coins'?coins:id==='lives'?lives:id==='status'?status:btn};
const raf=()=>{};
const sandbox={document:doc,window:{requestAnimationFrame:raf},requestAnimationFrame:raf,console:console};
vm.createContext(sandbox);
vm.runInContext(code,sandbox);

function assert(name,cond){ if(!cond) throw new Error('FAIL '+name); console.log('OK',name); }
assert('dom_coins_init', String(coins.textContent).trim()==='100');
assert('dom_lives_init', String(lives.textContent).trim()==='10');
assert('status_init', String(status.textContent).trim()==='Build your defense!');
assert('buildBtn_exists', btn.textContent!==undefined);
console.log('SMOKE3_OK');
