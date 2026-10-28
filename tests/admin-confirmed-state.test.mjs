import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
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
 const ci=readFileSync(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');
 // CI runs Node checks before installing Playwright. Evaluate the actual config
 // with its identity defineConfig wrapper, without requiring browser dependencies.
 const configSource=readFileSync(new URL('../playwright.config.mjs',import.meta.url),'utf8');
 const config=runInNewContext(configSource.replace(/^import \{ defineConfig \} from '@playwright\/test';\r?\n/,'').replace('export default defineConfig(','globalThis.config = defineConfig(')+'\nconfig',{
  defineConfig:value=>value,process:{env:{CI:'true'}},
 });
 const steps=ci.split(/(?=^      - name:)/m);
 const attempt='${{ github.run_attempt }}',runId='${{ github.run_id }}';
 const critical=['account-entry','member-session-lifecycle','account-deadline','member-completion','history-reading','public-planner-stability','registration-live-continuity','appearance'];
 for(const engine of ['chromium','webkit','firefox']){
  const runs=steps.filter(step=>new RegExp('^        id: '+engine+'\\s*$','m').test(step));
  assert.equal(runs.length,1,engine+' has one required execution step');
  const run=runs[0];
  // Every engine runs after setup even when an earlier browser failed.
  assert.ok(run.includes("if: ${{ !cancelled() && steps.browser_setup.outcome == 'success' }}"));
  assert.ok(run.includes('--project='+engine));
  assert.ok(run.includes(`PLAYWRIGHT_HTML_OUTPUT_DIR: playwright-report/${engine}-${attempt}`));
  assert.ok(run.includes(`--output=test-results/${engine}-${attempt}`));
  const uploads=steps.filter(step=>step.includes(`name: browser-${engine}-${runId}-${attempt}`));
  assert.equal(uploads.length,1,engine+' has isolated failure evidence');
  const upload=uploads[0];
  assert.ok(upload.includes(`failure() && steps.${engine}.outcome == 'failure'`));
  assert.ok(upload.includes(`test-results/${engine}-${attempt}/`));
  assert.ok(upload.includes(`playwright-report/${engine}-${attempt}/`));
  assert.match(upload,/retention-days: 5(?:\r?\n|$)/);
  const project=config.projects.find(project=>project.name===engine);
  assert.equal(project?.use?.browserName,engine);
  if(engine!=='chromium')for(const suite of critical)assert.ok(project.testMatch.includes('**/'+suite+'.spec.mjs'),engine+' includes '+suite);
 }
 assert.doesNotMatch(ci,/continue-on-error/);
 assert.equal(config.retries,0);assert.equal(config.expect.timeout,7_000);
 assert.equal(config.use.trace,'retain-on-failure');assert.equal(config.use.screenshot,'only-on-failure');
});

test('receipt must match actor, operation, entity, event, operation ID and CAS base',()=>{
 const operation={id:'operation',actor:'a',eventId:'e',path:'/api/admin/reservations/r/payment',revision:4};
 const receipt={id:'operation',actorId:'a',eventId:'e',entityId:'r',operation:'payment',baseRevision:4,revision:6,state:'confirmed'};
 assert.equal(commandReceiptMatches(receipt,operation),true);
 for(const [key,value]of Object.entries({id:'other',actorId:'other',eventId:'other',entityId:'other',operation:'reservation',baseRevision:3,revision:2,state:'outcome_unknown'}))assert.equal(commandReceiptMatches({...receipt,[key]:value},operation),false,key);
});
