import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createMemberApiClient } from '../member/api.js';
import { loadMemberSessionSnapshot } from '../member/refresh.js';
import { compressImageBlob, IMAGE_ERROR_MESSAGE } from '../member/media.js';
import { MEMBER_SECTIONS, requestedMemberSection } from '../member/deep-links.js';
import { getAdminFunnel, linkPlannerReservation, markProfileCompletion, trackOnboarding, trackPlannerHandoff } from '../worker/domains/planner/funnel.js';
import { trackPublicPlannerDraft } from '../public-planner-handoff.js';
import { putCurrentReservation, putPlannerDraft, getPublicCurrentEvent, patchAdminEvent } from '../worker/domains.js';
import { nextEventPresentation } from '../public-event-presentation.js';

const json=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers:{'Content-Type':'application/json'}});
const post=body=>new Request('https://api.e36united.cz/api/planner-handoffs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const origin='https://e36united.cz';
const user={uid:'a',email:'a@example.test',getIdToken:async()=> 'token'};

test('next event uses configured dates only, no invented venue or past/invalid event',()=>{
  const event={startsOn:'2027-08-13',endsOn:'2027-08-15',venueName:'  Test kemp  '};
  assert.deepEqual(nextEventPresentation(event,'2027-08-01'),{dateLabel:'13.–15. 8. 2027',venue:'Test kemp'});
  assert.equal(nextEventPresentation({...event,venueName:null},'2027-08-01').venue,'');
  assert.equal(nextEventPresentation(event,'2027-08-16'),null);
  assert.equal(nextEventPresentation({venueName:'Unknown'},'2027-08-01'),null);
  assert.equal(nextEventPresentation({startsOn:'2027-02-30'},'2027-01-01'),null);
  assert.equal(nextEventPresentation({startsOn:'2027-08-15',endsOn:'2027-08-13'},'2027-01-01'),null);
  assert.equal(nextEventPresentation({startsOn:'2027-08-31',endsOn:'2027-09-01'},'2027-01-01').dateLabel,'31. 8. 2027 – 1. 9. 2027');
});

test('optional venue is editable, audited and public without changing existing event settings',async()=>{
  const {db,env}=runtime();
  db.exec("UPDATE events SET starts_on='2027-08-13',ends_on='2027-08-15',reservation_capacity=120 WHERE id='event'");
  const before=db.prepare("SELECT * FROM events WHERE id='event'").get();
  assert.equal((await patchAdminEvent(post({venueName:'  Test kemp  '}),env,user,'event',origin)).status,200);
  const after=db.prepare("SELECT * FROM events WHERE id='event'").get();
  assert.deepEqual({...after,venue_name:null},{...before});assert.equal(after.venue_name,'Test kemp');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM admin_actions').get().n,1);
  const event=(await (await getPublicCurrentEvent(env,origin)).json()).event;
  assert.equal(event.startsOn,'2027-08-13');assert.equal(event.endsOn,'2027-08-15');assert.equal(event.venueName,'Test kemp');
  assert.equal((await (await patchAdminEvent(post({venueName:'Test kemp'}),env,user,'event',origin)).json()).unchanged,true);
  for(const venueName of [123,{},'x'.repeat(121)])assert.equal((await patchAdminEvent(post({venueName}),env,user,'event',origin)).status,400);
  assert.equal((await patchAdminEvent(post({venueName:''}),env,user,'event',origin)).status,200);
  assert.equal(db.prepare("SELECT venue_name FROM events WHERE id='event'").get().venue_name,null);db.close();
});
function runtime(){
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('../db/migrations/2026-09-07-production-feedback.sql',import.meta.url),'utf8'));
  db.exec("INSERT INTO events(id,year,title,is_current) VALUES('event',2027,'United',1),('old',2026,'Old',0); INSERT INTO members(id,member_code,email,name) VALUES('a','A','a@example.test','A'),('b','B','b@example.test','B');");
  const prepare=(sql,bindings=[])=>({bind:(...values)=>prepare(sql,values),async first(){return db.prepare(sql).get(...bindings)||null},async all(){return{results:db.prepare(sql).all(...bindings)}},async run(){return{meta:{changes:Number(db.prepare(sql).run(...bindings).changes)}}}});
  return {db,env:{DB:{prepare,async batch(statements){db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());db.exec('COMMIT');return results}catch(error){db.exec('ROLLBACK');throw error}}}}};
}
function draft(){return {version:1,draftId:crypto.randomUUID(),source:'weekend-planner',eventId:'event',eventYear:2027,createdAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+86_400_000).toISOString(),arrival:'Pátek',departure:'Neděle',nights:2,attendanceType:'full_weekend',accommodation:'Bez ubytování',accommodationOptionId:null,accommodationUnits:0,crew:2,showShine:'Ne'}};

test('safe GET retries once for network and 502/503/504; other errors and mutations do not retry',async()=>{
  for(const status of ['network',502,503,504,400,401,403,500])for(const method of ['GET','POST','PUT','DELETE']){
    let calls=0;
    const api=createMemberApiClient({baseUrl:origin,getCurrentUser:()=>user,retryDelayMs:0,fetchRequest:async()=>{calls++;if(status==='network')throw new TypeError('Failed to fetch');return json({},status)}});
    await assert.rejects(api.request('/test',{method,retry:false}));
    assert.equal(calls,method==='GET'&&['network',502,503,504].includes(status)?2:1,`${method} ${status}`);
  }
});
test('a transient GET can recover, while a stalled upload has a deadline and is not replayed',async()=>{
  let calls=0;const api=createMemberApiClient({baseUrl:origin,getCurrentUser:()=>user,retryDelayMs:0,fetchRequest:async()=>++calls===1?json({},503):json({ok:true})});
  assert.deepEqual(await api.request('/read'),{ok:true});assert.equal(calls,2);
  calls=0;let signal;const upload=createMemberApiClient({baseUrl:origin,getCurrentUser:()=>user,timeoutMs:10,fetchRequest:async(_,options)=>{calls++;signal=options.signal;return new Promise(()=>{})}});
  await assert.rejects(upload.requestForm('/photo',new FormData()),/api_network_error/);assert.equal(calls,1);assert.equal(signal.aborted,true);
});
test('every secondary domain is isolated but 401/403 authorization failures still stop restore',async()=>{
  const names=['loadCars','loadReservation','loadPlannerDraft','loadClub','loadGallery'];
  for(const name of names){
    const loaders=Object.fromEntries(names.map(key=>[key,async()=> key==='loadPlannerDraft'?{available:true,draft:null}:[]]));
    loaders[name]=async()=>{throw new Error('offline')};
    const snapshot=await loadMemberSessionSnapshot(loaders);assert.equal(Object.keys(snapshot.errors).length,1);
    for(const status of [401,403]){loaders[name]=async()=>{throw Object.assign(new Error('denied'),{status})};await assert.rejects(loadMemberSessionSnapshot(loaders),error=>error.status===status)}
  }
});
test('canonical member sections validate all seven IDs and legacy aliases safely',()=>{
  for(const section of MEMBER_SECTIONS)assert.equal(requestedMemberSection(`?section=${section}`),section);
  assert.equal(requestedMemberSection('?panel=reservation'),'reservation');assert.equal(requestedMemberSection('?section=history'),'club');
  assert.equal(requestedMemberSection('?section=invalid&panel=garage'),'overview');assert.equal(requestedMemberSection('?section=__proto__'),'overview');
});
test('compression settles success, decode/read/canvas/toBlob failures and timeout with useful copy',async()=>{
  const previous={Image:globalThis.Image,FileReader:globalThis.FileReader,document:globalThis.document};
  try{
    for(const mode of ['success','decode','read','context','throw','blob','timeout']){
      globalThis.Image=class {width=320;height=240;set src(value){if(mode!=='timeout')queueMicrotask(()=>mode==='decode'?this.onerror?.():this.onload?.())}};
      globalThis.FileReader=class {readAsDataURL(){queueMicrotask(()=>mode==='read'?this.onerror?.():this.onload?.())}};
      globalThis.document={createElement:()=>({getContext:()=>mode==='context'?null:{drawImage(){if(mode==='throw')throw new Error('canvas failed')}},toBlob:callback=>callback(mode==='blob'?null:new Blob(['jpeg'],{type:'image/jpeg'}))})};
      const operation=compressImageBlob(new Blob(['photo']),1800,.82,{timeoutMs:20});
      if(mode==='success')assert.equal((await operation).type,'image/jpeg');else await assert.rejects(operation,error=>error.message===IMAGE_ERROR_MESSAGE);
    }
  }finally{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value}}
});
test('additive migration is executable and empty with foreign keys intact and venue optional',()=>{
  const {db}=runtime();
  assert.equal(db.prepare('SELECT COUNT(*) n FROM public_planner_handoffs').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM member_onboarding').get().n,0);
  assert.equal(db.prepare("SELECT venue_name FROM events WHERE id='event'").get().venue_name,null);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);db.close();
});
test('public tracking is idempotent, strict, anonymous and cannot be claimed by a second member',async()=>{
  const {db,env}=runtime(),plan=draft();
  for(let i=0;i<2;i++)assert.equal((await trackPlannerHandoff(post({draft:plan}),env,null,origin)).status,200);
  let row=db.prepare('SELECT * FROM public_planner_handoffs').get();assert.equal(row.member_id,null);assert.doesNotMatch(row.payload_json,/email|name/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM public_planner_handoffs').get().n,1);
  for(const invalid of [{...plan,email:'bad'}, {...plan,crew:99}, {...plan,eventId:'old'}, {...plan,expiresAt:'2000-01-01'}])assert.equal((await trackPlannerHandoff(post({draft:invalid}),env,null,origin)).status,400);
  assert.equal((await trackPlannerHandoff(post({draft:plan,padding:'x'.repeat(5000)}),env,null,origin)).status,400);
  assert.equal((await trackPlannerHandoff(post({draft:plan}),env,user,origin)).status,200);
  row=db.prepare('SELECT * FROM public_planner_handoffs').get();assert.equal(row.member_id,'a');assert.ok(row.member_portal_opened_at);
  await trackPlannerHandoff(post({draft:plan}),env,user,origin);
  assert.equal(db.prepare('SELECT member_claimed_at FROM public_planner_handoffs').get().member_claimed_at,row.member_claimed_at);
  assert.equal((await trackPlannerHandoff(post({draft:plan}),env,{uid:'b'},origin)).status,409);
  assert.equal(db.prepare('SELECT member_id FROM public_planner_handoffs').get().member_id,'a');db.close();
});
test('legacy draft can be claimed; conversion checks both draft and reservation ownership and event',async()=>{
  const {db,env}=runtime(),plan=draft();await trackPlannerHandoff(post({draft:plan}),env,user,origin);
  db.exec("INSERT INTO reservations(id,member_id,event_id) VALUES('r','a','event'),('other','b','event')");
  const link={draftId:plan.draftId,uid:'a',eventId:'event',reservationId:'other'};
  await linkPlannerReservation(env,link);assert.equal(db.prepare('SELECT reservation_id FROM public_planner_handoffs').get().reservation_id,null);
  await linkPlannerReservation(env,{...link,reservationId:'r',eventId:'old'});assert.equal(db.prepare('SELECT reservation_id FROM public_planner_handoffs').get().reservation_id,null);
  await linkPlannerReservation(env,{...link,reservationId:'r'});const row=db.prepare('SELECT * FROM public_planner_handoffs').get();assert.equal(row.reservation_id,'r');assert.ok(row.reservation_created_at);
  await linkPlannerReservation(env,{...link,reservationId:'r'});assert.equal(db.prepare('SELECT reservation_created_at FROM public_planner_handoffs').get().reservation_created_at,row.reservation_created_at);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);db.close();
});
test('onboarding never trusts supplied identity or profile stage and timestamps are idempotent',async()=>{
  const {db,env}=runtime(),newUser={uid:'new',email:'new@example.test'};
  assert.equal((await trackOnboarding(post({stage:'seen',email:'forged'}),env,newUser,origin)).status,400);
  await trackOnboarding(post({stage:'portal'}),env,newUser,origin);
  let row=db.prepare('SELECT * FROM member_onboarding').get();assert.equal(row.email,newUser.email);assert.equal(row.member_profile_created_at,null);assert.equal(row.first_portal_loaded_at,null);
  db.exec("INSERT INTO members(id,member_code,email,name) VALUES('new','NEW','new@example.test','New')");
  await markProfileCompletion(env,'new');await trackOnboarding(post({stage:'portal'}),env,newUser,origin);
  row=db.prepare('SELECT * FROM member_onboarding').get();assert.ok(row.member_profile_created_at);assert.ok(row.first_portal_loaded_at);
  await trackOnboarding(post({stage:'portal'}),env,newUser,origin);const again=db.prepare('SELECT * FROM member_onboarding').get();
  assert.equal(again.firebase_account_seen_at,row.firebase_account_seen_at);assert.equal(again.member_profile_created_at,row.member_profile_created_at);assert.equal(again.first_portal_loaded_at,row.first_portal_loaded_at);db.close();
});

test('real reservation success records conversion even if public/client tracking was delayed; failure does not',async()=>{
  const {db,env}=runtime(),plan=draft();
  db.exec("INSERT INTO cars(id,member_id,model) VALUES('car','a','328i')");
  await putPlannerDraft(post({draft:plan}),env,user,origin);
  const body={plannerDraftId:plan.draftId,carId:'car',arrival:'Jen na otočku',crew:2,attendanceType:'day_visit',accommodation:'Bez ubytování',accommodationUnits:0,showShine:'Ne'};
  assert.equal((await putCurrentReservation(post(body),env,user,origin)).status,409);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM public_planner_handoffs').get().n,0);
  db.exec("UPDATE events SET registration_status='open' WHERE id='event'");
  const response=await putCurrentReservation(post(body),env,user,origin);assert.equal(response.status,200);
  const reservation=(await response.json()).reservation,row=db.prepare('SELECT * FROM public_planner_handoffs').get();
  assert.equal(row.member_id,'a');assert.equal(row.reservation_id,reservation.id);assert.ok(row.reservation_created_at);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM member_planner_drafts').get().n,0);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);db.close();
});
test('Admin funnel counts real forward records, global incomplete identities and event-scoped plans',async()=>{
  const {db,env}=runtime(),a=draft(),b=draft(),c=draft();
  await trackPlannerHandoff(post({draft:a}),env,null,origin);await trackPlannerHandoff(post({draft:b}),env,user,origin);await trackPlannerHandoff(post({draft:c}),env,user,origin);
  db.exec("INSERT INTO reservations(id,member_id,event_id) VALUES('r','a','event')");await linkPlannerReservation(env,{draftId:c.draftId,uid:'a',eventId:'event',reservationId:'r'});
  await trackOnboarding(post({stage:'seen'}),env,{uid:'new',email:'new@example.test'},origin);
  const payload=await (await getAdminFunnel(env,new URL(`${origin}/?eventId=event`),origin)).json();
  assert.deepEqual(payload.counts,{members:2,incomplete:1,created:3,claimed:2,opened:2,converted:1,unclaimed:1,claimedWithoutReservation:1});
  assert.equal(payload.details.incomplete[0].email,'new@example.test');assert.equal(payload.details.claimedWithoutReservation[0].email,'a@example.test');assert.equal(payload.details.unclaimed[0].email,undefined);
  const old=await (await getAdminFunnel(env,new URL(`${origin}/?eventId=old`),origin)).json();assert.equal(old.counts.created,0);assert.equal(old.counts.members,2);db.close();
});
test('tracking failure is harmless to public handoff and reservation/profile completion',async()=>{
  assert.equal(await trackPublicPlannerDraft(draft(),{baseUrl:origin,fetchRequest:async()=>{throw new Error('offline')}}),false);
  const env={DB:{prepare(){throw new Error('migration not installed')}}};
  await markProfileCompletion(env,'a');await linkPlannerReservation(env,{draftId:crypto.randomUUID(),uid:'a',eventId:'event',reservationId:'r'});
});
test('normal registration no longer sends verification; password reset and sync remain',()=>{
  const member=readFileSync(new URL('../member.js',import.meta.url),'utf8'),worker=readFileSync(new URL('../worker/domains/members.js',import.meta.url),'utf8');
  assert.doesNotMatch(member,/sendEmailVerification|ověřovací e-mail|Ověření e-mailu jsme/);assert.match(member,/sendPasswordResetEmail/);assert.match(worker,/email_verified = excluded.email_verified/);
});
