import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {memberRuntime} from './helpers/admin-member-runtime.mjs';
import worker from '../cloudflare-worker-media.js';
import {getPreliminaryReservation,putPreliminaryReservation,cancelPreliminaryReservation,listAdminPreliminaryReservations,savePreliminarySettings} from '../worker/domains/reservations/preliminary.js';
import {putCurrentReservation,getCurrentReservation} from '../worker/domains/reservations/index.js';
import {getAdminSummary} from '../worker/admin/summary.js';
const origin='https://e36united.cz',auth={uid:'m'};
const req=(body,method='PUT',path='/api/preliminary-reservations/current',token)=>new Request('https://api.e36united.cz'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(method==='GET'?{}:{body:JSON.stringify(body)})});
const preference={eventId:'e',revision:0,carId:'c',arrival:'Pátek',crew:2,crewDetails:['Řidič','Doprovod'],accommodation:'Chatka',accommodationOptionId:'cab',accommodationUnits:2,showShine:'Možná',note:'Nezávazná preference'};
function setup(){const r=memberRuntime();r.db.exec(`DELETE FROM reservations;UPDATE events SET registration_status='closed' WHERE id='e';
 INSERT INTO event_preliminary_settings(event_id,enabled,write_token) VALUES('e',1,'fixture');
 INSERT INTO event_accommodation_options(id,event_id,name,kind,inventory_mode,units_total,capacity_per_unit,unit_price_czk,active) VALUES('cab','e','Chatka','cabin','limited',1,4,500,1);`);return r;}
const save=(r,body=preference)=>putPreliminaryReservation(req(body),r.env,auth,origin);
const get=r=>getPreliminaryReservation(r.env,auth,origin);
const snapshot=r=>JSON.stringify(['reservations','reservation_accommodation','member_qr_identities','united_points_ledger'].map(table=>r.db.prepare(`SELECT * FROM ${table}`).all()));

test('preliminary migration is additive, defaults off and preserves FK integrity',()=>{
 const migration=readFileSync(new URL('../db/migrations/2026-09-19-preliminary-reservations.sql',import.meta.url),'utf8');
 const schema=readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8');const db=new DatabaseSync(':memory:');
 db.exec(schema.replace(migration.trim(),''));db.exec(migration);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM event_preliminary_settings').get().n,0);
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='idx_preliminary_event_status'").get().n,1);db.close();
});
test('preliminary create/edit/cancel preserves every preference and has no capacity/payment/QR side effects',async()=>{
 const r=setup(),before=snapshot(r);assert.equal((await save(r)).status,200);
 let p=(await (await get(r)).json()).preliminary;assert.equal(p.status,'active');assert.equal(p.preferences.showShine,'Možná');assert.deepEqual(p.preferences.crewDetails,preference.crewDetails);
 assert.ok(p.createdAt&&p.updatedAt);assert.equal(p.preferences.note,preference.note);
 assert.equal((await save(r,{...preference,revision:p.revision,note:'Upraveno'})).status,200);
 p=(await (await get(r)).json()).preliminary;assert.equal(p.revision,2);assert.equal(p.preferences.note,'Upraveno');
 assert.equal((await cancelPreliminaryReservation(req({eventId:'e',revision:2},'DELETE'),r.env,auth,origin)).status,200);
 assert.equal((await (await get(r)).json()).preliminary.status,'cancelled');assert.equal(snapshot(r),before);
 assert.equal((await save(r,{...preference,revision:3})).status,200);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM preliminary_reservations').get().n,1);r.db.close();
});
test('one member/event interest cannot be duplicated or overwritten with a stale revision',async()=>{
 const r=setup();const result=await Promise.all([save(r),save(r)]);assert.deepEqual(result.map(x=>x.status).sort(),[200,409]);
 assert.equal(r.db.prepare('SELECT COUNT(*) n FROM preliminary_reservations').get().n,1);
 assert.equal((await save(r,{...preference,revision:42})).status,409);
 assert.equal((await cancelPreliminaryReservation(req({eventId:'e',revision:1},'DELETE'),r.env,{uid:'n'},origin)).status,409);r.db.close();
});
test('settings, current event, active membership and existing real reservation gate submission',async()=>{
 const r=setup();r.db.exec('DELETE FROM event_preliminary_settings');assert.equal((await save(r)).status,409);
 assert.equal((await savePreliminarySettings(req({enabled:true,revision:0}),r.env,{uid:'a'},'e',origin)).status,200);
 assert.equal((await savePreliminarySettings(req({enabled:false,revision:0}),r.env,{uid:'a'},'e',origin)).status,409);
 r.db.exec("UPDATE events SET registration_status='open' WHERE id='e'");assert.equal((await save(r)).status,409);
 r.db.exec("UPDATE events SET registration_status='closed' WHERE id='e';UPDATE members SET status='suspended' WHERE id='m'");assert.equal((await save(r)).status,409);
 r.db.exec("UPDATE members SET status='active' WHERE id='m';INSERT INTO reservations(id,member_id,event_id,status) VALUES('real','m','e','approved')");const before=snapshot(r);assert.equal((await save(r)).status,409);assert.equal(snapshot(r),before);
 assert.equal((await save(r,{...preference,eventId:'old'})).status,409);r.db.close();
});
test('preferences validate owned car, event option, crew, note and forbid financial/QR fields',async()=>{
 const r=setup();for(const invalid of [{carId:'cn'},{crew:6},{crew:1,crewDetails:['A','B']},{showShine:'perhaps'},{note:'x'.repeat(1001)},{accommodationOptionId:'missing'},{paymentVs:'123'},{amountDueCzk:10},{status:'approved'}])assert.equal((await save(r,{...preference,...invalid})).status,400,JSON.stringify(invalid));
 assert.equal((await save(r,{...preference,note:'x'.repeat(9000)})).status,413);
 r.db.exec("UPDATE event_accommodation_options SET units_total=0 WHERE id='cab'");assert.equal((await save(r)).status,200,'Sold-out preference does not reserve capacity');r.db.close();
});
test('non-binding plan allows no car while real reservation still requires one',async()=>{
 const r=setup();assert.equal((await save(r,{...preference,carId:null})).status,200);
 let p=(await(await get(r)).json()).preliminary;assert.equal(p.preferences.carId,null);
 r.db.exec("UPDATE events SET registration_status='open' WHERE id='e'");
 const response=await putCurrentReservation(req({...p.preferences,preliminaryId:p.id,preliminaryRevision:p.revision}),r.env,auth,origin);
 assert.equal(response.status,400);assert.equal((await response.json()).error,'car_required');p=(await(await get(r)).json()).preliminary;
 assert.equal(p.status,'active');assert.equal(r.db.prepare('SELECT COUNT(*) n FROM reservations').get().n,0);r.db.close();
});
test('day visit stores no accommodation and cancellation remains possible after registrations open',async()=>{
 const r=setup();assert.equal((await save(r,{...preference,arrival:'Jen na otočku'})).status,200);
 const p=(await (await get(r)).json()).preliminary;assert.equal(p.preferences.accommodation,'Bez ubytování');assert.equal(p.preferences.accommodationUnits,0);assert.equal(p.preferences.accommodationOptionId,null);
 r.db.exec("UPDATE events SET registration_status='open' WHERE id='e'");assert.equal((await cancelPreliminaryReservation(req({eventId:'e',revision:p.revision},'DELETE'),r.env,auth,origin)).status,200);r.db.close();
});
test('opening registration/read never converts; explicit confirmation validates latest price and consumes atomically',async()=>{
 const r=setup();await save(r);let p=(await (await get(r)).json()).preliminary;
 assert.equal((await putCurrentReservation(req({...p.preferences,preliminaryId:p.id,preliminaryRevision:p.revision}),r.env,auth,origin)).status,409);
 r.db.exec("UPDATE events SET registration_status='open' WHERE id='e';UPDATE event_accommodation_options SET unit_price_czk=750 WHERE id='cab'");
 const before=snapshot(r);await get(r);await getCurrentReservation(r.env,auth,origin);assert.equal(snapshot(r),before);assert.equal((await (await get(r)).json()).preliminary.status,'active');
 const response=await putCurrentReservation(req({...p.preferences,preliminaryId:p.id,preliminaryRevision:p.revision}),r.env,auth,origin);assert.equal(response.status,200,await response.clone().text());
 const real=(await response.json()).reservation;assert.equal(real.status,'pending');assert.equal(real.amountDueCzk,1500);assert.equal((await (await get(r)).json()).preliminary.status,'converted');
 assert.equal(r.db.prepare('SELECT COUNT(*) n FROM member_qr_identities').get().n,0);
 assert.equal((await putCurrentReservation(req({...p.preferences,preliminaryId:p.id,preliminaryRevision:p.revision}),r.env,auth,origin)).status,409);r.db.close();
});
test('conversion revalidates capacity, car ownership, option activity and revision without losing interest',async()=>{
 for(const kind of ['capacity','car','option','revision']){
  const r=setup();await save(r);const p=(await (await get(r)).json()).preliminary;r.db.exec("UPDATE events SET registration_status='open' WHERE id='e'");
  if(kind==='capacity')r.db.exec("UPDATE event_accommodation_options SET units_total=0 WHERE id='cab'");
  if(kind==='car')r.db.exec("DELETE FROM cars WHERE id='c'");
  if(kind==='option')r.db.exec("UPDATE event_accommodation_options SET active=0 WHERE id='cab'");
  const response=await putCurrentReservation(req({...p.preferences,preliminaryId:p.id,preliminaryRevision:kind==='revision'?99:p.revision}),r.env,auth,origin);
  assert.ok(response.status>=400,kind);assert.equal((await (await get(r)).json()).preliminary.status,'active');assert.equal(r.db.prepare('SELECT COUNT(*) n FROM reservations').get().n,0);r.db.close();
 }
});
test('Admin preliminary count/list is event scoped, bounded and separate from actual reservation statistics',async()=>{
 const r=setup(),summaryUrl=new URL('https://api.e36united.cz/api/admin/summary?eventId=e');
 const summaryBefore=await(await getAdminSummary(r.env,summaryUrl,origin,new Date('2026-09-19T12:00:00Z'))).json();
 await save(r);const before=snapshot(r),writes=r.writes;
 const result=await(await listAdminPreliminaryReservations(r.env,new URL('https://api.e36united.cz/api/admin/preliminary-reservations?eventId=e'),origin)).json();
 assert.equal(result.total,1);assert.equal(result.items.length,1);assert.equal(result.pageSize,20);assert.equal(result.items[0].preferences.note,preference.note);assert.equal(r.writes,writes);assert.equal(snapshot(r),before);
 const other=await(await listAdminPreliminaryReservations(r.env,new URL('https://api.e36united.cz/api/admin/preliminary-reservations?eventId=old'),origin)).json();assert.equal(other.total,0);
 const summaryAfter=await(await getAdminSummary(r.env,summaryUrl,origin,new Date('2026-09-19T12:00:00Z'))).json();assert.deepEqual(summaryAfter.overview,summaryBefore.overview);r.db.close();
});
test('preliminary HTTP routes enforce Firebase, active member and Admin authorization',async()=>{
 const r=setup(),keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);Object.assign(jwk,{kid:'preliminary-test',alg:'RS256',use:'sig'});const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({keys:[jwk]}),{headers:{'Cache-Control':'max-age=3600'}});
 async function token(uid){const now=Math.floor(Date.now()/1000),encode=o=>Buffer.from(JSON.stringify(o)).toString('base64url'),signed=encode({alg:'RS256',kid:jwk.kid})+'.'+encode({aud:'e36-united',iss:'https://securetoken.google.com/e36-united',sub:uid,iat:now,auth_time:now,exp:now+3600,email:'fixture@example.invalid'});const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(signed));return signed+'.'+Buffer.from(sig).toString('base64url');}
 try{
  const memberToken=await token('m');assert.equal((await worker.fetch(req(preference),r.env,{})).status,401);
  assert.equal((await worker.fetch(req(preference,'PUT','/api/preliminary-reservations/current',memberToken),r.env,{})).status,200);
  assert.equal((await worker.fetch(req(null,'GET','/api/admin/preliminary-reservations',memberToken),r.env,{})).status,403);
  assert.equal((await worker.fetch(req({enabled:false,revision:1},'PUT','/api/admin/events/e/preliminary-settings',memberToken),r.env,{})).status,403);
  r.db.exec("UPDATE members SET status='suspended' WHERE id='m'");
  for(const method of ['GET','PUT','DELETE'])assert.equal((await worker.fetch(req(preference,method,'/api/preliminary-reservations/current',memberToken),r.env,{})).status,403);
 }finally{globalThis.fetch=original;r.db.close();}
});
