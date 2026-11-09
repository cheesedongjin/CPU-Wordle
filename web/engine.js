'use strict';
const INITIAL = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];
const VOWELS = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅗㅏ','ㅗㅐ','ㅗㅣ','ㅛ','ㅜ','ㅜㅓ','ㅜㅔ','ㅜㅣ','ㅠ','ㅡ','ㅡㅣ','ㅣ'];
const FINAL = ['','ㄱ','ㄲ','ㄱㅅ','ㄴ','ㄴㅈ','ㄴㅎ','ㄷ','ㄹ','ㄹㄱ','ㄹㅁ','ㄹㅂ','ㄹㅅ','ㄹㅌ','ㄹㅍ','ㄹㅎ','ㅁ','ㅂ','ㅂㅅ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
function splitWord(text,lang){
  text=text.trim().normalize('NFC');
  if(lang==='en') return /^[a-z]*$/i.test(text)?[...text.toLowerCase()]:null;
  const out=[];
  for(const ch of text){const n=ch.codePointAt(0)-0xac00;if(n<0||n>=11172)return null;out.push(INITIAL[Math.floor(n/588)],...VOWELS[Math.floor(n%588/28)],...FINAL[n%28]);}
  return out;
}

function judge(answer, guess) {
  const result = guess.map((token, i) => token === answer[i] ? 2 : 0);
  const remaining = new Map();
  answer.forEach((token, i) => { if (result[i] !== 2) remaining.set(token, (remaining.get(token) || 0) + 1); });
  guess.forEach((token, i) => {
    if (result[i] === 0 && remaining.get(token) > 0) {
      result[i] = 1; remaining.set(token, remaining.get(token) - 1);
    }
  });
  return result;
}
// Stable word IDs: independent of dictionary ordering and selected settings.
function puzzleCode(language, word) {
  let hash = 2166136261;
  for (const char of word) hash = Math.imul(hash ^ char.codePointAt(0), 16777619) >>> 0;
  return `CW1-${language.toUpperCase()}-${hash.toString(16).padStart(8, '0').toUpperCase()}`;
}
function createPuzzles(data) {
  const puzzles = new Map();
  for (const language of ['ko', 'en']) for (const answer of data[language].answers) {
    const code = puzzleCode(language, answer);
    if (puzzles.has(code)) throw new Error('Duplicate puzzle code');
    puzzles.set(code, {code, language, answer, length: splitWord(answer, language).length});
  }
  return puzzles;
}
const MODES = {
  classic: {label: '기본', badge: 'CLASSIC', attempts: 6, description: '6번의 기회로 단어 하나를 찾아보세요.'},
  hacker: {label: '해커', badge: 'HACKER', attempts: 7, description: '7번의 기회 · 오답은 무작위 한 칸이 가려지고, 정답은 모두 공개됩니다.'},
  detective: {label: '탐정', badge: 'DETECTIVE', attempts: 7, description: '5칸 고정 · 후보 100개 · 공통 7번의 기회로 두 이름을 찾으세요.'}
};
// Fictional first-name candidates; independent of the general word dictionary.
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
function namePuzzles(language) {
  return NAMES[language].map(answer => ({answer, language, length: splitWord(answer, language).length, code: puzzleCode(language, answer)}));
}
function themedPuzzle(mode, first, second) {
  if (mode === 'classic') return {...first, mode};
  if (mode === 'hacker') return {...first, mode, code: first.code.replace('CW1-', 'CWH1-')};
  return {...first, mode, answers: [first.answer, second.answer], code: `CWD1-${first.language.toUpperCase()}-${first.code.split('-')[2]}-${second.code.split('-')[2]}`};
}
function resolvePuzzle(code, puzzles) {
  if (code.startsWith('CW1-')) return puzzles.get(code);
  if (code.startsWith('CWH1-')) { const p = puzzles.get(code.replace('CWH1-', 'CW1-')); return p && themedPuzzle('hacker', p); }
  const match = /^CWD1-(KO|EN)-([A-F0-9]{8})-([A-F0-9]{8})$/.exec(code);
  if (!match) return;
  const pool = namePuzzles(match[1].toLowerCase());
  const first = pool.find(p => p.code.endsWith(match[2])), second = pool.find(p => p.code.endsWith(match[3]));
  if (first && second && first.answer !== second.answer && first.length === second.length) return themedPuzzle('detective', first, second);
}
function submitGuess(game, word, random = Math.random) {
  if (game.status !== 'active') return;
  const tokens = splitWord(word, game.language);
  const answers = game.answers || [game.answer];
  const results = answers.map(answer => judge(splitWord(answer, game.language), tokens));
  game.solved = answers.map((answer, i) => game.solved?.[i] || answer === word);
  if (game.mode === 'hacker' && word !== game.answer) results[0][Math.floor(random() * tokens.length)] = -1;
  game.rows.push({tokens, tiles: results[0], results});
  game.won = game.solved.every(Boolean);
  if (game.won || game.rows.length >= MODES[game.mode || 'classic'].attempts) game.status = 'finished';
}
if (typeof module !== 'undefined') module.exports = {splitWord, judge, puzzleCode, createPuzzles, MODES, NAMES, namePuzzles, themedPuzzle, resolvePuzzle, submitGuess};
