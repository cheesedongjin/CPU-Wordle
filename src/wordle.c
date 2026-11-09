/* 게임 규칙 전체: 자모 분해, 판정, 문제 코드, 모드별 진행.
 * WebAssembly로 컴파일해 브라우저에서 쓰고(web/wordle_wasm.js), 테스트에서는 그대로 네이티브로 컴파일합니다.
 * 표준 라이브러리 없이 동작하도록 작성했습니다. */
#include "wordle.h"

/* ── 한글 자모 표 ──────────────────────────────────────────────
 * 유니코드 한글 음절 = 0xAC00 + (초성×21 + 중성)×28 + 종성
 * 복합 모음(ㅘ)과 겹받침(ㄳ)은 두 칸으로, ㅐ·쌍자음은 한 칸으로 나눕니다.
 * 두 번째 칸이 없으면 0입니다. */
static const uint32_t INITIAL[19] = {
    U'ㄱ', U'ㄲ', U'ㄴ', U'ㄷ', U'ㄸ', U'ㄹ', U'ㅁ', U'ㅂ', U'ㅃ', U'ㅅ',
    U'ㅆ', U'ㅇ', U'ㅈ', U'ㅉ', U'ㅊ', U'ㅋ', U'ㅌ', U'ㅍ', U'ㅎ'};
static const uint32_t VOWEL[21][2] = {
    {U'ㅏ'}, {U'ㅐ'}, {U'ㅑ'}, {U'ㅒ'}, {U'ㅓ'}, {U'ㅔ'}, {U'ㅕ'},
    {U'ㅖ'}, {U'ㅗ'}, {U'ㅗ', U'ㅏ'}, {U'ㅗ', U'ㅐ'}, {U'ㅗ', U'ㅣ'}, {U'ㅛ'}, {U'ㅜ'},
    {U'ㅜ', U'ㅓ'}, {U'ㅜ', U'ㅔ'}, {U'ㅜ', U'ㅣ'}, {U'ㅠ'}, {U'ㅡ'}, {U'ㅡ', U'ㅣ'}, {U'ㅣ'}};
static const uint32_t FINAL[28][2] = {
    {0}, {U'ㄱ'}, {U'ㄲ'}, {U'ㄱ', U'ㅅ'}, {U'ㄴ'}, {U'ㄴ', U'ㅈ'}, {U'ㄴ', U'ㅎ'},
    {U'ㄷ'}, {U'ㄹ'}, {U'ㄹ', U'ㄱ'}, {U'ㄹ', U'ㅁ'}, {U'ㄹ', U'ㅂ'}, {U'ㄹ', U'ㅅ'}, {U'ㄹ', U'ㅌ'},
    {U'ㄹ', U'ㅍ'}, {U'ㄹ', U'ㅎ'}, {U'ㅁ'}, {U'ㅂ'}, {U'ㅂ', U'ㅅ'}, {U'ㅅ'}, {U'ㅆ'},
    {U'ㅇ'}, {U'ㅈ'}, {U'ㅊ'}, {U'ㅋ'}, {U'ㅌ'}, {U'ㅍ'}, {U'ㅎ'}};

static int is_space(uint32_t c) {
    return c == ' ' || (c >= '\t' && c <= '\r') || c == 0xA0 || c == 0x3000 || c == 0xFEFF;
}

/* 칸 하나(또는 두 개)를 out에 붙입니다. 자리가 모자라면 -1 */
static int push(uint32_t *out, int count, int cap, const uint32_t pair[2]) {
    for (int i = 0; i < 2 && pair[i]; i++) {
        if (count >= cap) return -1;
        out[count++] = pair[i];
    }
    return count;
}

/* 단어를 칸 배열로 바꿉니다. 앞뒤 공백은 무시하고, 허용되지 않는 글자가 있으면 -1.
 * NFC 정규화는 문자열 처리라 호출하는 쪽(JS)에서 먼저 합니다. */
int wd_split(const uint32_t *text, int len, int lang, uint32_t *out, int cap) {
    int start = 0, end = len, count = 0;
    while (start < end && is_space(text[start])) start++;
    while (end > start && is_space(text[end - 1])) end--;
    for (int i = start; i < end; i++) {
        uint32_t c = text[i];
        if (lang == WD_EN) {
            if (c >= 'A' && c <= 'Z') c += 'a' - 'A'; /* 소문자로 통일 */
            if (c < 'a' || c > 'z' || count >= cap) return -1;
            out[count++] = c;
            continue;
        }
        if (c < 0xAC00 || c >= 0xAC00 + 11172) return -1; /* 완성형 한글 음절만 허용 */
        uint32_t s = c - 0xAC00;
        uint32_t initial[2] = {INITIAL[s / 588], 0};       /* 588 = 21×28 */
        count = push(out, count, cap, initial);
        if (count >= 0) count = push(out, count, cap, VOWEL[s % 588 / 28]);
        if (count >= 0) count = push(out, count, cap, FINAL[s % 28]);
        if (count < 0) return -1;
    }
    return count;
}

/* 판정: 2 = 글자·위치 일치, 1 = 글자만 일치, 0 = 없음 */
void wd_judge(const uint32_t *answer, const uint32_t *guess, int n, int32_t *out) {
    int used[64] = {0}; /* 정답의 각 칸이 이미 다른 칸의 판정에 쓰였는지 */
    if (n > 64) n = 64;
    /* 1단계: 같은 위치의 글자를 먼저 초록으로 확정 */
    for (int i = 0; i < n; i++) {
        out[i] = guess[i] == answer[i] ? WD_CORRECT : WD_ABSENT;
        used[i] = out[i] == WD_CORRECT;
    }
    /* 2단계: 아직 쓰이지 않은 정답 칸이 있을 때만 노랑. 중복 글자가 정답보다 많이 노랗게 나오지 않습니다. */
    for (int i = 0; i < n; i++) {
        if (out[i] == WD_CORRECT) continue;
        for (int j = 0; j < n; j++) {
            if (!used[j] && answer[j] == guess[i]) {
                used[j] = 1;
                out[i] = WD_PRESENT;
                break;
            }
        }
    }
}

/* 단어 ID = FNV-1a 해시(32비트). 사전 순서나 설정과 관계없이 같은 단어는 같은 ID입니다. */
uint32_t wd_hash(const uint32_t *word, int len) {
    uint32_t hash = 2166136261u;
    for (int i = 0; i < len; i++) hash = (hash ^ word[i]) * 16777619u;
    return hash;
}

/* 모드별 기회 수 */
int wd_attempts(int mode) {
    return mode == WD_CLASSIC ? 6 : 7;
}

static const char *const PREFIX[3] = {"CW1", "CWH1", "CWD1"};
static const char *const LANG_CODE[2] = {"KO", "EN"};
static const char HEX[] = "0123456789ABCDEF";

static int append(char *out, int at, const char *text) {
    while (*text) out[at++] = *text++;
    return at;
}

static int append_hex(char *out, int at, uint32_t value) {
    for (int shift = 28; shift >= 0; shift -= 4) out[at++] = HEX[(value >> shift) & 15];
    return at;
}

/* 문제 코드 만들기: 기본 CW1-KO-XXXXXXXX, 해커 CWH1-…, 탐정 CWD1-언어-ID1-ID2 */
int wd_make_code(int mode, int lang, uint32_t id1, uint32_t id2, char *out) {
    int at = append(out, 0, PREFIX[mode]);
    out[at++] = '-';
    at = append(out, at, LANG_CODE[lang]);
    out[at++] = '-';
    at = append_hex(out, at, id1);
    if (mode == WD_DETECTIVE) {
        out[at++] = '-';
        at = append_hex(out, at, id2);
    }
    return at;
}

/* code[at…]가 text와 같으면 다음 위치, 아니면 -1 */
static int expect(const uint32_t *code, int len, int at, const char *text) {
    for (; *text; text++, at++)
        if (at >= len || code[at] != (uint32_t)*text) return -1;
    return at;
}

/* 대문자 16진수 8자리를 읽습니다. 실패하면 -1 */
static int read_hex(const uint32_t *code, int len, int at, uint32_t *value) {
    *value = 0;
    for (int i = 0; i < 8; i++, at++) {
        if (at >= len) return -1;
        uint32_t c = code[at];
        uint32_t digit = c >= '0' && c <= '9' ? c - '0' : c >= 'A' && c <= 'F' ? c - 'A' + 10 : 16;
        if (digit > 15) return -1;
        *value = *value << 4 | digit;
    }
    return at;
}

/* 문제 코드 해석. 형식이 정확히 맞을 때만 1을 돌려줍니다(대문자 기준). */
int wd_parse_code(const uint32_t *code, int len, int *mode, int *lang, uint32_t *id1, uint32_t *id2) {
    /* 긴 접두사부터 확인해야 CWH1이 CW1로 잘못 읽히지 않습니다. */
    static const int ORDER[3] = {WD_HACKER, WD_DETECTIVE, WD_CLASSIC};
    for (int k = 0; k < 3; k++) {
        int m = ORDER[k], at = expect(code, len, 0, PREFIX[m]);
        if (at < 0 || (at = expect(code, len, at, "-")) < 0) continue;
        for (int l = 0; l < 2; l++) {
            int p = expect(code, len, at, LANG_CODE[l]);
            if (p < 0 || (p = expect(code, len, p, "-")) < 0) continue;
            if ((p = read_hex(code, len, p, id1)) < 0) return 0;
            *id2 = 0;
            if (m == WD_DETECTIVE && ((p = expect(code, len, p, "-")) < 0 || (p = read_hex(code, len, p, id2)) < 0)) return 0;
            if (p != len) return 0;
            *mode = m;
            *lang = l;
            return 1;
        }
        return 0;
    }
    return 0;
}

static int same(const uint32_t *a, const uint32_t *b, int n) {
    for (int i = 0; i < n; i++)
        if (a[i] != b[i]) return 0;
    return 1;
}

/* 추측 한 번 처리.
 * answers: 정답 count개를 n칸씩 이어 붙인 배열, results: 정답마다 n칸 판정 결과
 * random: 0 이상 1 미만의 난수 (해커 모드에서 가릴 칸을 고를 때 사용)
 * 반환값: 맞힌 정답 비트 | WD_FINISHED | WD_WON */
int wd_play(int mode, int n, int count, const uint32_t *answers, const uint32_t *guess,
            int rows_done, int solved_mask, double random, int32_t *results) {
    int all = (1 << count) - 1;
    for (int i = 0; i < count; i++) {
        wd_judge(answers + i * n, guess, n, results + i * n);
        if (same(answers + i * n, guess, n)) solved_mask |= 1 << i; /* 한 번 맞힌 정답은 계속 맞힘 상태 */
    }
    /* 해커: 오답이면 첫 보드의 무작위 한 칸을 가림(-1) */
    if (mode == WD_HACKER && !same(answers, guess, n)) {
        int hidden = (int)(random * n);
        results[hidden < n ? hidden : n - 1] = WD_HIDDEN;
    }
    int status = solved_mask & all;
    if ((solved_mask & all) == all) status |= WD_WON | WD_FINISHED;
    if (rows_done + 1 >= wd_attempts(mode)) status |= WD_FINISHED;
    return status;
}

/* 사용한 글자 집계: 글자마다 가장 좋은 판정(없음 < 글자만 < 위치)을 남깁니다.
 * 가린 칸(-1)은 세지 않습니다. 반환값은 서로 다른 글자 수입니다. */
int wd_keyboard(const uint32_t *tokens, const int32_t *results, int cells, uint32_t *keys, int32_t *best) {
    int count = 0;
    for (int i = 0; i < cells; i++) {
        if (results[i] < 0) continue;
        int k = 0;
        while (k < count && keys[k] != tokens[i]) k++;
        if (k == count) {
            keys[count] = tokens[i];
            best[count++] = results[i];
        } else if (results[i] > best[k]) {
            best[k] = results[i];
        }
    }
    return count;
}

/* ── WebAssembly 연결부 ────────────────────────────────────────
 * JS와 C는 아래 두 버퍼로 값을 주고받습니다. JS가 in_buf에 값을 쓰고 함수를 부르면,
 * 결과가 out_buf에 담깁니다. 네이티브 테스트 빌드에서는 이 부분을 쓰지 않습니다. */
#ifdef __wasm__
#define WD_EXPORT(name) __attribute__((export_name(#name)))
#define WD_BUF 1024

static uint32_t in_buf[WD_BUF];
static int32_t out_buf[WD_BUF];

WD_EXPORT(wd_in) uint32_t *js_in(void) { return in_buf; }
WD_EXPORT(wd_out) int32_t *js_out(void) { return out_buf; }
WD_EXPORT(wd_capacity) int js_capacity(void) { return WD_BUF; }
WD_EXPORT(wd_attempts) int js_attempts(int mode) { return wd_attempts(mode); }

/* in: 글자 len개 → out: 칸 */
WD_EXPORT(wd_split) int js_split(int len, int lang) {
    return wd_split(in_buf, len, lang, (uint32_t *)out_buf, WD_BUF);
}

/* in: 정답 n칸 + 추측 n칸 → out: 판정 n개 */
WD_EXPORT(wd_judge) void js_judge(int n) { wd_judge(in_buf, in_buf + n, n, out_buf); }

/* in: 단어 글자 len개 → 해시 */
WD_EXPORT(wd_hash) uint32_t js_hash(int len) { return wd_hash(in_buf, len); }

/* out: 코드 문자열(글자 하나당 한 칸) */
WD_EXPORT(wd_code) int js_code(int mode, int lang, uint32_t id1, uint32_t id2) {
    char text[40];
    int len = wd_make_code(mode, lang, id1, id2, text);
    for (int i = 0; i < len; i++) out_buf[i] = text[i];
    return len;
}

/* in: 코드 글자 len개 → out: [모드, 언어, ID1, ID2] */
WD_EXPORT(wd_parse) int js_parse(int len) {
    int mode, lang;
    uint32_t id1, id2;
    if (!wd_parse_code(in_buf, len, &mode, &lang, &id1, &id2)) return 0;
    out_buf[0] = mode;
    out_buf[1] = lang;
    out_buf[2] = (int32_t)id1;
    out_buf[3] = (int32_t)id2;
    return 1;
}

/* in: 정답 count×n칸 + 추측 n칸 → out: 판정 count×n개 */
WD_EXPORT(wd_play) int js_play(int mode, int n, int count, int rows_done, int solved_mask, double random) {
    if (count < 1 || count > WD_MAX_ANSWERS || n < 1 || (count + 1) * n > WD_BUF) return WD_FINISHED;
    return wd_play(mode, n, count, in_buf, in_buf + count * n, rows_done, solved_mask, random, out_buf);
}

/* in: 글자 cells개 + 판정 cells개 → out: [글자, 판정] 쌍 */
WD_EXPORT(wd_keyboard) int js_keyboard(int cells) {
    static uint32_t keys[WD_BUF / 2];
    static int32_t best[WD_BUF / 2];
    if (cells * 2 > WD_BUF) return 0;
    int count = wd_keyboard(in_buf, (const int32_t *)(in_buf + cells), cells, keys, best);
    for (int i = 0; i < count; i++) {
        out_buf[2 * i] = (int32_t)keys[i];
        out_buf[2 * i + 1] = best[i];
    }
    return count;
}
#endif
