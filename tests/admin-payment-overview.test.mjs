import test from 'node:test';import assert from 'node:assert/strict';
import {memberRuntime} from './helpers/admin-member-runtime.mjs';
import {getAdminDashboard,ADMIN_PAYMENT_OVERVIEW_SQL} from '../worker/admin/dashboard.js';
import {getAdminReservations} from '../worker/domains/reservations/index.js';
import {patchAdminReservationPayment} from '../worker/domains.js';
import {paymentOverviewMarkup} from '../admin/command-cards.js';
import {mobileShortcuts,validMobileShortcuts,MOBILE_ADMIN_TARGETS,factoryPreferences,validatePreferences} from '../admin/dashboard-model.js';
const origin='https://e36united.cz',read=async(r,event='e')=>(await getAdminDashboard(r.env,new URL('/api/admin/dashboard?presentation=command&eventId='+event,origin),origin)).json();
function fixture(){const r=memberRuntime();r.db.exec(`UPDATE reservations SET admission_czk=300,amount_paid_czk=0 WHERE id='r';
INSERT INTO event_accommodation_options(id,event_id,name,kind,inventory_mode,units_total,capacity_per_unit) VALUES('cab','e','Chatka','cabin','limited',8,4);
INSERT INTO reservation_accommodation(reservation_id,option_id,option_name,kind,people_count,unit_count,unit_price_czk,person_price_czk,bedding_fee_per_person_czk,city_tax_per_person_per_night_czk,nights,base_total_czk,person_total_czk,bedding_total_czk,city_tax_total_czk,total_czk) VALUES('r','cab','Chatka','cabin',2,1,700,0,0,0,1,700,0,0,0,700);
INSERT INTO reservations(id,member_id,event_id,status,amount_due_czk,amount_paid_czk) VALUES('partial','n','e','pending',800,1000),('cancelled','a','e','cancelled',0,500),('other-year','m','old','approved',9999,9999);
INSERT INTO event_payments(id,event_id,reservation_id,method,amount_czk,actor_id,reason,created_at) VALUES('p1','e','r','bank',200,'a','Isolated receipt','2026-11-01 10:00:00');`);return r;}
test('payment overview uses selected active prescriptions and joint amounts, with missing breakdown and overpayment kept separate',async()=>{
 const r=fixture();try{const before=r.db.prepare('SELECT total_changes() n').get().n,p=(await read(r)).payments;
 assert.equal(p.activeCount,2);assert.equal(p.dueCzk,1800);assert.equal(p.paidCzk,1200);assert.equal(p.remainingCzk,800);assert.equal(p.overpaymentCzk,200);
 assert.equal(p.breakdownCount,1);assert.equal(p.admissionCzk,300);assert.equal(p.lodgingCzk,700);assert.equal(p.recent.length,1);assert.equal(p.recent[0].amountCzk,200);assert.equal(p.recent[0].amountPaidCzk,200);
 const html=paymentOverviewMarkup(p,()=>'<button>Filtr</button>');assert.match(html,/Úhrada patří celé registraci/);assert.match(html,/pouze celková cena/);assert.doesNotMatch(html,/200 Kč za vstupné/);
 for(const [scope,expected] of [['underpaidActive',['r']],['unpaidActive',[]],['paidActive',[]]]){const u=new URL('/api/admin/reservations?eventId=e&view=payments&projection=list&scope='+scope,origin),result=await(await getAdminReservations({...r.env,ADMIN_READ:true},u,origin)).json();assert.deepEqual(result.reservations.map(x=>x.id),expected);}
 assert.equal(r.db.prepare('SELECT total_changes() n').get().n,before);assert.equal(r.writes,0);assert.ok(r.db.prepare('EXPLAIN QUERY PLAN '+ADMIN_PAYMENT_OVERVIEW_SQL).all('e').length);
 }finally{r.db.close()}
});
test('last five movements retain dated refunds and genuine legacy adjustments, never create a payment date from a snapshot',async()=>{
 const r=fixture();try{
 r.db.exec(`INSERT INTO event_payments(id,event_id,reservation_id,method,amount_czk,actor_id,reason,reverses_id,created_at) VALUES('refund','e','r','bank',-200,'a','Isolated reversal','p1','2026-11-02 10:00:00');
 INSERT INTO event_payments(id,event_id,reservation_id,method,amount_czk,actor_id,reason,created_at) VALUES('p2','e','r','bank',100,'a','Partial receipt','2026-11-03 10:00:00'),('p3','e','r','cash',200,'a','Partial receipt','2026-11-03 11:00:00'),('p4','e','r','bank',300,'a','Partial receipt','2026-11-03 12:00:00');`);
 const result=await patchAdminReservationPayment(new Request(origin,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({amountPaidCzk:1200})}),r.env,{uid:'a'},'partial',origin);assert.equal(result.status,200);
 r.db.exec("UPDATE admin_actions SET created_at='2026-11-03 13:00:00' WHERE action_type='reservation_payment_update'");
 const p=(await read(r)).payments;assert.equal(p.recent.length,5);assert.deepEqual(p.recent.map(x=>x.createdAt),['2026-11-03 13:00:00','2026-11-03 12:00:00','2026-11-03 11:00:00','2026-11-03 10:00:00','2026-11-02 10:00:00']);assert.deepEqual(p.recent.map(x=>x.amountCzk),[200,300,200,100,-200]);assert.equal(p.recent[0].source,'legacy-adjustment');assert.equal(p.recent[0].amountPaidCzk,1200);assert.equal(p.recent.at(-1).source,'ledger');assert.ok(!p.recent.some(x=>x.reservationId==='cancelled'||x.reservationId==='other-year'));
 assert.match(paymentOverviewMarkup(p,()=>''),/Vratka/);const old=(await read(r,'old')).payments;assert.equal(old.paidCzk,9999);assert.deepEqual(old.recent,[]);
 }finally{r.db.close()}
});
test('undocumented prescription stays unknown; paid/unpaid links use amount and active status, not approval alone',async()=>{
 const r=fixture();try{r.db.exec("UPDATE reservation_accommodation SET total_czk=701 WHERE reservation_id='r'; UPDATE reservations SET amount_paid_czk=1000 WHERE id='r'; UPDATE reservations SET amount_paid_czk=0 WHERE id='partial'");const p=(await read(r)).payments;assert.equal(p.breakdownCount,0);assert.match(paymentOverviewMarkup(p,()=>''),/Rozpis vstupného a ubytování není doložen/);
 for(const [scope,expected]of [['paidActive',['r']],['unpaidActive',['partial']],['underpaidActive',[]]]){const response=await getAdminReservations({...r.env,ADMIN_READ:true},new URL('/api/admin/reservations?eventId=e&view=payments&projection=list&scope='+scope,origin),origin);assert.deepEqual((await response.json()).reservations.map(x=>x.id),expected);}
 }finally{r.db.close()}
});
test('legacy accommodation shortcuts map to Registrations without overwriting any other preference',()=>{
 const p=factoryPreferences();p.mobileShortcuts=['members','reservations','accommodation'];const before=structuredClone(p);assert.ok(validatePreferences(p));assert.ok(validMobileShortcuts(p.mobileShortcuts));assert.deepEqual(mobileShortcuts(p.mobileShortcuts),['members','reservations','dashboard']);assert.deepEqual(p,before);assert.equal(Object.hasOwn(MOBILE_ADMIN_TARGETS,'accommodation'),false);
});
