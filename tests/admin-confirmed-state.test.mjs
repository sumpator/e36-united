import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mergeReservation,confirmedFields,commandReceiptMatches} from '../admin/confirmed-state.js';

const current=()=>({id:'r',eventId:'e',revision:4,status:'pending',reviewContext:{qrIssued:false,selectedCarPhoto:'/private/selected'},payment:{amountDueCzk:1000,amountPaidCzk:200,spayd:'synthetic'},carSnapshot:{model:'BMW 325i'},member:{id:'m',name:'Synthetic'}});
test('partial confirmed reservation keeps absent read projection fields and does not mutate the old snapshot',()=>{
 const old=current(),next=mergeReservation(old,{id:'r',revision:6,status:'approved',reviewNote:'confirmed'});
 assert.equal(next.status,'approved');for(const key of ['reviewContext','payment','carSnapshot','member'])assert.deepEqual(next[key],old[key]);assert.equal(old.status,'pending');
});
test('partial nested payment merges only present fields; explicit zero/null remain authoritative',()=>{
 const next=mergeReservation(current(),{id:'r',revision:6,payment:{amountPaidCzk:0,spayd:null}});
 assert.deepEqual(next.payment,{amountDueCzk:1000,amountPaidCzk:0,spayd:null});
});
test('older detail/list response cannot replace a newer confirmed revision',()=>{
 const next=mergeReservation(current(),{id:'r',revision:6,status:'approved'});
 assert.equal(mergeReservation(next,current()),next);assert.equal(mergeReservation(next,{id:'r',revision:5,status:'rejected'}),next);
 assert.equal(mergeReservation(next,{id:'r',revision:6,status:'approved',reviewedAt:'synthetic'}).reviewedAt,'synthetic');
});
test('reservation identity/event and receipt-only floor reject unrelated or stale projections',()=>{
 const old=current();assert.equal(mergeReservation(old,{id:'other',revision:9}),old);assert.equal(mergeReservation(old,{id:'r',eventId:'other',revision:9}),old);
 assert.equal(mergeReservation(old,undefined),old);assert.equal(mergeReservation(old,{...old,revision:5},6),old);
});
test('confirming one field keeps unrelated unsent controls dirty',()=>{
 const result=confirmedFields({':reviewNote':'',':paymentAmount':'200'},{':reviewNote':'sent',':paymentAmount':'777'},{':reviewNote':'sent'});
 assert.deepEqual(result.delta,{':paymentAmount':'777'});assert.equal(result.base[':paymentAmount'],'200');
});
test('post-send edits are not confirmed and receipt with no saved snapshot clears no fields',()=>{
 const base={':reviewNote':''},live={':reviewNote':'new text'};
 assert.deepEqual(confirmedFields(base,live,{':reviewNote':'sent'}),{base:{':reviewNote':'sent'},delta:live});
 assert.deepEqual(confirmedFields(base,live,{}),{base,delta:live});
});
test('history components and a dashboard configuration snapshot remain independently dirty',()=>{
 const base={'attendance:historyReviewNote':'','sns:historyReviewNote':''},live={'attendance:historyReviewNote':'yes','sns:historyReviewNote':'not submitted'};
 assert.deepEqual(confirmedFields(base,live,{'attendance:historyReviewNote':'yes'}).delta,{'sns:historyReviewNote':'not submitted'});
 assert.deepEqual(confirmedFields({':configuration':'old'},{':configuration':'later'},{':configuration':'sent'}).delta,{':configuration':'later'});
});
test('CI failure diagnostics are engine/attempt isolated, short-lived and do not relax failures',()=>{
 const ci=readFileSync(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8'),config=readFileSync(new URL('../playwright.config.mjs',import.meta.url),'utf8');
 for(const engine of ['chromium','webkit']){
  assert.ok(ci.includes(`--output=test-results/${engine}-\${{ github.run_attempt }}`));
  assert.ok(ci.includes(`name: browser-${engine}-\${{ github.run_id }}-\${{ github.run_attempt }}`));
  assert.ok(ci.includes(`failure() && steps.${engine}.outcome == 'failure'`));
 }
 assert.equal((ci.match(/retention-days: 5/g)||[]).length,2);assert.doesNotMatch(ci,/continue-on-error/);assert.match(config,/retries: 0/);assert.match(config,/timeout: 7_000/);assert.match(config,/trace: 'retain-on-failure'/);assert.match(config,/screenshot: 'only-on-failure'/);
});

test('receipt must match actor, operation, entity, event, operation ID and CAS base',()=>{
 const operation={id:'operation',actor:'a',eventId:'e',path:'/api/admin/reservations/r/payment',revision:4};
 const receipt={id:'operation',actorId:'a',eventId:'e',entityId:'r',operation:'payment',baseRevision:4,revision:6,state:'confirmed'};
 assert.equal(commandReceiptMatches(receipt,operation),true);
 for(const [key,value]of Object.entries({id:'other',actorId:'other',eventId:'other',entityId:'other',operation:'reservation',baseRevision:3,revision:2,state:'outcome_unknown'}))assert.equal(commandReceiptMatches({...receipt,[key]:value},operation),false,key);
});
