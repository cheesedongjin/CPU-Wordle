# CPU WORDLE

한글 자모와 영어로 즐기는 C 기반 웹 워들입니다. 클래식, 180초 타임어택, 2인 실시간 대전, 개인 기록과 리더보드를 제공합니다.

**플레이:** [https://cpu-wordle.onrender.com](https://cpu-wordle.onrender.com)

## 실행

Docker Desktop 또는 Docker Engine이 실행된 환경에서:

```sh
docker compose up --build
```

[http://localhost:8080](http://localhost:8080)에 접속합니다. Compose는 개발용 PostgreSQL도 실행하고 named volume에 기록을 보존합니다. 개발용 DB 암호는 공개된 로컬 테스트 값이며 외부 운영에 사용하지 않습니다.

## Render 무료 배포

1. Neon에서 이 프로젝트 전용 무료 PostgreSQL 프로젝트/DB를 만듭니다.
2. 연결 문자열을 복사합니다. Render가 사용할 URL은 `sslmode=require` 이상을 사용하세요. 비밀번호가 포함되어 있으므로 Git이나 채팅에 기록하지 않습니다.
3. Render → **New → Blueprint** → `cheesedongjin/CPU-Wordle` 저장소를 연결합니다.
4. `render.yaml`의 `plan: free`를 확인하고 `DATABASE_URL`에 Neon 연결 문자열을 입력합니다.
5. 배포합니다. C 빌드와 엔진 테스트가 Docker 이미지 생성 중 실행됩니다. DB 테이블은 서버 시작 시 자동 생성됩니다.
6. Render 주소를 엽니다. 기본 `onrender.com` 도메인에서는 `RENDER_EXTERNAL_URL`로 출처 검사를 자동 설정합니다.
7. 사용자 도메인을 연결했다면 `APP_ORIGIN=https://사용자도메인`을 추가하고 해당 주소만 사용합니다.

무료 Render는 유휴 15분 후 절전될 수 있고 첫 접속이 약 1분 지연될 수 있습니다. 진행 중 게임은 메모리 상태이므로 서버 재시작 시 무효로 사라집니다. 완료 기록은 Neon에 저장되어 재배포 후에도 유지됩니다. 무료 한도와 정책은 배포 시 서비스 콘솔에서 확인하세요.

Render의 무료 PostgreSQL은 기간 제한이 있으므로 이 구성은 Neon을 사용합니다. SQLite를 운영 데이터 저장소로 쓰지 않습니다. Render 로컬 파일에 쓴 데이터는 영속하지 않습니다.

## 환경 변수

| 변수 | 설명 |
| --- | --- |
| `DATABASE_URL` | 필수 PostgreSQL 연결 URL. 운영에서는 TLS 사용 |
| `PORT` | 기본 8080, Render는 Blueprint에서 10000 |
| `PRODUCTION` | 운영에서는 `1`. Secure 쿠키 및 HTTPS 출처 요구 |
| `APP_ORIGIN` | 허용할 정확한 웹 출처. 생략하면 `RENDER_EXTERNAL_URL`, 개발은 localhost |
| `TEST_DURATION_MS` | 비운영 테스트 전용 제한 시간. 운영에서는 무시 |
| `TEST_COUNTDOWN_MS` | 비운영 테스트 전용 카운트다운. 운영에서는 무시 |
| `TEST_GRACE_MS` | 비운영 테스트 전용 재접속 유예. 운영에서는 무시 |

`APP_ORIGIN`에는 경로나 마지막 `/`를 넣지 않습니다. 기본 로컬 주소는 `http://localhost:8080`입니다. `127.0.0.1`을 사용하려면 해당 출처로 설정하세요.

## 구현

- C17 + CivetWeb: 정적 화면, HTTP API, WebSocket.
- utf8proc: 유효 UTF-8 검사, NFC 정규화.
- C 판정 엔진: 초성·중성·종성 분해, 복합 모음·겹받침 분리, 중복 글자 소비 판정.
- PostgreSQL/libpq: 익명 계정, 완료 결과, 순위 조회. 파라미터 바인딩 사용.
- OpenSSL: 운영체제 난수 기반 ID와 세션 토큰, 세션 토큰 SHA-256 저장.
- 순수 HTML/CSS/JS: 반응형 화면, 한글 IME 입력, 실시간 상태, 리더보드.
- WebSocket은 1초 간격 최신 스냅샷을 전달합니다. 상태 변경은 멱등성 ID가 포함된 HTTP POST로 통일했습니다.

## 게임 규칙

- 한글 5~12칸, 영어 5~8칸. 한글은 `사과 → ㅅ ㅏ ㄱ ㅗ ㅏ`처럼 나눕니다.
- `ㅐ·ㅔ·ㅒ·ㅖ`, `ㄲ·ㄸ·ㅃ·ㅆ·ㅉ`는 각각 한 칸입니다.
- 일반 게임은 6회. 타임어택은 180초, 정답마다 100점이며 문제당 6회입니다.
- 타임어택은 세션 내 정답을 반복하지 않습니다. 후보를 다 사용하면 조기 종료됩니다. 긴 한글 길이에는 후보가 적으므로 시작 화면에서 후보 수를 확인하세요.
- 대전 신청은 준비 완료를 뜻합니다. 같은 언어·길이 2명 매칭 후 3초 뒤 자동 시작합니다.
- 대전은 첫 정답이 승리, 둘 다 못 풀면 무승부. 기권 또는 30초 재접속 유예 초과는 패배입니다.
- 대전 승 3점, 무 1점, 패 0점. 타임어택은 사용자별 최고 기록을 비교합니다.
- 기간은 한국 시각 기준입니다. 주간은 월요일 00:00부터입니다.
- 익명 계정은 브라우저 쿠키에 연결됩니다. 쿠키 삭제 시 복구할 수 없고 다른 브라우저와 공유되지 않습니다.

## 단어 데이터

출제 목록과 검증 사전을 분리했습니다. 현재 한글 369개, 영어 449개만 출제합니다. 입력 검증은 한글 45,059개, 영어 139,420개의 단어 목록을 사용합니다. 원본 데이터 범위의 표제어만 인정하며 모든 한국어 활용형을 생성하지 않습니다.

[데이터 출처와 라이선스](data/README.md), [버전·해시](data/manifest.json), [원 설계](DESIGN.md), [구현 결정 및 운영 제한](IMPLEMENTATION.md)을 참고하세요.

## 검증

GitHub Actions가 C 빌드·단위 테스트, PostgreSQL을 포함한 HTTP/WebSocket 통합 테스트, 운영 Docker 이미지 빌드를 실행합니다.

Linux에서 직접 빌드하려면 Debian/Ubuntu 개발 패키지 `cmake pkg-config libcivetweb-dev libcjson-dev libutf8proc-dev libpq-dev libssl-dev`를 설치한 뒤:

```sh
cmake -S . -B build -DCMAKE_BUILD_TYPE=Debug
cmake --build build -j2
ctest --test-dir build --output-on-failure
```

## 운영 한계

개인 프로젝트/캐주얼 경쟁을 위한 단일 인스턴스 구현입니다. 계정 인증 강화, 실력 기반 매칭, 다중 인스턴스, 경기 중 서버 재시작 복구, 정식 대회 수준 부정행위 방지는 포함하지 않습니다. 익명 계정을 여러 개 만드는 행위를 완전히 막지 않습니다.
