'use strict';
// C 엔진(src/wordle.c → WebAssembly)을 불러와 JS에서 쓰기 쉬운 함수로 감쌉니다.
// 규칙 계산은 모두 C가 하고, 이 파일은 값 변환과 게임 데이터(이름 후보)만 맡습니다.
// 브라우저와 Node 테스트가 함께 씁니다.

const WASM_BASE64 = typeof WORDLE_WASM === 'string' ? WORDLE_WASM : require('./wordle_wasm.js');
const wasm = new WebAssembly.Instance(new WebAssembly.Module(Uint8Array.from(atob(WASM_BASE64), c => c.charCodeAt(0)))).exports;
const CAPACITY = wasm.wd_capacity();
// 번호는 src/wordle.h의 enum과 같아야 합니다.
const LANG = {ko: 0, en: 1}, LANG_NAME = ['ko', 'en'];
const MODE_ID = {classic: 0, hacker: 1, detective: 2}, MODE_NAME = ['classic', 'hacker', 'detective'];
const FINISHED = 1 << 8, WON = 1 << 9;

// C의 입력 버퍼에 숫자들을 쓰고 개수를 돌려줍니다. 버퍼보다 길면 -1.
function put(values) {
  if (values.length > CAPACITY) return -1;
  new Uint32Array(wasm.memory.buffer, wasm.wd_in(), values.length).set(values);
  return values.length;
}
const take = count => [...new Int32Array(wasm.memory.buffer, wasm.wd_out(), count)];
const codePoints = text => Array.from(text, ch => ch.codePointAt(0));

// 단어를 칸(자모 또는 알파벳) 배열로 바꿉니다. 허용되지 않는 글자가 있으면 null.
function splitWord(text, lang) {
  const len = put(codePoints(text.normalize('NFC'))); // NFC 정규화만 JS에서 처리
  const count = len < 0 ? -1 : wasm.wd_split(len, LANG[lang]);
  return count < 0 ? null : take(count).map(c => String.fromCodePoint(c));
}
// 판정: 2 = 글자·위치 일치, 1 = 글자만 일치, 0 = 없음
function judge(answer, guess) {
  put([...answer, ...guess].map(t => t.codePointAt(0)));
  wasm.wd_judge(guess.length);
  return take(guess.length);
}
const wordId = word => wasm.wd_hash(put(codePoints(word))) >>> 0;
function makeCode(mode, lang, id1, id2 = 0) {
  return String.fromCharCode(...take(wasm.wd_code(MODE_ID[mode], LANG[lang], id1, id2)));
}
function puzzleCode(language, word) { return makeCode('classic', language, wordId(word)); }

// 출제 목록 전체를 코드 → 문제 맵으로 만듭니다. 해시가 겹치면 바로 실패시킵니다.
function createPuzzles(data) {
  const puzzles = new Map();
  for (const language of ['ko', 'en']) for (const answer of data[language].answers) {
    const code = puzzleCode(language, answer);
    if (puzzles.has(code)) throw new Error('Duplicate puzzle code');
    puzzles.set(code, {code, language, answer, length: splitWord(answer, language).length});
  }
  return puzzles;
}
// 모드별 화면 문구. 기회 수는 C(wd_attempts)에서 가져옵니다.
const MODES = {
  classic: {label: '기본', badge: 'CLASSIC', attempts: wasm.wd_attempts(0), description: '6번의 기회로 단어 하나를 찾아보세요.'},
  hacker: {label: '해커', badge: 'HACKER', attempts: wasm.wd_attempts(1), description: '7번의 기회 · 오답은 무작위 한 칸이 가려지고, 정답은 모두 공개됩니다.'},
  detective: {label: '탐정', badge: 'DETECTIVE', attempts: wasm.wd_attempts(2), description: '5칸 고정 · 이름 후보 100개 · 7번 안에 두 이름 찾기'}
};
// 탐정 모드용 가상의 이름 후보. 일반 단어 사전과 따로 관리합니다.
const NAMES = {
  ko: [
    '민수','민지','지민','수민','민아','하린','서진','유진','수진','서윤',
    '지윤','하윤','서연','서현','서영','서준','서율','서인','서경','지연',
    '지영','지안','지은','수연','수영','수경','수한','민서','민호','민우',
    '하은','하람','하연','하랑','유민','유림','유현','유찬','도윤','도영',
    '도경','도희','예린','예은','예준','예솔','다인','다연','다빈','다솜',
    '다윤','시현','시연','시훈','준서','준우','준하','현우','현지','현호',
    '은서','은수','은재','은하','태현','태준','태희','태양','나은','나현',
    '나희','나린','소영','소윤','소율','소은','재현','재희','재인','재은',
    '주영','주은','주빈','성호','성재','아린','아인','보민','채영','채윤',
    '채희','가은','가현','가온','가희','건우','우빈','우영','연우','연수'
  ],
  en: [
    'alice','james','david','sarah','henry','grace','clara','peter','oscar','emily',
    'lucas','julia','aaron','ethan','logan','chloe','aiden','allen','amber','angel',
    'ariel','avery','blair','brady','bruce','caleb','carlo','casey','celia','chris',
    'clark','conor','daisy','derek','diane','donna','drake','edith','elena','elise',
    'ellis','elsie','erica','ernie','fiona','flynn','freya','gemma','grant','haley',
    'heath','holly','irene','jaden','janet','jason','jenny','jimmy','jorge','judah',
    'karen','keith','kenny','kiara','lance','layla','leroy','linda','louis','lydia',
    'maria','mario','mateo','miles','naomi','olive','paola','patsy','pedro','quinn',
    'raven','renee','robin','roman','rowan','sadie','sandy','selma','shawn','sofia',
    'stacy','susan','tanya','tessa','tonya','trent','vance','vince','wally','wendy'
  ]
};
// 이름 후보를 일반 문제와 같은 형태로 만듭니다.
function namePuzzles(language) {
  return NAMES[language].map(answer => ({answer, language, length: splitWord(answer, language).length, code: puzzleCode(language, answer)}));
}
// 기본 문제를 모드에 맞게 바꿉니다. 코드 형식은 C(wd_code)가 정합니다.
function themedPuzzle(mode, first, second) {
  if (mode === 'classic') return {...first, mode};
  if (mode === 'hacker') return {...first, mode, code: makeCode('hacker', first.language, wordId(first.answer))};
  return {...first, mode, answers: [first.answer, second.answer], code: makeCode('detective', first.language, wordId(first.answer), wordId(second.answer))};
}
// 공유받은 코드를 문제로 되돌립니다. 형식 검사는 C(wd_parse), 단어 찾기는 여기서 합니다.
function resolvePuzzle(code, puzzles) {
  const len = put(codePoints(code));
  if (len < 0 || !wasm.wd_parse(len)) return;
  const [modeId, langId, id1, id2] = take(4), mode = MODE_NAME[modeId], language = LANG_NAME[langId];
  if (mode !== 'detective') {
    const puzzle = puzzles.get(makeCode('classic', language, id1 >>> 0));
    return puzzle && themedPuzzle(mode, puzzle);
  }
  const pool = namePuzzles(language);
  const first = pool.find(p => wordId(p.answer) === id1 >>> 0), second = pool.find(p => wordId(p.answer) === id2 >>> 0);
  if (first && second && first.answer !== second.answer && first.length === second.length) return themedPuzzle('detective', first, second);
}
// 추측 한 번 처리. 판정·가림·승패는 C(wd_play)가 정하고, 결과를 game 객체에 기록합니다.
function submitGuess(game, word, random = Math.random) {
  if (game.status !== 'active') return;
  const tokens = splitWord(word, game.language), answers = game.answers || [game.answer], n = tokens.length;
  put([...answers.flatMap(answer => splitWord(answer, game.language)), ...tokens].map(t => t.codePointAt(0)));
  const solvedMask = answers.reduce((mask, _, i) => game.solved?.[i] ? mask | 1 << i : mask, 0);
  const status = wasm.wd_play(MODE_ID[game.mode || 'classic'], n, answers.length, game.rows.length, solvedMask, random());
  const flat = take(answers.length * n), results = answers.map((_, i) => flat.slice(i * n, (i + 1) * n));
  game.solved = answers.map((_, i) => Boolean(status & 1 << i));
  game.rows.push({tokens, tiles: results[0], results});
  game.won = Boolean(status & WON);
  if (status & FINISHED) game.status = 'finished';
}
// 사용한 글자 집계(C의 wd_keyboard). target번째 정답 기준으로 글자 → 가장 좋은 판정 맵을 돌려줍니다.
function keyboardStatus(rows, target) {
  const tokens = rows.flatMap(row => row.tokens), results = rows.flatMap(row => row.results[target]);
  if (put([...tokens.map(t => t.codePointAt(0)), ...results]) < 0) return new Map();
  const pairs = take(wasm.wd_keyboard(tokens.length) * 2);
  const map = new Map();
  for (let i = 0; i < pairs.length; i += 2) map.set(String.fromCodePoint(pairs[i]), pairs[i + 1]);
  return map;
}
// Node 테스트에서 불러올 수 있도록 내보냅니다.
if (typeof module !== 'undefined') module.exports = {splitWord, judge, puzzleCode, createPuzzles, MODES, NAMES, namePuzzles, themedPuzzle, resolvePuzzle, submitGuess, keyboardStatus};
