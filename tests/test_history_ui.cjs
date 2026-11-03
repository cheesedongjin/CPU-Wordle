const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.dataset = {}; this.events = {}; this.isConnected = true; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; }
  setAttribute(key,value) { this.attributes[key] = value; }
  addEventListener(key,fn) { this.events[key] = fn; }
}
const context = vm.createContext({document:{createElement:tag=>new Element(tag)}});
const source = fs.readFileSync('web/app.js','utf8').split('function connectSocket()')[0];
vm.runInContext(source,context);
const puzzle = {round:1,answer:'water',rows:[{tokens:[...'sword'],tiles:[0,1,0,1,0]},{tokens:[...'water'],tiles:[2,2,2,2,2]}]};
context.puzzle = puzzle;
const board = vm.runInContext('historyBoard(puzzle,5)',context).children[1];
assert.equal(board.children.length,6);
assert.ok(board.children.every(row=>row.children.length===5));
assert.equal(board.children[0].children[1].className,'tile present');
assert.equal(board.children[0].children[0].className,'tile absent');
assert.equal(board.children[1].children[4].className,'tile correct');
assert.match(board.children[1].children[4].attributes['aria-label'],/정확한 위치/);
assert.equal(board.children[2].children[0].textContent,'');
assert.equal(vm.runInContext('historyBoard({round:1,answer:"한글",rows:[]},12)',context).children[1].children[0].children.length,12);
(async()=>{
  context.records=[{mode:0,lang:1,length:5,guesses:2,points:100,outcome:'won',ended_at:'2026-11-03T00:00:00Z',history:[puzzle]}, {mode:0,lang:0,length:5,guesses:1,points:0,outcome:'lost',ended_at:'2026-11-03T00:00:00Z',history:null}];
  context.box=new Element('div');
  vm.runInContext('api=async()=>records',context);
  await vm.runInContext('loadHistory(box)',context);
  const [current,legacy]=context.box.children;
  assert.equal(current.children.length,1);
  current.open=true;current.events.toggle();current.events.toggle();
  assert.equal(current.children.length,2,'lazy replay renders only once');
  legacy.open=true;legacy.events.toggle();
  assert.match(legacy.children[1].textContent,/상세 시도 기록이 없습니다/);
  context.records=[];await vm.runInContext('loadHistory(box)',context);
  assert.match(context.box.children[0].textContent,/아직 기록이 없어요/);
  console.log('PASS: replay colors, six rows, long boards, accessible labels, lazy rendering, legacy and empty history');
})().catch(e=>{console.error(e);process.exitCode=1;});
