'use strict';
const $ = id => document.getElementById(id);
const puzzles = createPuzzles(WORDLE_DATA);
const allowed = Object.fromEntries(['ko', 'en'].map(lang => [lang, new Set(WORDLE_DATA[lang].allowed)]));
let mode = 'classic', language = 'ko', length = 5, state = null, composing = false, lastBoard = '', toastTimer;
function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
function message(text,error=false){$('game-message').textContent=text;$('game-message').classList.toggle('error',error);}

const HERO = {
  classic: {eyebrow: 'CLASSIC · 6 TRIES', title: '한 칸씩, 정답에 가까이.', copy: '익숙한 단어를 새로운 시선으로. 당신의 단어 감각을 깨워보세요.', color: '#2a2e49'},
  hacker: {eyebrow: 'HACKER · 7 TRIES · SIGNAL UNSTABLE', title: '깨진 신호 속 정답을 해독하라.', copy: '오답을 낼 때마다 한 칸이 손상됩니다. 남은 단서로 시스템을 뚫어보세요.', color: '#06110d'},
  detective: {eyebrow: 'DETECTIVE · 2 SUSPECTS · 100 NAMES', title: '두 개의 이름, 하나의 단서.', copy: '용의자 100명 중 두 사람을 7번 안에 찾아내세요. 한 번의 추리가 두 사건 모두에 흔적을 남깁니다.', color: '#1b1613'}
};
function availablePuzzles() { return mode === 'detective' ? namePuzzles(language) : [...puzzles.values()].filter(p => p.language === language); }
function updateSettings() {
  document.querySelectorAll('[data-mode]').forEach(button => {
    const selected = button.dataset.mode === mode;
    button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', selected);
  });
  document.querySelectorAll('[data-language]').forEach(button => {
    const selected = button.dataset.language === language;
    button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', selected);
  });
  const choices = [...new Set(availablePuzzles().map(p => p.length))].sort((a,b) => a-b);
  if (!choices.includes(length)) length = choices[0];
  $('length').replaceChildren(...choices.map(n => { const option = node('option', `${n}칸`); option.value = n; return option; }));
  $('length').value = length;
  $('length').disabled = mode === 'detective';
  $('length-label').textContent = language === 'ko' ? '자모 기준' : '알파벳 기준';
  $('pool-note').textContent = '설정을 바꾸면 바로 새 문제가 시작돼요.';
}
function start(puzzle) {
  mode = puzzle.mode || 'classic'; language = puzzle.language; length = puzzle.length;
  state = {game: {...puzzle, mode, status: 'active', rows: [], solved: []}};
  $('guess').value = ''; $('puzzle-code').value = puzzle.code;
  updateSettings(); render(); $('guess').focus({preventScroll: true});
}
function randomPuzzle() {
  const pool = availablePuzzles().filter(p => p.length === length);
  const first = pool[Math.floor(Math.random() * pool.length)];
  const others = pool.filter(p => p.answer !== first.answer);
  start(themedPuzzle(mode, first, others[Math.floor(Math.random() * others.length)]));
}

function applyTheme(theme) {
  if (document.body) document.body.dataset.mode = theme;
  const hero = HERO[theme];
  $('hero-eyebrow').textContent = hero.eyebrow; $('hero-title').textContent = hero.title; $('hero-copy').textContent = hero.copy;
  $('theme-color').setAttribute('content', hero.color);
}
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
  renderBoard(); renderKeyboard(); preview();
}
function renderBoard(){
  const g=state?.game,n=g?.length||length,rows=g?.rows||[];
  const preview=!g||g.status==='finished'?[]:splitWord($('guess').value,g.language)||[];
  const key=JSON.stringify([n,rows,preview,g?.status,g?.mode]);if(key===lastBoard)return;lastBoard=key;
  const board=$('board');board.className=g?.mode==='detective'?'detective-boards':'board-group';board.replaceChildren();
  for(let target=0;target<(g?.answers?.length||1);target++){
    const section=node('section',undefined,'board');section.setAttribute('style',`--cols:${n}`);
    if(g?.mode==='detective'){const solved=g.solved[target];const title=node('h3',undefined,`board-title${solved?' solved':''}`);title.append(node('span',`용의자 ${'AB'[target]}`),node('strong',solved?g.answers[target]:'미확인'));section.append(title);}
    for(let r=0;r<MODES[g?.mode||mode].attempts;r++){
      const row=node('div',undefined,'board-row');if(r===rows.length&&g?.status==='active')row.classList.add('current');
      for(let c=0;c<n;c++){
        const value=rows[r]?.tokens[c]??(r===rows.length?preview[c]:'')??'';
        const result=rows[r]?.results[target][c];
        const tile=node('span',result===-1?'?':value,'tile');
        if(rows[r]){tile.classList.add(result===-1?'corrupted':['absent','present','correct'][result]);tile.setAttribute('aria-label',result===-1?'오류: 판정 미공개':`${value}: ${['없는 글자','다른 위치에 있음','정확한 위치'][result]}`);}
        else if(value)tile.classList.add('filled');row.append(tile);
      }
      section.append(row);
    }
    board.append(section);
  }
}
function renderKeyboard(){
  const g=state?.game,lang=g?.language||language;
  const rows=lang==='ko'?['ㅂㅈㄷㄱㅅㅛㅕㅑㅐㅔ','ㅁㄴㅇㄹㅎㅗㅓㅏㅣ','ㅋㅌㅊㅍㅠㅜㅡ']:['qwertyuiop','asdfghjkl','zxcvbnm'];
  const shifted={'ㅂ':'ㅃ','ㅈ':'ㅉ','ㄷ':'ㄸ','ㄱ':'ㄲ','ㅅ':'ㅆ','ㅐ':'ㅒ','ㅔ':'ㅖ'};
  $('keyboard-target').hidden = g?.mode !== 'detective';
  const target = g?.mode === 'detective' ? Number($('keyboard-target').value || 0) : 0;
  const results=new Map();
  for(const row of g?.rows||[])row.tokens.forEach((token,i)=>{
    const result=row.results[target][i];
    if(result >= 0) results.set(token,Math.max(results.get(token)??-1,result));
  });
  const keyboard=$('keyboard');
  const signature=JSON.stringify([lang,[...results]]);
  if(keyboard.dataset.signature===signature)return;
  keyboard.dataset.signature=signature;
  keyboard.setAttribute('aria-label',`${lang==='ko'?'두벌식':'QWERTY'} 글자 사용 현황`);
  keyboard.replaceChildren();
  function keyLabel(token,extra=''){
    const result=results.get(token),status=['absent','present','correct'][result];
    const label=node('span',token.toUpperCase(),`keyboard-letter${extra}${status?' '+status:''}`);
    label.setAttribute('aria-label',`${token.toUpperCase()}: ${['없는 글자','다른 위치에 있음','정확한 위치'][result]||'아직 사용하지 않음'}`);
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
function preview(){const g=state?.game;const tokens=splitWord($('guess').value,g?.language||language);$('token-preview').textContent=$('guess').value?(tokens?tokens.join(' '):'완성된 단어를 입력하세요'):((g?.language||language)==='ko'?'사과 → ㅅ ㅏ ㄱ ㅗ ㅏ':'apple → a p p l e');$('token-count').textContent=`${tokens?.length||0} / ${g?.length||length}`;renderBoard();}

function changeSettings(update) {
  const before = JSON.stringify([mode, language, length]);
  update(); updateSettings();
  if (JSON.stringify([mode, language, length]) !== before) randomPuzzle();
}
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => changeSettings(() => {mode = button.dataset.mode;})));
$('keyboard-target').addEventListener('change', renderKeyboard);
$('start').addEventListener('click', randomPuzzle);
document.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click', () => changeSettings(() => {language = button.dataset.language;})));
$('length').addEventListener('change', () => changeSettings(() => {length = Number($('length').value);}));
$('code-form').addEventListener('submit', event => {
  event.preventDefault();
  const code = $('shared-code').value.trim().toUpperCase();
  const puzzle = resolvePuzzle(code, puzzles);
  if (!puzzle) { toast('문제 코드를 확인해 주세요. 예: CW1-KO-12345678'); return; }
  if (state?.game.code === code) { toast('지금 풀고 있는 문제입니다.'); return; }
  start(puzzle); $('shared-code').value = '';
});
$('copy-code').addEventListener('click', async () => {
  const code = state.game.code;
  try { await navigator.clipboard.writeText(code); toast('문제 코드를 복사했어요. 친구에게 보내 주세요.'); }
  catch { $('puzzle-code').focus(); $('puzzle-code').select(); toast('코드를 선택했어요. Ctrl+C 또는 길게 눌러 복사해 주세요.'); }
});
$('guess').addEventListener('compositionstart', () => {composing = true;});
$('guess').addEventListener('compositionend', () => {composing = false; preview();});
$('guess').addEventListener('input', preview);
$('guess-form').addEventListener('submit', event => {
  event.preventDefault();
  const g = state?.game;
  if (composing || !g || g.status !== 'active') return;
  const word = $('guess').value.trim().normalize('NFC').toLowerCase();
  const tokens = splitWord(word, g.language);
  if (!tokens || tokens.length !== g.length) {message(`${g.length}칸에 맞는 단어를 입력해 주세요.`, true); return;}
  if (!(g.mode === 'detective' ? NAMES[g.language].includes(word) : allowed[g.language].has(word))) {message(g.mode === 'detective' ? '후보 목록에 있는 이름을 입력해 주세요.' : '사전에 없는 단어입니다.', true); return;}
  submitGuess(g, word);
  $('guess').value = ''; render();
  if (g.status === 'active') $('guess').focus();
});
$('help-open').addEventListener('click', () => $('dialog').showModal());
$('dialog-close').addEventListener('click', () => $('dialog').close());
updateSettings(); randomPuzzle();
