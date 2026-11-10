'use strict';
// 화면 그리기와 이벤트 처리. 규칙은 C 엔진(src/wordle.c)에 있고 engine.js가 연결합니다.
// 전체를 함수 안에 두어 puzzles·state 같은 변수가 콘솔에서 전역으로 보이지 않게 합니다.
(() => {
const $ = id => document.getElementById(id);
const puzzles = createPuzzles(decodeAnswers(WORDLE_DATA));
const allowed = Object.fromEntries(['ko', 'en'].map(lang => [lang, new Set(WORDLE_DATA[lang].allowed)]));
// 현재 설정과 진행 중인 게임
let mode = 'classic', language = 'ko', length = 5, state = null, composing = false, lastBoard = '', toastTimer;
function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
function message(text,error=false){$('game-message').textContent=text;$('game-message').classList.toggle('error',error);}

// 모드별 상단 문구와 브라우저 테마 색
const HERO = {
  classic: {eyebrow: 'CLASSIC · 6번의 기회', title: '단어 하나를 6번 안에 맞히세요', copy: '초록은 글자와 위치 일치, 노랑은 글자만 일치, 회색은 없는 글자입니다.', color: '#2a2e49'},
  hacker: {eyebrow: 'HACKER · 7번의 기회', title: '오답마다 한 칸의 판정이 가려집니다', copy: '가려진 칸은 줄무늬로 표시되고 입력한 글자만 보입니다. 정답을 맞히면 모두 공개됩니다.', color: '#06110d'},
  detective: {eyebrow: 'DETECTIVE · 7번의 기회', title: '이름 후보 100개 중 두 개를 찾으세요', copy: '한 번 입력하면 두 보드에 동시에 판정됩니다.', color: '#1b1613'}
};
const MAX_LENGTH = 7; // 사전에는 더 긴 단어도 있지만 선택지는 7칸까지
function availablePuzzles() { return mode === 'detective' ? namePuzzles(language) : [...puzzles.values()].filter(p => p.language === language); }
// 설정 버튼과 길이 목록을 현재 mode/language/length에 맞춥니다.
function updateSettings() {
  document.querySelectorAll('[data-mode]').forEach(button => {
    const selected = button.dataset.mode === mode;
    button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', selected);
  });
  document.querySelectorAll('[data-language]').forEach(button => {
    const selected = button.dataset.language === language;
    button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', selected);
  });
  const choices = [...new Set(availablePuzzles().map(p => p.length))].filter(n => n <= MAX_LENGTH).sort((a,b) => a-b);
  if (!choices.includes(length)) length = choices[0];
  $('length').replaceChildren(...choices.map(n => { const option = node('option', `${n}칸`); option.value = n; return option; }));
  $('length').value = length;
  $('length').disabled = mode === 'detective';
  $('length-label').textContent = language === 'ko' ? '자모 기준' : '알파벳 기준';
  $('pool-note').textContent = '설정을 바꾸면 바로 새 문제가 시작돼요.';
}
// 새 게임 시작. 공유 코드로 연 문제면 그 모드·언어·길이를 따릅니다.
function start(puzzle) {
  mode = puzzle.mode || 'classic'; language = puzzle.language; length = puzzle.length;
  state = {game: {...puzzle, mode, status: 'active', rows: [], solved: []}};
  $('guess').value = ''; $('puzzle-code').value = puzzle.code;
  updateSettings(); render(); $('guess').focus({preventScroll: true});
}
// 같은 길이 후보에서 무작위로 고릅니다. 탐정 모드는 서로 다른 두 번째 이름도 뽑습니다.
function randomPuzzle() {
  const pool = availablePuzzles().filter(p => p.length === length);
  const first = pool[Math.floor(Math.random() * pool.length)];
  const others = pool.filter(p => p.answer !== first.answer);
  start(themedPuzzle(mode, first, others[Math.floor(Math.random() * others.length)]));
}

// body의 data-mode로 페이지 전체 테마를 바꿉니다.
function applyTheme(theme) {
  if (document.body) document.body.dataset.mode = theme;
  const hero = HERO[theme];
  $('hero-eyebrow').textContent = hero.eyebrow; $('hero-title').textContent = hero.title; $('hero-copy').textContent = hero.copy;
  $('theme-color').setAttribute('content', hero.color);
}
// 게임 상태 전체를 화면에 반영합니다.
function render() {
  const g = state?.game, active = g?.status === 'active';
  $('game-language').textContent = `${(g?.language || language) === 'ko' ? '한글' : '영어'} · ${g?.length || length}칸`;
  $('progress').textContent = `${g?.rows.length || 0} / ${MODES[g?.mode || mode].attempts}`;
  $('mode-pill').textContent = MODES[g?.mode || mode].badge;
  applyTheme(g?.mode || mode);
  $('mode-description').textContent = MODES[g?.mode || mode].description;
  $('name-candidates').hidden = g?.mode !== 'detective';
  $('name-list').textContent = g?.mode === 'detective' ? namePuzzles(g.language).filter(p => p.length === g.length).map(p => p.answer).join(' · ') : '';
  $('hidden-legend').hidden = g?.mode !== 'hacker';
  $('guess').disabled = $('submit').disabled = !active;
  $('guess').placeholder = (g?.language || language) === 'ko' ? '완성된 단어를 입력하세요' : 'Enter an English word';
  $('result').hidden = !g || active;
  if (g && !active) $('result').replaceChildren(node('h3', g.won ? '정답입니다!' : '기회를 모두 사용했어요.'), node('p', `정답은 ${(g.answers || [g.answer]).map(a => `‘${a}’`).join(', ')}`));
  message(active ? (g.mode === 'detective' ? `두 사람의 이름을 찾아보세요. (${g.solved.filter(Boolean).length}/2명 확인)` : '단어를 입력해 정답을 찾아보세요.') : '새 문제를 만들거나 친구의 문제 코드를 입력하세요.');
  renderBoard(); renderKeyboard(); preview(); fitBoard();
}
// 보드를 그립니다. 입력할 때마다 불리므로 상태가 같으면 건너뜁니다.
function renderBoard(){
  const g=state?.game,n=g?.length||length,rows=g?.rows||[];
  const preview=!g||g.status==='finished'?[]:splitWord($('guess').value,g.language)||[];
  const key=JSON.stringify([n,rows,preview,g?.status,g?.mode]);if(key===lastBoard)return;lastBoard=key;
  const board=$('board');board.className=g?.mode==='detective'?'detective-boards':'board-group';board.replaceChildren();
  for(let target=0;target<(g?.answers?.length||1);target++){
    const section=node('section',undefined,'board');section.setAttribute('style',`--cols:${n}`);
    if(g?.mode==='detective'){const solved=g.solved[target];const title=node('h3',undefined,`board-title${solved?' solved':''}`);title.append(node('span',`인물 ${'AB'[target]}`),node('strong',solved?g.answers[target]:'미확인'));section.append(title);}
    for(let r=0;r<MODES[g?.mode||mode].attempts;r++){
      const row=node('div',undefined,'board-row');if(r===rows.length&&g?.status==='active')row.classList.add('current');
      // 제출한 줄은 판정 색, 현재 줄은 입력 미리보기, -1은 해커 모드의 가린 칸
      for(let c=0;c<n;c++){
        const value=rows[r]?.tokens[c]??(r===rows.length?preview[c]:'')??'';
        const result=rows[r]?.results[target][c];
        const tile=node('span',value,'tile');
        if(rows[r]){tile.classList.add(result===-1?'corrupted':['absent','present','correct'][result]);tile.setAttribute('aria-label',result===-1?`${value}: 판정 미공개`:`${value}: ${['없는 글자','다른 위치에 있음','정확한 위치'][result]}`);}
        else if(value)tile.classList.add('filled');row.append(tile);
      }
      section.append(row);
    }
    board.append(section);
  }
}
// 보드·입력칸·키보드가 한 화면에 들어올 때까지 칸 크기(--tile)를 줄입니다.
function fitBoard(){
  const board=$('board'),game=$('game-theme');
  if(typeof innerHeight!=='number'||!board.getBoundingClientRect)return;
  const docTop=el=>el.getBoundingClientRect().top+scrollY,docBottom=el=>el.getBoundingClientRect().bottom+scrollY;
  const wrap=document.querySelector('.board-wrap'),keys=document.querySelector('.keyboard-status');
  const rows=MODES[state?.game?.mode||mode].attempts,topbar=document.querySelector('.topbar').offsetHeight;
  board.style.setProperty('--tile','60px');
  const first=board.querySelector('.tile');if(!first)return;
  let tile=Math.min(60,Math.floor(first.getBoundingClientRect().width));
  const gameTop=docTop(game);
  let avail=innerHeight-12-gameTop;
  if(avail<420)avail=innerHeight-topbar-20; // 위쪽 메뉴가 너무 크면 스크롤한 상태 기준으로 맞춤
  const need=()=>Math.max(docBottom(wrap),docBottom(keys))-gameTop;
  for(let i=0;i<5;i++){
    board.style.setProperty('--tile',tile+'px');
    const over=need()-avail;
    if(over<=0||tile<=26)break;
    tile=Math.max(26,tile-Math.ceil(over/rows));
  }
  board.style.setProperty('--tile',tile+'px');
}
const STATUS=['absent','present','correct'],STATUS_TEXT=['없는 글자','다른 위치에 있음','정확한 위치'];
// 사용한 글자 키보드를 그립니다.
function renderKeyboard(){
  const g=state?.game,lang=g?.language||language,split=g?.mode==='detective';
  const rows=lang==='ko'?['ㅂㅈㄷㄱㅅㅛㅕㅑㅐㅔ','ㅁㄴㅇㄹㅎㅗㅓㅏㅣ','ㅋㅌㅊㅍㅠㅜㅡ']:['qwertyuiop','asdfghjkl','zxcvbnm'];
  const shifted={'ㅂ':'ㅃ','ㅈ':'ㅉ','ㄷ':'ㄸ','ㄱ':'ㄲ','ㅅ':'ㅆ','ㅐ':'ㅒ','ㅔ':'ㅖ'};
  $('keyboard-split-note').hidden=!split;
  // 집계는 C(wd_keyboard)가 합니다. 탐정 모드는 인물별로 따로 집계해 키 하나를 반반 칠합니다.
  const results=(split?[0,1]:[0]).map(target=>keyboardStatus(g?.rows||[],target));
  const keyboard=$('keyboard');
  const signature=JSON.stringify([lang,...results.map(map=>[...map])]);
  if(keyboard.dataset.signature===signature)return;
  keyboard.dataset.signature=signature;
  keyboard.setAttribute('aria-label',`${lang==='ko'?'두벌식':'QWERTY'} 글자 사용 현황`);
  keyboard.replaceChildren();
  function keyLabel(token,extra=''){
    const values=results.map(map=>map.get(token));
    const label=node('span',token.toUpperCase(),`keyboard-letter${extra}`);
    if(split){
      const [a,b]=values.map(v=>STATUS[v]||'unused');
      label.classList.add('split',`a-${a}`,`b-${b}`);
      label.setAttribute('aria-label',`${token.toUpperCase()}: 인물 A ${STATUS_TEXT[values[0]]||'아직 사용하지 않음'}, 인물 B ${STATUS_TEXT[values[1]]||'아직 사용하지 않음'}`);
    }else{
      if(STATUS[values[0]])label.classList.add(STATUS[values[0]]);
      label.setAttribute('aria-label',`${token.toUpperCase()}: ${STATUS_TEXT[values[0]]||'아직 사용하지 않음'}`);
    }
    return label;
  }
  for(const letters of rows){
    const row=node('div',undefined,'keyboard-row');
    for(const token of letters){
      const key=node('div',undefined,'keyboard-key');
      if(lang==='ko'&&shifted[token])key.append(keyLabel(shifted[token],' keyboard-shift'));
      key.append(keyLabel(token));row.append(key);
    }
    keyboard.append(row);
  }
}
// 입력 중인 단어를 칸 단위로 미리 보여 줍니다.
function preview(){const g=state?.game;const tokens=splitWord($('guess').value,g?.language||language);$('token-preview').textContent=$('guess').value?(tokens?tokens.join(' '):'완성된 단어를 입력하세요'):((g?.language||language)==='ko'?'사과 → ㅅ ㅏ ㄱ ㅗ ㅏ':'apple → a p p l e');$('token-count').textContent=`${tokens?.length||0} / ${g?.length||length}`;renderBoard();}

// 설정이 실제로 바뀌었을 때만 새 문제를 시작합니다.
function changeSettings(update) {
  const before = JSON.stringify([mode, language, length]);
  update(); updateSettings();
  if (JSON.stringify([mode, language, length]) !== before) randomPuzzle();
}
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => changeSettings(() => {mode = button.dataset.mode;})));
$('start').addEventListener('click', randomPuzzle);
document.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click', () => changeSettings(() => {language = button.dataset.language;})));
$('length').addEventListener('change', () => changeSettings(() => {length = Number($('length').value);}));
$('code-form').addEventListener('submit', event => {
  event.preventDefault();
  const code = $('shared-code').value.trim().toUpperCase();
  const puzzle = resolvePuzzle(code, puzzles);
  if (!puzzle) { toast('문제 코드를 확인해 주세요. 예: CW2-KO-12345678'); return; }
  if (state?.game.code === code) { toast('지금 풀고 있는 문제입니다.'); return; }
  start(puzzle); $('shared-code').value = '';
});
$('copy-code').addEventListener('click', async () => {
  const code = state.game.code;
  try { await navigator.clipboard.writeText(code); toast('문제 코드를 복사했어요. 친구에게 보내 주세요.'); }
  catch { // 클립보드를 쓸 수 없으면 직접 복사하도록 코드를 선택해 둠
    $('puzzle-code').focus(); $('puzzle-code').select(); toast('코드를 선택했어요. Ctrl+C 또는 길게 눌러 복사해 주세요.'); }
});
$('guess').addEventListener('compositionstart', () => {composing = true;});
$('guess').addEventListener('compositionend', () => {composing = false; preview();});
$('guess').addEventListener('input', preview);
$('guess-form').addEventListener('submit', event => {
  event.preventDefault();
  const g = state?.game;
  if (composing || !g || g.status !== 'active') return; // 한글 조합 중에는 제출하지 않음
  const word = $('guess').value.trim().normalize('NFC').toLowerCase();
  const tokens = splitWord(word, g.language);
  // 칸 수와 사전 확인을 통과해야 기회가 차감됩니다.
  if (!tokens || tokens.length !== g.length) {message(`${g.length}칸에 맞는 단어를 입력해 주세요.`, true); return;}
  if (!(g.mode === 'detective' ? NAMES[g.language].includes(word) : allowed[g.language].has(word))) {message(g.mode === 'detective' ? '후보 목록에 있는 이름을 입력해 주세요.' : '사전에 없는 단어입니다.', true); return;}
  submitGuess(g, word);
  $('guess').value = ''; render();
  if (g.status === 'active') $('guess').focus();
});
if(typeof addEventListener==='function')addEventListener('resize',fitBoard);
// 이름 후보 목록은 바깥을 클릭하거나 Esc를 누르면 닫습니다.
if(typeof addEventListener==='function'){
  addEventListener('click',event=>{if(!$('name-candidates').contains(event.target))$('name-candidates').open=false;});
  addEventListener('keydown',event=>{if(event.key==='Escape')$('name-candidates').open=false;});
}
$('help-open').addEventListener('click', () => $('dialog').showModal());
$('dialog-close').addEventListener('click', () => $('dialog').close());
updateSettings(); randomPuzzle();
// Node 테스트(tests/test_local.cjs)만 이 훅을 미리 정의해 내부 상태를 확인합니다.
if (typeof WORDLE_TEST_HOOK === 'function') WORDLE_TEST_HOOK(code => eval(code));
})();
