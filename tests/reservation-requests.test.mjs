import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {memberRuntime} from './helpers/admin-member-runtime.mjs';
import {resourceRevision,runAdminCommand} from '../worker/admin/commands.js';
import {acknowledgeReservationRequest,reviewReservationRequest,submitReservationRequest,updateReservationCar} from '../worker/domains/reservations/requests.js';
import {getAdminReservations,getCurrentReservation} from '../worker/domains/reservations/index.js';
import {getAdminSummary} from '../worker/admin/summary.js';
import {patchAdminReservation} from '../worker/domains.js';

const origin='https://e36united.cz',auth={uid:'m'};
const request=(path,method,body,headers={})=>new Request(`https://api.e36united.cz${path}`,{method,headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
function prepare(){
  const r=memberRuntime();
  r.db.exec(`UPDATE events SET registration_status='open',full_weekend_nights=2,saturday_only_nights=1 WHERE id='e';
    INSERT INTO event_accommodation_options(id,event_id,name,kind,inventory_mode,units_total,capacity_per_unit,unit_price_czk,person_price_czk,bedding_fee_per_person_czk,city_tax_per_person_per_night_czk,active)
    VALUES('cab','e','Chatka A','cabin','limited',2,4,500,0,50,25,1);
    INSERT INTO event_accommodation_options(id,event_id,name,kind,inventory_mode,units_total,capacity_per_unit,unit_price_czk,person_price_czk,bedding_fee_per_person_czk,city_tax_per_person_per_night_czk,active)
    VALUES('cab-premium','e','Chatka Premium','cabin','limited',2,3,700,0,50,25,1);
    INSERT INTO reservation_accommodation(reservation_id,option_id,option_name,kind,people_count,unit_count,unit_price_czk,person_price_czk,bedding_fee_per_person_czk,city_tax_per_person_per_night_czk,nights,base_total_czk,person_total_czk,bedding_total_czk,city_tax_total_czk,total_czk)
    VALUES('r','cab','Chatka A','cabin',2,1,500,0,50,25,2,1000,0,100,100,1200);
    UPDATE reservations SET arrival='Pátek',attendance_type='full_weekend',accommodation='Chatka',accommodation_units=2,show_shine='Ne',note='Původní',amount_due_czk=1200,amount_paid_czk=200,payment_status='underpaid' WHERE id='r';`);
  return r;
}
const change={reservationId:'r',type:'change',memberNote:'Prosím upravit.',arrival:'Sobota',crew:3,accommodation:'Chatka',accommodationOptionId:'cab',accommodationUnits:3,showShine:'Ano',note:'Nový příjezd'};
async function submit(r,body=change){return submitReservationRequest(request('/api/reservations/current/requests','POST',body),r.env,auth,'r',origin)}
async function decide(r,id,decision,comment='Rozhodnutí United'){
  const base=await resourceRevision(r.env,'reservation','r'),req=request(`/api/admin/reservations/r/requests/${id}`,'PATCH',{decision,adminComment:comment},{'Idempotency-Key':crypto.randomUUID(),'If-Match':String(base)});
  return runAdminCommand(req,r.env,{uid:'a'},'reservation-request','r',origin,env=>reviewReservationRequest(req,env,{uid:'a'},'r',id,origin));
}

test('approved reservation change is proposed once and only mutates authoritative data after Admin approval',async()=>{
  const r=prepare(),before=r.db.prepare("SELECT * FROM reservations WHERE id='r'").get();
  let response=await submit(r);assert.equal(response.status,201);
  const created=await response.json();assert.equal(created.request.status,'pending');
  assert.deepEqual({...r.db.prepare("SELECT arrival,crew,note,amount_due_czk,amount_paid_czk,status FROM reservations WHERE id='r'").get()},{arrival:'Pátek',crew:2,note:'Původní',amount_due_czk:1200,amount_paid_czk:200,status:'approved'});
  response=await submit(r);assert.equal(response.status,200);assert.equal((await response.json()).unchanged,true);
  assert.equal(r.db.prepare("SELECT COUNT(*) n FROM reservation_requests WHERE reservation_id='r'").get().n,1);
  response=await decide(r,created.request.id,'approved');assert.equal(response.status,200);
  const current=r.db.prepare("SELECT arrival,crew,note,amount_due_czk,amount_paid_czk,payment_status,status,payment_vs FROM reservations WHERE id='r'").get();
  assert.deepEqual({...current,payment_vs:before.payment_vs},{arrival:'Sobota',crew:3,note:'Nový příjezd',amount_due_czk:725,amount_paid_czk:200,payment_status:'underpaid',status:'approved',payment_vs:before.payment_vs});
  const allocation=r.db.prepare("SELECT people_count,unit_count,nights,total_czk FROM reservation_accommodation WHERE reservation_id='r'").get();
  assert.deepEqual({...allocation},{people_count:3,unit_count:1,nights:1,total_czk:725});r.db.close();
});

test('member change payload stays on the request allowlist and a cabin type change remains pending',async()=>{
  const r=prepare(),before={...r.db.prepare("SELECT arrival,crew,accommodation,note,amount_due_czk,status FROM reservations WHERE id='r'").get()};
  const forbidden=await submit(r,{...change,attendanceType:'saturday_only'});assert.equal(forbidden.status,400);assert.equal((await forbidden.json()).error,'invalid_fields');
  const response=await submit(r,{...change,accommodationOptionId:'cab-premium'});assert.equal(response.status,201);
  const payload=await response.json(),stored=r.db.prepare('SELECT original_json,proposed_json,status FROM reservation_requests WHERE id=?').get(payload.request.id);
  const original=JSON.parse(stored.original_json),proposed=JSON.parse(stored.proposed_json);
  assert.equal(stored.status,'pending');assert.equal(original.accommodationOptionId,'cab');assert.equal(original.accommodationSnapshot.optionName,'Chatka A');
  assert.equal(proposed.accommodationOptionId,'cab-premium');assert.equal(proposed.accommodationSnapshot.optionName,'Chatka Premium');assert.equal(proposed.accommodationSnapshot.unitCount,1);
  assert.deepEqual({...r.db.prepare("SELECT arrival,crew,accommodation,note,amount_due_czk,status FROM reservations WHERE id='r'").get()},before);r.db.close();
});

test('rejected change keeps the approved reservation and exposes the member-facing comment',async()=>{
  const r=prepare(),before=r.db.prepare("SELECT * FROM reservations WHERE id='r'").get(),created=await (await submit(r)).json();
  const response=await decide(r,created.request.id,'rejected','Kapacita není dostupná.');assert.equal(response.status,200);
  assert.deepEqual({...r.db.prepare("SELECT arrival,crew,note,amount_due_czk,amount_paid_czk,status FROM reservations WHERE id='r'").get()},{arrival:before.arrival,crew:before.crew,note:before.note,amount_due_czk:before.amount_due_czk,amount_paid_czk:before.amount_paid_czk,status:'approved'});
  const payload=await (await getCurrentReservation(r.env,auth,origin)).json();assert.equal(payload.reservation.request.status,'rejected');assert.equal(payload.reservation.request.adminComment,'Kapacita není dostupná.');r.db.close();
});

test('reservation decision keeps the internal Admin note out of the member response',async()=>{
  const r=prepare(),base=await resourceRevision(r.env,'reservation','r');
  const req=request('/api/admin/reservations/r','PATCH',{status:'rejected',reviewNote:'Interní důvod pro pořadatele.',memberComment:'Veřejná zpráva pro člena.'},{'Idempotency-Key':crypto.randomUUID(),'If-Match':String(base)});
  const response=await runAdminCommand(req,r.env,{uid:'a'},'reservation','r',origin,env=>patchAdminReservation(req,env,{uid:'a'},'r',origin));assert.equal(response.status,200);
  const member=await (await getCurrentReservation(r.env,auth,origin)).json();
  assert.equal(member.reservation.memberComment,'Veřejná zpráva pro člena.');assert.equal('reviewNote' in member.reservation,false);
  const stored=r.db.prepare("SELECT review_note FROM reservations WHERE id='r'").get();assert.equal(stored.review_note,'Interní důvod pro pořadatele.');r.db.close();
});

test('approved cancellation releases capacity without deleting allocation or recorded payment',async()=>{
  const r=prepare();r.db.exec("UPDATE reservations SET amount_paid_czk=1200,payment_status='paid',paid_at='2026-09-01' WHERE id='r'");
  const created=await (await submit(r,{reservationId:'r',type:'cancellation',memberNote:'Nemohu přijet.'})).json();
  const response=await decide(r,created.request.id,'approved','Ozveme se kvůli finančnímu vypořádání.');assert.equal(response.status,200);
  assert.deepEqual({...r.db.prepare("SELECT status,amount_due_czk,amount_paid_czk,payment_status,paid_at FROM reservations WHERE id='r'").get()},{status:'cancelled',amount_due_czk:1200,amount_paid_czk:1200,payment_status:'paid',paid_at:'2026-09-01'});
  assert.equal(r.db.prepare("SELECT COUNT(*) n FROM reservation_accommodation WHERE reservation_id='r'").get().n,1);
  assert.equal(r.db.prepare("SELECT COALESCE(SUM(ra.unit_count),0) n FROM reservation_accommodation ra JOIN reservations x ON x.id=ra.reservation_id WHERE ra.option_id='cab' AND x.status='approved'").get().n,0);r.db.close();
});

test('reservation car changes independently without changing approval, stay or money',async()=>{
  const r=prepare(),response=await updateReservationCar(request('/api/reservations/r/car','PATCH',{carId:'c2'}),r.env,auth,'r',origin);assert.equal(response.status,200);
  assert.deepEqual({...r.db.prepare("SELECT car_id,status,arrival,crew,amount_due_czk,amount_paid_czk FROM reservations WHERE id='r'").get()},{car_id:'c2',status:'approved',arrival:'Pátek',crew:2,amount_due_czk:1200,amount_paid_czk:200});
  assert.equal(r.db.prepare("SELECT action_type FROM admin_actions WHERE entity_id='r' ORDER BY created_at DESC LIMIT 1").get().action_type,'reservation_car_changed');r.db.close();
});

test('Admin workflow projection exposes pending comparison and real timeline without changing the reservation',async()=>{
  const r=prepare(),created=await (await submit(r)).json();r.env.ADMIN_READ=true;
  const url=new URL('https://api.e36united.cz/api/admin/reservations?eventId=e&id=r&projection=detail&presentation=command&include=workflow');
  const response=await getAdminReservations(r.env,url,origin);assert.equal(response.status,200);
  const item=(await response.json()).reservations[0];assert.equal(item.id,'r');assert.equal(item.status,'approved');assert.equal(item.requests[0].id,created.request.id);
  assert.equal(item.requests[0].original.arrival,'Pátek');assert.equal(item.requests[0].proposed.arrival,'Sobota');
  assert.ok(item.history.some(entry=>entry.label==='Žádost o změnu'));assert.ok(item.history.every(entry=>entry.at),'timeline does not invent undated history');r.db.close();
});

test('Admin approval totals include change and cancellation queues once per reservation',async()=>{
  const r=prepare();await submit(r);
  r.db.exec(`INSERT INTO members(id,member_code,email,name) VALUES('x','EU-X','x@example.invalid','X'),('y','EU-Y','y@example.invalid','Y');
    INSERT INTO reservations(id,member_id,event_id,status,amount_due_czk,amount_paid_czk,crew) VALUES
    ('r-new','n','e','pending',0,0,1),('r-cancel','x','e','approved',0,0,1),('r-both','y','e','pending',0,0,1);
    INSERT INTO reservation_requests(id,reservation_id,member_id,request_type,status,original_json,member_note) VALUES
    ('cancel','r-cancel','x','cancellation','pending','{}','Zrušit'),
    ('both','r-both','y','cancellation','pending','{}','Zrušit pending rezervaci');`);
  const payload=await (await getAdminSummary(r.env,new URL('https://api.e36united.cz/api/admin/summary?eventId=e'),origin)).json();
  assert.deepEqual(payload.attention.reservationApprovals,{newReservations:1,changes:1,cancellations:2,total:4});
  assert.equal(payload.attention.reservations,4,'one reservation contributes to attention at most once');
  r.env.ADMIN_READ=true;
  const queue=await (await getAdminReservations(r.env,new URL('https://api.e36united.cz/api/admin/reservations?eventId=e&scope=approvals'),origin)).json();
  assert.deepEqual(queue.reservations.map(item=>item.id).sort(),['r','r-both','r-cancel','r-new']);r.db.close();
});

test('capacity projection excludes the current reservation and a pending request does not allocate capacity',async()=>{
  const r=prepare();r.db.exec(`INSERT INTO reservations(id,member_id,event_id,status,amount_due_czk,amount_paid_czk,crew) VALUES('r-other','n','e','approved',0,0,1);
    INSERT INTO reservation_accommodation(reservation_id,option_id,option_name,kind,people_count,unit_count,unit_price_czk,person_price_czk,bedding_fee_per_person_czk,city_tax_per_person_per_night_czk,nights,base_total_czk,person_total_czk,bedding_total_czk,city_tax_total_czk,total_czk)
    VALUES('r-other','cab','Chatka A','cabin',1,1,500,0,50,25,2,1000,0,50,50,1100);`);
  await submit(r);r.env.ADMIN_READ=true;
  const detail=await (await getAdminReservations(r.env,new URL('https://api.e36united.cz/api/admin/reservations?eventId=e&id=r&projection=detail&presentation=command&include=workflow'),origin)).json();
  const capacity=detail.reservations[0].requests[0].capacity;
  assert.deepEqual({occupied:capacity.occupiedUnits,current:capacity.currentReservationUnits,proposed:capacity.proposedUnits,after:capacity.occupiedAfterApproval,deficit:capacity.deficitUnits,available:capacity.available},{occupied:2,current:1,proposed:1,after:2,deficit:0,available:true});
  assert.equal(r.db.prepare("SELECT COALESCE(SUM(unit_count),0) n FROM reservation_accommodation WHERE option_id='cab'").get().n,2,'pending proposal does not allocate a third unit');r.db.close();
});

test('sold-out change stays pending until capacity is increased and approval rechecks atomically',async()=>{
  const r=prepare();r.db.exec(`UPDATE event_accommodation_options SET units_total=1 WHERE id='cab-premium';
    INSERT INTO reservations(id,member_id,event_id,status,amount_due_czk,amount_paid_czk,crew) VALUES('r-premium','n','e','approved',0,0,1);
    INSERT INTO reservation_accommodation(reservation_id,option_id,option_name,kind,people_count,unit_count,unit_price_czk,person_price_czk,bedding_fee_per_person_czk,city_tax_per_person_per_night_czk,nights,base_total_czk,person_total_czk,bedding_total_czk,city_tax_total_czk,total_czk)
    VALUES('r-premium','cab-premium','Chatka Premium','cabin',1,1,700,0,50,25,2,1400,0,50,50,1500);`);
  const created=await (await submit(r,{...change,accommodationOptionId:'cab-premium'})).json();
  const before={...r.db.prepare("SELECT arrival,accommodation,amount_due_czk FROM reservations WHERE id='r'").get()};
  let response=await decide(r,created.request.id,'approved');assert.equal(response.status,409);
  const conflict=await response.json();assert.equal(conflict.error,'accommodation_capacity_exceeded');assert.equal(conflict.capacity.deficitUnits,1);
  assert.deepEqual({...r.db.prepare("SELECT arrival,accommodation,amount_due_czk FROM reservations WHERE id='r'").get()},before);
  assert.equal(r.db.prepare('SELECT status FROM reservation_requests WHERE id=?').get(created.request.id).status,'pending');
  assert.equal(r.db.prepare("SELECT COUNT(*) n FROM admin_actions WHERE entity_id='r' AND action_type='reservation_change_approved'").get().n,0);
  r.db.exec("UPDATE event_accommodation_options SET units_total=2 WHERE id='cab-premium'");
  response=await decide(r,created.request.id,'approved');assert.equal(response.status,200);
  assert.equal(r.db.prepare("SELECT option_id FROM reservation_accommodation WHERE reservation_id='r'").get().option_id,'cab-premium');
  assert.equal(r.db.prepare('SELECT status FROM reservation_requests WHERE id=?').get(created.request.id).status,'approved');r.db.close();
});

test('capacity changed after the detail check still blocks the atomic approval without a partial write',async()=>{
  const r=prepare(),created=await (await submit(r,{...change,accommodationOptionId:'cab-premium'})).json();
  const before={...r.db.prepare("SELECT arrival,accommodation,amount_due_czk FROM reservations WHERE id='r'").get()},batch=r.env.DB.batch.bind(r.env.DB);
  let intervened=false;r.env.DB.batch=async statements=>{if(!intervened){intervened=true;r.db.exec("UPDATE event_accommodation_options SET units_total=0 WHERE id='cab-premium'")}return batch(statements)};
  const response=await decide(r,created.request.id,'approved');assert.equal(response.status,409);assert.equal(intervened,true);
  assert.deepEqual({...r.db.prepare("SELECT arrival,accommodation,amount_due_czk FROM reservations WHERE id='r'").get()},before);
  assert.equal(r.db.prepare('SELECT status FROM reservation_requests WHERE id=?').get(created.request.id).status,'pending');
  assert.equal(r.db.prepare("SELECT option_id FROM reservation_accommodation WHERE reservation_id='r'").get().option_id,'cab');
  assert.equal(r.db.prepare("SELECT COUNT(*) n FROM admin_actions WHERE entity_id='r' AND action_type='reservation_change_approved'").get().n,0);r.db.close();
});

test('two Admin decisions cannot approve one request or apply its capacity twice',async()=>{
  const r=prepare(),created=await (await submit(r)).json(),base=await resourceRevision(r.env,'reservation','r');
  const send=adminId=>{const req=request(`/api/admin/reservations/r/requests/${created.request.id}`,'PATCH',{decision:'approved',adminComment:adminId},{'Idempotency-Key':crypto.randomUUID(),'If-Match':String(base)});return runAdminCommand(req,r.env,{uid:'a'},'reservation-request','r',origin,env=>reviewReservationRequest(req,env,{uid:'a'},'r',created.request.id,origin))};
  const responses=await Promise.all([send('První'),send('Druhý')]);assert.deepEqual(responses.map(response=>response.status).sort(),[200,409]);
  assert.equal(r.db.prepare("SELECT COUNT(*) n FROM admin_actions WHERE entity_id='r' AND action_type='reservation_change_approved'").get().n,1);
  assert.equal(r.db.prepare("SELECT COUNT(*) n FROM reservation_accommodation WHERE reservation_id='r'").get().n,1);
  assert.equal(r.db.prepare('SELECT status FROM reservation_requests WHERE id=?').get(created.request.id).status,'approved');r.db.close();
});

test('approved change remains request-specific until the member acknowledges it once',async()=>{
  const r=prepare(),created=await (await submit(r)).json();assert.equal((await decide(r,created.request.id,'approved')).status,200);
  let member=(await (await getCurrentReservation(r.env,auth,origin)).json()).reservation;
  assert.equal(member.request.id,created.request.id);assert.equal(member.request.memberAcknowledgedAt,null);
  let response=await acknowledgeReservationRequest(r.env,auth,'r',created.request.id,origin);assert.equal(response.status,200);
  const acknowledged=await response.json();assert.equal(acknowledged.unchanged,false);assert.ok(acknowledged.request.memberAcknowledgedAt);
  response=await acknowledgeReservationRequest(r.env,auth,'r',created.request.id,origin);assert.equal(response.status,200);assert.equal((await response.json()).unchanged,true);
  response=await acknowledgeReservationRequest(r.env,{uid:'n'},'r',created.request.id,origin);assert.equal(response.status,404);
  member=(await (await getCurrentReservation(r.env,auth,origin)).json()).reservation;
  assert.ok(member.request.memberAcknowledgedAt);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM reservation_requests WHERE id=?').get(created.request.id).n,1);r.db.close();
});

test('approved reservation returns first-load payment QR source without an Admin payment mutation',async()=>{
  const r=prepare();r.db.exec("UPDATE events SET payment_recipient_name='E36 United',payment_account_display='123/0100',payment_iban='CZ6508000000192000145399',payment_message_prefix='United',payment_deadline='2026-10-01' WHERE id='e'; UPDATE reservations SET payment_vs='20260001' WHERE id='r'");
  const writes=r.writes,payload=await (await getCurrentReservation(r.env,auth,origin)).json(),payment=payload.reservation.payment;
  assert.equal(r.writes,writes);assert.equal(payment.configurationReady,true);assert.match(payment.spayd,/^SPD\*1\.0\*ACC:CZ6508000000192000145399\*AM:1000\.00\*CC:CZK\*X-VS:/);r.db.close();
});

test('forward migration is canonical, additive and preserves existing reservation/payment rows',()=>{
  const schema=readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8'),migration=readFileSync(new URL('../db/migrations/2026-09-11-reservation-requests.sql',import.meta.url),'utf8').trim();
  assert.ok(schema.includes(migration));const db=new DatabaseSync(':memory:');db.exec(schema.split('-- Forward-only reservation change/cancellation requests.')[0]+'COMMIT;');
  db.exec("INSERT INTO members(id,member_code,email,name) VALUES('m','EU-1','m@example.invalid','Member'); INSERT INTO events(id,year,title,is_current) VALUES('e',2026,'United',1); INSERT INTO reservations(id,member_id,event_id,status,amount_due_czk,amount_paid_czk) VALUES('r','m','e','approved',1200,200)");
  const before=db.prepare("SELECT id,status,amount_due_czk,amount_paid_czk FROM reservations WHERE id='r'").get();db.exec(migration);
  assert.deepEqual(db.prepare("SELECT id,status,amount_due_czk,amount_paid_czk FROM reservations WHERE id='r'").get(),before);assert.equal(db.prepare('SELECT COUNT(*) n FROM reservation_requests').get().n,0);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.throws(()=>db.exec(migration),/already exists/);db.close();
});

test('acknowledgement migration is canonical, additive and leaves existing requests unacknowledged',()=>{
  const schema=readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8'),migration=readFileSync(new URL('../db/migrations/2026-09-12-reservation-request-acknowledgement.sql',import.meta.url),'utf8').trim();
  assert.ok(schema.includes(migration));const db=new DatabaseSync(':memory:');db.exec(schema.split('-- Member acknowledgement is request-specific and server-persisted.')[0]+'COMMIT;');
  db.exec("INSERT INTO members(id,member_code,email,name) VALUES('m','EU-1','m@example.invalid','Member'); INSERT INTO events(id,year,title,is_current) VALUES('e',2026,'United',1); INSERT INTO reservations(id,member_id,event_id,status,amount_due_czk,amount_paid_czk) VALUES('r','m','e','approved',1200,200); INSERT INTO reservation_requests(id,reservation_id,member_id,request_type,status,original_json,proposed_json) VALUES('q','r','m','change','approved','{}','{}')");
  db.exec(migration);const row=db.prepare("SELECT id,status,member_acknowledged_at FROM reservation_requests WHERE id='q'").get();assert.deepEqual({...row},{id:'q',status:'approved',member_acknowledged_at:null});assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.throws(()=>db.exec(migration),/duplicate column name/);db.close();
});
