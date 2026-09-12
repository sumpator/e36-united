import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { runAdminCommand, getAdminOperation, resourceRevision } from '../worker/admin/commands.js';
import { getAdminSummary } from '../worker/admin/summary.js';
import * as domains from '../worker/domains.js';

const origin='https://e36united.cz';
const migration=readFileSync(new URL('../db/migrations/2026-09-08-admin-safe-operations.sql',import.meta.url),'utf8');
const reservationRequestsMigration=readFileSync(new URL('../db/migrations/2026-09-11-reservation-requests.sql',import.meta.url),'utf8');
const acknowledgementMigration=readFileSync(new URL('../db/migrations/2026-09-12-reservation-request-acknowledgement.sql',import.meta.url),'utf8');
function runtime(){
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8').split('-- Stage 1 only:')[0]+'\nCOMMIT;');
  db.exec(`INSERT INTO members(id,member_code,email,name,role) VALUES
    ('a','A','a@example.invalid','Admin A','admin'),('b','B','b@example.invalid','Admin B','admin'),('m','M','m@example.invalid','Member','member');
    INSERT INTO events(id,year,title,is_current) VALUES('e',2027,'Synthetic',1),('old',2026,'Previous',0);
    INSERT INTO reservations(id,member_id,event_id,status,amount_due_czk,payment_vs,crew,attendance_type,show_shine)
    VALUES('r','m','e','approved',1000,'2027000001',2,'full_weekend','Ano');`);
  // Exact forward migration is exercised against populated predecessor schema, not an empty DB.
  if(!db.prepare("SELECT 1 FROM schema_migrations WHERE id='2026-09-08-admin-safe-operations'").get())db.exec(migration);
  if(!db.prepare("SELECT 1 FROM schema_migrations WHERE id='2026-09-11-reservation-requests'").get())db.exec(reservationRequestsMigration);
  if(!db.prepare("SELECT 1 FROM schema_migrations WHERE id='2026-09-12-reservation-request-acknowledgement'").get())db.exec(acknowledgementMigration);
  const prepare=(sql,values=[])=>({bind:(...bindings)=>prepare(sql,bindings),
    first:async()=>db.prepare(sql).get(...values)||null,all:async()=>({results:db.prepare(sql).all(...values)}),
    run:async()=>/^\s*(SELECT|WITH)\b/i.test(sql)?{results:db.prepare(sql).all(...values),meta:{changes:0}}:({meta:{changes:Number(db.prepare(sql).run(...values).changes)}})});
  let tail=Promise.resolve();
  const env={DB:{prepare,batch(statements){const run=tail.then(async()=>{db.exec('BEGIN IMMEDIATE');try{
    const results=[];for(const statement of statements)results.push(await statement.run());db.exec('COMMIT');return results;
  }catch(error){db.exec('ROLLBACK');throw error}});tail=run.catch(()=>{});return run;}}};
  return{db,env};
}
const request=(amount,key,revision)=>new Request(`${origin}/api/admin/reservations/r/payment`,{method:'PATCH',
  headers:{'Content-Type':'application/json','Idempotency-Key':key,'If-Match':String(revision)},body:JSON.stringify({amountPaidCzk:amount})});
function pay(env,amount,key,revision,actor='a'){
  const req=request(amount,key,revision),auth={uid:actor};
  return runAdminCommand(req,env,auth,'payment','r',origin,guarded=>domains.patchAdminReservationPayment(req,guarded,auth,'r',origin));
}

test('Admin migration preserves populated business records, creates no receipts and advances versions for every writer',async()=>{
  const{db,env}=runtime();
  assert.equal(db.prepare("SELECT amount_due_czk FROM reservations WHERE id='r'").get().amount_due_czk,1000);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM admin_operation_receipts').get().n,0);
  const before=await resourceRevision(env,'reservation','r');
  db.exec("UPDATE reservations SET note='Member edit' WHERE id='r'; UPDATE reservations SET note='Second same-second edit' WHERE id='r'");
  assert.equal(await resourceRevision(env,'reservation','r'),before+2);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.throws(()=>db.exec(migration),/already exists/);db.close();
});

test('two admins with the same payment base have one committed outcome and one conflict; no lost update',async()=>{
  const{db,env}=runtime(),base=await resourceRevision(env,'reservation','r');
  const responses=await Promise.all([pay(env,200,'one',base),pay(env,400,'two',base,'b')]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
  assert.equal(db.prepare("SELECT amount_paid_czk FROM reservations WHERE id='r'").get().amount_paid_czk,200);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM admin_actions').get().n,1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM admin_operation_receipts').get().n,1);db.close();
});

test('committed save with lost response reconciles; same operation replays without audit or business duplicates',async()=>{
  const{db,env}=runtime(),base=await resourceRevision(env,'reservation','r');
  await pay(env,200,'lost-response',base); // deliberately discard response
  const recovered=await(await getAdminOperation(env,{uid:'a'},'lost-response',origin)).json();
  assert.equal(recovered.operation.state,'confirmed');
  const replay=await(await pay(env,200,'lost-response',base)).json();
  assert.equal(replay.replayed,true);assert.deepEqual(replay.operation,recovered.operation);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM admin_actions').get().n,1);
  assert.equal((await pay(env,300,'lost-response',base)).status,409);
  assert.equal((await pay(env,200,'lost-response',base,'b')).status,409);
  assert.equal((await(await getAdminOperation(env,{uid:'b'},'lost-response',origin)).json()).operation.state,'outcome_unknown');db.close();
});

test('undelivered operation has unknown outcome, not false rejection/success; explicit same-key retry may commit',async()=>{
  const{db,env}=runtime(),base=await resourceRevision(env,'reservation','r');
  assert.equal((await(await getAdminOperation(env,{uid:'a'},'undelivered',origin)).json()).operation.state,'outcome_unknown');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM admin_actions').get().n,0);
  assert.equal((await pay(env,250,'undelivered',base)).status,200);db.close();
});

test('zero-row primary write rolls back CAS, receipt, audit and all dependent Points statements',async()=>{
  const{db,env}=runtime(),base=await resourceRevision(env,'reservation','r');
  const req=request(200,'zero-row',base);
  const response=await runAdminCommand(req,env,{uid:'a'},'payment','r',origin,async guarded=>{
    await guarded.DB.batch([
      guarded.DB.prepare("UPDATE reservations SET amount_paid_czk=200 WHERE id='absent'"),
      guarded.DB.prepare("INSERT INTO admin_actions(id,admin_member_id,action_type,entity_type,entity_id) VALUES('bad','a','bad','reservation','r')"),
      guarded.DB.prepare("INSERT INTO united_points_ledger(id,member_id,source_type,source_key,delta,reason) VALUES('bad','m','test','bad',100,'bad')"),
    ]);return new Response('{}');
  });
  assert.equal(response.status,409);assert.equal(await resourceRevision(env,'reservation','r'),base);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM admin_actions').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM admin_operation_receipts').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM united_points_ledger').get().n,0);db.close();
});

test('old clients without expected state fail closed before any write',async()=>{
  const{db,env}=runtime();let executed=false;
  const response=await runAdminCommand(new Request(`${origin}/test`,{method:'PATCH'}),env,{uid:'a'},'payment','r',origin,()=>{executed=true});
  assert.equal(response.status,428);assert.equal(executed,false);db.close();
});

test('canonical summary independently reconciles money, occupancy, claim overlap and global versus event scope',async()=>{
  const{db,env}=runtime();
  db.exec(`UPDATE reservations SET amount_paid_czk=200 WHERE id='r';
    INSERT INTO reservations(id,member_id,event_id,status,crew,amount_due_czk,amount_paid_czk,show_shine,attendance_type)
      VALUES('pending','a','e','pending',4,1000,1300,'Možná','saturday_only'),('cancelled','b','e','cancelled',5,0,400,'Ne','day_visit');
    INSERT INTO event_accommodation_options(id,event_id,name,kind,inventory_mode,units_total,capacity_per_unit)
      VALUES('cabin','e','Cabin','cabin','limited',5,4),('tent','e','Tent','tent','unlimited',0,4);
    INSERT INTO reservation_accommodation(reservation_id,option_id,option_name,kind,people_count,unit_count,unit_price_czk,person_price_czk,bedding_fee_per_person_czk,city_tax_per_person_per_night_czk,nights,base_total_czk,person_total_czk,bedding_total_czk,city_tax_total_czk,total_czk)
      VALUES('r','cabin','Cabin','cabin',2,1,0,0,0,0,2,0,0,0,0,0),('pending','cabin','Cabin','cabin',4,2,0,0,0,0,2,0,0,0,0,0);
    INSERT INTO united_history_claims(id,member_id,event_id,attendance_status,sns_status) VALUES('both','m','old','pending','pending');`);
  const before=db.prepare('SELECT total_changes() n').get().n;
  const payload=await(await getAdminSummary(env,new URL(`${origin}/api/admin/summary?eventId=e`),origin)).json();
  assert.equal(db.prepare('SELECT total_changes() n').get().n,before,'summary must be read-only');
  assert.equal(payload.overview.reservations,2);assert.equal(payload.overview.people,6);
  assert.equal(payload.overview.payments.amountPaidCzk,1900);
  assert.equal(payload.overview.payments.activePaidCzk,1500);assert.equal(payload.overview.payments.inactivePaidCzk,400);
  assert.equal(payload.overview.payments.amountRemainingCzk,800);assert.equal(payload.overview.payments.overpaymentCzk,700);
  assert.equal(payload.overview.payments.appliedToActiveCzk,1200);
  assert.equal(payload.overview.accommodation.units,1);assert.equal(payload.overview.accommodation.pendingUnits,2);
  assert.equal(payload.overview.accommodation.confirmedPeople,2);
  assert.equal(payload.overview.accommodation.options.find(o=>o.id==='tent').unitsTotal,null);
  assert.equal(payload.attention.history,1);assert.equal(payload.overview.history.attendancePending,1);assert.equal(payload.overview.history.snsPending,1);
  assert.equal(payload.context.communityScope,'global');assert.equal(payload.freshness.consistency,'single-primary-batch');db.close();
});

test('bounded reservation reads return independent filtered totals and do not allocate legacy VS',async()=>{
 const{db,env}=runtime();db.exec("UPDATE reservations SET payment_vs=NULL WHERE id='r'; INSERT INTO reservations(id,member_id,event_id,status,amount_due_czk,amount_paid_czk) VALUES('second','a','e','pending',300,0)");
 const before=db.prepare('SELECT total_changes() n').get().n;
 const response=await domains.getAdminReservations({...env,ADMIN_READ:true},new URL(origin+'/api/admin/reservations?eventId=e&pageSize=1'),origin);
 const data=await response.json();assert.equal(data.reservations.length,1);assert.equal(data.pagination.total,2);assert.equal(data.pagination.totalPages,2);assert.equal(data.counts.pending,1);
 const filtered=await(await domains.getAdminReservations({...env,ADMIN_READ:true},new URL(origin+'/api/admin/reservations?eventId=e&filter=pending'),origin)).json();
 assert.equal(filtered.pagination.total,1);assert.equal(filtered.reservations[0].id,'second');assert.equal(filtered.reservations[0].memberId,'a');
 assert.equal(db.prepare('SELECT total_changes() n').get().n,before);assert.equal(db.prepare("SELECT payment_vs FROM reservations WHERE id='r'").get().payment_vs,null);db.close();
});

test('overdue ages at UTC end of date without any row update; cancelled money remains visible',async()=>{
 const{db,env}=runtime();db.exec("UPDATE events SET payment_deadline='2026-09-08' WHERE id='e'");
 const get=async time=>(await(await getAdminSummary(env,new URL(origin+'/api/admin/summary?eventId=e'),origin,new Date(time))).json()).overview.payments;
 assert.equal((await get('2026-09-08T23:59:58Z')).overdue,0);
 assert.equal((await get('2026-09-09T00:00:00Z')).overdue,1);
 db.exec("UPDATE reservations SET status='cancelled',amount_paid_czk=1200 WHERE id='r'");
 const value=await get('2026-09-09T00:00:00Z');assert.equal(value.overdue,0);assert.equal(value.amountDueCzk,0);assert.equal(value.amountPaidCzk,1200);assert.equal(value.inactivePaidCzk,1200);assert.equal(value.overpaymentCzk,200);db.close();
});

test('a real History approval commits Points/audit/receipt once and cannot replay or overwrite newer review',async()=>{
 const{db,env}=runtime();db.exec("INSERT INTO united_history_claims(id,member_id,event_id,attendance_status,sns_status) VALUES('h','m','old','pending','not_claimed')");
 const base=await resourceRevision(env,'history','h');
 const review=async(key,revision,actor='a')=>{
  const req=new Request(origin+'/review',{method:'PATCH',headers:{'If-Match':String(revision),'Idempotency-Key':key},body:JSON.stringify({status:'approved',reviewNote:''})});
  return runAdminCommand(req,env,{uid:actor},'history-attendance','h',origin,e=>domains.patchAdminHistoryClaim(req,e,{uid:actor},'h','attendance',origin));
 };
 assert.equal((await review('history-op',base)).status,200);
 const points=db.prepare('SELECT SUM(delta) total,COUNT(*) n FROM united_points_ledger').get();assert.ok(points.total>0);
 assert.equal((await review('history-op',base)).status,200);
 assert.equal((await review('history-other',base,'b')).status,409);
 assert.deepEqual(db.prepare('SELECT SUM(delta) total,COUNT(*) n FROM united_points_ledger').get(),points);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM admin_actions').get().n,1);db.close();
});

test('Member/allocation writes invalidate a previously loaded Admin base in the same second',async()=>{
 const{db,env}=runtime(),base=await resourceRevision(env,'reservation','r');
 db.exec("UPDATE reservations SET note='Member changed current request' WHERE id='r'");
 assert.equal((await pay(env,700,'stale-admin',base)).status,409);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM admin_operation_receipts').get().n,0);db.close();
});

test('accommodation create receipt identifies the new option and replay cannot duplicate it',async()=>{
 const{db,env}=runtime(),base=await resourceRevision(env,'accommodation-catalog','e');
 const req=new Request(origin+'/api/admin/accommodation',{method:'POST',headers:{'If-Match':String(base),'Idempotency-Key':'create-option'},body:JSON.stringify({eventId:'e',name:'Synthetic cabin',kind:'cabin',inventoryMode:'limited',unitsTotal:2,capacityPerUnit:4,unitPriceCzk:100,personPriceCzk:0,beddingFeePerPersonCzk:0,cityTaxPerPersonPerNightCzk:0,active:true})});
 const run=()=>runAdminCommand(req.clone(),env,{uid:'a'},'accommodation-create','e',origin,e=>domains.createAdminAccommodation(req.clone(),e,{uid:'a'},origin));
 const first=await run(),payload=await first.json();assert.equal(first.status,201);assert.equal(payload.operation.entityId,payload.option.id);assert.equal(payload.operation.eventId,'e');
 assert.equal((await run()).status,201);assert.equal(db.prepare('SELECT COUNT(*) n FROM event_accommodation_options').get().n,1);db.close();
});
