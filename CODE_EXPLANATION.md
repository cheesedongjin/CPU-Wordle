# 코드 설명

주요 로직이 어디에 있고 어떻게 동작하는지 정리한 문서입니다. 줄 번호는 이 문서를 쓴 시점 기준이므로, 코드가 바뀌면 함수 이름으로 찾으세요.

## 전체 구조

빌드할 때 두 종류의 파일을 만듭니다.

- **게임 규칙:** `scripts/build_wasm.py`가 Zig clang으로 `src/wordle.c`를 컴파일합니다. 결과는 WebAssembly를 base64로 담은 `web/wordle_wasm.js`입니다.
- **단어 데이터:** `scripts/bundle_data.py`가 `data/*.txt`를 `web/words.js`로 묶습니다.

브라우저에서는 `web/app.js`가 입력을 받고, `web/engine.js`를 통해 C 규칙을 실행한 뒤 결과를 화면에 표시합니다.

| 파일 | 역할 |
|---|---|
| `src/wordle.c` | 게임 규칙 계산 |
| `web/engine.js` | C 함수와 JavaScript 연결, 단어 검색 |
| `web/app.js` | 입력 처리와 화면 표시 |

`src/wordle.c`는 자모 분해, 판정, 문제 코드 생성·해석, 모드별 기회 수와 승리 조건, 해커 모드 가림, 키보드 집계를 담당합니다. `web/engine.js`는 C와 주고받는 값을 변환하고, 사전·이름 후보 검색과 NFC 정규화를 처리합니다. `web/app.js`는 설정 변경, 입력 이벤트, 화면 그리기와 칸 크기 조절을 담당합니다.

- 서버가 없습니다. C는 WebAssembly로 컴파일되어 `web/wordle_wasm.js` 안에 base64로 들어 있어서, `index.html`을 파일로 열어도(`file://`) 동작합니다.
- C 코드는 표준 라이브러리를 쓰지 않습니다. 그래서 브라우저용(wasm32-freestanding)과 테스트용(네이티브) 모두 같은 소스로 컴파일됩니다.

## 1. 한글을 자모 칸으로 나누기

위치: [src/wordle.c:38](src/wordle.c:38) `wd_split`, 자모 표는 [src/wordle.c:10](src/wordle.c:10)

```c
if (c < 0xAC00 || c >= 0xAC00 + 11172) return -1; /* 완성형 한글 음절만 허용 */
uint32_t s = c - 0xAC00;
uint32_t initial[2] = {INITIAL[s / 588], 0};       /* 588 = 21×28 */
count = push(out, count, cap, initial);
if (count >= 0) count = push(out, count, cap, VOWEL[s % 588 / 28]);
if (count >= 0) count = push(out, count, cap, FINAL[s % 28]);
```

- 한글 음절의 코드 값은 `0xAC00 + (초성×21 + 중성)×28 + 종성`입니다. 588로 나눈 몫이 초성, 나머지를 28로 나눈 몫이 중성, 28로 나눈 나머지가 종성입니다.
- `VOWEL`, `FINAL` 표는 칸을 두 개까지 가집니다. `ㅘ`는 `{ㅗ, ㅏ}`, `ㄳ`은 `{ㄱ, ㅅ}`처럼 두 칸이고, `ㅐ`나 쌍자음은 한 칸입니다.
- 예: `사과` → `ㅅ ㅏ ㄱ ㅗ ㅏ` (5칸)
- 영어는 대문자를 소문자로 바꾸고, 알파벳이 아니면 -1을 돌려줍니다. 앞뒤 공백은 무시합니다.
- 출력 자리(`cap`)가 모자라면 -1을 돌려줘서 버퍼를 넘치지 않습니다.
- NFC 정규화(조합형 한글을 완성형으로)는 유니코드 표가 필요해서 JS([web/engine.js:24](web/engine.js:24) `splitWord`)가 먼저 처리한 뒤 C에 넘깁니다.
- 데이터 빌드 스크립트의 [scripts/build_data.py](scripts/build_data.py) `tokens`도 같은 규칙으로 칸 수를 셉니다.

## 2. 판정 (중복 글자 처리)

위치: [src/wordle.c:62](src/wordle.c:62) `wd_judge`

```c
for (int i = 0; i < n; i++) {
    out[i] = guess[i] == answer[i] ? WD_CORRECT : WD_ABSENT;
    used[i] = out[i] == WD_CORRECT;
}
for (int i = 0; i < n; i++) {
    if (out[i] == WD_CORRECT) continue;
    for (int j = 0; j < n; j++) {
        if (!used[j] && answer[j] == guess[i]) { used[j] = 1; out[i] = WD_PRESENT; break; }
    }
}
```

- 결과 값: `2` 글자·위치 일치(초록), `1` 글자만 일치(노랑), `0` 없음(회색)
- 1단계에서 같은 위치를 초록으로 확정하고, 그 정답 칸을 "사용함"으로 표시합니다.
- 2단계에서는 아직 사용하지 않은 정답 칸이 있을 때만 노랑을 주고, 그 칸을 사용함으로 바꿉니다. 정답에 `l`이 하나뿐이면 추측에 `l`이 여러 개여도 노랑은 하나만 나옵니다.
- 예: 정답 `apple`, 추측 `allee` → `[2, 1, 0, 0, 2]`

## 3. 문제 코드

위치: [src/wordle.c:88](src/wordle.c:88) `wd_hash`, [src/wordle.c:117](src/wordle.c:117) `wd_make_code`, [src/wordle.c:151](src/wordle.c:151) `wd_parse_code`

```c
uint32_t hash = 2166136261u ^ WD_SALT;
for (int i = 0; i < len; i++) hash = (hash ^ word[i]) * 16777619u;
hash ^= hash >> 16; hash *= 0x85EBCA6Bu;
hash ^= hash >> 13; hash *= 0xC2B2AE35u;
return hash ^ hash >> 16;
```

- 단어의 각 글자 코드로 32비트 해시를 만들어 단어 ID로 씁니다. 사전 순서나 선택한 길이가 바뀌어도 같은 단어는 같은 코드입니다.
- 시작값에 `WD_SALT`를 섞고 끝에서 비트를 한 번 더 섞습니다. 공개 사전을 일반 FNV-1a로 해시해 코드와 맞춰 보는 방법을 막기 위한 가벼운 장치이며, 암호는 아닙니다. 솔트를 바꾸면 기존 코드가 모두 무효가 되므로 접두사 버전도 함께 올립니다.
- `wd_make_code`는 ID를 대문자 16진수 8자리로 붙여 코드 문자열을 만듭니다.

| 모드 | 코드 형식 |
|---|---|
| 기본 | `CW2-언어-단어ID` |
| 해커 | `CWH2-언어-단어ID` |
| 탐정 | `CWD2-언어-이름ID-이름ID` |

예: 기본 모드의 영어 정답 `apple`은 `CW2-EN-F123CC0B`입니다.

- `wd_parse_code`는 형식이 정확히 맞을 때만 모드·언어·ID를 돌려줍니다. 접두사를 `CWH2` → `CWD2` → `CW2` 순서로 확인합니다. 예전 `CW1` 코드는 열리지 않습니다. 소문자 16진수, 남는 글자, 모자란 자릿수는 모두 실패입니다.
- 해석한 ID로 실제 단어를 찾는 일은 데이터가 있는 JS([web/engine.js:112](web/engine.js:112) `resolvePuzzle`)가 합니다. 탐정 코드는 두 이름이 후보에 있고 서로 다를 때만 열립니다.

## 4. 추측 한 번 처리와 모드별 규칙

위치: [src/wordle.c:183](src/wordle.c:183) `wd_play`, 기회 수는 [src/wordle.c:97](src/wordle.c:97) `wd_attempts`

```c
for (int i = 0; i < count; i++) {
    wd_judge(answers + i * n, guess, n, results + i * n);
    if (same(answers + i * n, guess, n)) solved_mask |= 1 << i;
}
if (mode == WD_HACKER && !same(answers, guess, n)) {
    int hidden = (int)(random * n);
    results[hidden < n ? hidden : n - 1] = WD_HIDDEN;
}
int status = solved_mask & all;
if ((solved_mask & all) == all) status |= WD_WON | WD_FINISHED;
if (rows_done + 1 >= wd_attempts(mode)) status |= WD_FINISHED;
```

- **기본**: 정답 하나, 6번
- **해커**: 7번. 오답이면 첫 보드의 무작위 한 칸을 `-1`(가림)로 바꿉니다. 정답이면 가리지 않습니다.
- **탐정**: 정답 두 개, 공통 7번. 한 번 입력하면 두 정답 모두 판정합니다. 맞힌 정답은 `solved_mask` 비트로 계속 남고, 둘 다 맞히면 승리입니다.
- 반환값 하나에 "맞힌 정답 비트 | 끝남 | 승리"를 담습니다(비트 값은 [src/wordle.h](src/wordle.h)).
- 난수는 JS가 `Math.random()` 값을 넘겨줍니다. 테스트에서는 고정된 값을 넘겨 가릴 칸을 정할 수 있습니다.
- 게임 기록(줄 목록 등)은 화면이 쓰는 JS 객체에 남고, C는 계산만 합니다. 연결부는 [web/engine.js:125](web/engine.js:125) `submitGuess`입니다.

## 5. 사용한 글자 집계

위치: [src/wordle.c:203](src/wordle.c:203) `wd_keyboard`, 화면 쪽은 [web/app.js:128](web/app.js:128) `renderKeyboard`

```c
if (results[i] < 0) continue;
int k = 0;
while (k < count && keys[k] != tokens[i]) k++;
if (k == count) { keys[count] = tokens[i]; best[count++] = results[i]; }
else if (results[i] > best[k]) best[k] = results[i];
```

- 글자마다 지금까지 받은 판정 중 가장 좋은 값(없음 < 글자만 < 위치)을 남깁니다. 가린 칸(`-1`)은 세지 않습니다.
- 탐정 모드는 인물 A·B 기준으로 한 번씩 집계하고, 화면에서 키 하나의 왼쪽 절반을 A, 오른쪽 절반을 B의 색으로 칠합니다.

## 6. C와 JS 사이 값 주고받기

C 쪽: [src/wordle.c:222](src/wordle.c:222) `#ifdef __wasm__` 아래, JS 쪽: [web/engine.js:15](web/engine.js:15) `put`, `take`

```c
static uint32_t in_buf[WD_BUF];
static int32_t out_buf[WD_BUF];
WD_EXPORT(wd_judge) void js_judge(int n) { wd_judge(in_buf, in_buf + n, n, out_buf); }
```

```js
function put(values) {
  if (values.length > CAPACITY) return -1;
  new Uint32Array(wasm.memory.buffer, wasm.wd_in(), values.length).set(values);
  return values.length;
}
const take = count => [...new Int32Array(wasm.memory.buffer, wasm.wd_out(), count)];
```

- WebAssembly 함수는 숫자만 주고받을 수 있어서, C에 입력 버퍼와 출력 버퍼(각 1024칸)를 두었습니다.
- JS가 글자들을 유니코드 코드 값으로 바꿔 입력 버퍼에 쓰고(`put`) C 함수를 부르면, C가 결과를 출력 버퍼에 쓰고 JS가 읽습니다(`take`).
- 버퍼보다 긴 입력은 JS에서 먼저 거릅니다.
- `WD_EXPORT`가 붙은 함수만 JS에 노출됩니다. 이 부분은 wasm 빌드에서만 컴파일되고, 네이티브 테스트에서는 빠집니다.
- [web/engine.js:7](web/engine.js:7)에서 base64를 풀어 `WebAssembly.Instance`로 바로 불러옵니다. 크기가 6KB 정도라 동기로 불러와도 문제없습니다.

## 7. 입력 검증과 설정 변경 (화면 쪽)

위치: [web/app.js:194](web/app.js:194) 입력 폼, [web/app.js:168](web/app.js:168) `changeSettings`

- 한글 입력기가 글자를 조합하는 중에는 Enter를 눌러도 제출하지 않습니다.
- 칸 수가 맞고 사전(탐정은 이름 후보)에 있는 단어만 `submitGuess`로 넘깁니다. 잘못된 입력은 기회를 쓰지 않습니다.
- 모드·언어·길이를 바꾸면 값이 실제로 바뀌었을 때만 새 문제를 시작합니다. 길이 선택지는 7칸까지입니다.
- [web/app.js:105](web/app.js:105) `fitBoard`는 보드·입력칸·키보드가 한 화면에 들어올 때까지 칸 크기를 줄입니다.

## 8. 빌드와 테스트

**빌드**

- [scripts/build_wasm.py](scripts/build_wasm.py): `src/wordle.c`를 WebAssembly로 컴파일해 `web/wordle_wasm.js`를 만듭니다. C를 수정한 뒤 실행합니다.
- [scripts/build_data.py](scripts/build_data.py): `.cache`의 원본 사전에서 `data/` 목록을 다시 만듭니다.
- [scripts/bundle_data.py](scripts/bundle_data.py): `data/`의 단어 목록을 `web/words.js`로 묶습니다. 출제 목록은 XOR + base64로 가리고, `web/engine.js`의 `decodeAnswers`가 풉니다.
- [scripts/build_pages.py](scripts/build_pages.py): GitHub Pages용 파일을 `build/pages`에 모으고 링크를 검사합니다.

**테스트**

- [scripts/test_c.py](scripts/test_c.py): [tests/test_engine.c](tests/test_engine.c)를 네이티브로 컴파일해 C 규칙을 검사합니다.
- [tests/test_local.cjs](tests/test_local.cjs): Node에서 wasm을 불러 JS 연결부와 화면 흐름을 검사합니다.

**자동 검사와 배포**

[.github/workflows/ci.yml](.github/workflows/ci.yml)에서 다음 순서로 실행합니다.

1. C 테스트
2. 다시 만든 wasm·사전 번들이 커밋된 파일과 같은지 확인
3. JS 테스트
4. Pages 빌드·배포

컴파일러는 Zig에 들어 있는 clang을 씁니다. CI와 같은 버전을 설치하세요.

```sh
pip install ziglang==0.17.1
python scripts/test_c.py
python scripts/build_wasm.py
node --test tests/test_local.cjs
```
