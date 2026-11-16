from pathlib import Path
from reportlab.platypus import PageBreak
import textwrap
from reportlab.platypus import XPreformatted
from xml.sax.saxutils import escape

source=Path(__file__).with_name('create_practical.py').read_text(encoding='utf-8')
exec(source.split("p('CPU Wordle 프로젝트 설명','title')")[0])
OUT=ROOT/'output/pdf/CPU_Wordle_핵심_코드_설명.pdf'
styles['code'].fontSize=8.5
styles['code'].leading=12
NOTES={
  'out[i] = guess[i]': '같은 자리의 글자가 같으면 초록, 다르면 우선 회색으로 기록',
  'used[i] =': '초록으로 맞힌 정답 칸은 이미 사용했다고 표시',
  'if (out[i] == WD_CORRECT)': '초록 칸은 확인이 끝났으므로 다음 칸으로 이동',
  'if (!used[j]': '아직 쓰지 않은 정답 칸에서 같은 글자를 찾음',
  'used[j] =': '찾은 정답 칸을 사용 처리하고 입력 칸을 노랑으로 기록',
  'int all =': '모든 정답을 맞혔을 때의 표시를 준비',
  'wd_judge(answers': '각 정답과 이번 입력을 비교해 색깔을 계산',
  'if (same(answers': '이번에 맞힌 정답을 기존 성공 기록에 추가',
  'int status =': '지금까지 맞힌 정답 정보를 이번 결과에 담음',
  'if ((solved_mask': '정답을 모두 맞혔으면 승리와 종료를 표시',
  'if (rows_done': '이번 입력까지 포함해 기회를 다 썼으면 종료',
  'uint32_t s =': '입력한 한글이 ‘가’에서 얼마나 떨어져 있는지 계산',
  'uint32_t initial': '첫 자음을 찾아 결과 목록에 넣을 준비',
  'if (count >= 0) count = push(out, count, cap, VOWEL': '앞 처리가 성공했으면 모음을 결과 목록에 추가',
  'if (count >= 0) count = push(out, count, cap, FINAL': '이어서 받침을 추가하며, 받침이 없으면 추가하지 않음',
  'if (mode == WD_HACKER': '해커 모드에서 오답일 때만 한 칸을 가림',
  'int hidden =': '임의의 숫자로 가릴 칸 번호를 선택',
  'results[hidden': '선택한 칸을 숨김으로 기록; 범위를 벗어나면 마지막 칸 사용',
  'if (results[i] < 0)': '숨겨진 색깔은 알 수 없으므로 키보드 정보에서 제외',
  'while (k < count': '이 글자가 이미 키보드 기록에 있는지 찾음',
  'if (k == count)': '처음 나온 글자이면 글자와 색깔을 새로 기록',
  '} else if (results[i] > best[k])': '이미 있는 글자이면 더 좋은 힌트를 얻었을 때만 변경',
  "if (composing ||": '한글 조합 중이거나 진행 중인 게임이 아니면 제출을 멈춤',
  "const word =": '앞뒤 공백 제거, 한글 표현 통일, 영어 소문자 변환',
  'const tokens = splitWord': '단어를 실제로 비교할 자모 또는 알파벳 칸으로 나눔',
  'uint32_t hash =': '단어 번호 계산에 사용할 시작값을 준비',
  'for (int i = 0; i < len; i++) hash': '글자를 하나씩 읽어 숫자 계산에 반영',
  'hash ^= hash >> 16;': '계산된 숫자를 더 섞어 최종 단어 번호를 만듦',
  'int at = append': '먼저 기본·해커·탐정 중 모드 표시를 붙임',
  'at = append(out, at, LANG_CODE': '한글 KO 또는 영어 EN 표시를 붙임',
  'at = append_hex(out, at, id1)': '첫 번째 정답의 번호를 8자리 문자로 붙임',
  'if (mode == WD_DETECTIVE)': '탐정 모드는 두 번째 이름의 번호도 붙임',
  'if (values.length > CAPACITY)': '입력 공간에 들어갈 수 있는 개수인지 확인',
  'new Uint32Array': 'C가 읽을 입력 공간에 숫자 목록을 복사',
  'const take =': 'C가 써 둔 결과를 필요한 개수만큼 읽어 목록으로 만듦',
  'static uint32_t in_buf': '입력을 적을 공간과 계산 결과를 적을 공간을 준비',
  'wd_judge(in_buf': '앞의 정답과 뒤의 추측을 비교해 출력 공간에 결과를 적음',
  'put([...answer': '정답과 추측을 글자 번호로 바꾸어 이어서 전달',
  'wasm.wd_judge': 'C의 정답 판정 코드를 실행',
  'return take(guess.length)': '입력 칸 수만큼 판정 결과를 읽음',
  "const len = put(codePoints": '한글 표현을 맞추고 글자 번호를 C에 전달',
  'const count = len': '전달에 성공했으면 C에서 글자를 분해',
  'return count < 0': '실패면 null, 성공이면 결과 번호를 눈에 보이는 글자로 바꿈',
  'game.solved =': '정답별로 맞혔는지를 기록',
  'game.rows.push': '이번 입력과 색깔 결과를 새 줄로 추가',
  'game.won =': '승리 여부를 기록',
  'if (status & FINISHED)': '게임이 끝났으면 상태를 종료로 변경',
 }
def code(s):
 notes=NOTES
 rendered=[]
 for line in s.splitlines():
  key=line.strip()
  for prefix,note in notes.items():
   if key.startswith(prefix):
    indent=line[:len(line)-len(line.lstrip())]
    rendered.append(escape(indent)+'<font name="KR" color="#444444">// '+escape(note)+'</font>')
    break
  rendered.append(escape(line))
 if story: story[-1].keepWithNext=True
 story.append(XPreformatted('\n'.join(rendered),styles['code']))
def excerpt(file,start,end):
 s=(ROOT/file).read_text(encoding='utf-8')
 s='\n'.join(line for line in s.split('\n') if line.strip() not in {'// '+note for note in NOTES.values()})
 a=s.index(start); b=s.index(end,a)
 snippet=textwrap.dedent(s[a:b].rstrip())
 lines=[]
 for line in snippet.splitlines():
  if '/*' in line: line=line.split('/*')[0].rstrip()
  if '//' in line: line=line.split('//')[0].rstrip()
  if line.strip():lines.append(line)
 code('\n'.join(lines))
def page():story.append(PageBreak())
def loc(s):p(s,'small')

p('CPU Wordle 핵심 코드 설명','title')
p('CPU Wordle은 단어를 입력하면 정답과 비교해 색깔로 힌트를 주는 게임이다. 화면을 만들고 입력을 받는 일은 HTML·CSS·JavaScript가 맡는다. 글자를 비교하고 승패를 정하는 규칙은 C로 만들었다. 이 C 코드를 브라우저에서 실행할 수 있게 바꾼 것이 WebAssembly다. 아래에서는 게임의 중요한 기능부터 차례대로 설명한다.')
h('1. 정답 판정: 글자와 위치 비교')
loc('src/wordle.c · wd_judge')
excerpt('src/wordle.c','    for (int i = 0; i < n; i++) {\n        out[i]', '\n}\n\n/* 단어 ID')
p('먼저 입력한 단어와 정답을 첫 칸부터 차례대로 비교한다. 같은 자리에 같은 글자가 있으면 초록으로 기록한다. 나머지 칸은 일단 회색으로 둔다. 코드에서 guess는 입력한 글자 목록, answer는 정답 글자 목록, out은 각 칸의 색깔을 기록하는 목록이다. [i]는 그중 지금 확인하는 칸을 뜻한다.')
p('다음으로 초록이 아닌 칸을 확인한다. 정답의 다른 자리에 같은 글자가 있으면 노랑으로 바꾼다. 이때 정답 글자 하나를 여러 번 세지 않도록 used에 “이미 사용함”을 기록한다. 초록으로 맞힌 글자도 먼저 사용한 것으로 기록한다. WD_CORRECT는 초록, WD_PRESENT는 노랑, WD_ABSENT는 회색을 뜻하는 코드 이름이다.')
p('for는 같은 작업을 칸마다 되풀이하는 반복문이다. if는 “이 조건이 맞으면 실행하라”는 뜻이다. continue는 다음 칸으로 넘어가고, break는 찾는 글자를 발견했을 때 더 찾지 않고 멈춘다. 배열은 여러 값을 순서대로 담아 두는 목록이다. 이 코드에서는 글자, 색깔, 사용 여부를 각각 목록으로 관리한다.')
p('예: 정답 apple / 입력 allee → 초록·노랑·회색·회색·초록. 정답에는 l이 한 개이므로 첫 l만 노랑이다. e는 마지막 칸이 초록으로 먼저 확정되어 앞의 e는 회색이다. 색깔로 글자의 위치와 개수를 함께 추리할 수 있다.')

page()
h('2. 게임 진행: 한 번의 입력과 승패 처리')
loc('src/wordle.c · wd_play, wd_attempts')
excerpt('src/wordle.c','    int all = (1 << count) - 1;', '    /* 해커:')
excerpt('src/wordle.c','    int status = solved_mask & all;', '\n}\n\n/* 사용한 글자')
p('단어 한 번을 입력하면 색깔을 정하는 것 외에도 해야 할 일이 있다. 정답을 맞혔는지, 기회를 다 썼는지, 게임을 끝낼지를 확인해야 한다. wd_judge는 글자별 색깔을 정하는 코드이고, wd_play는 이 결과를 모아 이번 입력의 결과를 정하는 코드다. 함수는 이처럼 특정 일을 하도록 묶어 둔 코드에 붙인 이름이다.')
p('기본·해커 모드는 정답 하나와 비교하고, 탐정 모드는 정답 두 개와 각각 비교한다. answers는 정답들을 담은 목록이고 results는 비교 결과를 담은 목록이다. 정답이 각각 5칸이라면 앞의 5칸은 A, 다음 5칸은 B에 해당한다. answers + i * n은 비교할 정답의 시작 위치를 찾는 계산이다.')
p('rows_done은 지금까지 입력한 횟수다. 여기에 이번 입력 1회를 더해 기회를 모두 썼는지 확인한다. wd_attempts는 모드에 맞는 기회 수를 알려 준다. 기본은 6번, 해커와 탐정은 7번이다. 필요한 정답을 모두 맞히면 승리로 끝나고, 기회만 다 쓰면 게임을 종료한다.')
h('3. 탐정 모드: 두 정답을 따로 기억하기')
p('탐정 모드는 A와 B를 서로 다른 차례에 맞혀도 된다. 그래서 “A를 맞혔는가?”와 “B를 맞혔는가?”를 따로 기억해야 한다. solved_mask는 이 두 가지를 적는 체크표 역할을 한다. A를 맞힌 뒤 다른 이름을 입력해도 A의 성공 기록은 남는다.')
p('코드는 체크표를 숫자로 저장한다. 0과 1만 쓰는 이진수로 보면 A만 맞힌 상태는 01, B만 맞힌 상태는 10, 둘 다 맞힌 상태는 11이다. 1 << i는 어느 정답에 표시할지 고르고, |=는 기존 표시를 남겨 둔 채 새 표시를 추가한다.')
p('all은 모두 맞혔을 때의 체크표다. 현재 기록과 비교해 A와 B가 모두 표시되어 있으면 승리로 처리한다. WD_WON은 “승리”, WD_FINISHED는 “게임 종료”라는 표시다. 화면을 담당하는 JavaScript가 이 표시를 읽고 결과를 보여 준다.')

page()
h('4. 한글 분해: 자음과 모음을 게임 칸으로 변환')
loc('src/wordle.c · wd_split')
excerpt('src/wordle.c','        uint32_t s = c - 0xAC00;', '        if (count < 0)')
p('영어는 알파벳 하나를 한 칸으로 쓸 수 있지만, 한글 한 글자에는 자음과 모음이 함께 들어 있다. 그래서 한글은 먼저 자음과 모음으로 나눈다. 예를 들어 ‘강’은 첫 자음 ㄱ, 모음 ㅏ, 받침 ㅇ으로 나뉜다. 이 세 부분을 각각 초성, 중성, 종성이라고 부른다.')
p('컴퓨터는 글자마다 정해진 번호를 사용한다. 이 번호 규칙이 유니코드이고, 0xAC00은 ‘가’의 번호다. 한글 번호는 일정한 순서로 정해져 있어서 ‘가’의 번호를 빼고 나눗셈을 하면 첫 자음, 모음, 받침을 찾을 수 있다. /는 나눗셈의 몫, %는 나머지를 구한다. 코드의 588은 모음 21가지와 받침 28가지의 조합 수이며, 받침이 없는 경우도 포함한다.')
p('INITIAL, VOWEL, FINAL은 첫 자음·모음·받침을 찾아보는 목록이다. push는 찾은 글자를 결과 목록 뒤에 넣는 코드다. 이 게임에서는 ㅘ를 ㅗ+ㅏ로, ㄳ을 ㄱ+ㅅ으로 나눈다. 따라서 사과는 ㅅ, ㅏ, ㄱ, ㅗ, ㅏ의 다섯 칸이 된다. ㅐ와 쌍자음은 한 칸으로 사용한다. count는 지금까지 만든 칸 수다.')
h('5. 해커 모드: 무작위 한 칸의 판정 가리기')
loc('src/wordle.c · wd_play')
excerpt('src/wordle.c','    if (mode == WD_HACKER', '    int status =')
p('이 코드는 “해커 모드이고, 이번 입력이 오답인가?”를 확인한다. 두 조건이 모두 맞으면 한 칸을 골라 색깔을 숨긴다. &&는 “그리고”, !same은 “정답과 다름”이라는 뜻이다. 맞는 단어를 입력한 줄은 모두 표시한다.')
p('가릴 칸은 매번 임의로 고른다. random에는 JavaScript가 고른 0 이상 1 미만의 숫자가 들어 있다. 여기에 전체 칸 수 n을 곱하고 소수점 아래를 버린다. 5칸에서 0.6이 나왔다면 0.6×5=3이다. 코드의 칸 번호는 0부터 세므로 번호 3은 네 번째 칸이다.')
p('고른 칸의 결과를 WD_HIDDEN, 즉 “숨김”으로 바꾼다. 화면은 이 표시가 있는 칸을 줄무늬로 보여 준다. 입력한 글자는 보이고 색깔만 숨겨진다. hidden < n ? hidden : n - 1 부분은 칸 번호가 범위를 벗어나면 마지막 칸을 사용하도록 하는 처리다.')

page()
h('6. 키보드 표시: 글자별로 얻은 힌트 모으기')
loc('src/wordle.c · wd_keyboard')
excerpt('src/wordle.c','    for (int i = 0; i < cells; i++) {', '    return count;\n}\n\n/* ── WebAssembly')
p('게임판에는 이전에 입력한 단어와 결과가 줄마다 남는다. 키보드는 그중 같은 글자의 힌트를 모아서 보여 준다. 예를 들어 여러 번 입력한 a가 어떤 색을 받았는지 한곳에서 확인할 수 있다. tokens는 입력한 글자 목록, results는 각 글자가 받은 색깔이다.')
p('keys는 지금까지 나온 글자를 모은 목록이고, best는 그 글자의 가장 좋은 힌트다. 처음 나온 글자는 새로 적고, 이미 있는 글자는 이전보다 확실한 힌트를 얻었을 때만 바꾼다. 회색은 0, 노랑은 1, 초록은 2로 기록하므로 더 큰 숫자를 남기면 된다. 한 번 초록으로 확인한 글자는 나중에 회색이 나와도 키보드에서 초록으로 남는다.')
p('해커 모드에서 숨겨진 칸은 색깔을 알 수 없으므로 키보드 정보에 넣지 않는다. 탐정 모드는 A와 B의 정보를 따로 모은다. 키 하나의 왼쪽은 A의 힌트, 오른쪽은 B의 힌트를 보여 준다.')
h('7. 입력 처리: 완성된 단어를 확인한 뒤 판정하기')
loc('web/app.js · 입력 폼 제출 처리 · JavaScript')
excerpt('web/app.js',"  if (composing || !g || g.status !== 'active')", '  // 칸 수와 사전 확인')
p('한글은 ㄱ을 누른 뒤 ㅏ를 눌러 ‘가’를 만드는 식으로 입력한다. composing은 아직 글자를 만드는 중인지 확인하는 표시다. 글자가 완성되고 게임이 진행 중일 때 입력을 받는다. trim은 앞뒤 빈칸을 지우고, toLowerCase는 영어 대문자를 소문자로 바꾼다. normalize는 같은 한글을 컴퓨터도 같은 글자로 처리하도록 맞춘다.')
p('splitWord는 입력한 단어를 게임 칸으로 나눈다. 이후 칸 수가 문제와 맞는지, 단어 목록에 있는지 확인한다. 탐정 모드에서는 이름 후보 목록을 확인한다. 모두 맞으면 submitGuess로 넘겨 정답과 비교한다. 입력을 고쳐야 하는 경우에는 기회를 쓰지 않고 다시 입력할 수 있다.')

page()
h('8. 문제 공유: 단어를 코드로 찾기')
loc('src/wordle.c · wd_hash')
excerpt('src/wordle.c','    uint32_t hash = 2166136261u', '\n}\n\n/* 모드별 기회')
p('친구와 같은 문제를 풀려면 어떤 문제인지 알려 주는 표시가 필요하다. 문제 코드는 게임 모드, 언어, 단어 번호를 붙인 것이다. 단어 번호는 글자들을 정해진 계산에 넣어 만든다. 이처럼 입력을 계산해 숫자로 바꾸는 방식을 해시라고 한다. 위 코드는 글자를 하나씩 읽고 숫자를 섞어 단어 번호를 만든다.')
p('같은 버전에서는 같은 단어로 항상 같은 번호를 만든다. 단어 목록의 순서가 달라져도 단어 자체로 번호를 계산하므로 같은 문제를 찾을 수 있다. 예를 들어 CW2-EN-F123CC0B에서 CW2는 기본 모드, EN은 영어, F123CC0B는 apple의 번호다.')
loc('src/wordle.c · wd_make_code')
excerpt('src/wordle.c','    int at = append(out, 0, PREFIX[mode]);', '\n}\n\n/* code[')
p('이 코드는 문제 코드의 각 부분을 차례대로 붙인다. append는 글자를 뒤에 붙이는 작업이다. PREFIX에서 모드 표시를 고르고, LANG_CODE에서 KO 또는 EN을 고른 다음 단어 번호를 붙인다. 단어 번호는 숫자와 A~F로 이루어진 8자리로 적는다. 탐정 모드는 정답이 두 개이므로 번호도 두 개를 붙인다.')
p('친구가 코드를 입력하면 wd_parse_code가 모드, 언어, 단어 번호를 읽는다. resolvePuzzle은 그 번호의 단어를 목록에서 찾는다. 탐정 모드라면 이름 두 개를 찾는다. 이렇게 코드에 담긴 정보를 읽어서 같은 문제를 시작한다.')
p('createPuzzles는 “이 코드에 해당하는 문제는 이것”이라는 목록을 준비한다. 여기서 사용하는 Map은 이름표로 내용을 찾는 목록이다. 문제 코드를 이름표로 사용해 정답, 언어, 칸 수를 바로 찾을 수 있다.')

page()
h('9. C와 웹 연결: 메모리로 입력과 결과 전달')
loc('web/engine.js · put, take · JavaScript')
excerpt('web/engine.js','function put(values)', 'const codePoints')
p('화면을 맡은 JavaScript와 규칙을 맡은 C는 입력과 결과를 주고받아야 한다. 이를 위해 둘이 함께 사용하는 저장 공간을 둔다. JavaScript가 입력을 적어 놓으면 C가 읽고 계산한다. C가 결과를 적어 놓으면 JavaScript가 다시 읽는다. 이런 임시 저장 공간을 버퍼라고 부른다.')
p('put은 전달할 숫자 목록을 입력 공간에 쓰는 코드다. take는 계산이 끝난 결과를 출력 공간에서 읽는 코드다. Uint32Array와 Int32Array는 이 공간을 숫자 목록처럼 읽고 쓰게 해 준다. 출력에는 “숨김”을 뜻하는 -1도 있으므로 음수를 읽을 수 있는 Int32Array를 사용한다.')
loc('src/wordle.c · WebAssembly 연결부')
code('''static uint32_t in_buf[WD_BUF];
static int32_t out_buf[WD_BUF];
WD_EXPORT(wd_judge) void js_judge(int n) {
    wd_judge(in_buf, in_buf + n, n, out_buf);
}''')
p('in_buf는 입력을 적는 곳이고 out_buf는 결과를 적는 곳이다. 입력에는 정답 글자들과 추측 글자들을 이어서 넣는다. 예를 들어 각각 5칸이면 앞 5칸은 정답, 뒤 5칸은 추측이다. in_buf + n은 정답 다음에 있는 추측의 시작 위치다. wd_judge가 두 단어를 비교해 결과를 적는다.')
loc('web/engine.js · judge · JavaScript')
excerpt('web/engine.js','function judge(answer, guess)', 'const wordId')
p('codePointAt(0)은 글자를 컴퓨터가 쓰는 번호로 바꾼다. put으로 번호들을 전달한 다음 wasm.wd_judge로 C의 판정 코드를 실행한다. take로 결과를 읽으면 0, 1, 2가 나온다. 화면에서는 이 숫자들을 각각 회색, 노랑, 초록으로 보여 준다.')

page()
h('10. 한글 입력을 C 함수에 전달하는 과정')
loc('web/engine.js · splitWord · JavaScript')
excerpt('web/engine.js','function splitWord(text, lang)', '// 판정:')
p('겉으로 같은 한글이라도 컴퓨터 안에서는 저장된 모양이 다를 수 있다. normalize는 이 차이를 정리한다. codePoints는 글자를 번호 목록으로 바꾸고, put은 그 목록을 C가 읽을 공간에 적는다. 그다음 wasm.wd_split으로 한글을 자음과 모음으로 나누는 코드를 실행한다.')
p('C는 몇 칸으로 나뉘었는지 count로 알려 준다. JavaScript는 take(count)로 그 칸 수만큼 결과를 읽는다. String.fromCodePoint는 번호를 다시 눈에 보이는 글자로 바꾼다. 사과를 넣었다면 ㅅ, ㅏ, ㄱ, ㅗ, ㅏ의 목록을 얻는다. 즉 입력 정리, C 계산, 글자로 되돌리기의 순서다.')
h('11. 결과 기록과 화면 갱신')
loc('web/engine.js · submitGuess 중 결과 기록 부분 · JavaScript')
excerpt('web/engine.js','  game.solved = answers.map', '\n}\n// 사용한 글자 집계')
p('계산이 끝나면 이번 입력의 결과를 게임 기록에 추가한다. game.solved에는 어떤 정답을 맞혔는지 적는다. game.rows.push는 입력한 글자와 색깔을 새 줄로 기록한다. 이 기록이 쌓이므로 화면에서 이전에 입력한 단어들을 계속 볼 수 있다.')
p('status에는 이번 입력으로 승리했는지, 게임이 끝났는지가 들어 있다. status & WON은 승리 표시를, status & FINISHED는 종료 표시를 확인한다. Boolean은 그 결과를 “맞다” 또는 “아니다”로 바꾼다. 종료 표시가 있으면 게임 상태를 finished로 바꾸고 결과 화면을 보여 준다.')
p('입력 처리가 끝나면 입력칸을 비우고 render를 실행한다. render는 현재 기록을 읽어 게임판의 색깔, 키보드 힌트, 사용한 기회 수, 결과 문구를 새로 보여 주는 코드다. 사용자가 입력할 때마다 “계산 → 기록 → 화면 표시”가 이어지는 것이다.')
h('관련 파일')
p('src/wordle.c: 정답 판정, 한글 분해, 모드별 진행, 공유 코드, 키보드 집계.<br/>src/wordle.h: 모드·판정·승패 표시 값과 함수 선언.<br/>web/engine.js: C 함수 호출, 값 변환, 단어 검색, 진행 기록.<br/>web/app.js: 입력 이벤트와 화면 표시.<br/>scripts/build_wasm.py: C 코드를 브라우저 실행용 파일로 변환.<br/>tests/test_engine.c: 각 게임 규칙의 구체적인 입력·결과 사례.','small')

def footer(c,d):
 c.setFont('KR',9);c.drawCentredString(A4[0]/2,27,str(d.page))
SimpleDocTemplate(str(OUT),pagesize=A4,leftMargin=48,rightMargin=48,topMargin=38,bottomMargin=42,title='CPU Wordle 핵심 코드 설명').build(story,onFirstPage=footer,onLaterPages=footer)
print(OUT)
