#define _POSIX_C_SOURCE 200809L
#include "engine.h"
#include <utf8proc.h>
#include <openssl/rand.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <ctype.h>

Dictionary dictionaries[2];
static const uint32_t initials[]={0x3131,0x3132,0x3134,0x3137,0x3138,0x3139,0x3141,0x3142,0x3143,0x3145,0x3146,0x3147,0x3148,0x3149,0x314a,0x314b,0x314c,0x314d,0x314e};
static const uint32_t vowels[][2]={{0x314f,0},{0x3150,0},{0x3151,0},{0x3152,0},{0x3153,0},{0x3154,0},{0x3155,0},{0x3156,0},{0x3157,0},{0x3157,0x314f},{0x3157,0x3150},{0x3157,0x3163},{0x315b,0},{0x315c,0},{0x315c,0x3153},{0x315c,0x3154},{0x315c,0x3163},{0x3160,0},{0x3161,0},{0x3161,0x3163},{0x3163,0}};
static const uint32_t finals[][2]={{0,0},{0x3131,0},{0x3132,0},{0x3131,0x3145},{0x3134,0},{0x3134,0x3148},{0x3134,0x314e},{0x3137,0},{0x3139,0},{0x3139,0x3131},{0x3139,0x3141},{0x3139,0x3142},{0x3139,0x3145},{0x3139,0x314c},{0x3139,0x314d},{0x3139,0x314e},{0x3141,0},{0x3142,0},{0x3142,0x3145},{0x3145,0},{0x3146,0},{0x3147,0},{0x3148,0},{0x314a,0},{0x314b,0},{0x314c,0},{0x314d,0},{0x314e,0}};
static int append(Word *w,uint32_t c){ if(!c)return 1; if(w->length>=MAX_TOKENS)return 0; w->tokens[w->length++]=c; return 1; }
int normalize_word(const char *input,int lang,Word *out){
    memset(out,0,sizeof(*out));
    if(!input || strlen(input)>WORD_BYTES || lang<0 || lang>1)return 0;
    while(*input && isspace((unsigned char)*input))input++;
    char tmp[WORD_BYTES+1]; snprintf(tmp,sizeof(tmp),"%s",input);
    size_t n=strlen(tmp); while(n && isspace((unsigned char)tmp[n-1]))tmp[--n]=0;
    utf8proc_uint8_t *norm=utf8proc_NFC((const utf8proc_uint8_t*)tmp);
    if(!norm)return 0;
    if(strlen((char*)norm)>WORD_BYTES){free(norm);return 0;}
    for(size_t i=0;norm[i];){
        int32_t cp; utf8proc_ssize_t used=utf8proc_iterate(norm+i,-1,&cp);
        if(used<1){free(norm);return 0;} i+=(size_t)used;
        if(lang==1){
            if(cp>='A'&&cp<='Z'){cp+=32;norm[i-1]=(unsigned char)cp;}
            if(cp<'a'||cp>'z'||out->length>=8||!append(out,(uint32_t)cp)){free(norm);return 0;}
        }else{
            if(cp<0xac00||cp>0xd7a3){free(norm);return 0;}
            unsigned s=(unsigned)(cp-0xac00),v=(s%588)/28,f=s%28;
            if(!append(out,initials[s/588])||!append(out,vowels[v][0])||!append(out,vowels[v][1])||!append(out,finals[f][0])||!append(out,finals[f][1])){free(norm);return 0;}
        }
    }
    snprintf(out->text,sizeof(out->text),"%s",norm);free(norm);
    return out->length>0;
}
int judge(const Word *answer,const Word *guess,int tiles[MAX_TOKENS]){
    if(answer->length!=guess->length||answer->length<1||answer->length>MAX_TOKENS)return -1;
    int used[MAX_TOKENS]={0},correct=0;
    for(int i=0;i<answer->length;i++){tiles[i]=0;if(answer->tokens[i]==guess->tokens[i]){tiles[i]=2;used[i]=1;correct++;}}
    for(int i=0;i<answer->length;i++)if(tiles[i]!=2)for(int j=0;j<answer->length;j++)if(!used[j]&&guess->tokens[i]==answer->tokens[j]){used[j]=1;tiles[i]=1;break;}
    return correct==answer->length;
}
static int cmpstr(const void *a,const void *b){return strcmp(*(char*const*)a,*(char*const*)b);}
int dictionary_contains(int lang,const char *word){Dictionary *d=&dictionaries[lang];return bsearch(&word,d->allowed,d->allowed_count,sizeof(char*),cmpstr)!=NULL;}
int dictionaries_load(void){
    for(int lang=0;lang<2;lang++){
        Dictionary *d=&dictionaries[lang];char path[128],line[512];
        snprintf(path,sizeof(path),"data/%s_allowed.txt",lang?"en":"ko");FILE *f=fopen(path,"r");if(!f)return 0;
        size_t cap=4096;d->allowed=calloc(cap,sizeof(char*));if(!d->allowed)return 0;
        while(fgets(line,sizeof(line),f)){Word w;if(!normalize_word(line,lang,&w)||w.length<5)continue;
            if(d->allowed_count==cap){cap*=2;char **p=realloc(d->allowed,cap*sizeof(char*));if(!p)return 0;d->allowed=p;}
            d->allowed[d->allowed_count++]=strdup(w.text);
        }fclose(f);qsort(d->allowed,d->allowed_count,sizeof(char*),cmpstr);
        snprintf(path,sizeof(path),"data/%s_answers.txt",lang?"en":"ko");f=fopen(path,"r");if(!f)return 0;
        while(fgets(line,sizeof(line),f)){
            Word w;if(!normalize_word(line,lang,&w)||w.length<5||!dictionary_contains(lang,w.text)||d->count>=MAX_ANSWERS){fprintf(stderr,"Invalid answer entry in %s\n",path);fclose(f);return 0;}
            for(int i=0;i<d->count;i++)if(w.length==d->words[i].length&&!memcmp(w.tokens,d->words[i].tokens,(size_t)w.length*sizeof(uint32_t))){fprintf(stderr,"Duplicate answer pattern\n");fclose(f);return 0;}
            d->words[d->count++]=w;
        }fclose(f);if(!d->count)return 0;
        fprintf(stderr,"Dictionary %s: %zu allowed / %d answers\n",lang?"en":"ko",d->allowed_count,d->count);
    }return 1;
}
int answer_indices(int lang,int length,int *indices){int n=0;for(int i=0;i<dictionaries[lang].count;i++)if(dictionaries[lang].words[i].length==length)indices[n++]=i;return n;}
void random_hex(char *out,size_t bytes){unsigned char raw[64];if(bytes>sizeof(raw)||RAND_bytes(raw,(int)bytes)!=1)abort();for(size_t i=0;i<bytes;i++)snprintf(out+i*2,3,"%02x",raw[i]);}
unsigned random_below(unsigned limit){if(!limit)abort();unsigned v,threshold=(unsigned)(-limit)%limit;do{if(RAND_bytes((unsigned char*)&v,sizeof(v))!=1)abort();}while(v<threshold);return v%limit;}
int64_t now_ms(void){struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return (int64_t)t.tv_sec*1000+t.tv_nsec/1000000;}
cJSON *word_tokens(const Word *word){cJSON *a=cJSON_CreateArray();for(int i=0;i<word->length;i++){unsigned char buf[5]={0};utf8proc_encode_char((int32_t)word->tokens[i],buf);cJSON_AddItemToArray(a,cJSON_CreateString((char*)buf));}return a;}
