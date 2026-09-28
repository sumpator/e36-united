import test from 'node:test';
import assert from 'node:assert/strict';
import { arrivalsRuntime, seedArrivals, EVENT } from './helpers/arrivals-runtime.mjs';
import { routeArrivals,arrivalList,findArrivalMembers,tokenHash } from '../worker/domains/arrivals.js';
import { claimArrival,deliverArrivalInvitations } from '../worker/domains/arrival-invitations.js';
import { getAdminOperation } from '../worker/admin/commands.js';
import {searchLiveMembers} from '../worker/domains/live.js';
import {getAdminMember} from '../worker/admin/members.js';
import {putCurrentReservation} from '../worker/domains/reservations/index.js';
const origin='https://example.invalid',auth={uid:'a'};
async function call(r,body,{part='',method='POST',key=crypto.randomUUID(),revision,actor=auth}={}){
  if(revision==null)revision=(await arrivalList(r.env,EVENT)).revision;
  const url=new URL(origin+'/api/admin/events/'+EVENT+'/arrivals'+part);
  const request=new Request(url,{method,headers:{'Content-Type':'application/json','Idempotency-Key':key,'If-Match':String(revision)},body:JSON.stringify(body)});
  const response=await routeArrivals({request,env:r.env,url,origin,auth:actor});return {status:response.status,...await response.json()};
}
const arrival=(name,extra={})=>({id:'arrival-'+name,memberId:'fixture-'+name,carId:'car-'+name,crew:2,cash:0,...extra});
test('real reservation endpoint snapshots admission and keeps it when rates change',async()=>{
 const r=arrivalsRuntime();try{await seedArrivals(r);r.db.exec('UPDATE events SET is_current=0');r.db.prepare("UPDATE events SET is_current=1,registration_status='open' WHERE id=?").run(EVENT);
  const body={carId:'car-unregistered',arrival:'Pátek',crew:2,accommodation:'Chatka',accommodationOptionId:'fixture-cabin',accommodationUnits:2,showShine:'Ne'};
  const put=async b=>putCurrentReservation(new Request(origin+'/api/reservations/current',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}),r.env,{uid:'fixture-unregistered'},origin);
  let response=await put(body);assert.equal(response.status,200,await response.clone().text());const reservation=r.db.prepare("SELECT * FROM reservations WHERE member_id='fixture-unregistered'").get();assert.equal(reservation.admission_czk,300);assert.equal(reservation.amount_due_czk,1300);
  r.db.prepare('UPDATE events SET admission_registered_czk=900 WHERE id=?').run(EVENT);response=await put({...body,reservationId:reservation.id});assert.equal(response.status,200,await response.clone().text());assert.equal(r.db.prepare('SELECT admission_czk FROM reservations WHERE id=?').get(reservation.id).admission_czk,300);
 }finally{r.db.close()}
});
test('isolated idempotent fixtures, no legacy conversion, explicit rates and bank ledger',async()=>{
 const r=arrivalsRuntime();try{await seedArrivals(r);const before=r.db.prepare('SELECT COUNT(*) n FROM event_payments').get().n;await seedArrivals(r);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM event_payments').get().n,before);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM event_arrivals').get().n,0);assert.equal(r.db.prepare('SELECT amount_paid_czk FROM reservations WHERE id=?').get('reservation-paid').amount_paid_czk,1300);assert.equal(r.db.prepare('PRAGMA foreign_key_check').all().length,0);assert.equal(r.env.SMTP2GO_API_KEY,undefined)}finally{r.db.close()}
});
test('paid, partial and overpaid; repeat or lost receipt never charges twice; QR/search same identity',async()=>{
 const r=arrivalsRuntime();try{await seedArrivals(r);
  const qr=r.db.prepare("SELECT token FROM member_qr_identities WHERE member_id='fixture-paid'").get().token;
  assert.equal((await findArrivalMembers(r.env,EVENT,'','E36U1:'+qr))[0].id,(await findArrivalMembers(r.env,EVENT,'paid@')).find(m=>m.email==='paid@arrivals.invalid').id);
  assert.equal((await call(r,arrival('paid'))).arrival.paymentStatus,'paid');
  assert.equal((await call(r,arrival('partial',{cash:300}))).status,400);
  const key=crypto.randomUUID(),revision=(await arrivalList(r.env,EVENT)).revision,b=arrival('partial',{cash:300,acceptDebt:true});
  const first=await call(r,b,{key,revision});assert.equal(first.status,200,JSON.stringify(first));assert.equal(first.arrival.balance,500);
  const replay=await call(r,b,{key,revision});assert.equal(replay.replayed,true);
  assert.equal((await (await getAdminOperation(r.env,auth,key,origin)).json()).operation.state,'confirmed');
  const repeated=await call(r,arrival('partial',{id:'another-request',cash:999,acceptDebt:true}));assert.equal(repeated.alreadyArrived,true);assert.equal(repeated.arrival.paid,800);
  assert.equal((await call(r,arrival('overpaid'))).arrival.balance,-300);
  const list=await arrivalList(r.env,EVENT);assert.equal(list.counts.arrived,3);assert.equal(list.counts.cash,300);assert.equal(list.counts.people,6);
 }finally{r.db.close()}
});
test('FREE is admission only, member without reservation, anonymous guest, actual other car',async()=>{
 const r=arrivalsRuntime();try{await seedArrivals(r);
  const free=await call(r,arrival('free',{free:true,freeReason:'Test host pořadatele',cash:400,acceptDebt:true}));assert.equal(free.status,200,JSON.stringify(free));assert.equal(free.arrival.due,1000);assert.equal(free.arrival.balance,600);
  assert.equal((await call(r,arrival('unregistered',{cash:500}))).arrival.registered,0);
  const guest=await call(r,{id:'anonymous-guest',model:'BMW E36',body:'Coupé',crew:1,cash:500,matchesReviewed:true});assert.equal(guest.status,200,JSON.stringify(guest));assert.equal(guest.arrival.member_id,null);assert.match(guest.arrival.label,/Návštěvník/);
  const other=await call(r,arrival('othercar',{carId:'car-othercar-2'}));assert.equal(other.arrival.car_key,'car-othercar-2');assert.equal(r.db.prepare("SELECT car_id FROM reservations WHERE id='reservation-othercar'").get().car_id,'car-othercar');
  assert.equal((await call(r,arrival('othercar',{id:'reentry-othercar',carId:'car-othercar-2',additionalCar:true,cash:500}))).alreadyArrived,true);
  assert.equal((await arrivalList(r.env,EVENT)).counts.arrived,4);assert.equal(r.db.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{r.db.close()}
});
test('missing rate fails closed; roles, plate uniqueness, stale second device and atomic rollback',async()=>{
 const r=arrivalsRuntime();try{await seedArrivals(r);r.db.prepare('UPDATE events SET admission_onsite_czk=NULL WHERE id=?').run(EVENT);
  assert.equal((await call(r,arrival('unregistered'))).status,409);
  assert.equal((await call(r,arrival('unregistered',{free:true,freeReason:'Test'}),{actor:{uid:'m',role:'admin'}})).status,403);
  const revision=(await arrivalList(r.env,EVENT)).revision;
  assert.equal((await call(r,arrival('unregistered',{free:true,freeReason:'Test',plate:'TEST 001'}),{revision})).status,200);
  assert.equal((await call(r,arrival('paid'),{revision})).status,409);
  const same=await call(r,{id:'other-guest-plate',model:'BMW',body:'Sedan',crew:1,free:true,freeReason:'Test',plate:'TEST001',matchesReviewed:true});assert.equal(same.alreadyArrived,true);
  const count=r.db.prepare('SELECT COUNT(*) n FROM event_arrivals').get().n;
  r.db.exec("CREATE TRIGGER fixture_payment_fail BEFORE INSERT ON event_payments WHEN NEW.method='cash' BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");
  const failed=await call(r,arrival('partial',{cash:800}));assert.equal(failed.status,503);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM event_arrivals').get().n,count);
 }finally{r.db.close()}
});
test('guest invitation once, mock delivery only, verified ownership and one-use linkage',async()=>{
 const r=arrivalsRuntime();try{await seedArrivals(r);
  const b={id:'guest-invitation',model:'BMW E36',body:'Sedan',crew:2,cash:500,email:'other@example.invalid',matchesReviewed:true};
  const created=await call(r,b);assert.equal(created.status,200,JSON.stringify(created));const out=r.db.prepare("SELECT * FROM email_outbox WHERE template_key='arrival_invitation'").get(),token=JSON.parse(out.payload_json).token;
  assert.equal(r.db.prepare('SELECT token_hash FROM arrival_invitations').get().token_hash,await tokenHash(token));
  const claim=(who)=>claimArrival(new Request(origin,{method:'POST',body:JSON.stringify({token})}),r.env,who,origin);
  assert.equal((await claim({uid:'n',email:'other@example.invalid',emailVerified:false})).status,403);
  assert.equal((await claim({uid:'m',email:'member@example.invalid',emailVerified:true})).status,409);
  let sends=0;await deliverArrivalInvitations(r.env,b.id,{transport:{sendBatch:async()=>{sends++;return {emailIds:['mock-message']}}}});await deliverArrivalInvitations(r.env,b.id,{transport:{sendBatch:async()=>{sends++}}});assert.equal(sends,1);
  assert.equal((await claim({uid:'n',email:'other@example.invalid',emailVerified:true})).status,200);
  assert.equal((await claim({uid:'n',email:'other@example.invalid',emailVerified:true})).status,409);
  assert.equal(r.db.prepare('SELECT member_id FROM event_arrivals WHERE id=?').get(b.id).member_id,'n');assert.equal(r.db.prepare('SELECT COUNT(*) n FROM event_payments WHERE arrival_id=?').get(b.id).n,1);
  assert.equal(r.db.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{r.db.close()}
});
test('invitation retry accepts only definite failure, never uncertain delivery',async()=>{
 const r=arrivalsRuntime();try{await seedArrivals(r);const b={id:'arrival-mail-retry',model:'Test car',body:'Sedan',crew:1,cash:500,matchesReviewed:true,email:'retry@arrivals.invalid'};
  assert.equal((await call(r,b)).status,200);await deliverArrivalInvitations(r.env,b.id,{transport:{sendBatch:async()=>{throw {definiteRejection:true,code:'mock_rejected'}}}});
  assert.equal((await call(r,{arrivalId:b.id},{part:'/invitation-retry'})).status,200);
  await deliverArrivalInvitations(r.env,b.id,{transport:{sendBatch:async()=>{throw {code:'mock_timeout'}}}});
  assert.equal((await call(r,{arrivalId:b.id},{part:'/invitation-retry'})).status,409);
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM arrival_invitations').get().n,1);
 }finally{r.db.close()}
});
test('double click, audited payment reversal, actual-car correction and shared reads',async()=>{
 const r=arrivalsRuntime();try{await seedArrivals(r);
  const key=crypto.randomUUID(),revision=(await arrivalList(r.env,EVENT)).revision,b=arrival('partial',{cash:800});
  const results=await Promise.all([call(r,b,{key,revision}),call(r,b,{key,revision})]);assert.ok(results.every(x=>x.status===200));assert.equal(r.db.prepare("SELECT COUNT(*) n FROM event_payments WHERE method='cash'").get().n,1);
  const original=results.find(x=>x.arrival)?.arrival,paid=original.payments.find(p=>p.method==='cash');
  const corrected=await call(r,{version:original.version,reason:'LOCAL-ARRIVALS-V1 oprava hotovosti',payment:{reversesId:paid.id}},{method:'PATCH',part:'/'+b.id});assert.equal(corrected.status,200,JSON.stringify(corrected));assert.equal(corrected.arrival.paid,500);
  assert.equal((await call(r,{version:corrected.arrival.version,reason:'duplicitní storno',payment:{reversesId:paid.id}},{method:'PATCH',part:'/'+b.id})).status,400);
  const car=await call(r,{version:corrected.arrival.version,reason:'Oprava zvoleného auta',car:{model:'E36 test Touring',body:'Touring',plate:'TEST 22'}},{method:'PATCH',part:'/'+b.id});assert.equal(car.status,200,JSON.stringify(car));
  const members=await (await searchLiveMembers(r.env,EVENT,new URL(origin),origin)).json();assert.equal(members.members.find(m=>m.memberId==='fixture-partial').registeredCarId,car.arrival.car_key);
  const detail=await (await getAdminMember(r.env,new URL(origin+'?eventId='+EVENT),'fixture-partial',null,origin)).json();assert.equal(detail.arrivals[0].paid,500);
  r.db.prepare("INSERT INTO live_entries(id,event_id,discipline,member_id,competition_car_id,category) VALUES('entry-locked',?,'show_shine','fixture-partial',?,'Touring')").run(EVENT,car.arrival.car_key);
  assert.equal((await call(r,{version:car.arrival.version,reason:'Zakázané přepsání soutěže',car:{model:'other',body:'Sedan'}},{method:'PATCH',part:'/'+b.id})).status,409);
  assert.equal(r.db.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{r.db.close()}
});
