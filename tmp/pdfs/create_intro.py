from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor, white
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output/pdf/CPU_Wordle_프로젝트_설명.pdf'
OUT.parent.mkdir(parents=True,exist_ok=True)
pdfmetrics.registerFont(TTFont('KR','C:/Windows/Fonts/malgun.ttf'))
pdfmetrics.registerFont(TTFont('KRB','C:/Windows/Fonts/malgunbd.ttf'))
W,H=595.28,841.89
c=canvas.Canvas(str(OUT),pagesize=(W,H))
c.setTitle('CPU Wordle | 비전공자를 위한 프로젝트 설명')
c.setAuthor('CPU Wordle 프로젝트 설명 자료')
ink='#172A38'; muted='#526471'; green='#187B63'
def text(x,y,s,size=11,font='KR',color=ink):
 c.setFillColor(HexColor(color)); c.setFont(font,size); c.drawString(x,y,s)
def para(s,y,size=11,color=ink,width=499):
 st=ParagraphStyle('p',fontName='KR',fontSize=size,leading=size*1.65,textColor=HexColor(color),wordWrap='CJK')
 p=Paragraph(s,st); _,h=p.wrap(width,700); p.drawOn(c,48,y-h); return y-h
def title(num,kicker,heading,sub):
 c.setFillColor(HexColor('#F7F9FA')); c.rect(0,0,W,H,fill=1,stroke=0)
 c.setFillColor(HexColor(green)); c.rect(48,779,28,5,fill=1,stroke=0)
 text(48,754,kicker,10,'KRB',green); text(48,712,heading,25,'KRB')
 para(sub,688,11,muted)
 text(48,35,'CPU WORDLE  /  PROJECT GUIDE',8,'KRB',muted)
 text(511,35,f'{num} / 5',9,'KR',muted)
def section(label,y): text(48,y,label,15,'KRB'); return y-18
def code(lines,y):
 h=len(lines)*16+28
 c.setFillColor(HexColor('#182D3B'));c.roundRect(48,y-h,499,h,8,fill=1,stroke=0)
 for i,line in enumerate(lines): text(62,y-23-i*16,line,8.5,'Courier','#EDF5F5')
 return y-h-20
def note(s,y):
 return para(s,y,10,muted)
def end():c.showPage()

title(1,'01 / OVERVIEW','색깔을 단서로, 단어를 추리하다','코딩을 몰라도 이해할 수 있는 CPU Wordle 프로젝트 설명 자료')
y=para('CPU Wordle은 한글과 영어 단어를 입력하고, 색깔 힌트를 바탕으로 정답을 좁혀 가는 웹 게임입니다. 문제 코드를 보내면 친구도 같은 문제를 풀 수 있습니다.',627,15)
y=section('무엇을 할 수 있나요?',y-41)
for head,body in [ ('두 가지 언어','한글은 자음·모음 단위로, 영어는 알파벳 단위로 추리합니다.'),('세 가지 모드','기본, 해커, 탐정 모드가 서로 다른 추리 경험을 제공합니다.'),('같은 문제 공유','문제 코드를 복사해 전달하면 각자의 브라우저에서 같은 정답을 찾습니다.')]:
 text(48,y-16,head,12,'KRB',green);y=para(body,y-28,11)-20
y=section('이 프로젝트의 기술적 특징',y-12)
y=para('게임 규칙은 C 언어로 만들고, WebAssembly라는 브라우저 실행용 형태로 변환했습니다. 화면은 HTML·CSS·JavaScript로 구성합니다. 별도 게임 서버 없이 브라우저 안에서 계산이 이루어집니다.',y)
note('실행 방법: web/index.html을 브라우저에서 엽니다.\n<br/>읽는 순서: 게임 경험 → 한글 처리 → 판정 코드 → 구조와 공유',y-25)
end()

title(2,'02 / EXPERIENCE','한 번의 입력이 다음 단서가 됩니다','단어 입력 → 색깔 확인 → 후보 좁히기 → 다시 추측')
y=section('색깔의 의미',622)
for color,label,desc in [('#27966F','초록','글자와 위치가 모두 맞습니다.'),('#C49B31','노랑','글자는 있지만 위치가 다릅니다.'),('#7B8790','회색','대응되는 정답 글자가 남아 있지 않습니다.')]:
 c.setFillColor(HexColor(color));c.roundRect(48,y-28,25,25,4,fill=1,stroke=0)
 text(86,y-20,label,12,'KRB');text(135,y-20,desc,10.5);y-=42
y=para('예: 정답 apple에 allee를 입력하면 아래와 같이 표시됩니다.',y-10)
for i,(ch,col) in enumerate(zip('allee',['#27966F','#C49B31','#7B8790','#7B8790','#27966F'])):
 x=48+i*61;c.setFillColor(HexColor(col));c.roundRect(x,y-67,52,52,5,fill=1,stroke=0);text(x+18,y-49,ch,23,'KRB','#FFFFFF')
y=note('정답의 l은 한 개입니다. 첫 l에 노랑을 주었으므로 두 번째 l은 회색입니다.',y-80)
y=section('세 모드의 차이',y-37)
for head,body in [('기본  |  6번','단어 하나를 맞힙니다. 한글·영어 모두 5~7칸을 선택합니다.'),('해커  |  7번','오답마다 무작위 한 칸의 판정 색을 가립니다. 글자는 보입니다.'),('탐정  |  공통 7번','이름 후보 100개 중 두 이름을 찾습니다. 5칸 고정이며 한 번의 입력을 두 정답과 동시에 비교합니다. 둘 다 맞히면 승리합니다.')]:
 text(48,y-16,head,11,'KRB',green);y=para(body,y-26,10.5)-14
end()

title(3,'03 / CORE CODE 01','한글을 게임의 칸으로 바꾸기','핵심 함수: src/wordle.c의 wd_split')
y=para('한글 한 글자에는 자음과 모음이 함께 들어 있습니다. 이 게임은 글자를 구성 요소로 나누어 각각 한 칸씩 비교합니다.',624,12)
c.setFillColor(HexColor('#E4F1EB'));c.roundRect(48,476,499,76,8,fill=1,stroke=0)
text(69,505,'사과  →  ㅅ  ㅏ  ㄱ  ㅗ  ㅏ  →  5칸',22,'KRB',green)
y=section('실제 코드의 핵심 부분',435)
y=code(['uint32_t s = c - 0xAC00;','uint32_t initial[2] = {INITIAL[s / 588], 0};','count = push(out, count, cap, initial);','if (count >= 0)','    count = push(out, count, cap, VOWEL[s % 588 / 28]);','if (count >= 0)','    count = push(out, count, cap, FINAL[s % 28]);'],y-5)
y=para('컴퓨터는 한글을 숫자 번호로 저장합니다. 이 코드는 번호의 규칙을 이용해 초성·중성·종성을 찾고, 결과를 게임 칸에 차례대로 넣습니다.',y,11)
y=para('• INITIAL: 첫 자음(초성)을 찾는 표<br/>• VOWEL: 모음(중성)을 찾는 표<br/>• FINAL: 받침(종성)을 찾는 표<br/>• push: 찾은 구성 요소를 결과 목록에 넣는 작업',y-16,10.5)
note('ㅘ는 ㅗ+ㅏ, 겹받침 ㄳ은 ㄱ+ㅅ으로 나눕니다. ㅐ와 쌍자음은 한 칸입니다. 숫자 계산식을 외우기보다 “한글을 비교 가능한 칸으로 바꾼다”는 역할을 이해하면 됩니다.',y-20)
end()

title(4,'04 / CORE CODE 02 & 03','정확한 판정과 숨겨진 힌트','같은 판정 규칙을 바탕으로 모드별 특징을 더합니다.')
y=section('중복 글자를 정확하게 판정하기',622)
y=code(['for (int i = 0; i < n; i++) {','    out[i] = guess[i] == answer[i] ? WD_CORRECT : WD_ABSENT;','    used[i] = out[i] == WD_CORRECT;','}'],y-6)
y=para('guess는 입력, answer는 정답입니다. 같은 위치의 글자가 일치하면 먼저 초록으로 확정하고, 해당 정답 칸을 “사용함”으로 표시합니다.',y,11)
y=para('다음 단계에서는 아직 사용하지 않은 정답 칸에서 같은 글자를 찾을 때만 노랑을 줍니다. 정답 글자 하나를 여러 번 사용하지 않으므로, 중복 입력에도 일관된 힌트를 제공합니다.',y-12,11)
y=note('출처: src/wordle.c / wd_judge. 위 코드는 전체 판정 중 첫 단계 발췌입니다.',y-12)
y=section('해커 모드에서 힌트 한 칸 가리기',y-38)
y=code(['if (mode == WD_HACKER && !same(answers, guess, n)) {','    int hidden = (int)(random * n);','    results[hidden < n ? hidden : n - 1] = WD_HIDDEN;','}'],y-6)
y=para('① 해커 모드인지 확인합니다.<br/>② 오답이면 무작위로 한 칸을 고릅니다.<br/>③ 그 칸의 판정을 “가림”으로 바꿉니다.',y,11)
y=para('정답을 입력한 줄은 가리지 않습니다. 플레이어는 일부 단서가 없는 상태에서 추리해야 하므로 기본 모드와 다른 전략이 필요합니다.',y-14,11)
note('출처: src/wordle.c / wd_play. 코드의 줄바꿈만 읽기 쉽게 조정했습니다.',y-14)
end()

title(5,'05 / STRUCTURE & SHARING','화면은 진행자, C 코드는 심판','역할을 나누어 게임 규칙과 화면을 관리합니다.')
y=section('한 번의 입력이 처리되는 순서',622)
y=para('사용자 입력 → JavaScript가 전달 → C 기반 규칙 계산<br/>→ JavaScript가 결과를 받아 화면 갱신',y,13,green)
y=para('HTML·CSS는 게임판과 디자인을, JavaScript는 입력과 화면 갱신을 맡습니다. C는 글자 분해, 판정, 모드 규칙, 승패를 계산합니다. C 코드를 WebAssembly로 변환하면 브라우저에서 실행할 수 있습니다.',y-16,11)
y=section('문제 코드는 같은 문제를 찾는 번호표',y-35)
text(48,y-23,'CW2-EN-F123CC0B',20,'KRB',green)
y=para('CW2는 기본 모드와 버전, EN은 영어, 마지막 부분은 단어 ID입니다. 단어에서 일정한 계산으로 ID를 만드는 방식을 “해시”라고 부릅니다. 친구는 코드를 입력해 자신의 단어 목록에서 해당 문제를 찾습니다.',y-41,11)
y=note('같은 문제를 각자 푸는 방식입니다. 실시간 대전은 아니며, 해커 모드의 가림 위치는 플레이마다 달라질 수 있습니다. 해시는 정답을 안전하게 숨기는 암호가 아닙니다.',y-12)
y=section('사용 편의성과 현재 범위',y-30)
y=para('• 칸 수가 다르거나 사전에 없는 입력은 기회를 쓰지 않습니다.<br/>• 한글을 조합하는 중에는 제출하지 않습니다.<br/>• 키보드에 사용한 글자의 힌트를 모아 보여 줍니다.<br/>• C 규칙과 JavaScript 연결·화면 흐름을 검사하는 테스트가 있습니다.<br/>• 진행 상황은 저장하지 않으며, 설정 변경 시 새 문제가 시작됩니다.',y,10.5)
y=section('자료 출처',y-28)
y=note('프로젝트의 CODE_EXPLANATION.md, README.md 및 src/wordle.c를 바탕으로 작성했습니다. 구현 설명 자료이며, 이 문서 제작 과정에서 테스트를 새로 실행한 결과 보고서는 아닙니다.',y)
url='https://github.com/cheesedongjin/CPU-Wordle/blob/main/CODE_EXPLANATION.md'
text(48,y-22,'원본 코드 설명 문서 열기 ↗',10,'KRB',green)
c.linkURL(url,(48,y-26,250,y-10),relative=0,thickness=0)
end();c.save();print(OUT)
