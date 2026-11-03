#ifndef WORDLE_STORAGE_H
#define WORDLE_STORAGE_H
#include <cjson/cJSON.h>
int storage_init(void);
int storage_user(const char *hash,char id[33],char name[81],int create);
int storage_name(const char *id,const char *name);
int storage_result(const char *game,const char *uid,int mode,int lang,int length,int solved,int guesses,int elapsed,const char *outcome,int points);
cJSON *storage_board(int mode,int lang,int length,const char *period);
cJSON *storage_history(const char *uid);
#endif
