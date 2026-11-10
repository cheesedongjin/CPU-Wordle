# CPU WORDLE(가제)

테마가 있는 한글·영어 워들을 브라우저에서 풀고, 문제 코드로 친구와 같은 문제를 풀 수 있는 게임입니다.

게임 규칙은 C로 작성했고([src/wordle.c](src/wordle.c)), WebAssembly로 컴파일해 브라우저에서 실행합니다. 화면은 HTML·CSS·JavaScript입니다.

## 실행

`web/index.html`을 브라우저에서 열면 됩니다.

1. 위쪽 메뉴에서 모드를, 키보드 아래에서 언어와 길이를 고르면 바로 문제가 시작됩니다. **다른 문제**는 같은 설정으로 새 문제를 뽑습니다.
2. **문제 코드 공유**를 펼쳐 **복사**를 누르고 친구에게 보냅니다.
3. 친구가 **친구의 문제 코드**에 붙여 넣고 **열기**를 누르면 같은 문제가 열립니다.

## 규칙

초록은 글자와 위치가 모두 맞음, 노랑은 글자만 맞음, 회색은 없는 글자입니다. 잘못된 입력(칸 수가 다르거나 사전에 없는 단어)은 기회를 쓰지 않습니다.

| 모드 | 기회 | 내용 |
|---|---|---|
| 기본 | 6번 | 단어 하나를 맞힙니다. |
| 해커 | 7번 | 오답마다 무작위 한 칸의 판정이 가려집니다. 가린 칸은 줄무늬로 표시되고 입력한 글자만 보입니다. 정답을 맞히면 모두 공개됩니다. |
| 탐정 | 7번 | 이름 후보 100개 중 두 개를 찾습니다. 5칸 고정이며, 한 번 입력하면 두 보드에 동시에 판정됩니다. 키보드는 왼쪽 절반이 인물 A, 오른쪽 절반이 인물 B의 판정입니다. |

- 단어 길이는 5~7칸입니다. 한글은 자모 단위로 셉니다: `사과` → `ㅅ ㅏ ㄱ ㅗ ㅏ` (5칸). `ㅘ`와 겹받침은 두 칸, `ㅐ`와 쌍자음은 한 칸입니다.
- 모드에 따라 페이지 전체 테마가 바뀝니다.
- 설정을 바꾸거나 다른 코드를 열면 진행 중인 게임은 초기화됩니다. 진행 상황은 저장하지 않습니다.

## 문제 코드

| 모드 | 형식 |
|---|---|
| 기본 | `CW2-언어-단어ID` |
| 해커 | `CWH2-언어-단어ID` |
| 탐정 | `CWD2-언어-이름ID-이름ID` |

단어 ID는 단어 자체의 해시라서, 사전 순서나 선택한 길이와 관계없이 같은 코드는 같은 정답을 가리킵니다. 다른 버전에서 빠진 단어의 코드는 열리지 않습니다. 해커 모드의 가림 위치는 플레이할 때마다 무작위입니다. 정답과 사전이 브라우저 파일에 들어 있으므로 친구끼리 가볍게 즐기는 용도입니다.

## 폴더 구성

| 경로 | 내용 |
|---|---|
| `web/index.html`, `web/styles.css` | 화면 구조와 모드별 테마 |
| `src/wordle.c`, `src/wordle.h` | 게임 규칙(C): 자모 분해, 판정, 문제 코드, 모드별 진행, 키보드 집계 |
| `web/wordle_wasm.js` | C를 컴파일한 WebAssembly (`scripts/build_wasm.py`가 생성) |
| `web/engine.js` | C 함수를 JS에서 부르는 연결부와 이름 후보 데이터 |
| `web/app.js` | 설정, 입력, 화면 그리기 |
| `web/words.js` | 사전 번들 (`scripts/bundle_data.py`가 생성) |
| `data/` | 사전·출제 목록 원본과 [출처·라이선스](data/README.md) |
| `scripts/` | wasm 빌드, C 테스트, 데이터 생성·번들, Pages 빌드 |
| `tests/test_engine.c` | C 규칙 테스트 |
| `tests/test_local.cjs` | JS 연결부와 화면 흐름 테스트 |

코드가 어떻게 동작하는지는 [CODE_EXPLANATION.md](CODE_EXPLANATION.md)에 위치와 함께 정리했습니다.

## 개발

필요한 것: Node.js 22, Python 3, Zig 0.17.1(C 컴파일러로 사용)

```sh
pip install ziglang==0.17.1        # C 컴파일러 (Zig에 포함된 clang)
python scripts/test_c.py           # C 규칙 테스트
python scripts/build_wasm.py       # src/wordle.c 수정 후 web/wordle_wasm.js 다시 만들기
python scripts/bundle_data.py      # data/ 수정 후 web/words.js 다시 만들기
node --test tests/test_local.cjs   # JS 연결부·화면 테스트
python scripts/build_pages.py      # build/pages에 배포용 파일 모으기
```

C를 고친 뒤 `build_wasm.py`를 실행하지 않으면 브라우저는 예전 규칙으로 동작합니다. CI는 다시 만든 결과가 커밋된 `web/wordle_wasm.js`와 다르면 실패합니다.

사전 원본부터 다시 만들려면 [data/README.md](data/README.md)의 안내대로 원본 저장소를 `.cache/`에 받은 뒤 `python scripts/build_data.py`를 실행합니다.

## 배포

`main` 브랜치에 푸시하면 GitHub Actions([ci.yml](.github/workflows/ci.yml))가 C·JS 테스트를 돌린 뒤 `build/pages`를 GitHub Pages에 배포합니다. 다른 정적 호스팅에 올릴 때도 `python scripts/build_pages.py`로 만든 `build/pages` 폴더를 그대로 올리면 됩니다.
