"""Exercise real HTTP, PostgreSQL and WebSocket paths. Test timings set in CI only."""
import os, time, uuid, json, sys
from pathlib import Path
import requests
import websocket

BASE=os.environ.get('TEST_BASE_URL','http://localhost:8080')
def check(condition,message):
    if not condition: raise AssertionError(message)
def session():
    s=requests.Session();s.headers['Origin']=BASE
    r=s.post(BASE+'/api/session',json={});check(r.status_code==200,r.text);return s
def post(s,path,body=None,expected=200):
    body=dict(body or {});body.setdefault('request_id',str(uuid.uuid4()))
    r=s.post(BASE+'/api/'+path,json=body);check(r.status_code==expected,f'{path}: {r.status_code} {r.text}');return r.json(),body
def state(s):return s.get(BASE+'/api/state').json()
def start(s,mode=0,language='en',length=5):return post(s,'start',{'mode':mode,'language':language,'length':length})[0]['game']
def stop(s):
    g=state(s)['game']
    if g and g['status']!='finished':post(s,'abandon',{'game_id':g['id']})
def guess(s,g,word,expected=200):return post(s,'guess',{'game_id':g['id'],'puzzle_id':g['puzzle_id'],'word':word},expected)[0]
def pattern(answer,word):
    out=[0]*len(answer);rest=[]
    for i,(a,b) in enumerate(zip(answer,word)):
        if a==b:out[i]=2
        else:rest.append(a)
    for i,b in enumerate(word):
        if out[i]!=2 and b in rest:out[i]=1;rest.remove(b)
    return out
def solve(s,g):
    candidates=[w for w in Path('data/en_answers.txt').read_text().splitlines() if len(w)==g['length']]
    for _ in range(6):
        word=candidates[0];time.sleep(.23);response=guess(s,g,word);g=response['game']
        if g['status']=='finished':return g
        row=g['rows'][-1];candidates=[w for w in candidates if pattern(w,word)==row['tiles']]
    return g

for _ in range(100):
    try:
        if requests.get(BASE+'/health',timeout=1).status_code==200:break
    except requests.RequestException:pass
    time.sleep(.2)
else:raise RuntimeError('Server did not become ready')
a,b=session(),session()
check(a.cookies.get('wordle_session')!=b.cookies.get('wordle_session'),'distinct secure sessions')
check(requests.get(BASE+'/api/state').status_code==401,'auth required')
check(requests.get(BASE+'/api/stats').status_code==401,'stats auth required')
check(requests.get(BASE+'/api/history').status_code==401,'history auth required')
empty_stats=a.get(BASE+'/api/stats').json()
check(len(empty_stats)==3 and all(r['played']==0 for r in empty_stats),'empty stats include all modes')
check(a.post(BASE+'/api/start',headers={'Origin':'https://evil.invalid'},json={}).status_code==403,'origin guard')
g=start(a)
check('answer' not in g,'answer hidden')
guess(a,g,'zzzzz',422)
guess(a,g,'a',422)
time.sleep(1)
r,payload=post(a,'guess',{'game_id':g['id'],'puzzle_id':g['puzzle_id'],'word':'apple'})
again=a.post(BASE+'/api/guess',json=payload)
check(again.status_code==200 and again.json()==r,'idempotent guess response')
check(state(a)['game']['attempts']==1,'no duplicate attempt')
payload['word']='grape';check(a.post(BASE+'/api/guess',json=payload).status_code==409,'idempotency collision')
post(b,'guess',{'game_id':g['id'],'puzzle_id':g['puzzle_id'],'word':'apple'},409)
time.sleep(1);stop(a)
g=start(a,0,'ko',5);g=guess(a,g,'사과')['game'];check(g['rows'][0]['tokens']==list('ㅅㅏㄱㅗㅏ'),'Korean split through HTTP');stop(a)
time.sleep(1)
g=start(a,0,'en',8);g=solve(a,g);check(g['status']=='finished' and g['outcome']=='won','solver wins through real judge')
time.sleep(1.2)
history=a.get(BASE+'/api/history').json();check(any(r['outcome']=='won' for r in history),'results persisted')
saved=next(r for r in history if r['game_id']==g['id'])
check(saved['history'][0]['rows']==g['rows'],'persist exact tokens and judge colors')
check(saved['history'][0]['answer']==g['answer'],'persist completed answer')
check(b.get(BASE+'/api/history').json()==[],'history belongs to current user')
classic=a.get(BASE+'/api/stats').json()[0]
check(classic['played']==3 and classic['current_streak']>=1 and classic['best_streak']>=1,'all classic games counted with streaks')
check(classic['average_attempts']==round(sum(r['guesses'] for r in history)/3,1),'average includes all attempts')

g=start(a,1);guess(a,g,'apple');time.sleep(3.3);check(state(a)['game']['status']=='finished','time attack server deadline');time.sleep(1.2)
timed=next(r for r in a.get(BASE+'/api/history').json() if r['game_id']==g['id'])
check(timed['history'][0]['rows'][0]['word']=='apple','time attack persists attempts on timeout')
timed_stats=a.get(BASE+'/api/stats').json()[1]
check(timed_stats['played']==1 and timed_stats['win_rate'] is None and timed_stats['current_streak'] is None,'time attack has no win semantics')

# Solve the first puzzle and leave the next one untouched: both must survive.
time.sleep(1)
g=start(a,1,'en',8);original=g['id'];puzzle=g['puzzle_id']
candidates=[w for w in Path('data/en_answers.txt').read_text().splitlines() if len(w)==8]
for _ in range(6):
    word=candidates[0];time.sleep(.23);response=guess(a,g,word);g=response['game']
    if g['puzzle_id']!=puzzle:break
    row=g['rows'][-1];candidates=[w for w in candidates if pattern(w,word)==row['tiles']]
check(g['puzzle_id']!=puzzle,'time attack advanced to next puzzle')
stop(a);time.sleep(1.2)
replay=next(r for r in a.get(BASE+'/api/history').json() if r['game_id']==original)['history']
check(len(replay)==2 and replay[0]['rows'] and replay[1]['rows']==[],'preserve completed and empty final puzzle')
check(all(t==2 for t in replay[0]['rows'][-1]['tiles']),'preserve solved puzzle colors')
board=a.get(BASE+'/api/leaderboard?mode=1&language=en&length=5&period=all');check(board.status_code==200 and isinstance(board.json(),list),'leaderboard query')
time.sleep(1)
post(a,'queue',{'language':'en','length':5});matched=post(b,'queue',{'language':'en','length':5})[0]
check(matched['game']['mode']==2 and not matched['queued'],'matchmaking')
cookie='; '.join(f'{k}={v}' for k,v in a.cookies.items())
ws=websocket.create_connection(BASE.replace('http','ws')+'/ws',origin=BASE,cookie=cookie,timeout=3)
ws.send('sync');snap=json.loads(ws.recv());check(snap['game']['opponent']['nickname']==matched['nickname'],'WebSocket snapshot');check('rows' not in snap['game']['opponent'],'opponent guesses private');ws.close()
time.sleep(.3);post(b,'abandon',{'game_id':matched['game']['id']});check(state(a)['game']['outcome']=='won','forfeit gives opponent win')
time.sleep(1.3)
post(a,'queue',{'language':'ko','length':6});post(b,'queue',{'language':'ko','length':6})
for _ in range(10):time.sleep(.2);state(a)
check(state(a)['game']['outcome']=='won','disconnected opponent forfeits after grace')
print('PASS: sessions, origin, dictionary, tokenization, judging, idempotency, ownership, timers, persistence, leaderboard, WebSocket, matchmaking, forfeits, disconnects')
