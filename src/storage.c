#include "storage.h"
#include "engine.h"
#include <libpq-fe.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <pthread.h>

static PGconn *db;
static pthread_mutex_t db_lock=PTHREAD_MUTEX_INITIALIZER;
static PGresult *query(const char *sql,int count,const char **values){
    if(PQstatus(db)!=CONNECTION_OK)PQreset(db);
    if(PQstatus(db)!=CONNECTION_OK)return NULL;
    PGresult *r=PQexecParams(db,sql,count,NULL,values,NULL,NULL,0);
    if(PQresultStatus(r)!=PGRES_TUPLES_OK&&PQresultStatus(r)!=PGRES_COMMAND_OK){fprintf(stderr,"Database operation failed (%s)\n",PQresStatus(PQresultStatus(r)));PQclear(r);return NULL;}return r;
}
int storage_init(void){
    const char *url=getenv("DATABASE_URL");if(!url||!*url){fprintf(stderr,"DATABASE_URL is required. Use docker compose up --build locally.\n");return 0;}
    const char *keys[]={"dbname","connect_timeout","options",NULL};
    const char *vals[]={url,"5","-c statement_timeout=5000",NULL};
    db=PQconnectdbParams(keys,vals,1);if(PQstatus(db)!=CONNECTION_OK){fprintf(stderr,"Unable to connect to PostgreSQL (check DATABASE_URL).\n");return 0;}
    const char *schema=
    "CREATE TABLE IF NOT EXISTS users(id text PRIMARY KEY,session_hash text UNIQUE NOT NULL,nickname text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());"
    "CREATE TABLE IF NOT EXISTS results(game_id text NOT NULL,user_id text NOT NULL REFERENCES users(id),mode int NOT NULL,lang int NOT NULL,length int NOT NULL,solved int NOT NULL,guesses int NOT NULL,elapsed int NOT NULL,outcome text NOT NULL,points int NOT NULL,version text NOT NULL DEFAULT 'v1',ended_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(game_id,user_id));"
    "CREATE INDEX IF NOT EXISTS results_board ON results(mode,lang,length,ended_at);"
    "CREATE INDEX IF NOT EXISTS results_user ON results(user_id,ended_at);";
    PGresult *r=PQexec(db,schema);int ok=PQresultStatus(r)==PGRES_COMMAND_OK;PQclear(r);return ok;
}
int storage_user(const char *hash,char id[33],char name[81],int create){
    pthread_mutex_lock(&db_lock);const char *v[]={hash};PGresult *r=query("SELECT id,nickname FROM users WHERE session_hash=$1",1,v);int ok=0;
    if(r&&PQntuples(r)){snprintf(id,33,"%s",PQgetvalue(r,0,0));snprintf(name,81,"%s",PQgetvalue(r,0,1));ok=1;}
    else if(r&&create){random_hex(id,16);snprintf(name,81,"플레이어 %.6s",id);const char *p[]={id,hash,name};PGresult *s=query("INSERT INTO users(id,session_hash,nickname) VALUES($1,$2,$3)",3,p);ok=s!=NULL;if(s)PQclear(s);}
    if(r)PQclear(r);pthread_mutex_unlock(&db_lock);return ok;
}
int storage_name(const char *id,const char *name){pthread_mutex_lock(&db_lock);const char *v[]={name,id};PGresult *r=query("UPDATE users SET nickname=$1 WHERE id=$2",2,v);int ok=r!=NULL;if(r)PQclear(r);pthread_mutex_unlock(&db_lock);return ok;}
int storage_result(const char *game,const char *uid,int mode,int lang,int length,int solved,int guesses,int elapsed,const char *outcome,int points){
    char b[7][32];int nums[]={mode,lang,length,solved,guesses,elapsed,points};for(int i=0;i<7;i++)snprintf(b[i],32,"%d",nums[i]);
    const char *v[]={game,uid,b[0],b[1],b[2],b[3],b[4],b[5],outcome,b[6]};pthread_mutex_lock(&db_lock);
    PGresult *r=query("INSERT INTO results(game_id,user_id,mode,lang,length,solved,guesses,elapsed,outcome,points) VALUES($1,$2,$3::int,$4::int,$5::int,$6::int,$7::int,$8::int,$9,$10::int) ON CONFLICT(game_id,user_id) DO NOTHING",10,v);
    int ok=r!=NULL;if(r)PQclear(r);pthread_mutex_unlock(&db_lock);return ok;
}
static cJSON *rows(PGresult *r){if(!r)return NULL;cJSON *a=cJSON_CreateArray();for(int i=0;i<PQntuples(r);i++){cJSON *o=cJSON_Parse(PQgetvalue(r,i,0));if(o)cJSON_AddItemToArray(a,o);}PQclear(r);return a;}
cJSON *storage_board(int mode,int lang,int length,const char *period){
    char m[12],l[12],n[12];snprintf(m,12,"%d",mode);snprintf(l,12,"%d",lang);snprintf(n,12,"%d",length);
    const char *v[]={m,l,n,period};
    const char *sql=
    "WITH filtered AS (SELECT * FROM results WHERE mode=$1::int AND lang=$2::int AND length=$3::int AND version='v1' AND outcome IN ('won','lost','draw','finished') AND ($4='all' OR ended_at >= (date_trunc(CASE WHEN $4='week' THEN 'week' ELSE 'day' END,now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul'))),"
    "best AS (SELECT DISTINCT ON(user_id) user_id,points,guesses,solved FROM filtered ORDER BY user_id,points DESC,guesses ASC),"
    "duel AS (SELECT user_id,sum(points)::int AS points,count(*) FILTER(WHERE outcome='won')::int AS wins,count(*)::int AS played FROM filtered GROUP BY user_id),"
    "ranked AS (SELECT user_id,points,guesses,solved,0 AS wins,0 AS played,rank() OVER(ORDER BY points DESC,guesses ASC) AS rank FROM best WHERE $1::int=1 UNION ALL SELECT user_id,points,0,0,wins,played,rank() OVER(ORDER BY points DESC,wins DESC) AS rank FROM duel WHERE $1::int=2)"
    " SELECT row_to_json(x) FROM (SELECT r.*,u.nickname FROM ranked r JOIN users u ON u.id=r.user_id ORDER BY rank,user_id LIMIT 100) x";
    pthread_mutex_lock(&db_lock);cJSON *a=rows(query(sql,4,v));pthread_mutex_unlock(&db_lock);return a;
}
cJSON *storage_history(const char *uid){const char *v[]={uid};pthread_mutex_lock(&db_lock);cJSON *a=rows(query("SELECT row_to_json(x) FROM (SELECT mode,lang,length,solved,guesses,outcome,points,elapsed,ended_at FROM results WHERE user_id=$1 ORDER BY ended_at DESC LIMIT 30) x",1,v));pthread_mutex_unlock(&db_lock);return a;}
