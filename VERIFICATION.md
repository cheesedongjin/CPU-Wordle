# 검증 기록

2026-11-03 기준.

## 자동 검증

GitHub Actions `Build and test` 워크플로:

- Ubuntu에서 C 서버와 엔진을 실제 컴파일.
- UTF-8/NFC, 한글 자모 분해, 영어 중복 문자 판정, 사전 로딩 및 모든 선택 길이의 후보 존재 검사.
- PostgreSQL 16 서비스에 연결한 HTTP/WebSocket 통합 테스트.
- 세션 분리, Origin 차단, 잘못된 단어, 멱등성, 게임 소유권, 한글 판정, 영어 정답 완료, 결과 저장, 타임어택 시간 종료, 리더보드, 매칭, 기권, 연결 종료 유예 검사.
- 운영 Debian Docker 이미지 빌드 및 이미지 내부 엔진 테스트.
- 브라우저 JavaScript 문법 검사.

최신 실행 결과는 [GitHub Actions](https://github.com/cheesedongjin/CPU-Wordle/actions)에서 확인합니다.

## 실제 배포 검증

- Render Singapore / Free / Docker 서비스가 Live 상태로 전환됨.
- Neon Singapore 무료 프로젝트 `CPU-Wordle`의 pooled PostgreSQL 연결 사용.
- HTTPS 사이트에서 익명 세션 생성과 설정 로딩 성공.
- 한글 5칸 게임에서 `사과`, `하늘`, `바람` 제출 후 정답 완료 및 기록 저장 확인.
- 개인 기록 화면에서 해당 승리 기록 조회 확인.
- Chrome과 별도 앱 내 브라우저 사이 실제 2인 매칭과 공통 카운트다운 확인.
- 상대에게 시도 횟수만 동기화되고 추측 단어는 공개되지 않음 확인.
- 한쪽 기권 후 상대 승리 및 리더보드의 3점/0점 반영 확인.
- 한글 12칸 타임어택에서 정답 후 다음 문제 전환, 100점씩 누적, 4개 후보 소진 후 400점 종료 확인.
- 데스크톱 및 390px 모바일 화면 레이아웃 확인.

## 검증 한계

- 로컬 Windows Docker Desktop이 시작 오류로 종료되어 로컬 C 컨테이너 실행은 완료하지 못함. Linux 컴파일·통합·Docker 검증은 GitHub Actions에서 수행함.
- OS별 실제 물리 한글 입력기의 조합 이벤트 전체 조합은 수동 검증하지 않음. UI에는 composition/isComposing 방어를 구현했으며 완성형 한글 입력·자모 미리보기·제출은 브라우저에서 확인함.
- 대규모 부하, 장시간 장애 복구, 모든 모바일 기종, 정식 대회 수준 부정행위 방지 검증은 수행하지 않음.
