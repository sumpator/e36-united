import {test} from 'node:test';import assert from 'node:assert/strict';
import {reservationPriceBreakdown} from '../member/modules/planner/payments.js';
import {deriveOverviewState} from '../member-portal-state.js';
const payment={status:'overpaid',amountDueCzk:2280,amountPaidCzk:4200,overpaymentCzk:1920,remainingCzk:0};
test('saved price parts reconcile without recalculating current admission or changing the common payment',()=>{
 const r={status:'approved',admissionCzk:500,accommodationSnapshot:{totalCzk:1780},payment};const html=reservationPriceBreakdown(r);
 assert.match(html,/Vstupné/);assert.match(html,/500/);assert.match(html,/1\s780/);assert.match(html,/2\s280/);assert.equal(r.payment,payment);
 assert.match(reservationPriceBreakdown({...r,admissionCzk:null}),/není.*uložený/);assert.match(reservationPriceBreakdown({...r,admissionCzk:600}),/není.*uložený/);
 assert.match(reservationPriceBreakdown({sleep:'Bez ubytování',admissionCzk:0,payment:{amountDueCzk:0}}),/Celková cena/);
});
test('overview describes actual trip overpayment without a duplicate instruction',()=>{const v=deriveOverviewState({reservation:{status:'approved',payment},formatAmount:v=>v+' Kč'});assert.equal(v.copy,'Evidujeme přeplatek 1920 Kč.');assert.equal(v.target,'payments');});
