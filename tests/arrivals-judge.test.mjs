import test from 'node:test';
import assert from 'node:assert/strict';
import {arrivalsRuntime} from './helpers/arrivals-runtime.mjs';
import {saveLiveVote,saveJudgeScore,closeLiveEntry,controlLive,getMemberLive} from '../worker/domains/live.js';
const origin='https://example.invalid',req=b=>new Request(origin,{method:'POST',body:JSON.stringify(b)}),scores={overall:8,condition:7,cohesion:6,originality:9};
function setup(role){const r=arrivalsRuntime();r.db.exec(`UPDATE members SET role='${role}' WHERE id='m'; UPDATE events SET live_enabled=1 WHERE id='e'; INSERT INTO live_entries(id,event_id,discipline,member_id,car_id,category,presented_at) VALUES('entry','e','show_shine','m','c','Sedan',CURRENT_TIMESTAMP); INSERT INTO live_competition_state(event_id,discipline,status,current_entry_id) VALUES('e','show_shine','live','entry'); INSERT INTO live_category_state(event_id,discipline,category,status) VALUES('e','show_shine','Sedan','live');`);return r}
for(const kind of ['admin','assigned judge'])test(kind+' own car: separate public/jury sets, audited correction, closures',async()=>{
 const r=setup(kind==='admin'?'admin':'member');try{
  if(kind!=='admin')r.db.exec("INSERT INTO event_live_judges(event_id,member_id) VALUES('e','m')");
  assert.equal((await saveJudgeScore(req({scores,submitted:true,expectedVersion:0}),r.env,{uid:'m'},'entry',origin)).status,200);
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM live_public_votes').get().n,0);
  assert.equal((await saveLiveVote(req({score:8}),r.env,{uid:'m'},'entry',origin)).status,200);
  assert.equal((await (await getMemberLive(r.env,{uid:'m'},origin)).json()).me.judge,true);
  assert.equal((await closeLiveEntry(req({expectedVersion:1}),r.env,{uid:'a'},'entry',origin)).status,200);
  assert.equal((await saveLiveVote(req({score:9}),r.env,{uid:'m'},'entry',origin)).status,200);
  assert.equal((await saveJudgeScore(req({scores,submitted:true,expectedVersion:1}),r.env,{uid:'m'},'entry',origin)).status,400);
  assert.equal((await saveJudgeScore(req({scores:{...scores,overall:9},submitted:true,expectedVersion:1,correction:true,reason:'Test opravy'}),r.env,{uid:'m'},'entry',origin)).status,200);
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM live_judge_score_audit').get().n,1);
  await controlLive(req({action:'close_category',category:'Sedan',expectedCategoryVersion:1}),r.env,{uid:'a'},'e','show_shine',origin);
  assert.equal((await saveLiveVote(req({score:4}),r.env,{uid:'m'},'entry',origin)).status,409);
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM live_public_votes').get().n,1);
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM live_judge_scores').get().n,1);
 }finally{r.db.close()}
});
test('ordinary member and forged client flag denied; revocation is checked at write; exhaust closes',async()=>{
 const r=setup('member');try{
  assert.equal((await saveLiveVote(req({score:8,judge:true}),r.env,{uid:'m',role:'admin'},'entry',origin)).status,403);
  assert.equal((await saveJudgeScore(req({scores,submitted:true,expectedVersion:0}),r.env,{uid:'m',role:'admin'},'entry',origin)).status,403);
  r.db.exec("UPDATE members SET role='admin' WHERE id='m'");
  const prepare=r.env.DB.prepare;r.env.DB.prepare=sql=>{if(sql.startsWith('INSERT INTO live_public_votes'))r.db.exec("UPDATE members SET role='member' WHERE id='m'");return prepare(sql)};
  assert.equal((await saveLiveVote(req({score:8}),r.env,{uid:'m'},'entry',origin)).status,409);r.env.DB.prepare=prepare;
  r.db.exec("UPDATE members SET role='admin' WHERE id='m'; UPDATE live_entries SET discipline='best_exhaust',category=NULL; UPDATE live_competition_state SET discipline='best_exhaust';");
  assert.equal((await saveLiveVote(req({score:8}),r.env,{uid:'m'},'entry',origin)).status,200);
  r.db.exec("UPDATE live_entries SET voting_closed=1; UPDATE live_competition_state SET status='closed';");
  assert.equal((await saveLiveVote(req({score:9}),r.env,{uid:'m'},'entry',origin)).status,409);
 }finally{r.db.close()}
});
