#define _POSIX_C_SOURCE 200809L
#include "engine.h"
#include "storage.h"
#include <civetweb.h>
#include <openssl/sha.h>
#include <utf8proc.h>
#include <pthread.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

#define USERS 1024
#define GAMES 256
#define MEMOS 16
typedef struct { char id[65],body_hash[65]; char *response; int status; } Memo;
typedef struct {
    int used,game,queued,lang,length;
    char id[33],hash[65],name[81];
    int64_t seen,rate_time;int rate_count,memo_next;
    Memo memo[MEMOS];
} User;
typedef struct {Word word;int tiles[MAX_TOKENS];} Guess;
typedef struct {
    int user,attempts,total,solved,points,exhausted,saved;
    Guess guesses[6]; char outcome[24];
} Player;
typedef struct {
    int used,mode,lang,length,done,round,answer,pool[MAX_ANSWERS],pool_count,pool_pos;
    char id[33],puzzle[33],reason[32],last_answer[WORD_BYTES+1];
    int64_t start,end,finished;
    Player p[2];
} Game;
static User users[USERS];static Game games[GAMES];
static pthread_mutex_t state_lock=PTHREAD_MUTEX_INITIALIZER;
static volatile sig_atomic_t stopping;
static char origin[256];static int production;
static int duration_ms=180000,grace_ms=30000,countdown_ms=3000;
static int64_t version;
static struct mg_context *ctx;
static void hash_text(const char *s,char out[65]){unsigned char d[32];SHA256((const unsigned char*)s,strlen(s),d);for(int i=0;i<32;i++)snprintf(out+i*2,3,"%02x",d[i]);}
static const char *str(cJSON *j,const char *key){cJSON *x=cJSON_GetObjectItemCaseSensitive(j,key);return cJSON_IsString(x)?x->valuestring:"";}
static int number(cJSON *j,const char *key,int fallback){cJSON *x=cJSON_GetObjectItemCaseSensitive(j,key);return cJSON_IsNumber(x)?x->valueint:fallback;}
static void addstr(cJSON *j,const char *key,const char *value){cJSON_AddStringToObject(j,key,value);}
static void addnum(cJSON *j,const char *key,double value){cJSON_AddNumberToObject(j,key,value);}
static cJSON *error_json(const char *code,const char *message){cJSON *j=cJSON_CreateObject();addstr(j,"error",code);addstr(j,"message",message);return j;}
static int send_text(struct mg_connection *c,int status,const char *s,const char *extra){
    mg_printf(c,"HTTP/1.1 %d OK\r\nContent-Type: application/json; charset=utf-8\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n%sContent-Length: %zu\r\n\r\n",status,extra?extra:"",strlen(s));mg_write(c,s,strlen(s));return status;
}
static int respond(struct mg_connection *c,int status,cJSON *j){char *s=cJSON_PrintUnformatted(j);cJSON_Delete(j);int r=send_text(c,status,s,NULL);free(s);return r;}
static int valid_origin(struct mg_connection *c){const char *o=mg_get_header(c,"Origin");return o&&!strcmp(o,origin);}
static int auth(struct mg_connection *c){
    char token[80],hash[65];const char *cookie=mg_get_header(c,"Cookie");
    if(!cookie||mg_get_cookie(cookie,"wordle_session",token,sizeof(token))!=64)return -1;
    hash_text(token,hash);for(int i=0;i<USERS;i++)if(users[i].used&&!strcmp(hash,users[i].hash))return i;
    char id[33],name[81];if(!storage_user(hash,id,name,0))return -1;
    for(int i=0;i<USERS;i++)if(!users[i].used){User *u=&users[i];memset(u,0,sizeof(*u));u->used=1;u->game=-1;u->seen=now_ms();snprintf(u->id,sizeof(u->id),"%s",id);snprintf(u->name,sizeof(u->name),"%s",name);snprintf(u->hash,sizeof(u->hash),"%s",hash);return i;}return -1;
}
static int side(Game *g,int uid){return g->p[0].user==uid?0:1;}
static void next_puzzle(Game *g){g->answer=g->pool[g->pool_pos++];g->round++;random_hex(g->puzzle,16);g->p[0].attempts=0;g->p[0].exhausted=0;memset(g->p[0].guesses,0,sizeof(g->p[0].guesses));}
static void finish(Game *g,const char *reason,int winner,int64_t now){
    if(g->done)return;g->done=1;g->finished=now;snprintf(g->reason,sizeof(g->reason),"%s",reason);
    int count=g->mode==2?2:1;
    for(int i=0;i<count;i++){
        Player *p=&g->p[i];const char *outcome="finished";
        if(!strcmp(reason,"abandoned"))outcome="abandoned";
        else if(g->mode==2){outcome=winner==-2?"invalidated":winner<0?"draw":winner==i?"won":"lost";p->points=winner==-2?0:winner<0?1:winner==i?3:0;}
        else if(g->mode==0)outcome=winner==0?"won":"lost";
        snprintf(p->outcome,sizeof(p->outcome),"%s",outcome);
    }version++;
}
static void tick(int64_t now){
    for(int i=0;i<USERS;i++)if(users[i].used&&users[i].queued&&now-users[i].seen>30000){users[i].queued=0;version++;}
    for(int i=0;i<GAMES;i++){
        Game *g=&games[i];if(!g->used||g->done)continue;
        if(g->mode!=0&&now>=g->end){finish(g,"timeout",-1,g->end);continue;}
        if(g->mode==0&&now-users[g->p[0].user].seen>3600000){finish(g,"abandoned",-1,now);continue;}
        if(g->mode==2){
            int64_t a=users[g->p[0].user].seen+grace_ms,b=users[g->p[1].user].seen+grace_ms;
            if(now>=a||now>=b){int winner=a==b?-2:a<b?1:0;finish(g,"disconnected",winner,a<b?a:b);}
        }
    }
}
static cJSON *snapshot(int uid){
    User *u=&users[uid];cJSON *j=cJSON_CreateObject();addstr(j,"user_id",u->id);addstr(j,"nickname",u->name);addnum(j,"sequence",(double)version);cJSON_AddBoolToObject(j,"queued",u->queued);
    if(u->game<0||!games[u->game].used){cJSON_AddNullToObject(j,"game");return j;}
    Game *g=&games[u->game];int s=side(g,uid);Player *p=&g->p[s];int64_t now=now_ms();
    cJSON *v=cJSON_AddObjectToObject(j,"game");addstr(v,"id",g->id);addstr(v,"puzzle_id",g->puzzle);addnum(v,"mode",g->mode);addstr(v,"language",g->lang?"en":"ko");addnum(v,"length",g->length);addnum(v,"round",g->round);addnum(v,"solved",p->solved);addnum(v,"score",p->points);addnum(v,"attempts",p->attempts);addnum(v,"total_guesses",p->total);
    addnum(v,"countdown_ms",now<g->start?g->start-now:0);addnum(v,"remaining_ms",g->done?0:g->mode==0?-1:(g->end>now?g->end-now:0));
    addstr(v,"status",g->done?"finished":now<g->start?"countdown":"active");addstr(v,"outcome",p->outcome);addstr(v,"reason",g->reason);cJSON_AddBoolToObject(v,"exhausted",p->exhausted);cJSON_AddBoolToObject(v,"saved",p->saved);
    if(g->done)addstr(v,"answer",dictionaries[g->lang].words[g->answer].text);
    if(g->mode==1&&*g->last_answer)addstr(v,"previous_answer",g->last_answer);
    cJSON *rows=cJSON_AddArrayToObject(v,"rows");for(int i=0;i<p->attempts;i++){cJSON *r=cJSON_CreateObject();addstr(r,"word",p->guesses[i].word.text);cJSON_AddItemToObject(r,"tokens",word_tokens(&p->guesses[i].word));cJSON *colors=cJSON_AddArrayToObject(r,"tiles");for(int n=0;n<g->length;n++)cJSON_AddItemToArray(colors,cJSON_CreateNumber(p->guesses[i].tiles[n]));cJSON_AddItemToArray(rows,r);}
    if(g->mode==2){Player *other=&g->p[1-s];cJSON *o=cJSON_AddObjectToObject(v,"opponent");addstr(o,"nickname",users[other->user].name);addnum(o,"attempts",other->attempts);cJSON_AddBoolToObject(o,"connected",now-users[other->user].seen<5000);cJSON_AddBoolToObject(o,"exhausted",other->exhausted);}
    return j;
}
static int make_game(int uid,int opponent,int mode,int lang,int length){
    int slot=-1;for(int i=0;i<GAMES;i++)if(!games[i].used){slot=i;break;}if(slot<0)return 0;
    Game *g=&games[slot];memset(g,0,sizeof(*g));g->pool_count=answer_indices(lang,length,g->pool);if(!g->pool_count)return 0;
    for(int i=g->pool_count-1;i>0;i--){int n=(int)random_below((unsigned)i+1);int tmp=g->pool[i];g->pool[i]=g->pool[n];g->pool[n]=tmp;}
    g->used=1;g->mode=mode;g->lang=lang;g->length=length;g->start=now_ms()+(mode==2?countdown_ms:0);g->end=g->start+duration_ms;
    random_hex(g->id,16);g->p[0].user=uid;g->p[1].user=opponent;next_puzzle(g);users[uid].game=slot;users[uid].queued=0;
    if(opponent>=0){users[opponent].game=slot;users[opponent].queued=0;}version++;return 1;
}
static cJSON *config_json(void){cJSON *j=cJSON_CreateObject();addstr(j,"version","v1");addnum(j,"duration_seconds",duration_ms/1000);cJSON *langs=cJSON_AddObjectToObject(j,"languages");for(int l=0;l<2;l++){cJSON *a=cJSON_AddArrayToObject(langs,l?"en":"ko");for(int n=5;n<=(l?8:12);n++){int indices[MAX_ANSWERS],count=answer_indices(l,n,indices);if(count){cJSON *o=cJSON_CreateObject();addnum(o,"length",n);addnum(o,"answers",count);cJSON_AddItemToArray(a,o);}}}return j;}
static cJSON *mutate(int uid,const char *action,cJSON *body,int *status){
    User *u=&users[uid];Game *g=u->game>=0?&games[u->game]:NULL;int64_t now=now_ms();
    if(!strcmp(action,"name")){
        const char *name=str(body,"nickname");size_t bytes=strlen(name);int chars=0,valid=bytes>0&&bytes<=80;
        for(size_t i=0;valid&&i<bytes;){int32_t cp;int n=(int)utf8proc_iterate((const unsigned char*)name+i,(utf8proc_ssize_t)(bytes-i),&cp);if(n<=0||cp<32||cp==127){valid=0;break;}chars++;i+=(size_t)n;}
        if(!valid||chars>20){*status=422;return error_json("INVALID_NAME","닉네임은 1~20자로 입력하세요.");}
        if(!storage_name(u->id,name)){*status=503;return error_json("STORAGE_UNAVAILABLE","저장소에 연결할 수 없습니다. 잠시 후 다시 시도하세요.");}snprintf(u->name,sizeof(u->name),"%s",name);version++;return snapshot(uid);
    }
    if(!strcmp(action,"start")||!strcmp(action,"queue")){
        if((g&&!g->done)||u->queued){*status=409;return error_json("ACTIVE_GAME","이미 진행 중인 게임 또는 대기가 있습니다.");}
        int lang=!strcmp(str(body,"language"),"ko")?0:!strcmp(str(body,"language"),"en")?1:-1;int length=number(body,"length",0),mode=number(body,"mode",0),idx[MAX_ANSWERS];
        if(!strcmp(action,"queue"))mode=2;
        if(lang<0||length<5||length>(lang?8:12)||mode<0||mode>2||(!strcmp(action,"start")&&mode==2)||!answer_indices(lang,length,idx)){*status=422;return error_json("INVALID_SETTINGS","언어와 길이를 다시 선택하세요.");}
        if(mode==2){
            int opponent=-1;for(int i=0;i<USERS;i++)if(i!=uid&&users[i].used&&users[i].queued&&users[i].lang==lang&&users[i].length==length){opponent=i;break;}
            if(opponent<0){u->queued=1;u->lang=lang;u->length=length;u->game=-1;version++;return snapshot(uid);}
            if(!make_game(uid,opponent,mode,lang,length)){*status=503;return error_json("SERVER_FULL","현재 대전 방이 가득 찼습니다.");}
        }else if(!make_game(uid,-1,mode,lang,length)){*status=503;return error_json("SERVER_FULL","잠시 후 다시 시작하세요.");}
        return snapshot(uid);
    }
    if(!strcmp(action,"leave_queue")){u->queued=0;version++;return snapshot(uid);}
    if(!g||strcmp(str(body,"game_id"),g->id)){*status=409;return error_json("STALE_GAME","게임 상태가 바뀌었습니다. 새로고침해 주세요.");}
    if(g->done){*status=409;return error_json("GAME_FINISHED","이미 종료된 게임입니다.");}
    int s=side(g,uid);Player *p=&g->p[s];
    if(!strcmp(action,"abandon")){finish(g,g->mode==2?"forfeit":"abandoned",g->mode==2?1-s:-1,now);return snapshot(uid);}
    if(strcmp(action,"guess")){*status=404;return error_json("NOT_FOUND","알 수 없는 요청입니다.");}
    if(now<g->start){*status=409;return error_json("NOT_STARTED","카운트다운이 끝나면 입력하세요.");}
    if(g->mode!=0&&now>=g->end){finish(g,"timeout",-1,g->end);*status=409;return error_json("DEADLINE_EXCEEDED","제한 시간이 끝났습니다.");}
    if(strcmp(str(body,"puzzle_id"),g->puzzle)){*status=409;return error_json("STALE_PUZZLE","다음 문제로 넘어갔습니다.");}
    if(p->exhausted){*status=409;return error_json("EXHAUSTED","시도를 모두 사용했습니다. 상대 결과를 기다려 주세요.");}
    Word w;if(!normalize_word(str(body,"word"),g->lang,&w)){*status=422;return error_json("INVALID_WORD","허용된 한글 또는 영문 단어를 입력하세요.");}
    if(w.length!=g->length){*status=422;return error_json("LENGTH_MISMATCH","현재 보드와 같은 칸 수의 단어를 입력하세요.");}
    if(!dictionary_contains(g->lang,w.text)){*status=422;return error_json("WORD_NOT_FOUND","검증 사전에 없는 단어입니다. 다른 단어를 입력하세요.");}
    for(int i=0;i<p->attempts;i++)if(!strcmp(p->guesses[i].word.text,w.text)){*status=422;return error_json("ALREADY_GUESSED","이미 입력한 단어입니다.");}
    Guess *row=&p->guesses[p->attempts++];row->word=w;p->total++;int win=judge(&dictionaries[g->lang].words[g->answer],&w,row->tiles);version++;
    if(win){p->solved++;if(g->mode!=2)p->points=p->solved*100;}
    if(g->mode==1&&(win||p->attempts==6)){
        cJSON *result=cJSON_CreateObject();addstr(result,"word",w.text);cJSON_AddItemToObject(result,"tokens",word_tokens(&w));cJSON *a=cJSON_AddArrayToObject(result,"tiles");for(int i=0;i<g->length;i++)cJSON_AddItemToArray(a,cJSON_CreateNumber(row->tiles[i]));cJSON_AddBoolToObject(result,"solved",win);
        snprintf(g->last_answer,sizeof(g->last_answer),"%s",dictionaries[g->lang].words[g->answer].text);
        if(g->pool_pos==g->pool_count)finish(g,"pool_exhausted",-1,now);else next_puzzle(g);
        cJSON *j=snapshot(uid);cJSON_AddItemToObject(j,"last_guess",result);return j;
    }
    if(win)finish(g,"solved",s,now);
    else if(p->attempts==6){p->exhausted=1;if(g->mode==0)finish(g,"attempts_exhausted",-1,now);else if(g->p[1-s].exhausted)finish(g,"attempts_exhausted",-1,now);}
    return snapshot(uid);
}
static int api(struct mg_connection *c,void *unused){
    (void)unused;const struct mg_request_info *r=mg_get_request_info(c);const char *path=r->local_uri;
    if(!strcmp(path,"/health"))return respond(c,200,cJSON_Parse("{\"status\":\"ok\"}"));
    int post=!strcmp(r->request_method,"POST");
    if(post&&!valid_origin(c))return respond(c,403,error_json("ORIGIN","허용되지 않은 요청 출처입니다."));
    if(!post&&strcmp(r->request_method,"GET"))return respond(c,405,error_json("METHOD","지원하지 않는 요청입니다."));
    if(!strcmp(path,"/api/config")&&!post)return respond(c,200,config_json());
    pthread_mutex_lock(&state_lock);int uid=auth(c);
    if(!strcmp(path,"/api/session")&&post){
        char headers[256]="";
        if(uid<0){
            for(int i=0;i<USERS;i++)if(!users[i].used){uid=i;break;}
            if(uid<0){pthread_mutex_unlock(&state_lock);return respond(c,503,error_json("SERVER_FULL","접속 인원이 많습니다. 잠시 후 다시 시도하세요."));}
            char token[65],hash[65],id[33],name[81];random_hex(token,32);hash_text(token,hash);
            if(!storage_user(hash,id,name,1)){pthread_mutex_unlock(&state_lock);return respond(c,503,error_json("STORAGE_UNAVAILABLE","저장소 연결을 확인해 주세요."));}
            User *u=&users[uid];memset(u,0,sizeof(*u));u->used=1;u->game=-1;snprintf(u->id,sizeof(u->id),"%s",id);snprintf(u->hash,sizeof(u->hash),"%s",hash);snprintf(u->name,sizeof(u->name),"%s",name);
            snprintf(headers,sizeof(headers),"Set-Cookie: wordle_session=%s; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000%s\r\n",token,production?"; Secure":"");
        }
        users[uid].seen=now_ms();cJSON *j=snapshot(uid);char *s=cJSON_PrintUnformatted(j);cJSON_Delete(j);pthread_mutex_unlock(&state_lock);int code=send_text(c,200,s,headers);free(s);return code;
    }
    if(uid<0){pthread_mutex_unlock(&state_lock);return respond(c,401,error_json("UNAUTHORIZED","세션이 만료되었습니다. 페이지를 새로고침하세요."));}
    User *u=&users[uid];int64_t now=now_ms();tick(now);u->seen=now;
    if(!post){
        cJSON *j=NULL;
        if(!strcmp(path,"/api/state"))j=snapshot(uid);
        else if(!strcmp(path,"/api/history"))j=storage_history(u->id);
        else if(!strcmp(path,"/api/leaderboard")){
            char mode[8]="",lang[8]="",length[8]="",period[8]="";const char *q=r->query_string?r->query_string:"";
            mg_get_var(q,strlen(q),"mode",mode,sizeof(mode));mg_get_var(q,strlen(q),"language",lang,sizeof(lang));mg_get_var(q,strlen(q),"length",length,sizeof(length));mg_get_var(q,strlen(q),"period",period,sizeof(period));
            int m=atoi(mode),n=atoi(length);if((m!=1&&m!=2)||n<5||n>12||(!strcmp(lang,"en")&&n>8)||(strcmp(lang,"ko")&&strcmp(lang,"en"))||(strcmp(period,"day")&&strcmp(period,"week")&&strcmp(period,"all"))){pthread_mutex_unlock(&state_lock);return respond(c,422,error_json("FILTER","순위 필터를 확인해 주세요."));}
            j=storage_board(m,!strcmp(lang,"en"),n,period);
        }else {pthread_mutex_unlock(&state_lock);return respond(c,404,error_json("NOT_FOUND","찾을 수 없습니다."));}
        pthread_mutex_unlock(&state_lock);return respond(c,j?200:503,j?j:error_json("STORAGE_UNAVAILABLE","기록을 불러올 수 없습니다."));
    }
    if(now-u->rate_time>=1000){u->rate_time=now;u->rate_count=0;}if(++u->rate_count>5){pthread_mutex_unlock(&state_lock);return respond(c,429,error_json("RATE_LIMITED","입력이 너무 빠릅니다. 잠시 후 다시 시도하세요."));}
    const char *content=mg_get_header(c,"Content-Type");
    if(r->content_length<=0||r->content_length>4096||!content||strncmp(content,"application/json",16)){pthread_mutex_unlock(&state_lock);return respond(c,400,error_json("BAD_REQUEST","JSON 요청을 확인해 주세요."));}
    pthread_mutex_unlock(&state_lock);
    char raw[4097];int got=0,n;while(got<r->content_length&&(n=mg_read(c,raw+got,(size_t)(r->content_length-got)))>0)got+=n;raw[got]=0;
    if(got!=r->content_length||memchr(raw,0,(size_t)got))return respond(c,400,error_json("BAD_REQUEST","요청 본문이 올바르지 않습니다."));
    cJSON *body=cJSON_ParseWithLength(raw,(size_t)got);if(!cJSON_IsObject(body)){cJSON_Delete(body);return respond(c,400,error_json("BAD_JSON","요청 형식이 올바르지 않습니다."));}
    const char *request=str(body,"request_id");if(strlen(request)<8||strlen(request)>64){cJSON_Delete(body);return respond(c,400,error_json("REQUEST_ID","요청 ID가 필요합니다."));}
    char digest[65],scope[4300];snprintf(scope,sizeof(scope),"%s:%s",path,raw);hash_text(scope,digest);
    pthread_mutex_lock(&state_lock);tick(now_ms());u=&users[uid];
    for(int i=0;i<MEMOS;i++)if(!strcmp(u->memo[i].id,request)&&u->memo[i].response){
        if(strcmp(u->memo[i].body_hash,digest)){pthread_mutex_unlock(&state_lock);cJSON_Delete(body);return respond(c,409,error_json("REQUEST_CONFLICT","같은 요청 ID의 내용이 달라졌습니다."));}
        char *cached=strdup(u->memo[i].response);int status=u->memo[i].status;pthread_mutex_unlock(&state_lock);cJSON_Delete(body);int out=send_text(c,status,cached,NULL);free(cached);return out;
    }
    int status=200;cJSON *j=mutate(uid,!strncmp(path,"/api/",5)?path+5:"",body,&status);char *s=cJSON_PrintUnformatted(j);cJSON_Delete(j);
    Memo *memo=&u->memo[u->memo_next++%MEMOS];free(memo->response);snprintf(memo->id,sizeof(memo->id),"%s",request);snprintf(memo->body_hash,sizeof(memo->body_hash),"%s",digest);memo->response=strdup(s);memo->status=status;
    pthread_mutex_unlock(&state_lock);cJSON_Delete(body);int out=send_text(c,status,s,NULL);free(s);return out;
}
static int ws_connect(const struct mg_connection *conn,void *data){(void)data;struct mg_connection *c=(struct mg_connection*)conn;if(!valid_origin(c))return 1;pthread_mutex_lock(&state_lock);int uid=auth(c);pthread_mutex_unlock(&state_lock);return uid<0;}
static int ws_data(struct mg_connection *c,int bits,char *data,size_t len,void *unused){
    (void)unused;if((bits&15)==8)return 0;if((bits&15)!=1)return 1;if(len!=4||memcmp(data,"sync",4))return 0;
    pthread_mutex_lock(&state_lock);int uid=auth(c);if(uid<0){pthread_mutex_unlock(&state_lock);return 0;}tick(now_ms());users[uid].seen=now_ms();cJSON *j=snapshot(uid);char *text=cJSON_PrintUnformatted(j);cJSON_Delete(j);pthread_mutex_unlock(&state_lock);
    mg_websocket_write(c,MG_WEBSOCKET_OPCODE_TEXT,text,strlen(text));free(text);return 1;
}
static void signal_stop(int sig){(void)sig;stopping=1;}
static void *maintenance(void *arg){
    (void)arg;int loops=0;while(!stopping){struct timespec pause={0,100000000};nanosleep(&pause,NULL);pthread_mutex_lock(&state_lock);tick(now_ms());pthread_mutex_unlock(&state_lock);
        if(++loops%10)continue;
        for(int i=0;i<GAMES;i++)for(int s=0;s<2;s++){
            pthread_mutex_lock(&state_lock);Game *g=&games[i];
            if(!g->used||!g->done||s>(g->mode==2?1:0)||g->p[s].saved){pthread_mutex_unlock(&state_lock);continue;}
            Game copy=*g;char uid[33];snprintf(uid,sizeof(uid),"%s",users[g->p[s].user].id);pthread_mutex_unlock(&state_lock);
            Player *p=&copy.p[s];int elapsed=(int)(copy.finished>copy.start?copy.finished-copy.start:0);
            int ok=storage_result(copy.id,uid,copy.mode,copy.lang,copy.length,p->solved,p->total,elapsed,p->outcome,p->points);
            pthread_mutex_lock(&state_lock);if(g->used&&!strcmp(g->id,copy.id)&&ok)g->p[s].saved=1;pthread_mutex_unlock(&state_lock);
        }
        pthread_mutex_lock(&state_lock);int64_t now=now_ms();
        for(int i=0;i<GAMES;i++){Game *g=&games[i];if(g->used&&g->done&&g->p[0].saved&&(g->mode!=2||g->p[1].saved)&&now-g->finished>600000){for(int u=0;u<USERS;u++)if(users[u].used&&users[u].game==i)users[u].game=-1;memset(g,0,sizeof(*g));}}
        for(int i=0;i<USERS;i++)if(users[i].used&&users[i].game<0&&!users[i].queued&&now-users[i].seen>3600000){for(int n=0;n<MEMOS;n++)free(users[i].memo[n].response);memset(&users[i],0,sizeof(users[i]));}
        pthread_mutex_unlock(&state_lock);
    }return NULL;
}
int main(void){
    const char *port=getenv("PORT");if(!port)port="8080";production=getenv("PRODUCTION")&&!strcmp(getenv("PRODUCTION"),"1");
    const char *configured=getenv("APP_ORIGIN");if(!configured)configured=getenv("RENDER_EXTERNAL_URL");if(configured)snprintf(origin,sizeof(origin),"%s",configured);else snprintf(origin,sizeof(origin),"http://localhost:%s",port);
    if(production&&strncmp(origin,"https://",8)){fprintf(stderr,"Production requires HTTPS APP_ORIGIN or RENDER_EXTERNAL_URL\n");return 1;}
    if(!production&&getenv("TEST_DURATION_MS"))duration_ms=atoi(getenv("TEST_DURATION_MS"));
    if(!production&&getenv("TEST_COUNTDOWN_MS"))countdown_ms=atoi(getenv("TEST_COUNTDOWN_MS"));
    if(!production&&getenv("TEST_GRACE_MS"))grace_ms=atoi(getenv("TEST_GRACE_MS"));
    if(!dictionaries_load()||!storage_init())return 1;
    signal(SIGINT,signal_stop);signal(SIGTERM,signal_stop);signal(SIGPIPE,SIG_IGN);
    mg_init_library(0);char listen[40];snprintf(listen,sizeof(listen),"0.0.0.0:%s",port);
    const char *options[]={"listening_ports",listen,"document_root","web","num_threads","16","enable_directory_listing","no","request_timeout_ms","10000","additional_header","X-Content-Type-Options: nosniff\r\nReferrer-Policy: same-origin\r\nContent-Security-Policy: default-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",NULL};
    struct mg_callbacks callbacks;memset(&callbacks,0,sizeof(callbacks));ctx=mg_start(&callbacks,NULL,options);if(!ctx){fprintf(stderr,"HTTP server failed to start\n");return 1;}
    mg_set_request_handler(ctx,"/api",api,NULL);mg_set_request_handler(ctx,"/health",api,NULL);mg_set_websocket_handler(ctx,"/ws",ws_connect,NULL,ws_data,NULL,NULL);
    pthread_t worker;pthread_create(&worker,NULL,maintenance,NULL);fprintf(stderr,"CPU-Wordle ready on port %s\n",port);
    while(!stopping)sleep(1);mg_stop(ctx);pthread_join(worker,NULL);mg_exit_library();return 0;
}
