# Word data

`ko_answers.txt`와 `en_answers.txt`만 출제합니다. 이 두 파일과 `curated_*.txt`는 GitHub Pages 배포본에서 빠지며, 게임에는 `web/words.js`에 가려진 형태로 들어갑니다. `*_allowed.txt`는 입력 검증용이며 출제 후보로 자동 편입하지 않습니다.

- 한국어: 국립국어원 및 hunspell-dict-ko 기여자의 비 legacy 사전 데이터에서 `result` 표제어만 추출했습니다. 제외된 항목은 생략하며 게임의 5~12칸 범위로 필터링했습니다. 뜻풀이·예문은 포함하지 않습니다. 이 파생 한국어 데이터는 **CC BY-SA 4.0**으로 제공합니다.
- 영어: dwyl/english-words의 `words_alpha.txt`를 5~8글자 소문자 단어로 필터링했습니다. **Unlicense**입니다. 입력 사전에는 희귀어도 있지만 출제 목록은 별도로 선정했습니다.
- 출처 URL, 고정 커밋, 변환 설명, SHA-256은 `manifest.json`, 라이선스 전문은 `licenses/`에 있습니다.
- 한글은 표제어 기준입니다. 원본에 없는 조사 결합이나 동사 활용형은 자동 생성하지 않습니다.
- 출제 후보 원본은 `curated_*.txt`입니다. 빌더가 사전 포함 여부와 토큰 중복을 검사한 뒤 실제 출제 파일을 만듭니다.

재생성: manifest의 커밋으로 원본 저장소를 `.cache/hunspell-ko`, `.cache/english-words`에 체크아웃한 뒤 `python scripts/build_data.py`를 실행합니다. 원본 출처와 라이선스 고지는 데이터와 함께 유지하세요.
