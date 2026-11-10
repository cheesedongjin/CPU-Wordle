"""data/의 사전을 web/words.js 하나로 묶습니다. file://로 열어도 fetch 없이 동작하게 하기 위함입니다.
출제 목록(answers)은 소스 보기로 바로 읽히지 않도록 XOR + base64로 가려 둡니다.
암호가 아니라 가볍게 가리는 장치이며, 풀이는 web/engine.js의 decodeAnswers가 합니다.
"""
from pathlib import Path
import base64, json
ROOT = Path(__file__).resolve().parents[1]
SEED = 0x2B7E1516  # web/engine.js의 ANSWER_SEED와 같아야 합니다.


# xorshift32 키 스트림. web/engine.js의 keystream과 같은 규칙입니다.
def keystream(n):
    x, out = SEED, bytearray()
    for _ in range(n):
        x ^= (x << 13) & 0xFFFFFFFF
        x ^= x >> 17
        x ^= (x << 5) & 0xFFFFFFFF
        out.append(x & 0xFF)
    return out


def hide(words):
    raw = "\n".join(words).encode("utf-8")
    return base64.b64encode(bytes(a ^ b for a, b in zip(raw, keystream(len(raw))))).decode("ascii")


def read(lang, kind):
    return (ROOT / f"data/{lang}_{kind}.txt").read_text(encoding="utf-8").splitlines()


data = {lang: {"answers": hide(read(lang, "answers")), "allowed": read(lang, "allowed")} for lang in ["ko", "en"]}
(ROOT / "web/words.js").write_text("// scripts/bundle_data.py가 생성한 파일입니다. 라이선스는 data/README.md 참고.\nconst WORDLE_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
