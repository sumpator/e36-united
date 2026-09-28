import test from 'node:test';
import assert from 'node:assert/strict';
import {arrivalsRuntime,seedArrivals,EVENT} from './helpers/arrivals-runtime.mjs';
import {routeArrivals,arrivalList} from '../worker/domains/arrivals.js';
import {claimArrival} from '../worker/domains/arrival-invitations.js';
import {startLiveEntry,searchLiveMembers,resolveLiveQr,saveJudgeScore,saveLiveVote,getAdminLive,getMemberLive,liveEntryMedia,closeLiveEntry,controlLive} from '../worker/domains/live.js';
const origin='https://example.invalid',auth={uid:'a'},req=b=>new Request(origin,{method:'POST',body:JSON.stringify(b)});
async function gate(r,extra={}){
 const revision=(await arrivalList(r.env,EVENT)).revision,url=new URL(origin+'/api/admin/events/'+EVENT+'/arrivals');
 const response=await routeArrivals({request:new Request(url,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID(),'If-Match':String(revision)},body:JSON.stringify({id:'guest-arrived',model:'BMW 328i host',body:'Touring',crew:1,cash:500,matchesReviewed:true,...extra})}),url,env:r.env,auth,origin});
 assert.equal(response.status,200,await response.clone().text());return (await response.json()).arrival;
}
async function setup(){const r=arrivalsRuntime();await seedArrivals(r);r.db.prepare('UPDATE events SET live_enabled=1 WHERE id=?').run(EVENT);return r}
const start=(r,a,extra={},actor=auth)=>startLiveEntry(req({discipline:'show_shine',arrivalId:a.id,carId:a.car_key,category:'Touring',expectedVersion:1,...extra}),r.env,actor,EVENT,origin);
const admin=r=>getAdminLive(r.env,new URL(origin+'/?eventId='+EVENT),origin).then(x=>x.json());

test('arrived guest -> participant -> actual car -> atomic start -> official score, photo, results -> verified claim retains identity',async()=>{
 const r=await setup();try{
  const a=await gate(r,{email:'other@example.invalid'}),counts=r.db.prepare('SELECT (SELECT COUNT(*) FROM members) members,(SELECT COUNT(*) FROM cars) cars,(SELECT COUNT(*) FROM live_competition_cars) competitionCars').get();
  const list=await (await searchLiveMembers(r.env,EVENT,new URL(origin+'/?discipline=show_shine&q=host'),origin)).json();assert.equal(list.members[0].arrivalId,a.id);assert.equal(list.members[0].memberId,null);assert.equal(list.members[0].cars[0].id,a.car_key);
  assert.ok(!JSON.stringify(list).includes('other@example.invalid'));
  r.db.prepare("INSERT INTO live_car_photos(id,event_id,car_id,r2_key,mime_type,created_by) VALUES('guest-photo',?,?,'isolated/guest','image/jpeg','a')").run(EVENT,a.car_key);
  const response=await start(r,a);assert.equal(response.status,201,await response.clone().text());const {entryId}=await response.json();
  assert.equal((await liveEntryMedia(r.env,auth,entryId,origin)).status,200);
  const scores={overall:8,condition:7,cohesion:6,originality:9};
  assert.equal((await saveJudgeScore(req({scores,submitted:true,expectedVersion:0}),r.env,auth,entryId,origin)).status,200);
  assert.equal((await saveLiveVote(req({score:8}),r.env,{uid:'n'},entryId,origin)).status,200);
  const data=await admin(r);assert.equal(data.states.show_shine.entry.carId,a.car_key);assert.ok(JSON.stringify(data.results).includes(entryId));
  assert.ok(JSON.stringify((await (await getMemberLive(r.env,auth,origin)).json()).judgeHistory).includes(entryId));
  const token=JSON.parse(r.db.prepare('SELECT payload_json FROM email_outbox').get().payload_json).token;
  assert.equal((await claimArrival(req({token}),r.env,{uid:'n',email:'other@example.invalid',emailVerified:false},origin)).status,403);
  assert.equal((await claimArrival(req({token}),r.env,{uid:'n',email:'other@example.invalid',emailVerified:true},origin)).status,200);
  assert.equal((await claimArrival(req({token}),r.env,{uid:'n',email:'other@example.invalid',emailVerified:true},origin)).status,409);
  assert.deepEqual(r.db.prepare('SELECT (SELECT COUNT(*) FROM members) members,(SELECT COUNT(*) FROM cars) cars,(SELECT COUNT(*) FROM live_competition_cars) competitionCars').get(),counts);
  assert.equal(r.db.prepare('SELECT member_id FROM live_entry_vehicles WHERE entry_id=?').get(entryId).member_id,'n');
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM live_entries').get().n,1);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM live_judge_scores').get().n,1);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM live_public_votes').get().n,1);
  assert.equal((await saveLiveVote(req({score:9}),r.env,{uid:'n'},entryId,origin)).status,403);
  assert.equal((await closeLiveEntry(req({expectedVersion:2}),r.env,auth,entryId,origin)).status,200);
  assert.equal((await controlLive(req({action:'close_category',category:'Touring',expectedCategoryVersion:2}),r.env,auth,EVENT,'show_shine',origin)).status,200);
  assert.equal((await controlLive(req({action:'publish',expectedVersion:3}),r.env,auth,EVENT,'show_shine',origin)).status,200);
  assert.ok(JSON.stringify((await (await getMemberLive(r.env,{uid:'n'},origin)).json()).results).includes(entryId));
  assert.deepEqual(r.db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{r.db.close()}
});

test('no arrival, forged permission, wrong/closed category and unconfirmed original M do not create entries',async()=>{
 const r=await setup();try{
  assert.equal((await start(r,{id:'missing',car_key:'missing'})).status,409);
  const a=await gate(r);assert.equal((await start(r,a,{}, {uid:'n',role:'admin'})).status,403);
  assert.equal((await start(r,a,{category:'Sedan'})).status,409);assert.equal((await start(r,a,{category:'///M Power'})).status,409);
  r.db.prepare("INSERT INTO live_category_state(event_id,discipline,category,status) VALUES(?,'show_shine','Touring','closed')").run(EVENT);
  assert.equal((await start(r,a)).status,409);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM live_entries').get().n,0);
 }finally{r.db.close()}
});

test('concurrent replay starts once; another car never silently replaces the current entry',async()=>{
 const r=await setup();try{
  const a=await gate(r),b=await gate(r,{id:'second-arrival'});
  const result=await Promise.all([start(r,a),start(r,a)]);assert.deepEqual(result.map(x=>x.status).sort(),[200,201]);
  assert.equal((await start(r,b,{expectedVersion:2})).status,409);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM live_entries').get().n,1);
  assert.equal(r.db.prepare('SELECT version FROM live_competition_state').get().version,2);
 }finally{r.db.close()}
});

test('category close / role revocation after preflight cannot create an orphan entry',async()=>{
 for(const mutation of ["UPDATE live_category_state SET status='closed'", "UPDATE members SET role='member' WHERE id='a'"]){
  const r=await setup();try{const a=await gate(r);r.db.prepare("INSERT INTO live_category_state(event_id,discipline,category,status) VALUES(?,'show_shine','Touring','idle')").run(EVENT);
   const batch=r.env.DB.batch;r.env.DB.batch=statements=>{r.db.exec(mutation);return batch(statements)};
   assert.equal((await start(r,a)).status,409);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM live_entries').get().n,0);
  }finally{r.db.close()}
 }
});

test('member QR and manual lookup select the same arrived actual car without reservation/Show & Shine consent',async()=>{
 const r=await setup();try{const a=await gate(r,{id:'member-arrival',memberId:'fixture-unregistered',carId:'car-unregistered'});
  const token=r.db.prepare("SELECT token FROM member_qr_identities WHERE member_id='fixture-unregistered'").get().token;
  const qr=await (await resolveLiveQr(req({payload:'E36U1:'+token,discipline:'show_shine'}),r.env,EVENT,origin)).json();assert.equal(qr.members[0].arrivalId,a.id);
  assert.equal((await start(r,a,{category:'Sedan'})).status,201);
 }finally{r.db.close()}
});
