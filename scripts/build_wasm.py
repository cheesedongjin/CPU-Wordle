"""src/wordle.c를 WebAssembly로 컴파일해 web/wordle_wasm.js에 base64로 넣습니다.
파일로 따로 두지 않고 JS에 넣는 이유: file://로 열어도 fetch 없이 불러올 수 있게 하기 위함입니다.
컴파일러는 Zig에 포함된 clang을 씁니다: pip install ziglang==0.17.1
"""
from pathlib import Path
import base64, subprocess, sys

ROOT = Path(__file__).resolve().parents[1]
WASM = ROOT / "build" / "wordle.wasm"


def build():
    WASM.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        sys.executable, "-m", "ziglang", "cc",
        "--target=wasm32-freestanding", "-std=c11", "-O2", "-g0", "-nostdlib",
        "-Wall", "-Wextra", "-Werror",
        "-Wl,--no-entry", "-Wl,--strip-all",
        "src/wordle.c", "-o", str(WASM.relative_to(ROOT)),
    ], cwd=ROOT, check=True)
    encoded = base64.b64encode(WASM.read_bytes()).decode("ascii")
    (ROOT / "web" / "wordle_wasm.js").write_text(
        "// scripts/build_wasm.py가 src/wordle.c로 생성한 파일입니다. 직접 고치지 마세요.\n"
        f"const WORDLE_WASM = '{encoded}';\n"
        "if (typeof module !== 'undefined') module.exports = WORDLE_WASM;\n",
        encoding="utf-8", newline="\n",
    )
    print(f"web/wordle_wasm.js: {WASM.stat().st_size} bytes of wasm")


if __name__ == "__main__":
    build()
