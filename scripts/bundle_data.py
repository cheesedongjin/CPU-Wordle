"""data/의 사전을 web/words.js 하나로 묶습니다. file://로 열어도 fetch 없이 동작하게 하기 위함입니다."""
from pathlib import Path
import json
ROOT = Path(__file__).resolve().parents[1]
data = {lang: {kind: (ROOT / f"data/{lang}_{kind}.txt").read_text(encoding="utf-8").splitlines()
               for kind in ["answers", "allowed"]} for lang in ["ko", "en"]}
(ROOT / "web/words.js").write_text("// scripts/bundle_data.py가 생성한 파일입니다. 라이선스는 data/README.md 참고.\nconst WORDLE_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
