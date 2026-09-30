import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {arrivalsRuntime,seedArrivals,EVENT} from './helpers/arrivals-runtime.mjs';
import {memberRuntime} from './helpers/admin-member-runtime.mjs';
import {participantList} from '../worker/domains/live-arrivals.js';
import {startLiveEntry,createCompetitionCar,saveJudgeScore} from '../worker/domains/live.js';
import {findArrivalMembers,routeArrivals,arrivalList} from '../worker/domains/arrivals.js';
const origin='https://example.invalid',auth={uid:'a'},req=b=>new Request(origin,{method:'POST',body:JSON.stringify(b)});
async function setup(){const r=arrivalsRuntime();await seedArrivals(r);r.db.prepare('UPDATE events SET live_enabled=1 WHERE id=?').run(EVENT);return r}
const start=(r,car='car-paid',extra={},actor=auth)=>startLiveEntry(req({discipline:'show_shine',carId:car,category:'Sedan',expectedVersion:1,...extra}),r.env,actor,EVENT,origin);
async function createGuest(r,id='explicit-guest'){const f=new FormData();for(const [k,v] of Object.entries({id,participantName:'Host samostatně',model:'BMW 328i host',body:'Sedan',engine:'2.8',originalM:'false'}))f.set(k,v);return createCompetitionCar(new Request(origin,{method:'POST',body:f}),r.env,auth,EVENT,null,origin)}
async function gate(r,b,operation=crypto.randomUUID()){const url=new URL(origin+'/api/admin/events/'+EVENT+'/arrivals');return routeArrivals({request:new Request(url,{method:'POST',headers:{'Idempotency-Key':operation,'If-Match':String((await arrivalList(r.env,EVENT)).revision)},body:JSON.stringify({id:'explicit-arrival',crew:1,cash:500,matchesReviewed:true,...b})}),url,env:r.env,auth,origin})}
test('manual registration and member without reservation are listed without arrivals; each actual car once',async()=>{const r=await setup();try{
 r.db.prepare("UPDATE reservations SET admission_czk=NULL WHERE id='reservation-paid'").run();
 const gateRows=await findArrivalMembers(r.env,EVENT);assert.ok(gateRows.some(m=>m.id==='fixture-paid'));assert.ok(gateRows.some(m=>m.id==='fixture-unregistered'));
 assert.equal((await findArrivalMembers(r.env,EVENT,'TEST-paid'))[0].id,'fixture-paid');
 const rows=(await participantList(r.env,EVENT)).members;assert.equal(rows.filter(m=>m.cars[0]?.id==='car-paid').length,1);assert.ok(rows.some(m=>m.cars[0]?.id==='car-unregistered'));
 assert.equal(rows.filter(m=>m.memberId==='fixture-othercar').length,2);
 assert.equal((await start(r)).status,201);
 assert.equal(r.db.prepare('SELECT COUNT(*) n FROM event_arrivals').get().n,0);
 assert.equal(r.db.prepare('SELECT COUNT(*) n FROM event_payments').get().n,4);
}finally{r.db.close()}});
test('guest identity without arrival starts, scores and is reused at gate; cash and car exactly once',async()=>{const r=await setup();try{
 const before=r.db.prepare('SELECT COUNT(*) n FROM members').get().n;
 assert.equal((await createGuest(r)).status,201);assert.equal((await createGuest(r)).status,200);
 const result=await start(r,'explicit-guest');assert.equal(result.status,201,await result.clone().text());const {entryId}=await result.json();
 assert.equal((await saveJudgeScore(req({scores:{overall:8,condition:7,cohesion:8,originality:6},submitted:true,expectedVersion:0}),r.env,auth,entryId,origin)).status,200);
 assert.equal(r.db.prepare('SELECT COUNT(*) n FROM event_arrivals').get().n,0);
 assert.ok((await findArrivalMembers(r.env,EVENT,'Host')).some(m=>m.key==='car:explicit-guest'));
 const op=crypto.randomUUID(),a=await gate(r,{carId:'explicit-guest',name:'Host samostatně'},op);assert.equal(a.status,200,await a.clone().text());
 const again=await gate(r,{carId:'explicit-guest',name:'Host samostatně'});assert.equal(again.status,200,await again.clone().text());
 assert.equal(r.db.prepare('SELECT COUNT(*) n FROM event_arrivals').get().n,1);
 assert.equal(r.db.prepare("SELECT COUNT(*) n FROM event_payments WHERE method='cash'").get().n,1);
 assert.equal(r.db.prepare('SELECT COUNT(*) n FROM live_competition_cars').get().n,1);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM live_entries').get().n,1);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM members').get().n,before);
 assert.equal((await participantList(r.env,EVENT,'',{category:'Sedan'})).members[0].cars[0].id,'explicit-guest');
 assert.deepEqual(r.db.prepare('PRAGMA foreign_key_check').all(),[]);
}finally{r.db.close()}});
test('assigned judge can enroll; unauthorized actor, category mismatch, closed category and M are rejected',async()=>{const r=await setup();try{
 assert.equal((await start(r,'car-paid',{}, {uid:'n'})).status,403);
 assert.equal((await start(r,'car-paid',{category:'Touring'})).status,409);
 assert.equal((await start(r,'car-paid',{category:'///M Power'})).status,409);
 r.db.prepare("INSERT INTO live_category_state(event_id,discipline,category,status) VALUES(?,'show_shine','Sedan','closed')").run(EVENT);
 assert.equal((await start(r)).status,409);assert.equal(r.db.prepare('SELECT status FROM live_category_state').get().status,'closed');
 r.db.prepare('DELETE FROM live_category_state').run();
 r.db.prepare("INSERT INTO event_live_judges(event_id,member_id,created_by) VALUES(?,'n','a')").run(EVENT);
 assert.equal((await start(r,'car-unregistered',{}, {uid:'n'})).status,201);
}finally{r.db.close()}});
test('concurrent repeated start is unique and another car cannot replace it',async()=>{const r=await setup();try{
 assert.deepEqual((await Promise.all([start(r),start(r)])).map(x=>x.status).sort(),[200,201]);
 assert.equal((await start(r,'car-unregistered',{expectedVersion:2})).status,409);
 assert.equal(r.db.prepare('SELECT COUNT(*) n FROM live_entries').get().n,1);
}finally{r.db.close()}});
test('migration preserves existing competition data, indices, triggers and foreign keys',async()=>{const schema=readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8'),r=memberRuntime({schema:schema.split('-- Explicit jury participants without arrivals')[0]+'\nCOMMIT;'});try{
 r.db.exec("INSERT INTO live_competition_cars(id,event_id,member_id,model,body,created_by) VALUES('old-comp','e','m','BMW','Sedan','a'); INSERT INTO live_entries(id,event_id,discipline,member_id,competition_car_id,category) VALUES('old-entry','e','show_shine','m','old-comp','Sedan'); INSERT INTO live_public_votes(id,event_id,discipline,entry_id,voter_id,score) VALUES('old-vote','e','show_shine','old-entry','n',8); INSERT INTO event_arrivals(id,event_id,member_id,car_key,competition_car_id,model,body,crew,registered,admission_czk,services_czk,confirmed_by) VALUES('old-arrival','e','m','old-comp','old-comp','BMW','Sedan',1,0,500,0,'a');");
 r.db.exec("INSERT INTO live_competition_state(event_id,discipline,status,current_entry_id,version) VALUES('e','show_shine','live','old-entry',7); INSERT INTO live_judge_scores(id,event_id,entry_id,judge_id,scores_json,submitted) VALUES('old-score','e','old-entry','a','{\"overall\":8}',1); UPDATE live_judge_scores SET scores_json='{\"overall\":9}',version=2,updated_by='a',correction_reason='Isolated correction' WHERE id='old-score'; INSERT INTO live_judge_photos(id,event_id,entry_id,judge_id,r2_key,mime_type,size_bytes,gallery_submission_id) VALUES('old-photo','e','old-entry','a','synthetic-photo','image/jpeg',123,'g');");
 const tables=r.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'schema_migrations'").all().map(x=>x.name),snapshot=Object.fromEntries(tables.map(t=>[t,r.db.prepare('SELECT * FROM '+t).all()]));
 const objects=r.db.prepare("SELECT name FROM sqlite_master WHERE type IN ('index','trigger') AND sql IS NOT NULL").all().map(x=>x.name);
 r.db.exec('BEGIN');r.db.exec(readFileSync(new URL('../db/migrations/2026-09-30-live-explicit-participants.sql',import.meta.url),'utf8'));r.db.exec('COMMIT');
 for(const [t,rows] of Object.entries(snapshot)){const now=r.db.prepare('SELECT * FROM '+t).all();if(t==='live_competition_cars')now.forEach(x=>delete x.participant_name);assert.deepEqual(now,rows,t)}
 for(const name of objects)assert.ok(r.db.prepare('SELECT name FROM sqlite_master WHERE name=?').get(name),name);
 assert.deepEqual(r.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(r.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
}finally{r.db.close()}});
test('arrived accountless guest remains selectable; explicit guest later claimed without extra car or entry',async()=>{const r=await setup();try{
 const a=await gate(r,{id:'gate-only-guest',model:'Guest car',body:'Sedan'});assert.equal(a.status,200);
 const arrival=(await a.json()).arrival;assert.ok((await participantList(r.env,EVENT)).members.some(x=>x.arrivalId===arrival.id));
 await createGuest(r);const result=await start(r,'explicit-guest');const {entryId}=await result.json();
 const g=await gate(r,{id:'guest-to-link',carId:'explicit-guest',email:'other@example.invalid'});assert.equal(g.status,200);
 const {claimArrival}=await import('../worker/domains/arrival-invitations.js');
 const token=JSON.parse(r.db.prepare('SELECT payload_json FROM email_outbox').get().payload_json).token;
 const linked=await claimArrival(req({token}),r.env,{uid:'n',email:'other@example.invalid',emailVerified:true},origin);assert.equal(linked.status,200);
 assert.equal(r.db.prepare('SELECT member_id FROM live_entry_vehicles WHERE entry_id=?').get(entryId).member_id,'n');
 assert.equal(r.db.prepare('SELECT COUNT(*) n FROM live_entries').get().n,1);
 assert.equal(r.db.prepare('SELECT COUNT(*) n FROM live_competition_cars').get().n,1);
 assert.equal((await participantList(r.env,EVENT)).members.filter(x=>x.cars[0]?.id==='explicit-guest').length,1);
}finally{r.db.close()}});
test('role/category races fail atomically; names behind nicknames and pagination remain searchable',async()=>{for(const mutate of ["UPDATE members SET role='member' WHERE id='a'","INSERT INTO live_category_state(event_id,discipline,category,status) VALUES('"+EVENT+"','show_shine','Sedan','closed')"]){
 const r=await setup();try{const batch=r.env.DB.batch;r.env.DB.batch=ss=>{r.db.exec(mutate);return batch(ss)};assert.equal((await start(r)).status,409);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM live_entries').get().n,0)}finally{r.db.close()}
}
 const r=await setup();try{assert.ok((await participantList(r.env,EVENT,'Same Name')).members.some(m=>m.memberId==='m'));
 for(let i=0;i<55;i++)r.db.prepare("INSERT INTO cars(id,member_id,model,body) VALUES(?,'m',?,'Sedan')").run('page-'+i,'Paging '+i);
 const a=await participantList(r.env,EVENT),b=await participantList(r.env,EVENT,'',{offset:a.nextOffset});assert.equal(a.hasMore,true);assert.equal(new Set([...a.members,...b.members].map(m=>m.key)).size,a.members.length+b.members.length);
}finally{r.db.close()}});
test('router grants event judges only scoped preparation, never finance or global Admin',async()=>{const r=await setup(),fetchOriginal=globalThis.fetch;try{
 const {routeRequest}=await import('../worker/router.js');
 const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);jwk.kid='isolated-picker-jwk';jwk.alg='RS256';
 globalThis.fetch=async url=>{assert.match(String(url),/googleapis.com.*jwk/);return new Response(JSON.stringify({keys:[jwk]}),{headers:{'Cache-Control':'max-age=3600'}})};
 const now=Math.floor(Date.now()/1000),encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
 const unsigned=encode({alg:'RS256',kid:jwk.kid})+'.'+encode({sub:'n',aud:'e36-united',iss:'https://securetoken.google.com/e36-united',iat:now,auth_time:now,exp:now+3600});
 const token=unsigned+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(unsigned))).toString('base64url');
 r.db.prepare("INSERT INTO event_live_judges(event_id,member_id,created_by) VALUES(?,'n','a')").run(EVENT);
 const call=async(path,body)=>{const url=new URL(origin+path),request=new Request(url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token},...(body?{body:JSON.stringify(body)}:{})});return routeRequest({request,env:r.env,url,origin:'',ctx:{waitUntil(){throw Error('Unexpected background work')}}})};
 const base='/api/admin/events/'+EVENT;
 assert.equal((await call(base+'/live/members?discipline=show_shine')).status,200);
 assert.equal((await call(base+'/live/start',{discipline:'show_shine',carId:'car-paid',category:'Sedan',expectedVersion:1})).status,201);
 assert.equal((await call(base+'/arrivals/export')).status,403);
 assert.equal((await call('/api/admin/dashboard')).status,403);
 assert.equal((await call('/api/admin/events/old/live/members?discipline=show_shine')).status,403);
 assert.equal((await call(base+'/live/members?discipline=best_exhaust')).status,403);
}finally{globalThis.fetch=fetchOriginal;r.db.close()}});
