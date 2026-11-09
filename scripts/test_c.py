"""C 엔진 테스트(tests/test_engine.c)를 네이티브로 컴파일해 실행합니다.
컴파일러는 build_wasm.py와 같은 Zig(clang)를 씁니다.
"""
from pathlib import Path
import subprocess, sys

ROOT = Path(__file__).resolve().parents[1]
EXE = ROOT / "build" / ("test_engine.exe" if sys.platform == "win32" else "test_engine")

if __name__ == "__main__":
    EXE.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        sys.executable, "-m", "ziglang", "cc", "-std=c11", "-O1",
        "-Wall", "-Wextra", "-Werror",
        "src/wordle.c", "tests/test_engine.c", "-o", str(EXE.relative_to(ROOT)),
    ], cwd=ROOT, check=True)
    sys.exit(subprocess.run([str(EXE)], cwd=ROOT).returncode)
