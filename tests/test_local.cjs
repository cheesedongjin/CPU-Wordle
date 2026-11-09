const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {splitWord, judge, puzzleCode, createPuzzles} = require('../web/engine.js');
const data = vm.runInNewContext(fs.readFileSync('web/words.js','utf8') + '; WORDLE_DATA');
test('Korean decomposition and normalization', () => {
  assert.deepEqual(splitWord('사과','ko'), [...'ㅅㅏㄱㅗㅏ']);
  assert.deepEqual(splitWord('사과','ko'), splitWord('사과','ko'));
  assert.equal(splitWord('값이','ko').length,6);
  assert.equal(splitWord('꽈배기','ko').length,7);
  assert.equal(splitWord('괜찮다','ko').length,10);
  assert.equal(splitWord('abc가','ko'),null);
  assert.equal(splitWord('12345','en'),null);
});
test('Repeated letters are consumed after exact matches', () => {
  assert.deepEqual(judge([...'apple'],[...'allee']),[2,1,0,0,2]);
  assert.deepEqual(judge([...'apple'],[...'apple']),[2,2,2,2,2]);
});
test('Every code is unique, stable across dictionary ordering and resolves the same puzzle', () => {
  const first = createPuzzles(data);
  const second = createPuzzles(Object.fromEntries(['ko','en'].map(lang => [lang,{answers:[...data[lang].answers].reverse()}])));
  assert.equal(first.size,data.ko.answers.length+data.en.answers.length);
  for (const [code,puzzle] of first) {
    assert.deepEqual(second.get(code),puzzle);
    assert.ok(data[puzzle.language].allowed.includes(puzzle.answer));
    assert.equal(puzzleCode(puzzle.language,puzzle.answer),code);
  }
  assert.equal(puzzleCode('en','apple'),'CW1-EN-10BC2ABF');
  for(const lang of ['ko','en']) for(let n=5;n<=(lang==='ko'?12:8);n++) assert.ok([...first.values()].some(p=>p.language===lang&&p.length===n));
});
function browser() {
  class Element {
    constructor(){this.value='';this.dataset={};this.children=[];this.listeners={};this.classList={toggle(){},add(){}};}
    setAttribute(){} append(...nodes){this.children.push(...nodes);} replaceChildren(...nodes){this.children=nodes;}
    addEventListener(name,fn){this.listeners[name]=fn;} focus(){} select(){this.selected=true;} showModal(){} close(){}
    fire(name){return this.listeners[name]?.({preventDefault(){}});}
  }
  const elements = new Map([...fs.readFileSync('web/index.html','utf8').matchAll(/id="([^"]+)"/g)].map(match => [match[1],new Element()]));
  const context = vm.createContext({document:{body:new Element(),getElementById(id){if(!elements.has(id))throw new Error(`Missing element: ${id}`);return elements.get(id);},createElement(){return new Element();},querySelectorAll(){return [];}},navigator:{clipboard:{writeText:async text=>{context.copied=text;}}},setTimeout(){},clearTimeout(){}});
  for(const file of ['words','engine','app']) vm.runInContext(fs.readFileSync(`web/${file}.js`,'utf8'),context);
  return {elements,context,run:code=>vm.runInContext(code,context)};
}
test('Separate browsers open the same code; invalid inputs preserve attempts; win stops submissions', async () => {
  const a=browser(),b=browser();
  await a.elements.get('copy-code').fire('click');
  assert.equal(a.context.copied,a.run('state.game.code'));
  const apple=puzzleCode('en','apple');
  for(const page of [a,b]) {
    page.elements.get('shared-code').value=`  ${apple.toLowerCase()}  `;
    page.elements.get('code-form').fire('submit');
    assert.equal(page.run('state.game.answer'),'apple');
    page.elements.get('shared-code').value='BAD';page.elements.get('code-form').fire('submit');
    assert.equal(page.run('state.game.code'),apple);
    page.elements.get('guess').value='zzzzz';page.elements.get('guess-form').fire('submit');
    assert.equal(page.run('state.game.rows.length'),0);
    page.elements.get('guess').value='apple';page.elements.get('guess-form').fire('submit');
    assert.equal(page.run('state.game.won'),true);
    page.elements.get('guess-form').fire('submit');
    assert.equal(page.run('state.game.rows.length'),1);
  }
});
test('Six valid misses finish the game; IME composition does not submit', () => {
  const page=browser();
  page.elements.get('shared-code').value=puzzleCode('en','apple');page.elements.get('code-form').fire('submit');
  page.elements.get('guess').value='grape';page.elements.get('guess').fire('compositionstart');
  page.elements.get('guess-form').fire('submit');assert.equal(page.run('state.game.rows.length'),0);
  page.elements.get('guess').fire('compositionend');
  for(let n=0;n<6;n++){page.elements.get('guess').value='grape';page.elements.get('guess-form').fire('submit');}
  assert.equal(page.run('state.game.status'),'finished');assert.equal(page.run('state.game.won'),false);
});
test('Clipboard failure selects the code for manual copy', async () => {
  const page=browser();page.context.navigator.clipboard=undefined;
  await page.elements.get('copy-code').fire('click');assert.equal(page.elements.get('puzzle-code').selected,true);
});
const {namePuzzles, themedPuzzle, resolvePuzzle, submitGuess} = require('../web/engine.js');
test('Hacker hides one result for a miss and reveals every tile for the answer', () => {
  const game={mode:'hacker',language:'en',answer:'apple',rows:[],status:'active'};
  submitGuess(game,'grape',()=>0.4);
  assert.equal(game.rows[0].tiles.filter(v=>v===-1).length,1);
  assert.equal(game.rows[0].tiles[2],-1);
  submitGuess(game,'apple',()=>0.8);
  assert.equal(game.won,true);
  assert.equal(game.status,'finished');
  assert.deepEqual(game.rows[1].tiles,[2,2,2,2,2]);
});
test('Both special modes allow exactly seven attempts', () => {
  for(const mode of ['hacker','detective']){
    const game={mode,language:'en',answer:'alice',answers:mode==='detective'?['alice','james']:undefined,rows:[],status:'active'};
    for(let i=0;i<6;i++)submitGuess(game,'david');
    assert.equal(game.status,'active');
    submitGuess(game,'david'); assert.equal(game.status,'finished'); assert.equal(game.won,false);
    submitGuess(game,'alice'); assert.equal(game.rows.length,7);
  }
});
test('Detective retains the first solved identity and requires both names', () => {
  const game={mode:'detective',language:'en',answers:['alice','james'],rows:[],status:'active'};
  submitGuess(game,'alice');assert.deepEqual(game.solved,[true,false]);assert.equal(game.status,'active');
  assert.deepEqual(game.rows[0].results[1],judge([...'james'],[...'alice']));
  submitGuess(game,'james');assert.deepEqual(game.solved,[true,true]);assert.equal(game.won,true);
});
test('Theme codes round trip and detective pools always have pairs', () => {
  const puzzles=createPuzzles(data);
  const hacker=themedPuzzle('hacker',puzzles.get(puzzleCode('en','apple')));
  assert.deepEqual(resolvePuzzle(hacker.code,puzzles),hacker);
  for(const lang of ['ko','en']){
    const pool=namePuzzles(lang);
    assert.equal(pool.length,100);
    assert.equal(new Set(pool.map(p=>p.answer)).size,100);
    assert.ok(pool.every(p=>p.length===5));
    for(const first of pool){
      const second=pool.find(p=>p.length===first.length&&p.answer!==first.answer);
      assert.ok(second);
      const puzzle=themedPuzzle('detective',first,second);
      assert.deepEqual(resolvePuzzle(puzzle.code,puzzles),puzzle);
    }
  }
  assert.equal(resolvePuzzle('CWD1-EN-00000000-00000000',puzzles),undefined);
});
test('Theme UI shares both boards and excludes masked evidence from keyboard', () => {
  const page=browser();
  page.run("mode='detective';language='en';length=5;randomPuzzle()");
  assert.equal(page.elements.get('board').children.length,2);
  assert.equal(page.elements.get('progress').textContent,'0 / 7');
  page.run("$('guess').value=state.game.answers[0]");page.elements.get('guess-form').fire('submit');
  assert.equal(page.run('state.game.won'),false);
  page.run("$('guess').value=state.game.answers[1]");page.elements.get('guess-form').fire('submit');
  assert.equal(page.run('state.game.won'),true);
  page.run("start(themedPuzzle('hacker',puzzles.get(puzzleCode('en','apple'))));submitGuess(state.game,'grape',()=>0);render()");
  assert.equal(page.elements.get('board').children[0].children[0].children[0].textContent,'?');
  assert.ok(!JSON.parse(page.elements.get('keyboard').dataset.signature)[1].some(([token])=>token==='g'));
});

test('Detective settings force five tiles and restore length controls for other modes', () => {
  const page=browser();
  for(const lang of ['ko','en']){
    page.run(`language='${lang}';length=8;mode='detective';updateSettings();randomPuzzle()`);
    assert.equal(page.run('state.game.length'),5);
    assert.equal(page.elements.get('length').disabled,true);
    assert.equal(page.elements.get('length').children.length,1);
    assert.equal(page.elements.get('name-list').textContent.split(' · ').length,100);
  }
  page.run("mode='classic';updateSettings()");
  assert.equal(page.elements.get('length').disabled,false);
});

test('Changing a setting starts a new puzzle immediately and themes the page', () => {
  const page=browser();
  page.run("changeSettings(()=>{mode='hacker'})");
  assert.equal(page.run('state.game.mode'),'hacker');
  assert.equal(page.run('document.body.dataset.mode'),'hacker');
  page.run("changeSettings(()=>{language='en'})");
  assert.equal(page.run('state.game.language'),'en');
  page.run("changeSettings(()=>{length=7})");
  assert.equal(page.run('state.game.length'),7);
  const code=page.run('state.game.code');
  page.run("changeSettings(()=>{length=7})");
  assert.equal(page.run('state.game.code'),code);
  page.run("changeSettings(()=>{mode='detective'})");
  assert.equal(page.run('state.game.answers.length'),2);
  assert.equal(page.run('document.body.dataset.mode'),'detective');
});
