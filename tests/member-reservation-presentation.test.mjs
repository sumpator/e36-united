import test from 'node:test';
import assert from 'node:assert/strict';
import {reservationStatusPresentation as present} from '../member/reservation-status.js';
import {normalizeReservation} from '../member/modules/planner/reservation.js';

test('menu separates confirmed attendance from server payment status',()=>{
 for(const [status,label]of [['unpaid','Nedoplatek'],['underpaid','Nedoplatek'],['paid','Zaplaceno'],['overpaid','Přeplatek'],['not_required','Bez platby']]){
  const view=present({status:'approved',payment:{status,remainingCzk:123}});assert.equal(view.symbol,'✓');assert.equal(view.label,'Potvrzeno');assert.equal(view.tone,'confirmed');assert.equal(view.payment,label);
 }
});

test('missing payment instructions and unknown states never claim a debt or payment',()=>{
 assert.equal(present({status:'approved',payment:{status:'unpaid',configurationReady:false}}).payment,'Platební údaje chybí');
 assert.equal(present({status:'approved',payment:{status:'unknown'}}).payment,'Platební stav nedostupný');
 assert.equal(present({status:'approved',payment:{status:'paid',configurationReady:false}}).payment,'Zaplaceno');
 assert.equal(present({status:'pending',payment:{status:'unpaid'}}).payment,'');
});
test('waiting, rejection, cancellation and technical failure are distinct',()=>{
 assert.equal(present({status:'pending'}).tone,'waiting');assert.equal(present({status:'pending'}).symbol,'◷');assert.equal(present({status:'pending'}).payment,'');
 assert.equal(present({status:'rejected'}).symbol,'×');assert.equal(present({status:'cancelled'}).tone,'neutral');assert.equal(present(null,{error:true}).label,'Chyba načtení');
});
test('change under review never promises a new payment instruction',()=>{
 const view=present({status:'approved',changePending:true,payment:{status:'underpaid'}});assert.match(view.label,/žádost čeká na tým/);assert.equal(view.payment,'Platba čeká na schválení změny');
});
test('saved preliminary plan is not a confirmed attendance or an outstanding payment',()=>{
 const view=present(null,{plan:true});assert.equal(view.tone,'neutral');assert.equal(view.payment,'');assert.equal(present(null,{draft:true}).tone,'action');assert.equal(present(null).tone,'neutral');
});
test('unavailable optional Planner cannot replace an existing reservation state',()=>{assert.equal(present({status:'approved'},{error:true}).tone,'confirmed')});
test('missing event title never invents a next event for a historical reservation',()=>{const r=normalizeReservation({id:'existing',eventYear:2026,status:'approved',payment:{amountDueCzk:500}});assert.equal(r.title,'E36 United');assert.equal(r.year,2026);assert.equal(r.payment.amountDueCzk,500)});
