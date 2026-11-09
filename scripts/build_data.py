""".cache에 받아 둔 고정 버전의 공개 사전에서 data/ 파일을 다시 만듭니다.
표제어만 추출하며 뜻풀이·예문은 재배포하지 않습니다.
"""
from pathlib import Path
import re, json, hashlib, shutil, unicodedata

ROOT = Path(__file__).resolve().parents[1]
KO_REV = '606164264399ca037325bd41750f9c108ed4c290'
EN_REV = '20f5cc9b3f0ccc8ce45d814c532b7c2031bba31c'
INITIAL = list('ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ')
VOWELS = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅗㅏ','ㅗㅐ','ㅗㅣ','ㅛ','ㅜ','ㅜㅓ','ㅜㅔ','ㅜㅣ','ㅠ','ㅡ','ㅡㅣ','ㅣ']
FINAL = ['','ㄱ','ㄲ','ㄱㅅ','ㄴ','ㄴㅈ','ㄴㅎ','ㄷ','ㄹ','ㄹㄱ','ㄹㅁ','ㄹㅂ','ㄹㅅ','ㄹㅌ','ㄹㅍ','ㄹㅎ','ㅁ','ㅂ','ㅂㅅ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ']
# src/wordle.c의 wd_split과 같은 규칙으로 자모 칸 수를 셉니다.
def tokens(word):
    out = ''
    for ch in unicodedata.normalize('NFC', word):
        n = ord(ch)-0xac00
        if not 0 <= n < 11172: return ''
        out += INITIAL[n//588]+VOWELS[(n%588)//28]+FINAL[n%28]
    return out

def main():
    out = ROOT/'data'; out.mkdir(exist_ok=True)
    ko = set()
    for p in (ROOT/'.cache/hunspell-ko/data/entries').glob('*.yaml'):
        if '-legacy' in p.name: continue  # 예전 형식 데이터는 제외
        for entry in p.read_text(encoding='utf-8').split('\n---\n'):
            result = entry.partition('\nresult:\n')[2]
            if not result or '제외:' in result: continue
            m = re.search(r'^    표제어: ([가-힣]+)$', result, re.M)
            if m and 5 <= len(tokens(m[1])) <= 12: ko.add(m[1])
    en = {w for w in (ROOT/'.cache/english-words/words_alpha.txt').read_text().splitlines() if re.fullmatch('[a-z]{5,8}',w)}
    for lang, words in [('ko',ko),('en',en)]:
        (out/f'{lang}_allowed.txt').write_text('\n'.join(sorted(words))+'\n',encoding='utf-8')
        selected = (ROOT/f'data/curated_{lang}.txt').read_text(encoding='utf-8').split()
        seen = set(); answers=[]; rejected=[]
        for w in selected:
            # 사전에 없는 단어는 버리고, 자모가 같은 단어는 하나만 출제
            key = tokens(w) if lang=='ko' else w
            if w not in words: rejected.append(w); continue
            if key in seen: continue
            seen.add(key); answers.append(w)
        (out/f'{lang}_answers.txt').write_text('\n'.join(answers)+'\n',encoding='utf-8')
        print(lang, 'dictionary:',len(words),'answers:',len(answers),'by length:', {n:sum(len(tokens(w) if lang=='ko' else w)==n for w in answers) for n in range(5,13 if lang=='ko' else 9)}, 'rejected:',rejected)
    lic = out/'licenses';lic.mkdir(exist_ok=True)
    for name in ['LICENSE.md','LICENSE.CC-BY-SA-4.0','LICENSE.CC-BY-SA-2.0-KR','LICENSE.CC-BY-4.0']:
        shutil.copyfile(ROOT/'.cache/hunspell-ko'/name,lic/('ko-'+name))
    shutil.copyfile(ROOT/'.cache/english-words/LICENSE.md',lic/'en-UNLICENSE.txt')
    manifest = {'version':'v1','korean':{'source':'https://github.com/spellcheck-ko/hunspell-dict-ko','revision':KO_REV,'license':'CC-BY-SA-4.0','attribution':'hunspell-dict-ko contributors and National Institute of Korean Language','changes':'Extract normalized headwords from non-legacy result sections; filter to 5–12 game tokens; no definitions/examples.'},'english':{'source':'https://github.com/dwyl/english-words','revision':EN_REV,'license':'Unlicense','changes':'Filter words_alpha.txt to 5–8 lowercase ASCII letters.'},'sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in out.glob('*_*.txt')}}
    (out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

if __name__=='__main__': main()
