from pathlib import Path
from reportlab.platypus import PageBreak

source=Path(__file__).with_name('create_practical.py').read_text(encoding='utf-8')
exec(source.split("p('CPU Wordle 프로젝트 설명','title')")[0])
OUT=ROOT/'output/pdf/CPU_Wordle_핵심_코드_설명.pdf'
styles['code'].fontSize=9
styles['code'].leading=12.5
p('CPU Wordle 핵심 코드 설명','title')
p('화면은 HTML·CSS·JavaScript로 구성하고, 핵심 게임 규칙은 C로 작성했다. C 코드는 WebAssembly로 변환해 브라우저에서 실행한다. 아래 세 코드는 정답 판정, 한글 분해, 해커 모드를 구현한 부분이다.')
h('1. 정답 판정')
p('src/wordle.c · wd_judge · C 코드 발췌','small')
code('''for (int i = 0; i < n; i++) {
    out[i] = guess[i] == answer[i] ? WD_CORRECT : WD_ABSENT;
    used[i] = out[i] == WD_CORRECT;
}
for (int i = 0; i < n; i++) {
    if (out[i] == WD_CORRECT) continue;
    for (int j = 0; j < n; j++) {
        if (!used[j] && answer[j] == guess[i]) {
            used[j] = 1;
            out[i] = WD_PRESENT;
            break;
        }
    }
}''')
p('입력한 단어와 정답을 한 칸씩 비교해 각 칸의 색깔을 결정한다. 첫 번째 반복문은 글자와 위치가 모두 같으면 초록색 판정 값인 WD_CORRECT를 저장한다. 나머지는 우선 회색 값인 WD_ABSENT로 두고, 초록으로 확정한 정답 칸은 used에 사용한 것으로 기록한다.')
p('두 번째 반복문은 초록색 칸을 건너뛰고 나머지를 비교한다. 아직 사용하지 않은 정답 칸에 같은 글자가 있으면 노란색 값인 WD_PRESENT를 저장하고, 그 정답 칸도 사용한 것으로 표시한다. 이렇게 정답에 들어 있는 글자 수만큼 힌트를 제공한다.')
p('배열은 값을 순서대로 담는 목록이다. guess는 입력 글자, answer는 정답 글자, out은 칸별 판정, used는 정답 칸의 사용 여부를 담는다. for는 각 칸을 반복해서 확인하고, if는 조건에 맞을 때만 실행한다. break는 일치하는 정답 칸을 하나 찾았을 때 안쪽 반복을 끝낸다.')
p('예를 들어 정답이 apple이고 입력이 allee이면 초록·노랑·회색·회색·초록이다. l은 정답에 한 개이므로 첫 l만 노랑이다. e는 마지막 칸이 초록으로 먼저 확정되므로 앞의 e는 회색이다.')
story.append(PageBreak())
h('2. 한글 분해')
p('src/wordle.c · wd_split · C 코드 발췌','small')
code('''uint32_t s = c - 0xAC00;
uint32_t initial[2] = {INITIAL[s / 588], 0};
count = push(out, count, cap, initial);
if (count >= 0)
    count = push(out, count, cap, VOWEL[s % 588 / 28]);
if (count >= 0)
    count = push(out, count, cap, FINAL[s % 28]);''')
p('한글은 한 글자 안에 자음과 모음이 들어 있으므로 자모 단위로 나누어 비교한다. 유니코드는 컴퓨터가 문자를 숫자로 구분하는 체계다. 완성형 한글의 배치 규칙에 따라 나눗셈과 나머지 연산으로 초성·중성·종성의 위치를 계산한다.')
p('0xAC00은 한글 ‘가’의 코드 값이다. 이 값을 빼면 ‘가’부터 센 순서를 얻는다. 588은 중성 21개와 종성 28가지의 조합 수이며, 종성에는 받침이 없는 경우도 포함한다. /는 정수 나눗셈, %는 나머지 연산이다.')
p('INITIAL·VOWEL·FINAL 배열에서 각각 초성·중성·종성을 찾고, push 함수로 결과 배열에 추가한다. 예를 들어 사과는 ㅅ, ㅏ, ㄱ, ㅗ, ㅏ의 다섯 칸이 된다. 이렇게 나눈 칸들을 정답 판정 함수에서 비교한다.')
h('3. 해커 모드')
p('src/wordle.c · wd_play · C 코드 발췌','small')
code('''if (mode == WD_HACKER && !same(answers, guess, n)) {
    int hidden = (int)(random * n);
    results[hidden < n ? hidden : n - 1] = WD_HIDDEN;
}''')
p('해커 모드는 오답을 입력할 때 판정 한 칸을 무작위로 가린다. 첫 줄의 조건문은 해커 모드인지, 입력이 정답과 다른지를 확인한다. &&는 두 조건을 모두 만족해야 한다는 뜻이고, !same은 두 단어가 같지 않다는 뜻이다.')
p('JavaScript의 Math.random()에서 받은 0 이상 1 미만의 난수에 칸 수 n을 곱하고, 정수로 바꾸어 가릴 칸을 고른다. n이 5이고 난수가 0.6이면 hidden은 3이다. 배열은 0부터 세므로 네 번째 칸에 해당한다.')
p('results 배열의 선택한 칸에 WD_HIDDEN을 저장하면 화면에서 해당 판정이 줄무늬로 표시된다. 입력한 글자는 그대로 보이고 판정 색만 가려진다. 기본 판정 결과에 이 처리를 더해 일부 단서가 숨겨지는 게임 방식을 구현한다.')
def footer(c,d):
 c.setFont('KR',9);c.drawCentredString(A4[0]/2,27,str(d.page))
SimpleDocTemplate(str(OUT),pagesize=A4,leftMargin=48,rightMargin=48,topMargin=38,bottomMargin=42,title='CPU Wordle 핵심 코드 설명').build(story,onFirstPage=footer,onLaterPages=footer)
print(OUT)
