import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {memberRuntime} from './helpers/admin-member-runtime.mjs';
import {saveLiveVote,saveJudgeScore,closeLiveEntry,controlLive,getMemberLive,saveProgramItem,saveCompetitionPhoto,liveEntryMedia} from '../worker/domains/live.js';
import {searchLiveMembers,judgePhotoMedia,competitionCarMedia} from '../worker/domains/live.js';
const origin='https://example.invalid',req=body=>new Request(origin,{method:'POST',body:JSON.stringify(body)}),scores={overall:8,condition:7,cohesion:6,originality:9};
function setup(){const r=memberRuntime();r.db.exec("UPDATE events SET live_enabled=1,starts_on='2026-06-19',ends_on='2026-06-21' WHERE id='e'; INSERT INTO live_entries(id,event_id,discipline,member_id,car_id,category,presented_at) VALUES('entry','e','show_shine','m','c','Sedan',CURRENT_TIMESTAMP); INSERT INTO live_competition_state(event_id,discipline,status,current_entry_id) VALUES('e','show_shine','live','entry'); INSERT INTO live_category_state(event_id,discipline,category,status) VALUES('e','show_shine','Sedan','live');");return r;}
test('public vote create, edit after car close, category closure and no duplicate',async()=>{const r=setup();try{
 assert.equal((await saveLiveVote(req({score:8}),r.env,{uid:'n'},'entry',origin)).status,200);
 await closeLiveEntry(req({expectedVersion:1}),r.env,{uid:'a'},'entry',origin);
 assert.equal((await saveLiveVote(req({score:9}),r.env,{uid:'n'},'entry',origin)).status,200);
 assert.equal((await saveLiveVote(req({score:9}),r.env,{uid:'a'},'entry',origin)).status,409);
 assert.equal(r.db.prepare('SELECT COUNT(*) n FROM live_public_votes').get().n,1);
 await controlLive(req({action:'close_category',category:'Sedan',expectedCategoryVersion:1}),r.env,{uid:'a'},'e','show_shine',origin);
 const denied=await (await saveLiveVote(req({score:1}),r.env,{uid:'n'},'entry',origin)).json();assert.equal(denied.error,'category_closed');assert.equal(denied.savedScore,9);
 assert.equal((await saveLiveVote(req({score:8}),r.env,{uid:'m'},'entry',origin)).status,403);
}finally{r.db.close()}});

test('isolated migration preserves existing set and refuses duplicate authors without choosing',()=>{
 const schema=readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8').split('-- One official score set per entry.')[0]+'COMMIT;';
 const migration=readFileSync(new URL('../db/migrations/2026-09-29-live-official-scoring.sql',import.meta.url),'utf8');
 for(const duplicate of [false,true]){
  const db=new DatabaseSync(':memory:');
  try{
   db.exec(schema);
   db.exec("INSERT INTO members(id,member_code,email,name,role) VALUES('a','A','a@local.invalid','Author','admin'),('b','B','b@local.invalid','Other','admin'),('m','M','m@local.invalid','Owner','member'); INSERT INTO events(id,year,title) VALUES('e',2026,'Local'); INSERT INTO cars(id,member_id,model) VALUES('c','m','BMW'); INSERT INTO live_entries(id,event_id,discipline,member_id,car_id) VALUES('entry','e','show_shine','m','c'); INSERT INTO live_judge_scores(id,event_id,entry_id,judge_id,scores_json,note,submitted) VALUES('s','e','entry','a','{\"overall\":8}','Original',1);");
   if(duplicate)db.exec("INSERT INTO live_judge_scores(id,event_id,entry_id,judge_id,scores_json,submitted) VALUES('s2','e','entry','b','{\"overall\":9}',1)");
   const before=db.prepare('SELECT * FROM live_judge_scores ORDER BY id').all();
   db.exec('BEGIN');
   if(duplicate){assert.throws(()=>db.exec(migration),/UNIQUE/);db.exec('ROLLBACK');assert.deepEqual(db.prepare('SELECT * FROM live_judge_scores ORDER BY id').all(),before);assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='live_judge_score_audit'").get().n,0)}
   else{db.exec(migration);db.exec('COMMIT');const after=db.prepare('SELECT * FROM live_judge_scores').get();for(const key of Object.keys(before[0]))assert.equal(after[key],before[0][key]);assert.equal(after.version,1);assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0)}
  }finally{db.close()}
 }
});
test('idle category never accepts votes or exposes totals; active member needs no check-in',async()=>{
 const r=setup();try{
  r.db.exec("UPDATE live_category_state SET status='idle'");
  assert.equal((await saveLiveVote(req({score:8}),r.env,{uid:'n'},'entry',origin)).status,409);
  r.db.exec("UPDATE live_category_state SET status='live'");
  assert.equal((await saveLiveVote(req({score:8}),r.env,{uid:'n'},'entry',origin)).status,200);
  r.db.exec("UPDATE live_competition_state SET status='published'");
  assert.deepEqual((await (await getMemberLive(r.env,{uid:'n'},origin)).json()).results,{});
  assert.equal(r.db.prepare("SELECT COUNT(*) n FROM event_member_presence WHERE member_id='n'").get().n,0);
  assert.equal(r.db.prepare("SELECT COUNT(*) n FROM reservations WHERE member_id='n'").get().n,0);
 }finally{r.db.close()}
});
test('competition image is visible through member and admin reads, internal evidence stays private',async()=>{
 const r=setup();try{
  r.env.MEDIA.get=async key=>({body:key,httpMetadata:{contentType:'image/jpeg'}});
  r.db.exec("INSERT INTO live_car_photos(id,event_id,car_id,created_by,r2_key,mime_type) VALUES('lp','e','c','a','competition-image','image/jpeg'); INSERT INTO live_judge_photos(id,event_id,entry_id,judge_id,r2_key,mime_type,size_bytes) VALUES('jp','e','entry','a','private-note-image','image/jpeg',100);");
  const members=await (await searchLiveMembers(r.env,'e',new URL(origin),origin)).json();
  assert.equal(members.members.find(row=>row.memberId==='m').cars.find(row=>row.id==='c').livePhotoId,'lp');
  assert.equal(await (await competitionCarMedia(r.env,'e','c',origin)).text(),'competition-image');
  assert.equal((await judgePhotoMedia(r.env,{uid:'n'},'jp',origin)).status,404);
  const payload=await (await getMemberLive(r.env,{uid:'n'},origin)).json();
  assert.equal(payload.states.show_shine.entry.imageUrl,'/api/live/entries/entry/media');assert.deepEqual(payload.judgeHistory,[]);
 }finally{r.db.close()}
});
test('category closes concurrently with edit; exhaust gets no exception',async()=>{const r=setup();try{
 await saveLiveVote(req({score:8}),r.env,{uid:'n'},'entry',origin);
 const prepare=r.env.DB.prepare;r.env.DB.prepare=sql=>{if(sql.startsWith('INSERT INTO live_public_votes'))r.db.exec("UPDATE live_category_state SET status='closed'");return prepare(sql)};
 assert.equal((await saveLiveVote(req({score:2}),r.env,{uid:'n'},'entry',origin)).status,409);
 assert.equal(r.db.prepare('SELECT score FROM live_public_votes').get().score,8);
 r.env.DB.prepare=prepare;r.db.exec("UPDATE live_entries SET discipline='best_exhaust',category=NULL,voting_closed=1; UPDATE live_competition_state SET discipline='best_exhaust',status='closed'; UPDATE live_public_votes SET discipline='best_exhaust';");
 assert.equal((await saveLiveVote(req({score:2}),r.env,{uid:'n'},'entry',origin)).status,409);
}finally{r.db.close()}});
test('one official jury set, explicit closed-category correction, audit and CAS',async()=>{const r=setup();try{
 assert.equal((await saveJudgeScore(req({scores,submitted:true,expectedVersion:0}),r.env,{uid:'a'},'entry',origin)).status,200);
 r.db.exec("UPDATE live_category_state SET status='closed'; UPDATE live_entries SET voting_closed=1; UPDATE live_competition_state SET status='published',current_entry_id=NULL; UPDATE members SET role='admin' WHERE id='n';");
 assert.equal((await saveJudgeScore(req({scores,submitted:true,expectedVersion:1}),r.env,{uid:'a'},'entry',origin)).status,400);
 const corrected={...scores,overall:9};
 const saved=await (await saveJudgeScore(req({scores:corrected,submitted:true,expectedVersion:1,correction:true,reason:'Oprava zápisu'}),r.env,{uid:'n'},'entry',origin)).json();
 assert.equal(saved.version,2);assert.equal(saved.authorId,'a');
 assert.equal((await saveJudgeScore(req({scores,submitted:true,expectedVersion:1,correction:true,reason:'stale'}),r.env,{uid:'a'},'entry',origin)).status,409);
 const audit=r.db.prepare('SELECT * FROM live_judge_score_audit').get();assert.equal(audit.changed_by,'n');assert.deepEqual(JSON.parse(audit.before_scores),scores);assert.deepEqual(JSON.parse(audit.after_scores),corrected);
 assert.equal(r.db.prepare('SELECT COUNT(*) n FROM live_judge_scores').get().n,1);assert.equal(r.db.prepare('SELECT status FROM live_category_state').get().status,'closed');
 const result=await (await getMemberLive(r.env,{uid:'m'},origin)).json();assert.deepEqual(result.judgeHistory,[]);assert.equal(result.results.show_shine[0].jury.criteria.overall,9);
 r.db.exec("DELETE FROM live_judge_scores");assert.equal((await saveJudgeScore(req({scores,submitted:true,expectedVersion:0}),r.env,{uid:'a'},'entry',origin)).status,409);
}finally{r.db.close()}});
test('program event dates, optional times, overnight, chronological order and revision',async()=>{const r=setup();try{
 const put=(title,timeFrom='',timeTo='')=>saveProgramItem(req({day:'2026-06-19',title,timeFrom,timeTo}),r.env,{uid:'a'},'e',null,origin);
 assert.equal((await put('Bez času')).status,200);await put('Večer','23:00','01:00');await put('Ráno','09:00');assert.equal((await put('Chyba','24:00')).status,400);
 const state=await (await getMemberLive(r.env,{uid:'n'},origin)).json();assert.deepEqual(state.program.map(x=>x.title),['Ráno','Večer','Bez času']);assert.equal(state.program[1].endsAt,'2026-06-20T01:00');assert.equal(state.program[2].startsAt,'');
 const early=state.program[0];r.db.exec("UPDATE event_program_items SET venue='Pódium',status='changed',visible=0,sort_order=9 WHERE id='"+early.id+"'");
 assert.equal((await saveProgramItem(req({day:'2026-06-20',title:'Sobota',timeFrom:'10:00',timeTo:''}),r.env,{uid:'a'},'e',early.id,origin)).status,200);
 const kept=r.db.prepare('SELECT * FROM event_program_items WHERE id=?').get(early.id);assert.equal(kept.venue,'Pódium');assert.equal(kept.status,'changed');assert.equal(kept.visible,0);assert.equal(kept.sort_order,9);
 assert.equal((await saveProgramItem(req({day:'2026-06-21',title:'Neděle',timeFrom:'',timeTo:''}),r.env,{uid:'a'},'e',null,origin)).status,200);
 await put('Stejný čas','23:00');const ordered=(await (await getMemberLive(r.env,{uid:'n'},origin)).json()).program;const again=(await (await getMemberLive(r.env,{uid:'n'},origin)).json()).program;assert.deepEqual(ordered.map(x=>x.id),again.map(x=>x.id));assert.equal(ordered.at(-1).title,'Neděle');
 assert.equal((await put('Bez začátku','','12:00')).status,400);assert.equal((await put('Nulový interval','12:00','12:00')).status,400);
 r.db.exec("UPDATE events SET starts_on=NULL WHERE id='e'");assert.equal((await put('Neodhadovat')).status,409);
}finally{r.db.close()}});
test('competition photograph stays separate and retry does not duplicate upload',async()=>{const r=setup(),objects=new Map();try{
 r.env.MEDIA.put=async(key,stream)=>objects.set(key,await new Response(stream).arrayBuffer());r.env.MEDIA.delete=async key=>objects.delete(key);r.env.MEDIA.get=async key=>({body:objects.get(key)||'garage',httpMetadata:{contentType:'image/jpeg'}});
 const uploadId=crypto.randomUUID(),request=()=>{const f=new FormData();f.append('file',new Blob(['competition'],{type:'image/jpeg'}),'photo.jpg');f.append('uploadId',uploadId);return new Request(origin,{method:'POST',body:f})};
 assert.equal((await saveCompetitionPhoto(request(),r.env,{uid:'a'},'e','c',origin)).status,201);
 assert.equal((await saveCompetitionPhoto(request(),r.env,{uid:'a'},'e','c',origin)).status,200);assert.equal(objects.size,1);
 assert.equal(await (await liveEntryMedia(r.env,{uid:'n'},'entry',origin)).text(),'competition');
 assert.equal(r.db.prepare("SELECT r2_key FROM car_photos WHERE id='p'").get().r2_key,'private/m/p');
 assert.equal(r.db.prepare('SELECT COUNT(*) n FROM live_judge_photos').get().n,0);
}finally{r.db.close()}});
