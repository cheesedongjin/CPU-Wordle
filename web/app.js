'use strict';
const $ = (id) => document.getElementById(id);
const LABELS = ['클래식', '타임어택', '실시간 대전'];
const STATE_LABELS = {won:'승리',lost:'실패',draw:'무승부',finished:'완료',abandoned:'중도 종료',invalidated:'무효 경기'};
const INITIAL = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];
const VOWELS = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅗㅏ','ㅗㅐ','ㅗㅣ','ㅛ','ㅜ','ㅜㅓ','ㅜㅔ','ㅜㅣ','ㅠ','ㅡ','ㅡㅣ','ㅣ'];
const FINAL = ['','ㄱ','ㄲ','ㄱㅅ','ㄴ','ㄴㅈ','ㄴㅎ','ㄷ','ㄹ','ㄹㄱ','ㄹㅁ','ㄹㅂ','ㄹㅅ','ㄹㅌ','ㄹㅍ','ㄹㅎ','ㅁ','ㅂ','ㅂㅅ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
let config, state, language='ko', mode=0, length=5, busy=false, composing=false, receivedAt=0, ws, syncTimer, pending=null, lastBoard='', lastGame='', lastPuzzle='', toastTimer, errorUntil=0;
function splitWord(text,lang=language){
  text=text.trim().normalize('NFC');
  if(lang==='en') return /^[a-z]*$/i.test(text)?[...text.toLowerCase()]:null;
  const out=[];
  for(const ch of text){const n=ch.codePointAt(0)-0xac00;if(n<0||n>=11172)return null;out.push(INITIAL[Math.floor(n/588)],...VOWELS[Math.floor(n%588/28)],...FINAL[n%28]);}
  return out;
}
function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
function message(text,error=false){if(error)errorUntil=Date.now()+4000;else if(Date.now()<errorUntil)return;$('game-message').textContent=text;$('game-message').classList.toggle('error',error);}
function connected(ok,text){$('connection-dot').className=`dot ${ok?'online':'offline'}`;$('connection-text').textContent=text;}
async function api(path,body){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
  try{const response=await fetch(`/api/${path}`,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:controller.signal});const data=await response.json();if(!response.ok){const e=new Error(data.message||'요청을 처리하지 못했습니다.');e.status=response.status;throw e;}return data;}
  finally{clearTimeout(timer);}
}
function apply(data){
  if(!data||!('game' in data))return;
  if(state?.boot_id===data.boot_id&&state&&data.sequence<state.sequence)return;
  if(state?.boot_id&&state.boot_id!==data.boot_id&&state.game?.status!=='finished'&&state.game)toast('서버가 재시작되어 진행 중 게임이 종료되었습니다. 완료된 기록은 보존됩니다.');
  state=data;receivedAt=performance.now();$('nickname').textContent=data.nickname;
  const g=data.game;
  if(g&&g.id!==lastGame){lastGame=g.id;lastPuzzle=g.puzzle_id;$('guess').value='';language=g.language;length=g.length;mode=g.mode;updateSettings();}
  if(g&&g.puzzle_id!==lastPuzzle){lastPuzzle=g.puzzle_id;$('guess').value='';if(g.previous_answer)toast(`이전 정답: ${g.previous_answer} · 다음 단어를 맞혀보세요.`);}
  render();
}
async function action(path,body={}){
  if(busy)return;
  if(pending&&(pending.path!==path||JSON.stringify(pending.input)!==JSON.stringify(body))){toast('먼저 이전 요청의 처리를 확인해 주세요. 같은 동작을 다시 눌러 재시도할 수 있습니다.');return;}
  busy=true;renderControls();
  const req=pending||{path,input:body,body:{...body,request_id:crypto.randomUUID()}};pending=req;
  try{const data=await api(path,req.body);pending=null;if(path==='guess')$('guess').value='';apply(data);connected(true,'서버와 연결되었습니다');if(path==='guess'&&data.last_guess)toast(data.game?.status==='finished'?'타임어택을 완료했습니다!':data.last_guess.solved?'정답! 다음 문제로 이어갑니다.':'6번의 기회를 사용했어요. 다음 문제로 이어갑니다.');return data;}
  catch(e){if(e.status)pending=null;message(e.status?e.message:'연결이 지연되고 있습니다. 같은 버튼을 눌러 안전하게 재시도하세요.',true);toast(e.status?e.message:'서버가 깨어나는 중일 수 있습니다. 잠시 후 같은 요청을 다시 시도하세요.');}
  finally{busy=false;renderControls();if(state?.game?.status==='active')$('guess').focus();}
}
function updateSettings(){
  document.querySelectorAll('[data-language]').forEach(b=>{const on=b.dataset.language===language;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',on);});
  document.querySelectorAll('[data-mode]').forEach(b=>{const on=Number(b.dataset.mode)===mode;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',on);});
  if(config){const choices=config.languages[language];if(!choices.some(c=>c.length===length))length=choices[0].length;$('length').replaceChildren(...choices.map(c=>{const o=node('option',`${c.length}칸`);o.value=c.length;return o;}));$('length').value=length;const count=choices.find(c=>c.length===length).answers;$('pool-note').textContent=`선정된 출제 단어 ${count}개${mode===1?' · 세션 내 중복 출제 없음':''}`;}
  $('length-label').textContent=language==='ko'?'자모 기준':'알파벳 기준';
}
function renderControls(){
  const g=state?.game,active=g&&g.status!=='finished',queued=state?.queued;
  $('settings-fields').disabled=!!(active||queued||busy||pending);
  $('start').disabled=!state||busy||!!active||!!queued;
  $('start').replaceChildren(node('span',queued?'상대를 찾는 중…':active?'게임 진행 중':g?.status==='finished'?'다시 도전하기':mode===2?'상대 찾기':'게임 시작'),node('span','→'));
  $('abandon').hidden=!active;$('abandon').disabled=busy;
  const canGuess=active&&g.status==='active'&&!g.exhausted&&!queued;
  $('guess').disabled=!canGuess||busy;
  $('submit').disabled=!canGuess||busy;
  $('guess').placeholder=language==='ko'?'완성된 단어를 입력하세요':'Enter an English word';
}
function renderBoard(){
  const g=state?.game,n=g?.length||length,rows=g?.rows||[];
  const preview=!g||g.status==='finished'?[]:splitWord($('guess').value,g.language)||[];
  const key=JSON.stringify([n,rows,preview,g?.status]);if(key===lastBoard)return;lastBoard=key;
  const board=$('board');board.className=`board${n>6?' long':''}`;board.replaceChildren();
  for(let r=0;r<6;r++){const row=node('div',undefined,'board-row');if(r===rows.length&&g?.status==='active')row.classList.add('current');for(let c=0;c<n;c++){
    const value=rows[r]?.tokens[c]??(r===rows.length?preview[c]:'')??'';const tile=node('span',value,'tile');
    if(rows[r]){const result=rows[r].tiles[c];tile.classList.add(['absent','present','correct'][result]);tile.setAttribute('aria-label',`${value}: ${['없는 글자','다른 위치에 있음','정확한 위치'][result]}`);}else if(value)tile.classList.add('filled');row.append(tile);
  }board.append(row);}
}
function renderKeyboard(){
  const g=state?.game,lang=g?.language||language;
  const rows=lang==='ko'?['ㅂㅈㄷㄱㅅㅛㅕㅑㅐㅔ','ㅁㄴㅇㄹㅎㅗㅓㅏㅣ','ㅋㅌㅊㅍㅠㅜㅡ']:['qwertyuiop','asdfghjkl','zxcvbnm'];
  const shifted={'ㅂ':'ㅃ','ㅈ':'ㅉ','ㄷ':'ㄸ','ㄱ':'ㄲ','ㅅ':'ㅆ','ㅐ':'ㅒ','ㅔ':'ㅖ'};
  const results=new Map();
  for(const row of g?.rows||[])row.tokens.forEach((token,i)=>{
    results.set(token,Math.max(results.get(token)??-1,row.tiles[i]));
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
function render(){
  const g=state?.game,queued=state?.queued;$('mode-pill').textContent=['CLASSIC','TIME ATTACK','LIVE DUEL'][g?.mode??mode];$('game-language').textContent=`${(g?.language||language)==='ko'?'한글':'영어'} · ${g?.length||length}칸`;
  $('progress').replaceChildren(document.createTextNode(String(g?.attempts||0)),node('span',' / 6'));
  $('waiting').hidden=!queued;$('session-stats').hidden=!g||g.mode===0;$('solved').textContent=g?.solved||0;$('score').textContent=g?.score||0;
  $('opponent').hidden=!g?.opponent;if(g?.opponent)$('opponent').textContent=`${g.opponent.connected?'●':'○'} ${g.opponent.nickname} · ${g.opponent.attempts}/6회${g.opponent.exhausted?' · 결과 대기 중':!g.opponent.connected?' · 재접속 대기 중':''}`;
  $('result').hidden=g?.status!=='finished';
  if(g?.status==='finished'){
    const result=$('result');result.replaceChildren(node('h3',g.mode===1?`${g.solved}개 정답, ${g.score}점`:(g.outcome==='won'?'멋져요, 정답입니다!':g.outcome==='draw'?'좋은 승부였어요. 무승부!':g.outcome==='lost'?'아쉬워요. 다시 도전해 볼까요?':STATE_LABELS[g.outcome]||'게임 종료')));
    if(g.mode===2&&g.outcome==='won')result.firstElementChild.textContent='대전에서 승리했어요!';
    result.append(node('p',`정답은 ‘${g.answer}’`));const reasons={timeout:'제한 시간이 끝났습니다.',attempts_exhausted:'6번의 기회를 모두 사용했습니다.',pool_exhausted:'이 길이의 모든 출제 단어를 풀었습니다.',disconnected:'재접속 유예 시간이 끝났습니다.',forfeit:'기권으로 종료되었습니다.',abandoned:'중도 종료한 게임입니다.'};
    if(reasons[g.reason])result.append(node('p',reasons[g.reason]));result.append(node('small',g.saved?'기록 저장 완료':'기록 저장 중…'));
    message('다른 길이나 모드를 선택해 다시 도전해 보세요.');
  }else if(queued)message('두 플레이어가 연결되면 3초 뒤 자동으로 시작합니다.');
  else if(g?.status==='countdown')message('상대를 찾았어요. 잠시 후 같은 단어로 시작합니다.');
  else if(g?.exhausted)message('시도를 모두 사용했어요. 상대의 결과를 기다려 주세요.');
  else if(g)message(g.mode===1?`${g.round}번째 단어 · 같은 길이로 계속 도전하세요.`:'사전에 있는 단어라면 출제 목록 밖의 단어도 입력할 수 있어요.');
  renderControls();renderBoard();renderKeyboard();preview();updateTimer();
}
function preview(){const g=state?.game;const tokens=splitWord($('guess').value,g?.language||language);$('token-preview').textContent=$('guess').value?(tokens?tokens.join(' '):'완성된 단어를 입력하세요'):(language==='ko'?'사과 → ㅅ ㅏ ㄱ ㅗ ㅏ':'apple → a p p l e');$('token-count').textContent=`${tokens?.length||0} / ${g?.length||length}`;renderBoard();}
function updateTimer(){const g=state?.game;if(!g)return;const dt=performance.now()-receivedAt;const remaining=Math.max(0,Math.min((config?.duration_seconds||180)*1000,g.remaining_ms-dt));const sec=Math.ceil(remaining/1000);$('timer').textContent=`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;if(g.status==='countdown'){const n=Math.max(0,Math.ceil((g.countdown_ms-dt)/1000));message(n?`${n}초 뒤 시작합니다. 준비하세요!`:'시작 상태를 확인하고 있습니다…');}}
function openDialog(title){$('dialog-title').textContent=title;$('dialog-content').replaceChildren();if(!$('dialog').open)$('dialog').showModal();return $('dialog-content');}
function help(){const box=openDialog('게임 방법');for(const [title,copy] of [
  ['6번 안에 단어를 찾아보세요','초록은 글자와 위치가 일치, 노랑은 글자만 일치, 회색은 정답에 남아 있는 같은 글자가 없다는 뜻입니다. 같은 글자는 정답에 있는 개수만큼만 색칠됩니다.'],
  ['한글 5~12칸 · 영어 5~8칸','한글은 두벌식 자모 기준입니다. ㅘ→ㅗ+ㅏ, ㅙ→ㅗ+ㅐ, ㄳ→ㄱ+ㅅ처럼 나눕니다. ㅐ·ㅔ·ㅒ·ㅖ와 쌍자음은 나누지 않습니다. 사과는 5칸입니다.'],
  ['사전은 입력을 확인하는 용도예요','정답은 선정된 친숙한 단어에서만 나옵니다. 입력은 더 넓은 검증 사전을 사용합니다. 한글은 표제어 기준이므로 모든 활용형이 허용되는 것은 아닙니다. 잘못된 입력은 시도를 차감하지 않습니다.'],
  ['타임어택','180초 동안 정답 하나당 100점! 정답을 맞히거나 6회를 소진하면 다음 문제로 진행합니다. 같은 세션에서는 정답이 반복되지 않으며 후보를 모두 사용해도 종료됩니다. 동점일 때 유효 추측이 적은 기록이 앞섭니다.'],
  ['실시간 대전','같은 언어·길이의 상대와 자동으로 연결됩니다. 대전 신청은 준비 완료를 뜻하며 매칭 후 3초 뒤 시작합니다. 180초 안에 먼저 맞히면 승리합니다. 서버가 받은 순서로 판정하므로 네트워크 지연의 영향이 있습니다. 둘 다 못 맞히면 무승부입니다.'],
  ['재접속과 기록','연결이 끊겨도 30초 안에 같은 브라우저로 돌아오면 대전을 이어갑니다. 기권은 패배입니다. 서버 재시작 시 진행 중 게임은 복구되지 않으며 순위에도 반영하지 않습니다. 익명 계정은 쿠키를 지우면 복구할 수 없습니다.']]){box.append(node('h3',title),node('p',copy));}}
function credits(){const box=openDialog('사전 출처 및 서비스 안내');box.append(node('p','한글 입력 사전: 국립국어원 및 hunspell-dict-ko 기여자. 비 legacy 표제어를 추출·정규화하고 게임 길이로 필터링했습니다. 파생 데이터는 CC BY-SA 4.0입니다. 영어 입력 사전: dwyl/english-words, Unlicense. 뜻풀이와 예문은 포함하지 않습니다.'));for(const [label,url] of [['한국어 원본과 라이선스','https://github.com/spellcheck-ko/hunspell-dict-ko'],['영어 원본과 라이선스','https://github.com/dwyl/english-words'],['프로젝트 및 데이터 변환 내역','https://github.com/cheesedongjin/CPU-Wordle']]){const p=node('p'),a=node('a',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';p.append(a);box.append(p);}box.append(node('h3','무료 서버 안내'),node('p','Render 무료 서버는 이용자가 없으면 절전될 수 있습니다. 첫 접속이 약 1분 지연될 수 있으며 서비스 재시작으로 대전이 종료될 수 있습니다. 완료 기록은 외부 PostgreSQL에 저장됩니다.'),node('h3','저장하는 정보'),node('p','익명 사용자 식별자, 세션 토큰의 해시, 닉네임, 완료된 게임의 점수와 전적을 저장합니다. 세션 토큰은 HttpOnly 쿠키로 보관합니다. 닉네임에 개인정보를 넣지 마세요.'));}
async function leaderboard(){
  const box=openDialog('리더보드');const filters=node('div',undefined,'filters');const specs=[['mode',[[1,'타임어택'],[2,'실시간 대전']],mode===2?2:1],['language',[['ko','한글'],['en','영어']],language],['length',Array.from({length:8},(_,i)=>[i+5,`${i+5}칸`]),length],['period',[['day','오늘'],['week','이번 주'],['all','전체']], 'all']];const selects={};
  for(const [key,choices,value] of specs){const s=node('select');s.setAttribute('aria-label',key);for(const [v,label] of choices){const o=node('option',label);o.value=v;s.append(o);}s.value=value;selects[key]=s;filters.append(s);}
  const content=node('div');box.append(filters,node('p','타임어택은 개인 최고 기록, 대전은 승 3점 · 무 1점 · 패 0점입니다. 일간·주간 경계는 한국 시각 기준입니다.'),content);let generation=0;
  async function load(){const ticket=++generation;for(const o of selects.length.options)o.disabled=selects.language.value==='en'&&Number(o.value)>8;if(selects.language.value==='en'&&Number(selects.length.value)>8)selects.length.value=5;content.replaceChildren(node('p','기록을 불러오는 중…','empty'));try{const q=new URLSearchParams(Object.fromEntries(Object.entries(selects).map(([k,v])=>[k,v.value])));const rows=await api(`leaderboard?${q}`);if(ticket!==generation)return;content.replaceChildren();if(!rows.length){content.append(node('p','아직 기록이 없어요. 첫 번째 기록을 남겨보세요!','empty'));return;}const table=node('table'),head=node('tr');['순위','플레이어','점수','기록'].forEach(t=>head.append(node('th',t)));const thead=node('thead');thead.append(head);table.append(thead);const tbody=node('tbody');for(const row of rows){const tr=node('tr');if(row.user_id===state?.user_id)tr.className='me';[row.rank,row.nickname,row.points,selects.mode.value==='2'?`${row.wins}승 / ${row.played}경기`:`${row.solved}정답 / ${row.guesses}회`].forEach(t=>tr.append(node('td',String(t))));tbody.append(tr);}table.append(tbody);content.append(table);}catch(e){if(ticket===generation)content.replaceChildren(node('p',e.message,'empty'));}}
  Object.values(selects).forEach(s=>s.addEventListener('change',load));await load();
}
async function history(){const box=openDialog('내 플레이 기록');box.append(node('p','최근 완료된 게임 30개를 표시합니다.'));try{const rows=await api('history');if(!$('dialog').open||$('dialog-title').textContent!=='내 플레이 기록')return;if(!rows.length){box.append(node('p','아직 기록이 없어요. 첫 게임을 시작해 보세요.','empty'));return;}const table=node('table');const head=node('tr');['날짜','모드','설정','결과'].forEach(t=>head.append(node('th',t)));table.append(head);for(const r of rows){const tr=node('tr');[new Date(r.ended_at).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric'}),LABELS[r.mode],`${r.lang?'영어':'한글'} ${r.length}칸`,`${STATE_LABELS[r.outcome]||r.outcome} · ${r.points}점`].forEach(t=>tr.append(node('td',t)));table.append(tr);}box.append(table);}catch(e){box.append(node('p',e.message));}}
function profile(){const box=openDialog('플레이어 이름');const input=node('input');input.className='profile-input';input.maxLength=20;input.value=state?.nickname||'';input.setAttribute('aria-label','닉네임');const button=node('button','이름 저장','primary full');button.onclick=async()=>{const data=await action('name',{nickname:input.value.trim()});if(data){$('dialog').close();toast('이름을 저장했습니다.');}};box.append(node('p','다른 플레이어에게 보일 이름입니다. 개인정보를 넣지 마세요.'),input,button);input.focus();}
function connectSocket(){
  if(ws&&(ws.readyState===WebSocket.OPEN||ws.readyState===WebSocket.CONNECTING))return;
  ws=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws`);
  ws.onopen=()=>{connected(true,'실시간 연결됨');ws.send('sync');clearInterval(syncTimer);syncTimer=setInterval(()=>{if(ws?.readyState===WebSocket.OPEN)ws.send('sync');},1000);};
  ws.onmessage=e=>{try{if(!busy)apply(JSON.parse(e.data));}catch{}};
  ws.onclose=()=>{clearInterval(syncTimer);connected(false,'재연결 중…');setTimeout(connectSocket,2500);};
  ws.onerror=()=>ws.close();
}
async function boot(){
  try{config=await api('config');const data=await api('session',{});apply(data);updateSettings();render();connected(true,'서버와 연결되었습니다');connectSocket();}
  catch(e){connected(false,'연결 재시도 중');message('무료 서버가 깨어나는 중일 수 있습니다. 잠시만 기다려 주세요.',true);setTimeout(boot,5000);}
}
document.querySelectorAll('[data-language]').forEach(b=>b.onclick=()=>{language=b.dataset.language;updateSettings();render();});
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=Number(b.dataset.mode);updateSettings();render();});
$('length').onchange=()=>{length=Number($('length').value);updateSettings();render();};
$('start').onclick=()=>action(mode===2?'queue':'start',{language,length,mode});
$('cancel-queue').onclick=()=>action('leave_queue');
$('abandon').onclick=()=>{const box=openDialog('게임을 종료할까요?');box.append(node('p',mode===2?'기권하면 상대가 승리합니다.':'진행 중인 게임이 중도 종료로 기록됩니다.'));const button=node('button','종료하기','primary full');button.onclick=async()=>{const data=await action('abandon',{game_id:state.game.id});if(data)$('dialog').close();};box.append(button);};
$('guess').addEventListener('compositionstart',()=>composing=true);
$('guess').addEventListener('compositionend',()=>{composing=false;preview();});
$('guess').addEventListener('input',preview);
$('guess').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.isComposing||composing||e.keyCode===229))e.preventDefault();});
$('guess-form').onsubmit=e=>{e.preventDefault();if(composing||busy||!state?.game)return;action('guess',{game_id:state.game.id,puzzle_id:state.game.puzzle_id,word:$('guess').value});};
$('help-open').onclick=help;$('rules-open').onclick=help;$('credits-open').onclick=credits;$('leaderboard-open').onclick=leaderboard;$('history-open').onclick=history;$('profile-open').onclick=profile;
const dialog=$('dialog');
let backdropPointerId=null;
function isBackdropEvent(e){const r=dialog.getBoundingClientRect();return e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom);}
$('dialog-close').onclick=()=>dialog.close();
// Text selection can start inside the dialog and produce a click outside it.
dialog.addEventListener('pointerdown',e=>{backdropPointerId=e.button===0&&isBackdropEvent(e)?e.pointerId:null;});
dialog.addEventListener('click',e=>{const dismiss=backdropPointerId!==null&&backdropPointerId===e.pointerId&&isBackdropEvent(e);backdropPointerId=null;if(dismiss)dialog.close();});
dialog.addEventListener('pointercancel',()=>{backdropPointerId=null;});
dialog.addEventListener('close',()=>{backdropPointerId=null;});
setInterval(updateTimer,200);
setInterval(async()=>{if(!state||busy||ws?.readyState===WebSocket.OPEN)return;try{apply(await api('state'));}catch{}},3000);
window.addEventListener('online',connectSocket);
render();boot();
