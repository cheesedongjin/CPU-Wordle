/* src/wordle.c 규칙을 네이티브로 컴파일해 직접 검사합니다.
 * 실행: python scripts/test_c.py */
#include <stdio.h>
#include <string.h>
#include "../src/wordle.h"

static int failures = 0;
#define CHECK(cond) do { if (!(cond)) { printf("실패 %s:%d: %s\n", __FILE__, __LINE__, #cond); failures++; } } while (0)

/* U"…" 문자열을 uint32_t 배열로 쓰기 위한 도우미 */
#define TEXT(s) ((const uint32_t *)(s))
static int ulen(const void *s) {
    const uint32_t *p = s;
    int n = 0;
    while (p[n]) n++;
    return n;
}

static int split(const void *text, int lang, uint32_t *out) {
    return wd_split(TEXT(text), ulen(text), lang, out, 64);
}

static void test_split(void) {
    uint32_t out[64];
    CHECK(split(U"사과", WD_KO, out) == 5);
    CHECK(memcmp(out, U"ㅅㅏㄱㅗㅏ", 5 * sizeof(uint32_t)) == 0); /* ㅘ는 ㅗ ㅏ 두 칸 */
    CHECK(split(U"값이", WD_KO, out) == 6);                       /* 겹받침 ㅄ은 두 칸 */
    CHECK(split(U"꽈배기", WD_KO, out) == 7);                      /* 쌍자음 ㄲ은 한 칸 */
    CHECK(split(U"괜찮다", WD_KO, out) == 10);
    CHECK(split(U"  사과 ", WD_KO, out) == 5);                    /* 앞뒤 공백 무시 */
    CHECK(split(U"abc가", WD_KO, out) == -1);
    CHECK(split(U"ApPle", WD_EN, out) == 5 && out[0] == 'a' && out[2] == 'p');
    CHECK(split(U"12345", WD_EN, out) == -1);
    CHECK(wd_split(TEXT(U"사과"), 2, WD_KO, out, 4) == -1);       /* 출력 자리가 모자라면 실패 */
}

static void test_judge(void) {
    int32_t r[5];
    wd_judge(TEXT(U"apple"), TEXT(U"allee"), 5, r);
    CHECK(r[0] == 2 && r[1] == 1 && r[2] == 0 && r[3] == 0 && r[4] == 2); /* 남은 l은 하나뿐 */
    wd_judge(TEXT(U"apple"), TEXT(U"apple"), 5, r);
    CHECK(r[0] == 2 && r[1] == 2 && r[2] == 2 && r[3] == 2 && r[4] == 2);
    wd_judge(TEXT(U"abbey"), TEXT(U"babes"), 5, r);
    CHECK(r[0] == 1 && r[1] == 1 && r[2] == 2 && r[3] == 2 && r[4] == 0);
}

static void test_codes(void) {
    char text[40];
    uint32_t code[40], id1, id2;
    int mode, lang;
    uint32_t apple = wd_hash(TEXT(U"apple"), 5);
    int len = wd_make_code(WD_CLASSIC, WD_EN, apple, 0, text);
    CHECK(len == 15 && memcmp(text, "CW2-EN-F123CC0B", 15) == 0);
    /* 솔트 없는 FNV-1a(apple = 10BC2ABF)와 달라야 함 */
    CHECK(apple != 0x10BC2ABFu);

    /* 만든 코드를 다시 읽으면 같은 값이 나와야 함 */
    for (int m = 0; m < 3; m++) {
        len = wd_make_code(m, WD_KO, 0xDEADBEEF, 0x0123ABCD, text);
        for (int i = 0; i < len; i++) code[i] = (unsigned char)text[i];
        CHECK(wd_parse_code(code, len, &mode, &lang, &id1, &id2));
        CHECK(mode == m && lang == WD_KO && id1 == 0xDEADBEEF);
        CHECK(id2 == (m == WD_DETECTIVE ? 0x0123ABCDu : 0u));
    }
    /* 예전 버전(CW1) 코드도 거부 */
    const char *bad[] = {"BAD", "CW2-EN-F123CC0", "CW2-EN-f123cc0b", "CW2-JP-F123CC0B", "CW2-EN-F123CC0B-", "CWD2-EN-F123CC0B", "CW1-EN-10BC2ABF"};
    for (unsigned k = 0; k < sizeof bad / sizeof *bad; k++) {
        len = (int)strlen(bad[k]);
        for (int i = 0; i < len; i++) code[i] = (unsigned char)bad[k][i];
        CHECK(!wd_parse_code(code, len, &mode, &lang, &id1, &id2));
    }
}

static void test_play(void) {
    int32_t r[10];
    /* 해커: 오답이면 random에 해당하는 칸(0.4 × 5 = 2번 칸)을 가림 */
    int s = wd_play(WD_HACKER, 5, 1, TEXT(U"apple"), TEXT(U"grape"), 0, 0, 0.4, r);
    CHECK(r[2] == WD_HIDDEN && !(s & WD_FINISHED));
    s = wd_play(WD_HACKER, 5, 1, TEXT(U"apple"), TEXT(U"apple"), 1, 0, 0.8, r);
    CHECK((s & WD_WON) && (s & WD_FINISHED) && r[0] == 2 && r[4] == 2); /* 정답은 가리지 않음 */

    /* 기회 수: 기본 6, 해커·탐정 7 */
    CHECK(wd_play(WD_CLASSIC, 5, 1, TEXT(U"apple"), TEXT(U"grape"), 5, 0, 0, r) & WD_FINISHED);
    CHECK(!(wd_play(WD_HACKER, 5, 1, TEXT(U"apple"), TEXT(U"grape"), 5, 0, 0, r) & WD_FINISHED));

    /* 탐정: 두 이름을 모두 맞혀야 승리, 먼저 맞힌 이름은 유지 */
    const uint32_t *names = TEXT(U"alicejames");
    s = wd_play(WD_DETECTIVE, 5, 2, names, TEXT(U"alice"), 0, 0, 0, r);
    CHECK((s & 3) == 1 && !(s & WD_WON));
    CHECK(r[5] == 1 && r[6] == 0); /* 두 번째 보드: james 기준 판정 */
    s = wd_play(WD_DETECTIVE, 5, 2, names, TEXT(U"james"), 1, s & 3, 0, r);
    CHECK((s & 3) == 3 && (s & WD_WON));
}

static void test_keyboard(void) {
    uint32_t keys[8];
    int32_t best[8];
    const int32_t results[6] = {0, 1, -1, 2, -1, 0};
    int n = wd_keyboard(TEXT(U"abcaca"), results, 6, keys, best);
    CHECK(n == 2);                                        /* c는 가린 칸뿐이라 빠짐 */
    CHECK(keys[0] == 'a' && best[0] == 2);                /* a: 0, 2, 0 중 가장 좋은 2 */
    CHECK(keys[1] == 'b' && best[1] == 1);
}

int main(void) {
    test_split();
    test_judge();
    test_codes();
    test_play();
    test_keyboard();
    if (failures) {
        printf("C 테스트 실패 %d건\n", failures);
        return 1;
    }
    printf("C 테스트 통과\n");
    return 0;
}
