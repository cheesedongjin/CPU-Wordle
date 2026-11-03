#ifndef WORDLE_ENGINE_H
#define WORDLE_ENGINE_H
#include <stdint.h>
#include <stddef.h>
#include <cjson/cJSON.h>
#define MAX_TOKENS 12
#define MAX_ANSWERS 1024
#define WORD_BYTES 128
typedef struct { char text[WORD_BYTES+1]; uint32_t tokens[MAX_TOKENS]; int length; } Word;
typedef struct { Word words[MAX_ANSWERS]; int count; char **allowed; size_t allowed_count; } Dictionary;
extern Dictionary dictionaries[2];
int normalize_word(const char *input, int lang, Word *out);
int judge(const Word *answer, const Word *guess, int tiles[MAX_TOKENS]);
int dictionaries_load(void);
int dictionary_contains(int lang, const char *word);
int answer_indices(int lang, int length, int *indices);
void random_hex(char *out, size_t bytes);
unsigned random_below(unsigned limit);
int64_t now_ms(void);
cJSON *word_tokens(const Word *word);
#endif
