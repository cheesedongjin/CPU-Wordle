#ifndef WORDLE_H
#define WORDLE_H

#include <stdint.h>

/* 모드와 언어 번호. web/engine.js의 MODE_ID, LANG과 같아야 합니다. */
enum { WD_CLASSIC = 0, WD_HACKER = 1, WD_DETECTIVE = 2 };
enum { WD_KO = 0, WD_EN = 1 };

/* 판정 값 */
enum { WD_ABSENT = 0, WD_PRESENT = 1, WD_CORRECT = 2, WD_HIDDEN = -1 };

/* wd_play 반환값의 상태 비트 (아래 2비트는 맞힌 정답 목록) */
#define WD_FINISHED (1 << 8)
#define WD_WON (1 << 9)

#define WD_MAX_ANSWERS 2

int wd_split(const uint32_t *text, int len, int lang, uint32_t *out, int cap);
void wd_judge(const uint32_t *answer, const uint32_t *guess, int n, int32_t *out);
uint32_t wd_hash(const uint32_t *word, int len);
int wd_attempts(int mode);
int wd_make_code(int mode, int lang, uint32_t id1, uint32_t id2, char *out);
int wd_parse_code(const uint32_t *code, int len, int *mode, int *lang, uint32_t *id1, uint32_t *id2);
int wd_play(int mode, int n, int count, const uint32_t *answers, const uint32_t *guess,
            int rows_done, int solved_mask, double random, int32_t *results);
int wd_keyboard(const uint32_t *tokens, const int32_t *results, int cells, uint32_t *keys, int32_t *best);

#endif
