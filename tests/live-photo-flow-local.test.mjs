import test from 'node:test';
import assert from 'node:assert/strict';
import {memberRuntime} from './helpers/admin-member-runtime.mjs';
import { seedConfirmedArrival } from './helpers/live-fixtures.mjs';
import {saveLiveVote,saveJudgeScore,closeLiveEntry,getMemberLive,startLiveEntry,controlLive,uploadLivePhoto,uploadJudgePhoto} from '../worker/domains/live.js';
import {uploadGallerySubmission} from '../worker/domains/member-gallery.js';
import {readFileSync} from 'node:fs';
const origin='https://example.invalid',request=body=>new Request(origin,{method:'POST',body:JSON.stringify(body)});
test('apartment migration preserves options, photos, allocations and revision records',()=>{
 const r=memberRuntime();try{
  r.db.exec("INSERT INTO event_accommodation_options(id,event_id,name,kind,inventory_mode,capacity_per_unit) VALUES('stay','e','Existing','cabin','limited',4); INSERT INTO event_accommodation_photos(id,option_id,r2_key,mime_type,size_bytes,sort_order) VALUES('stay-photo','stay','existing-object','image/jpeg',123,1); INSERT INTO reservation_accommodation(reservation_id,option_id,option_name,kind,people_count,unit_count,unit_price_czk,person_price_czk,bedding_fee_per_person_czk,city_tax_per_person_per_night_czk,nights,base_total_czk,person_total_czk,bedding_total_czk,city_tax_total_czk,total_czk) VALUES('r','stay','Existing','cabin',2,1,100,20,0,0,2,200,40,0,0,240);");
  const tables=['event_accommodation_options','event_accommodation_photos','reservation_accommodation','admin_resource_versions'],before=tables.map(t=>r.db.prepare('SELECT * FROM '+t+' ORDER BY 1,2').all());
  r.db.exec("DELETE FROM schema_migrations WHERE id='2026-09-28-accommodation-apartment'");
  r.db.exec('BEGIN');r.db.exec(readFileSync(new URL('../db/migrations/2026-09-28-accommodation-apartment.sql',import.meta.url),'utf8'));r.db.exec('COMMIT');
  tables.forEach((t,i)=>assert.deepEqual(r.db.prepare('SELECT * FROM '+t+' ORDER BY 1,2').all(),before[i]));assert.deepEqual(r.db.prepare('PRAGMA foreign_key_check').all(),[]);
  r.db.exec("INSERT INTO event_accommodation_options(id,event_id,name,kind,inventory_mode,capacity_per_unit) VALUES('apart','e','Synthetic apartment','apartment','limited',2)");assert.equal(r.db.prepare("SELECT kind FROM event_accommodation_options WHERE id='apart'").get().kind,'apartment');
 }finally{r.db.close()}
});
function setup(){const r=memberRuntime();r.db.exec("UPDATE events SET live_enabled=1 WHERE id='e'; INSERT INTO live_entries(id,event_id,discipline,member_id,car_id,category,presented_at) VALUES('entry','e','show_shine','m','c','Sedan',CURRENT_TIMESTAMP); INSERT INTO live_competition_state(event_id,discipline,status,current_entry_id,version) VALUES('e','show_shine','live','entry',1); INSERT INTO live_category_state(event_id,discipline,category,status) VALUES('e','show_shine','Sedan','live');");return r;}
test('own vote, exact judge scores, explicit close and replay; no other private scores',async()=>{
 const r=setup();try{
  assert.equal((await saveLiveVote(request({score:8}),r.env,{uid:'m'},'entry',origin)).status,403);
  assert.equal((await saveLiveVote(request({score:8}),r.env,{uid:'n'},'entry',origin)).status,200);
  const scores={overall:8,condition:7,cohesion:6,originality:9};assert.equal((await saveJudgeScore(request({scores,submitted:true,expectedVersion:0}),r.env,{uid:'a'},'entry',origin)).status,200);
  const member=await (await getMemberLive(r.env,{uid:'n'},origin)).json();assert.equal(member.votes.length,1);assert.deepEqual(member.judgeHistory,[]);
  const judge=await (await getMemberLive(r.env,{uid:'a'},origin)).json();assert.deepEqual(judge.judgeHistory[0].scores,scores);
  assert.equal((await closeLiveEntry(request({expectedVersion:1}),r.env,{uid:'n'},'entry',origin)).status,403);
  assert.equal((await closeLiveEntry(request({expectedVersion:1}),r.env,{uid:'a'},'entry',origin)).status,200);
  assert.equal((await closeLiveEntry(request({expectedVersion:1}),r.env,{uid:'a'},'entry',origin)).status,200);
  // live-next-local: existing votes remain editable while the category is live.
  assert.equal((await saveLiveVote(request({score:9}),r.env,{uid:'n'},'entry',origin)).status,200);
  assert.equal((await saveJudgeScore(request({scores,submitted:true,expectedVersion:1}),r.env,{uid:'a'},'entry',origin)).status,400);
  assert.equal(r.db.prepare('SELECT score FROM live_public_votes').get().score,9);
  await controlLive(request({action:'close_category',category:'Sedan',expectedCategoryVersion:1}),r.env,{uid:'a'},'e','show_shine',origin);
  assert.equal((await saveLiveVote(request({score:10}),r.env,{uid:'n'},'entry',origin)).status,409);
  assert.equal(r.db.prepare('SELECT score FROM live_public_votes').get().score,9);
 }finally{r.db.close()}
});
test('closure between preflight and write rejects public and judge mutations',async()=>{
 for(const judge of [false,true]){const r=setup();try{
  const prepare=r.env.DB.prepare;r.env.DB.prepare=sql=>{const statement=prepare(sql);if(sql.startsWith('INSERT INTO live_'+(judge?'judge_scores':'public_votes'))){r.db.exec("UPDATE live_entries SET voting_closed=1 WHERE id='entry'");}return statement;};
  const response=judge?await saveJudgeScore(request({scores:{overall:8,condition:8,cohesion:8,originality:8},submitted:true,expectedVersion:0}),r.env,{uid:'a'},'entry',origin):await saveLiveVote(request({score:8}),r.env,{uid:'n'},'entry',origin);
  assert.equal(response.status,409);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM '+(judge?'live_judge_scores':'live_public_votes')).get().n,0);
 }finally{r.db.close()}}
});
test('upload retry is actor-scoped, pending, one row and one media object',async()=>{
 const r=memberRuntime(),objects=new Map();r.env.MEDIA.put=async(key,stream)=>objects.set(key,await new Response(stream).arrayBuffer());r.env.MEDIA.delete=async key=>objects.delete(key);
 const key=crypto.randomUUID(),upload=()=>{const f=new FormData();f.append('file',new Blob(['synthetic'],{type:'image/jpeg'}),'local.jpg');f.append('uploadId',key);return new Request(origin,{method:'POST',body:f})};
 try{const first=await (await uploadGallerySubmission(upload(),r.env,{uid:'m'},origin)).json();const retry=await (await uploadGallerySubmission(upload(),r.env,{uid:'m'},origin)).json();assert.equal(first.submission.id,retry.submission.id);assert.equal(retry.submission.status,'pending');assert.equal(objects.size,1);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM gallery_submissions WHERE id=?').get(first.submission.id).n,1);const other=await (await uploadGallerySubmission(upload(),r.env,{uid:'n'},origin)).json();assert.notEqual(other.submission.id,first.submission.id)}finally{r.db.close()}
});

test('a second body category cannot start, including a category opened during preflight',async()=>{
 for(const concurrent of [false,true]){const r=setup();try{
  r.db.exec("UPDATE reservations SET show_shine='Ano'; UPDATE cars SET body='Coupé' WHERE id='c2';  UPDATE live_competition_state SET status='idle',current_entry_id=NULL;");
  seedConfirmedArrival(r,'m','c');
  if(concurrent){r.db.exec("UPDATE live_category_state SET status='idle'");const batch=r.env.DB.batch;r.env.DB.batch=async statements=>{r.db.exec("UPDATE live_category_state SET status='live' WHERE category='Sedan'");return batch(statements)}}
  const response=await startLiveEntry(request({discipline:'show_shine',memberId:'m',carId:'c2',category:'Coupé',expectedVersion:1}),r.env,{uid:'a'},'e',origin);
  assert.equal(response.status,409);assert.equal(r.db.prepare("SELECT COUNT(*) n FROM live_category_state WHERE status='live'").get().n,1);assert.equal(r.db.prepare("SELECT COUNT(*) n FROM live_entries WHERE car_id='c2'").get().n,0);
 }finally{r.db.close()}}
});

test('lost database acknowledgement preserves committed media and retry does not duplicate',async()=>{
 for(const kind of ['member','live','judge']){const r=setup(),objects=new Map();r.env.MEDIA.put=async(key,stream)=>objects.set(key,await new Response(stream).arrayBuffer());r.env.MEDIA.delete=async key=>objects.delete(key);const table=kind==='judge'?'live_judge_photos':'gallery_submissions',id=crypto.randomUUID();
  const upload=()=>{const form=new FormData();form.append('uploadId',id);form.append('file',new Blob(['synthetic'],{type:'image/jpeg'}),'photo.jpg');const req=new Request(origin,{method:'POST',body:form});return kind==='member'?uploadGallerySubmission(req,r.env,{uid:'a'},origin):kind==='live'?uploadLivePhoto(req,r.env,{uid:'a'},origin):uploadJudgePhoto(req,r.env,{uid:'a'},'entry',origin)};
  const original=r.env.DB.prepare;let interrupted=false;const wrap=s=>({first:s.first,all:s.all,bind:(...args)=>wrap(s.bind(...args)),run:async()=>{const result=await s.run();if(!interrupted){interrupted=true;throw new Error('acknowledgement lost')}return result}});
  r.env.DB.prepare=sql=>sql.trim().startsWith('INSERT INTO '+table)?wrap(original(sql)):original(sql);
  try{await assert.rejects(upload(),/acknowledgement lost/);assert.equal(objects.size,1);const receipt=await (await upload()).json();assert.equal(receipt.ok,true);assert.equal(receipt.replayed,true);assert.equal(objects.size,1);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM '+table+" WHERE "+(kind==='judge'?'judge_id':'member_id')+"='a'").get().n,1)}finally{r.db.close()}
 }
});

test('legacy pause/resume remains functional but a racing explicit close wins',async()=>{
 const r=setup();try{assert.equal((await controlLive(request({action:'pause',expectedVersion:1}),r.env,{uid:'a'},'e','show_shine',origin)).status,200);assert.equal((await controlLive(request({action:'resume',expectedVersion:2}),r.env,{uid:'a'},'e','show_shine',origin)).status,200);
  const original=r.env.DB.prepare;r.env.DB.prepare=sql=>{if(sql.startsWith('UPDATE live_competition_state SET status=?'))r.db.exec("UPDATE live_entries SET voting_closed=1 WHERE id='entry'");return original(sql)};
  assert.equal((await controlLive(request({action:'present',entryId:'entry',expectedVersion:3}),r.env,{uid:'a'},'e','show_shine',origin)).status,409);
 }finally{r.db.close()}
});
