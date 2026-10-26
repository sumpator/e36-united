import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {memberRuntime as createMemberRuntime} from './helpers/admin-member-runtime.mjs';
import {merchRuntime as createMerchRuntime} from './helpers/merch-runtime.mjs';
import {bootstrapMember} from '../worker/domains/members.js';
import {getCurrentReservation,putCurrentReservation} from '../worker/domains/reservations/index.js';
import {putPreliminaryReservation} from '../worker/domains/reservations/preliminary.js';
import {submitReservationRequest,reviewReservationRequest} from '../worker/domains/reservations/requests.js';
import {patchAdminReservation,patchAdminReservationPayment} from '../worker/domains.js';
import {changeOrder} from '../worker/domains/merch/service.js';
import {deliverTransactionalEmails,transactionalContent,transactionalTransportState} from '../worker/domains/mailing/transactional.js';
import {TRANSACTIONAL_TYPES,renderTransactionalEmail,czk} from '../worker/domains/mailing/transactional-template.js';
import {transactionalExample,transactionalTestExample,routeTransactionalEmails} from '../worker/domains/mailing/transactional-routes.js';
import {handleSmtp2goWebhook} from '../worker/domains/mailing/tracking.js';
import worker from '../worker/index.js';
import {verifyNewPasswordAccount} from '../member/registration-verification.js';
import {arrivalsRuntime as createArrivalsRuntime,seedArrivals,EVENT} from './helpers/arrivals-runtime.mjs';
import {routeArrivals,arrivalList} from '../worker/domains/arrivals.js';
import {deliverArrivalInvitations} from '../worker/domains/arrival-invitations.js';
import {deliverMerchEmail,routeMerch} from '../worker/domains/merch/index.js';
const origin='https://e36united.cz',member={uid:'m'},admin={uid:'a'};
const activate=r=>{r.db.exec('UPDATE transactional_email_control SET enabled=1 WHERE id=1');return r};
const memberRuntime=()=>activate(createMemberRuntime());
const merchRuntime=async()=>activate(await createMerchRuntime());
const arrivalsRuntime=()=>activate(createArrivalsRuntime());
const request=(body={},method='POST',path='/local')=>new Request('https://api.e36united.cz'+path,{method,headers:{'Content-Type':'application/json',Origin:origin},body:method==='GET'?undefined:JSON.stringify(body)});
const api=(r,path='',method='GET',body={},auth=admin)=>{const req=request(body,method,'/api/admin/mailing/transactional'+path);return routeTransactionalEmails({request:req,env:r.env,url:new URL(req.url),auth,origin})};
const rows=(r,kind)=>r.db.prepare('SELECT * FROM email_outbox WHERE template_key=? ORDER BY rowid').all(kind);
const capture=()=>{const messages=[];return {messages,async sendBatch(emails){messages.push(...emails);return {requestId:'request-'+messages.length,emailIds:['email-'+messages.length]}}}};
const deliver=(r,row,transport)=>deliverTransactionalEmails(r.env,{id:row.id,transport});
const setPayment=r=>r.db.exec("UPDATE events SET payment_account_display='19-2000145399/0800',payment_iban='CZ6508000000192000145399',payment_recipient_name='Fixture',payment_test_mode=0 WHERE id='e'; UPDATE reservations SET payment_vs='2026000001' WHERE id='r'");

test('default-off transport covers cron, waitUntil, retry and legacy entry points without blocking business writes or Admin reads',async t=>{
 const r=createMemberRuntime();t.after(()=>r.db.close());r.env.SMTP2GO_TRANSACTIONAL_API_KEY='captured-only';r.env.SMTP2GO_WEBHOOK_SECRET='isolated';
 const transport=capture(),previousFetch=globalThis.fetch;let network=0;globalThis.fetch=async()=>{network++;throw Error('No external calls allowed')};
 try{
  assert.deepEqual(await transactionalTransportState(r.env),{enabled:false,phase:'not_activated',activatedAt:null,revision:0});
  assert.equal((await patchAdminReservationPayment(request({amountPaidCzk:450},'PATCH'),r.env,admin,'r',origin)).status,200);
  assert.equal(r.db.prepare("SELECT amount_paid_czk FROM reservations WHERE id='r'").get().amount_paid_czk,450);
  const row=rows(r,'reservation_payment').at(-1);assert.equal(row.status,'skipped');assert.equal(row.error_message,'before_initial_activation');assert.equal(row.sent_at,null);
  await deliver(r,row,transport);await deliverArrivalInvitations(r.env,'missing',{transport});await deliverMerchEmail(r.env,'missing');
  const waits=[];await worker.scheduled({},r.env,{waitUntil:p=>waits.push(p)});
  const hook=new Request('https://api.e36united.cz/api/mailing/smtp2go-webhook',{method:'POST',headers:{Authorization:'Bearer isolated','Content-Type':'application/json'},body:JSON.stringify({id:'unknown-local',event:'processed',email_id:'unknown',time:1792742400,rcpt:'nobody@example.invalid'})});
  const response=await worker.fetch(hook,r.env,{waitUntil:p=>waits.push(p)});assert.equal(response.status,200);assert.equal(waits.length,1,'only the explicit cron schedules a drain, never the webhook');await Promise.all(waits);
  assert.equal((await api(r,'/'+row.id+'/retry','POST',{reason:'Výslovná zkouška ještě před aktivací'})).status,409);
  const history=await (await api(r)).json();assert.equal(history.transport.enabled,false);assert.equal((await api(r,'/'+row.id)).status,200);assert.equal((await api(r,'/templates/reservation_payment')).status,200);
  assert.equal(network,0);assert.equal(transport.messages.length,0);assert.equal(rows(r,'reservation_payment').at(-1).attempts,0);
  assert.throws(()=>r.db.exec("UPDATE transactional_email_control SET enabled='yes'"),/CHECK/);
  const unavailable={DB:{prepare(){throw Error('Unavailable configuration')}}};assert.equal((await transactionalTransportState(unavailable)).enabled,false);await deliverTransactionalEmails(unavailable,{transport});await deliverArrivalInvitations(unavailable,'missing',{transport});await deliverMerchEmail(unavailable,'missing');
  const invalid={DB:{prepare(sql){return {bind(){return this},async first(){return sql.includes('schema_migrations')?{id:'migration'}:{enabled:'true',activated_at:'2026-10-23',revision:1}}}}}};
  assert.equal((await transactionalTransportState(invalid)).enabled,false);await deliverTransactionalEmails(invalid,{transport});assert.equal(transport.messages.length,0);
 }finally{globalThis.fetch=previousFetch}
});

test('first activation never sends pre-activation or historical intents; only an explicit audited current-content retry can recover one',async t=>{
 const r=createMemberRuntime();t.after(()=>r.db.close());const transport=capture();
 await patchAdminReservationPayment(request({amountPaidCzk:300},'PATCH'),r.env,admin,'r',origin);const older=rows(r,'reservation_payment').at(-1);
 r.db.exec("INSERT INTO email_outbox(id,template_key,recipient_email,subject,status) VALUES('historical','old','old@example.invalid','Old','queued')");
 activate(r);const boundary=(await transactionalTransportState(r.env)).activatedAt;assert.ok(boundary);
 await deliverTransactionalEmails(r.env,{transport});assert.equal(transport.messages.length,0);
 await patchAdminReservationPayment(request({amountPaidCzk:400},'PATCH'),r.env,admin,'r',origin);const current=rows(r,'reservation_payment').at(-1);
 // Equal timestamps cannot move an earlier intent across the activation boundary.
 r.db.prepare('UPDATE email_outbox SET created_at=? WHERE id IN (?,?)').run(boundary,older.id,current.id);
 await deliverTransactionalEmails(r.env,{transport});assert.equal(transport.messages.length,1);assert.equal(r.db.prepare('SELECT status FROM email_outbox WHERE id=?').get(older.id).status,'skipped');
 assert.equal(r.db.prepare("SELECT status FROM email_outbox WHERE id='historical'").get().status,'queued');
 const retry=await api(r,'/'+older.id+'/retry','POST',{reason:'Jednotlivé dodatečné odeslání po kontrole aktuální rezervace'});assert.equal(retry.status,201);
 await deliverTransactionalEmails(r.env,{transport});assert.equal(transport.messages.length,2);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM transactional_email_audit').get().n,1);
 assert.equal(r.db.prepare('SELECT status,sent_at FROM email_outbox WHERE id=?').get(older.id).sent_at,null);assert.equal(rows(r,'reservation_payment').length,3);
 assert.throws(()=>r.db.exec('UPDATE transactional_email_control SET activated_at=NULL'),/immutable/);assert.throws(()=>r.db.exec('DELETE FROM transactional_email_control'),/retained/);
});

test('a later pause preserves new queued work and explicit retries, resume revalidates content and never duplicates delivery',async t=>{
 const r=memberRuntime();t.after(()=>r.db.close());const before=await transactionalTransportState(r.env),transport=capture();
 await patchAdminReservationPayment(request({amountPaidCzk:300},'PATCH'),r.env,admin,'r',origin);const first=rows(r,'reservation_payment').at(-1);
 r.db.exec('UPDATE transactional_email_control SET enabled=0 WHERE id=1');
 await patchAdminReservationPayment(request({amountPaidCzk:400},'PATCH'),r.env,admin,'r',origin);assert.equal(rows(r,'reservation_payment').at(-1).status,'queued');
 r.db.prepare("UPDATE email_outbox SET status='failed',error_message='provider_rejected' WHERE id=?").run(first.id);
 assert.equal((await api(r,'/'+first.id+'/retry','POST',{reason:'Výslovný retry připravený během technického pozastavení'})).status,201);
 await deliverTransactionalEmails(r.env,{transport});assert.equal(transport.messages.length,0);
 const paused=await transactionalTransportState(r.env);assert.equal(paused.phase,'paused');assert.equal(paused.activatedAt,before.activatedAt);
 activate(r);assert.ok((await transactionalTransportState(r.env)).revision>paused.revision);
 await deliverTransactionalEmails(r.env,{transport});assert.equal(transport.messages.length,2);await deliverTransactionalEmails(r.env,{transport});assert.equal(transport.messages.length,2);
 assert.equal(r.db.prepare("SELECT COUNT(*) n FROM email_outbox WHERE tx_version=1 AND status='queued'").get().n,0);
 await patchAdminReservation(request({status:'pending'},'PATCH'),r.env,admin,'r',origin);await patchAdminReservation(request({status:'approved'},'PATCH'),r.env,admin,'r',origin);const approval=rows(r,'reservation_approved').at(-1);
 r.db.exec('UPDATE transactional_email_control SET enabled=0 WHERE id=1');await patchAdminReservation(request({status:'cancelled'},'PATCH'),r.env,admin,'r',origin);activate(r);
 await deliverTransactionalEmails(r.env,{transport});assert.equal(r.db.prepare('SELECT status FROM email_outbox WHERE id=?').get(approval.id).status,'superseded');assert.equal(transport.messages.length,3);assert.ok(!transport.messages.at(-1).text_body.includes('Účet:'));
});

test('controlled pause and resume during content loading invalidates the old processor generation before provider handoff',async t=>{
 const r=memberRuntime();t.after(()=>r.db.close());await patchAdminReservationPayment(request({amountPaidCzk:500},'PATCH'),r.env,admin,'r',origin);
 const row=rows(r,'reservation_payment').at(-1),transport=capture(),prepare=r.env.DB.prepare;let enter,release;
 const entered=new Promise(resolve=>enter=resolve),barrier=new Promise(resolve=>release=resolve);
 r.env.DB.prepare=sql=>{const statement=prepare(sql);if(!sql.startsWith('SELECT r.*,m.email'))return statement;return {bind(...args){const bound=statement.bind(...args);return {...bound,async first(){enter();await barrier;return bound.first()}}}}};
 const processing=deliver(r,row,transport);await entered;r.db.exec('UPDATE transactional_email_control SET enabled=0 WHERE id=1');activate(r);release();await processing;r.env.DB.prepare=prepare;
 assert.equal(transport.messages.length,0);assert.equal(r.db.prepare('SELECT status FROM email_outbox WHERE id=?').get(row.id).status,'queued');
 await deliver(r,row,transport);assert.equal(transport.messages.length,1);
});

test('migration interlock prevents old Merch and arrival senders from claiming pre-activation or historical mail',async t=>{
 const r=await createMerchRuntime();t.after(r.close);r.env.SMTP2GO_TRANSACTIONAL_API_KEY='captured-only';const order=await r.order();await deliverMerchEmail(r.env,order.id);
 const legacy=r.db.prepare('SELECT * FROM merch_outbox WHERE order_id=?').get(order.id),linked=r.db.prepare('SELECT * FROM email_outbox WHERE source_outbox_id=?').get(legacy.id);
 assert.equal(linked.status,'skipped');assert.equal(r.db.prepare("UPDATE merch_outbox SET status='sending' WHERE id=? AND status='pending'").run(legacy.id).changes,0);
 const a=createArrivalsRuntime();t.after(()=>a.db.close());await seedArrivals(a);const revision=(await arrivalList(a.env,EVENT)).revision,url=new URL(origin+'/api/admin/events/'+EVENT+'/arrivals');
 assert.equal((await routeArrivals({request:new Request(url,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'off-invite','If-Match':String(revision)},body:JSON.stringify({id:'off-guest',model:'BMW guest',body:'Touring',crew:1,cash:500,matchesReviewed:true,email:'guest@example.invalid'})}),url,env:a.env,auth:admin,origin})).status,200);
 const invitation=rows(a,'arrival_invitation')[0],transport=capture();await deliverArrivalInvitations(a.env,'off-guest',{transport});assert.equal(transport.messages.length,0);
 assert.equal(invitation.status,'skipped');assert.equal(a.db.prepare("UPDATE email_outbox SET status='sending' WHERE id=? AND status='queued'").run(invitation.id).changes,0);
 // Historical tx0 arrival rows cannot bypass the new sender after later activation either.
 a.db.exec("INSERT INTO email_outbox(id,template_key,recipient_email,subject) VALUES('legacy-invite','arrival_invitation','old@example.invalid','Old')");
 a.db.exec("UPDATE email_outbox SET tx_version=0,status='queued' WHERE id='legacy-invite'");activate(a);
 assert.equal(a.db.prepare("UPDATE email_outbox SET status='sending' WHERE id='legacy-invite' AND status='queued'").run().changes,0);
 activate(r);assert.equal(r.db.prepare("UPDATE merch_outbox SET status='sending' WHERE id=? AND status='pending'").run(legacy.id).changes,0);
 const fresh=await r.order();let sends=0;
 await deliverTransactionalEmails(r.env,{orderId:fresh.id,transport:{async sendBatch(){
  // An old Worker cannot start the same source after the new Worker has claimed it.
  assert.equal(r.db.prepare("UPDATE merch_outbox SET status='sending' WHERE order_id=? AND status='pending'").run(fresh.id).changes,0);
  sends++;return {emailIds:['isolated-current'],requestId:'isolated-current'};
 }}});
 assert.equal(sends,1);
 assert.equal((await readMerchStatus(r,order.id)).messages[0].status,'skipped');
});
async function readMerchStatus(r,id){const url=new URL('https://api.e36united.cz/api/admin/merch/orders/'+id+'/email');return (await routeMerch({request:new Request(url),url,env:r.env,auth:{uid:'admin'},origin},true)).json()}

test('restricted future test candidates contain neither actionable invitation tokens nor payment instructions or selected recipients',()=>{
 for(const kind of ['reservation_payment','merch_confirmation','reservation_rejected','arrival_invitation']){
  const data=transactionalTestExample(kind),message=renderTransactionalEmail(kind,data);
  assert.match(message.subject,/\[TEST\]/);assert.equal(data.url,null);assert.match(message.text,/Nic neplať/);
  assert.ok(!message.text.includes('arrival-invite='));assert.ok(!message.text.includes('Variabilní symbol:'));assert.ok(!message.text.includes('19-2000145399'));
  assert.ok(!message.html.includes('href="https://'));assert.equal('to' in data,false);
 }
});

test('Firebase verification uses the existing SDK only once for a newly created unverified password account, never verified/federated users',async()=>{
 const calls=[],sdk={async sendEmailVerification(user){calls.push(user.uid)}},user={uid:'password',emailVerified:false,providerData:[{providerId:'password'}]};
 const result=await Promise.all([verifyNewPasswordAccount(sdk,user),verifyNewPasswordAccount(sdk,user)]);assert.deepEqual(calls,['password']);assert.ok(result.every(r=>r.requested));
 await verifyNewPasswordAccount(sdk,{uid:'verified',emailVerified:true});await verifyNewPasswordAccount(sdk,{uid:'google',emailVerified:false,providerData:[{providerId:'google.com'}]});assert.deepEqual(calls,['password']);
 const failed=await verifyNewPasswordAccount({async sendEmailVerification(){throw Error('captured rejection')}},{uid:'failed',emailVerified:false});assert.deepEqual(failed,{needed:true,requested:false});
});

test('transactional migration preserves populated predecessor and never backfills messages',()=>{
 const migration=readFileSync(new URL('../db/migrations/2026-10-23-transactional-emails.sql',import.meta.url),'utf8'),schema=readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8');assert.ok(schema.includes(migration.trim()));
 const db=new DatabaseSync(':memory:');try{
  db.exec(schema.replace(migration.trim(),''));db.exec("INSERT INTO members(id,member_code,email,name) VALUES('m','M','m@example.invalid','Fixture'); INSERT INTO events(id,year,title) VALUES('e',2026,'Fixture'); INSERT INTO reservations(id,member_id,event_id,amount_paid_czk) VALUES('r','m','e',500)");
  const before=db.prepare('SELECT * FROM reservations').all();db.exec(migration);
  assert.deepEqual(db.prepare('SELECT * FROM reservations').all(),before);assert.equal(db.prepare('SELECT COUNT(*) n FROM email_outbox').get().n,0);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='trigger' AND name LIKE 'email_%'").get().n,19);
 }finally{db.close()}
});

test('all versioned templates provide escaped HTML/text, literal state and safe actions without web-theme coupling',()=>{
 for(const kind of Object.keys(TRANSACTIONAL_TYPES)){
  const sample=transactionalExample(kind);if(sample.items)assert.equal(sample.facts.find(([label])=>label==='Celkem')[1],czk(sample.items.reduce((sum,item)=>sum+item.unitPriceMinor*item.quantity,0)/100));
  const message=renderTransactionalEmail(kind,{...transactionalExample(kind),comment:'<script>alert(1)</script>',facts:[['Jméno','<img src=x onerror=alert(1)>']],url:'javascript:alert(1)'});
  assert.ok(message.subject.length>10);assert.ok(message.text.includes('<script>'));assert.ok(message.html.includes('&lt;script&gt;'));assert.ok(message.html.includes('E36 UNITED'));assert.match(message.html,/font:16px/);assert.ok(!message.html.includes('href="javascript:'));assert.ok(!/<script\b|<link\b|display:grid|localStorage|@font-face/.test(message.html));
  assert.ok(message.html.length<100000);assert.ok(message.text.includes('info@e36united.cz'));
 }
});

test('bootstrap atomically queues a single welcome, never verification for an already verified provider',async t=>{
 const r=memberRuntime();t.after(()=>r.db.close());const auth={uid:'new-account',email:'new@example.invalid',emailVerified:true,name:'New Member'};
 for(let n=0;n<2;n++)assert.equal((await bootstrapMember(request({name:'New Member'}),r.env,auth,origin)).status,200);
 assert.equal(rows(r,'account_created').length,1);assert.equal(rows(r,'verify_email').length,0);assert.equal(rows(r,'reset_password').length,0);
 const transport=capture();await Promise.all([deliver(r,rows(r,'account_created')[0],transport),deliver(r,rows(r,'account_created')[0],transport)]);assert.equal(transport.messages.length,1);assert.deepEqual(transport.messages[0].to,['new@example.invalid']);
 assert.match(transport.messages[0].text_body,/Samotný účet účast nerezervuje/);
});

test('explicit preliminary save emits once, ordinary edits and failed replay do not flood, cancellation supersedes queued mail',async t=>{
 const r=memberRuntime();t.after(()=>r.db.close());r.db.exec("DELETE FROM reservations; INSERT INTO event_preliminary_settings(event_id,enabled,write_token) VALUES('e',1,'isolated')");
 const input={eventId:'e',revision:0,carId:null,arrival:'Jen na otočku',crew:1,accommodation:'Bez ubytování',showShine:'Ne',note:''};
 assert.equal((await putPreliminaryReservation(request(input,'PUT'),r.env,member,origin)).status,200);assert.equal((await putPreliminaryReservation(request(input,'PUT'),r.env,member,origin)).status,409);
 assert.equal((await putPreliminaryReservation(request({...input,revision:1,note:'Editace'},'PUT'),r.env,member,origin)).status,200);assert.equal(rows(r,'preliminary_saved').length,1);
 r.db.exec("UPDATE preliminary_reservations SET status='cancelled'");const transport=capture();await deliver(r,rows(r,'preliminary_saved')[0],transport);assert.equal(transport.messages.length,0);assert.equal(rows(r,'preliminary_saved')[0].status,'superseded');
});

test('real reservation submission, review, current partial/full money and owner-scoped deep links use confirmed server data',async t=>{
 const r=memberRuntime();t.after(()=>r.db.close());r.db.exec("DELETE FROM reservations; UPDATE events SET registration_status='open',admission_registered_czk=500 WHERE id='e'");
 const input={carId:'c',arrival:'Jen na otočku',crew:1,accommodation:'Bez ubytování',showShine:'Ne',note:''};
 const response=await putCurrentReservation(request(input,'PUT'),r.env,member,origin);assert.equal(response.status,200);const id=(await response.json()).reservation.id;
 assert.equal((await putCurrentReservation(request(input,'PUT'),r.env,member,origin)).status,409);assert.equal(rows(r,'reservation_submitted').filter(x=>x.entity_id===id).length,1);
 const transport=capture();await deliver(r,rows(r,'reservation_submitted').find(x=>x.entity_id===id),transport);assert.match(transport.messages[0].text_body,/Zatím nic neplať/);
 assert.equal((await patchAdminReservation(request({status:'approved',reviewNote:'SECRET INTERNAL',memberComment:'Veřejné potvrzení'},'PATCH'),r.env,admin,id,origin)).status,200);
 const approved=rows(r,'reservation_approved')[0];await deliver(r,approved,transport);assert.match(transport.messages[1].text_body,/Veřejné potvrzení/);assert.ok(!transport.messages[1].text_body.includes('SECRET INTERNAL'));
 assert.equal((await getCurrentReservation(r.env,{uid:'n'},origin,id)).status,404);assert.equal((await getCurrentReservation(r.env,member,origin,id)).status,200);
 // Modern reservations are paid through the authoritative event ledger, not forged totals.
 const {routeArrivals}=await import('../worker/domains/arrivals.js');
 for(const amount of [200,300]){
  const req=request({reservationId:id,amount,method:'bank',reason:'Izolovaná skutečně přijatá platba'},'POST','/api/admin/events/e/arrivals/reservation-payment');
  req.headers.set('Idempotency-Key',crypto.randomUUID());req.headers.set('If-Match',String(r.db.prepare("SELECT revision FROM admin_resource_versions WHERE resource_type='arrivals' AND resource_id='e'").get()?.revision||0));
  for(let n=0;n<2;n++){const response=await routeArrivals({request:req.clone(),env:r.env,url:new URL(req.url),origin,auth:admin});assert.equal(response.status,200,await response.text())}
  const notification=rows(r,'reservation_payment').find(row=>row.entity_id===id&&JSON.parse(row.payload_json).deltaCzk===amount);assert.ok(notification);await deliver(r,notification,transport);
 }
 assert.equal(r.db.prepare('SELECT COUNT(*) n FROM event_payments WHERE reservation_id=?').get(id).n,2);assert.equal(r.db.prepare('SELECT amount_paid_czk FROM reservations WHERE id=?').get(id).amount_paid_czk,500);
});

test('payment handler emits exact received delta and current balance; a queued approval never asks to pay after settlement or cancellation',async t=>{
 const r=memberRuntime();t.after(()=>r.db.close());setPayment(r);const transport=capture();
 for(const amount of [500,1000]){
  assert.equal((await patchAdminReservationPayment(request({amountPaidCzk:amount},'PATCH'),r.env,admin,'r',origin)).status,200);
  const row=rows(r,'reservation_payment').find(x=>JSON.parse(x.payload_json).deltaCzk===(amount===500?300:500));await deliver(r,row,transport);
 }
 assert.match(transport.messages[0].text_body,/Přijatá částka: 300/);assert.match(transport.messages[0].text_body,/Zbývá: 500/);assert.match(transport.messages[0].text_body,/Účet: 19-/);
 assert.match(transport.messages[1].text_body,/Teď nemusíš nic dělat/);assert.ok(!transport.messages[1].text_body.includes('Účet:'));
 await patchAdminReservation(request({status:'pending'},'PATCH'),r.env,admin,'r',origin);await patchAdminReservation(request({status:'approved'},'PATCH'),r.env,admin,'r',origin);const approved=rows(r,'reservation_approved').at(-1);
 await patchAdminReservation(request({status:'cancelled'},'PATCH'),r.env,admin,'r',origin);await deliver(r,approved,transport);assert.equal(r.db.prepare('SELECT status FROM email_outbox WHERE id=?').get(approved.id).status,'superseded');
});

test('request receipt is not decision; decision emails expose only public comment and commit with reservation cancellation',async t=>{
 const r=memberRuntime();t.after(()=>r.db.close());const transport=capture();
 r.db.exec("UPDATE reservations SET arrival='Pátek',attendance_type='full_weekend',accommodation='Bez ubytování',accommodation_units=0,admission_czk=500,amount_due_czk=500 WHERE id='r'");
 const change={type:'change',memberNote:'Prosím změnit posádku',arrival:'Sobota',crew:2,accommodation:'Bez ubytování',accommodationUnits:0,showShine:'Ne',note:''};
 const changeResponse=await submitReservationRequest(request(change),r.env,member,'r',origin);assert.equal(changeResponse.status,201);const changeId=(await changeResponse.json()).request.id;
 await deliver(r,rows(r,'request_change').at(-1),transport);assert.match(transport.messages.at(-1).text_body,/zatím platí v dosavadní podobě/);
 assert.equal((await reviewReservationRequest(request({decision:'approved',adminComment:'Posádka změněna'},'PATCH'),r.env,admin,'r',changeId,origin)).status,200);
 await deliver(r,rows(r,'request_approved').at(-1),transport);assert.match(transport.messages.at(-1).text_body,/Posádka změněna/);assert.equal(r.db.prepare("SELECT crew FROM reservations WHERE id='r'").get().crew,2);
 const second=await submitReservationRequest(request({...change,crew:3}),r.env,member,'r',origin);assert.equal(second.status,201);const secondId=(await second.json()).request.id;
 assert.equal((await reviewReservationRequest(request({decision:'rejected',adminComment:'Veřejné zdůvodnění zamítnutí'},'PATCH'),r.env,admin,'r',secondId,origin)).status,200);
 await deliver(r,rows(r,'request_rejected').at(-1),transport);assert.match(transport.messages.at(-1).text_body,/Veřejné zdůvodnění zamítnutí/);assert.equal(r.db.prepare("SELECT crew FROM reservations WHERE id='r'").get().crew,2);
 let response=await submitReservationRequest(request({type:'cancellation',memberNote:'Prosím zrušit'}),r.env,member,'r',origin);assert.equal(response.status,201);const id=(await response.json()).request.id;
 assert.equal((await submitReservationRequest(request({type:'cancellation',memberNote:'Prosím zrušit'}),r.env,member,'r',origin)).status,200);assert.equal(rows(r,'request_cancellation').length,1);
 await deliver(r,rows(r,'request_cancellation')[0],transport);assert.match(transport.messages.at(-1).text_body,/ještě|zatím není zrušená/);
 assert.equal((await reviewReservationRequest(request({decision:'approved',adminComment:'Schválené storno'},'PATCH'),r.env,admin,'r',id,origin)).status,200);
 assert.equal(r.db.prepare("SELECT status FROM reservations WHERE id='r'").get().status,'cancelled');assert.equal(rows(r,'reservation_cancelled').length,1);await deliver(r,rows(r,'reservation_cancelled')[0],transport);assert.match(transport.messages.at(-1).text_body,/refundace.*samostatné/);
 await patchAdminReservation(request({status:'rejected',memberComment:'Veřejné zamítnutí rezervace',reviewNote:'Interní tajná poznámka'},'PATCH'),r.env,admin,'r',origin);
 await deliver(r,rows(r,'reservation_rejected').at(-1),transport);assert.match(transport.messages.at(-1).text_body,/Veřejné zamítnutí rezervace/);assert.ok(!transport.messages.at(-1).text_body.includes('Interní tajná poznámka'));
});

test('Merch events, recipient, immutable prices, cancel request versus cancellation, refund and fulfillment are wired atomically',async t=>{
 const r=await merchRuntime();t.after(r.close);const transport=capture();let o=await r.order();
 const change=async(action,extra={})=>{o=await changeOrder(r.env,'admin',o.id,{action,revision:o.revision,operationKey:crypto.randomUUID(),...extra},true);return o};
 await deliver(r,rows(r,'merch_confirmation')[0],transport);assert.deepEqual(transport.messages[0].to,['member@example.invalid']);assert.match(transport.messages[0].text_body,/890/);assert.match(transport.messages[0].html_body,/<img/);
 await change('payment',{amountMinor:40000,date:new Date().toISOString().slice(0,10)});await deliver(r,rows(r,'merch_payment')[0],transport);assert.match(transport.messages.at(-1).text_body,/Zbývá: 490/);
 o=await changeOrder(r.env,'member',o.id,{action:'cancel',revision:o.revision,operationKey:'cancel-request'},false);await deliver(r,rows(r,'merch_cancel_request')[0],transport);assert.match(transport.messages.at(-1).text_body,/ještě není zrušená/);
 await change('paid',{date:new Date().toISOString().slice(0,10)});const count=rows(r,'merch_payment').length;await change('paid',{date:new Date().toISOString().slice(0,10)});assert.equal(rows(r,'merch_payment').length,count);
 await change('status',{status:'preparing'});await change('status',{status:'ready'});await deliver(r,rows(r,'merch_ready')[0],transport);assert.match(transport.messages.at(-1).text_body,/Pokyny k převzetí/);
 await change('cancel');await deliver(r,rows(r,'merch_cancelled')[0],transport);assert.match(transport.messages.at(-1).text_body,/Objednávka je zrušená/);assert.ok(!transport.messages.at(-1).text_body.includes('Účet:'));
 await change('refund',{amountMinor:10000,reason:'Evidované částečné vrácení'});await deliver(r,rows(r,'merch_refund')[0],transport);assert.match(transport.messages.at(-1).text_body,/Vrácená částka: 100/);
 assert.deepEqual(r.db.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('sending lock, ambiguous provider outcome, explicit audited verification/retry and crash recovery never blindly repeat',async t=>{
 const r=memberRuntime();t.after(()=>r.db.close());setPayment(r);await patchAdminReservationPayment(request({amountPaidCzk:400},'PATCH'),r.env,admin,'r',origin);const row=rows(r,'reservation_payment').at(-1);
 let release,entered;const gate=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);let sends=0;
 const transport={async sendBatch(){sends++;entered();await gate;throw {code:'provider_timeout'}}};
 const first=deliver(r,row,transport);await started;await deliver(r,row,transport);release();await first;assert.equal(sends,1);assert.equal(rows(r,'reservation_payment').at(-1).status,'uncertain');
 assert.equal((await api(r,'/'+row.id+'/retry','POST',{reason:'Chci zkusit odeslání znovu'})).status,409);
 assert.equal((await api(r,'/'+row.id+'/resolve','POST',{reason:'Ověřené neodeslání u poskytovatele',confirmedNotSent:true,evidence:'SMTP2GO neobsahuje zprávu; doložené ověření podpory'})).status,200);
 const body={reason:'Výslovné opakování po doloženém neodeslání'};assert.equal((await api(r,'/'+row.id+'/retry','POST',body)).status,201);assert.equal((await api(r,'/'+row.id+'/retry','POST',body)).status,409);
 const retry=r.db.prepare('SELECT * FROM email_outbox WHERE retry_of=?').get(row.id),captured=capture();await deliver(r,retry,captured);assert.equal(captured.messages.length,1);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM transactional_email_audit').get().n,2);
 r.db.prepare("UPDATE email_outbox SET status='sending',started_at='2000-01-01' WHERE id=?").run(row.id);await deliverTransactionalEmails(r.env,{transport:captured,id:row.id});assert.equal(r.db.prepare('SELECT status FROM email_outbox WHERE id=?').get(row.id).status,'uncertain');assert.equal(captured.messages.length,1);
});

test('existing authenticated webhook correlates, deduplicates and never calls provider acceptance delivered or read',async t=>{
 const r=memberRuntime();t.after(()=>r.db.close());r.env.SMTP2GO_WEBHOOK_SECRET='isolated-secret';const row=rows(r,'reservation_submitted')[0];
 // Seeded approved row supersedes submission; create a genuine payment event for delivery.
 await patchAdminReservationPayment(request({amountPaidCzk:350},'PATCH'),r.env,admin,'r',origin);const mail=rows(r,'reservation_payment').at(-1);await deliver(r,mail,capture());assert.equal(r.db.prepare('SELECT status FROM email_outbox WHERE id=?').get(mail.id).status,'sent');
 const send=(type,key,secret='isolated-secret')=>handleSmtp2goWebhook(new Request(origin,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+secret},body:JSON.stringify({id:key,event:type,time:1792742400,rcpt:'member@example.invalid',email_id:'email-1',headers:{'X-E36-Mail-Type':'transactional','X-E36-Transaction-Id':mail.id}})}),r.env);
 assert.equal((await send('delivered','delivery','bad')).status,401);assert.equal((await send('processed','processed')).status,200);assert.equal(r.db.prepare('SELECT status FROM email_outbox WHERE id=?').get(mail.id).status,'sent');
 for(let n=0;n<2;n++)assert.equal((await send('delivered','delivery')).status,200);assert.equal(r.db.prepare('SELECT status FROM email_outbox WHERE id=?').get(mail.id).status,'delivered');assert.equal(r.db.prepare('SELECT COUNT(*) n FROM transactional_email_events').get().n,2);
 assert.ok(row);assert.equal((await api(r,'','GET',{},member)).status,403);assert.equal((await api(r,'/templates')).status,200);
});

test('scheduled Worker drains only new recoverable intents without an open page or a live provider',async t=>{
 const r=memberRuntime();t.after(()=>r.db.close());r.env.SMTP2GO_TRANSACTIONAL_API_KEY='captured-only';
 r.db.exec("INSERT INTO email_outbox(id,template_key,recipient_email,subject,status) VALUES('legacy','old','old@example.invalid','Legacy','queued')");
 await patchAdminReservationPayment(request({amountPaidCzk:450},'PATCH'),r.env,admin,'r',origin);
 const before=globalThis.fetch,requests=[],waits=[];
 globalThis.fetch=async(url,options)=>{assert.equal(url,'https://eu-api.smtp2go.com/v3/email/batch');requests.push(JSON.parse(options.body));return Response.json({request_id:'captured',data:[{email_id:'captured-'+requests.length}]})};
 try{await worker.scheduled({},r.env,{waitUntil:p=>waits.push(p)});await Promise.all(waits)}finally{globalThis.fetch=before}
 assert.ok(requests.length>0);assert.equal(r.db.prepare("SELECT status FROM email_outbox WHERE id='legacy'").get().status,'queued');assert.ok(requests.every(r=>r.emails[0].html_body&&r.emails[0].text_body));
});

test('Merch dispatched shipment, withdrawal, complaint and resolution keep literal outcomes and tracking from stored state',async t=>{
 const r=await merchRuntime();t.after(r.close);let order=await r.order({shipping:'address',address:{name:'Test Member',email:'member@example.invalid',phone:'+420777000000',street:'Test 1',city:'Praha',postalCode:'11000'}});const transport=capture();
 const change=async(action,extra={})=>order=await changeOrder(r.env,'admin',order.id,{action,revision:order.revision,operationKey:crypto.randomUUID(),...extra},true);
 await change('paid',{date:new Date().toISOString().slice(0,10)});await change('status',{status:'preparing'});await change('status',{status:'sent',carrier:'Fixture',trackingNumber:'TEST123',trackingUrl:'https://example.invalid/track/TEST123'});
 await deliver(r,rows(r,'merch_sent')[0],transport);assert.match(transport.messages.at(-1).text_body,/TEST123/);assert.ok(!transport.messages.at(-1).text_body.includes('Účet:'));
 for(const action of ['withdraw','complaint']){await change(action,{reason:'Požadavek zákazníka'});await deliver(r,rows(r,'merch_'+action)[0],transport);assert.match(transport.messages.at(-1).text_body,/nikoli jeho automatické schválení/)}
 await change('resolve-request',{requestId:order.state.requests[0].id,reason:'Požadavek byl individuálně vyřízen'});await deliver(r,rows(r,'merch_resolved')[0],transport);assert.match(transport.messages.at(-1).text_body,/individuálně vyřízen/);
 // The previous Worker may finish its own existing outbox sender during additive migration rollout.
 const legacyOrder=await r.order(),legacy=r.db.prepare('SELECT * FROM merch_outbox WHERE order_id=?').get(legacyOrder.id),linked=r.db.prepare('SELECT * FROM email_outbox WHERE source_outbox_id=?').get(legacy.id);
 r.db.prepare("UPDATE merch_outbox SET status='sending' WHERE id=?").run(legacy.id);assert.equal(r.db.prepare('SELECT status FROM email_outbox WHERE id=?').get(linked.id).status,'sending');
 r.db.prepare("UPDATE merch_outbox SET status='sent' WHERE id=?").run(legacy.id);const before=transport.messages.length;await deliver(r,linked,transport);assert.equal(transport.messages.length,before);assert.equal(r.db.prepare('SELECT status FROM email_outbox WHERE id=?').get(linked.id).status,'sent');
});

test('mail intents roll back with failed business batches; current price/confirmed bank changes notify only affected unpaid reservations',async t=>{
 const r=memberRuntime();t.after(()=>r.db.close());const before=rows(r,'reservation_changed').length;
 await assert.rejects(r.env.DB.batch([r.env.DB.prepare("UPDATE reservations SET amount_due_czk=2000 WHERE id='r'"),r.env.DB.prepare("INSERT INTO events(id,year,title) VALUES('e',2026,'Collision')")]));
 assert.equal(r.db.prepare("SELECT amount_due_czk FROM reservations WHERE id='r'").get().amount_due_czk,1000);assert.equal(rows(r,'reservation_changed').length,before);
 r.db.exec("UPDATE events SET payment_account_display='Ověřený nový údaj' WHERE id='e'");assert.equal(rows(r,'reservation_changed').length,before+1);
 r.db.exec("UPDATE events SET payment_account_display='Ověřený nový údaj' WHERE id='e'");assert.equal(rows(r,'reservation_changed').length,before+1);
 r.db.exec("UPDATE reservations SET amount_paid_czk=1000 WHERE id='r'; UPDATE events SET payment_account_display='Další údaj' WHERE id='e'");assert.equal(rows(r,'reservation_changed').length,before+1);
});

test('transactional consent is independent of newsletter, but bounce/spam and explicit suppression remain effective',async t=>{
 const r=memberRuntime();t.after(()=>r.db.close());r.db.exec("UPDATE mailing_contacts SET mailing_consent_status='no',suppression_status='unsubscribed' WHERE current_member_id='m'; UPDATE reservations SET amount_paid_czk=300 WHERE id='r'");const first=rows(r,'reservation_payment').at(-1),transport=capture();
 await deliver(r,first,transport);assert.equal(transport.messages.length,1);
 r.db.prepare("INSERT INTO transactional_email_events VALUES('bounce',?,'bounce-key','hard_bounce',CURRENT_TIMESTAMP)").run(first.id);
 r.db.exec("UPDATE reservations SET amount_paid_czk=400 WHERE id='r'");const second=rows(r,'reservation_payment').at(-1);await deliver(r,second,transport);assert.equal(transport.messages.length,1);assert.equal(r.db.prepare('SELECT status FROM email_outbox WHERE id=?').get(second.id).status,'blocked');
});

test('delayed approval and payment receipt recompute settlement, and provider webhook arriving before send response stays delivered',async t=>{
 const r=memberRuntime();t.after(()=>r.db.close());setPayment(r);
 await patchAdminReservation(request({status:'pending'},'PATCH'),r.env,admin,'r',origin);await patchAdminReservation(request({status:'approved'},'PATCH'),r.env,admin,'r',origin);
 const approved=rows(r,'reservation_approved').at(-1);await patchAdminReservationPayment(request({amountPaidCzk:1000},'PATCH'),r.env,admin,'r',origin);
 const transport=capture();await deliver(r,approved,transport);assert.match(transport.messages[0].text_body,/Teď nemusíš nic dělat/);assert.ok(!transport.messages[0].text_body.includes('Účet:'));
 r.env.SMTP2GO_WEBHOOK_SECRET='isolated';const payment=rows(r,'reservation_payment').at(-1);
 await deliver(r,payment,{async sendBatch(emails){const id=emails[0].custom_headers.find(h=>h.header==='X-E36-Transaction-Id').value;
  const response=await handleSmtp2goWebhook(new Request(origin,{method:'POST',headers:{Authorization:'Bearer isolated','Content-Type':'application/json'},body:JSON.stringify({id:'early-delivery',event:'delivered',time:1792742400,email_id:'early-id',rcpt:'member@example.invalid',headers:{'X-E36-Mail-Type':'transactional','X-E36-Transaction-Id':id}})}),r.env);assert.equal(response.status,200);return {requestId:'early-request',emailIds:['early-id']}}});
 assert.equal(r.db.prepare('SELECT status FROM email_outbox WHERE id=?').get(payment.id).status,'delivered');
});

test('webhook without custom headers requires an exact saved provider ID and recipient, never an address-only match',async t=>{
 const r=memberRuntime();t.after(()=>r.db.close());r.env.SMTP2GO_WEBHOOK_SECRET='isolated';
 await patchAdminReservationPayment(request({amountPaidCzk:500},'PATCH'),r.env,admin,'r',origin);
 const mail=rows(r,'reservation_payment').at(-1);await deliver(r,mail,capture());
 const hook=(emailId,email)=>handleSmtp2goWebhook(new Request(origin,{method:'POST',headers:{Authorization:'Bearer isolated','Content-Type':'application/json'},body:JSON.stringify({id:'without-headers-'+emailId+email,event:'delivered',time:1792742400,email_id:emailId,rcpt:email})}),r.env);
 for(const [id,email]of [['unknown','member@example.invalid'],['email-1','other@example.invalid']]){assert.equal((await hook(id,email)).status,200);assert.equal(r.db.prepare('SELECT status FROM email_outbox WHERE id=?').get(mail.id).status,'sent')}
 assert.equal((await hook('email-1','member@example.invalid')).status,200);assert.equal(r.db.prepare('SELECT status FROM email_outbox WHERE id=?').get(mail.id).status,'delivered');
});

test('audited guest invitation retries retain the existing one-use identity and redact its token from Admin previews',async t=>{
 const r=arrivalsRuntime();t.after(()=>r.db.close());await seedArrivals(r);
 const revision=(await arrivalList(r.env,EVENT)).revision,url=new URL(origin+'/api/admin/events/'+EVENT+'/arrivals');
 const response=await routeArrivals({request:new Request(url,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'invitation-test','If-Match':String(revision)},body:JSON.stringify({id:'invited-guest',model:'BMW guest',body:'Touring',crew:1,cash:500,matchesReviewed:true,email:'invited@example.invalid'})}),url,env:r.env,auth:admin,origin});
 assert.equal(response.status,200,await response.clone().text());let mail=rows(r,'arrival_invitation')[0];assert.ok(mail);
 const token=JSON.parse(mail.payload_json).token,invitation=r.db.prepare('SELECT * FROM arrival_invitations WHERE outbox_id=?').get(mail.id),transport=capture();
 for(let n=0;n<2;n++){
  await deliver(r,mail,{async sendBatch(){throw {code:'provider_rejected',definiteRejection:true}}});
  const retry=await api(r,'/'+mail.id+'/retry','POST',{reason:'Ověřené odmítnutí, výslovně opakuji pozvánku'});assert.equal(retry.status,201,await retry.clone().text());
  mail=r.db.prepare('SELECT * FROM email_outbox WHERE id=?').get((await retry.json()).id);
 }
 const preview=await (await api(r,'/'+mail.id)).json();assert.ok(!JSON.stringify(preview).includes(token));
 await deliver(r,mail,transport);assert.equal(transport.messages.length,1);assert.deepEqual(transport.messages[0].to,['invited@example.invalid']);assert.ok(transport.messages[0].text_body.includes(token));
 assert.deepEqual(r.db.prepare('SELECT * FROM arrival_invitations WHERE id=?').get(invitation.id),invitation);assert.equal(r.db.prepare("SELECT payload_json FROM email_outbox WHERE id=?").get(mail.id).payload_json,null);
 assert.deepEqual(r.db.prepare('PRAGMA foreign_key_check').all(),[]);
});

for(const enabled of [false,true])test(`Worker webhook records delivery without scheduling or sending queued mail (transport ${enabled?'on':'off'})`,async t=>{
 const r=await merchRuntime();t.after(r.close);Object.assign(r.env,{SMTP2GO_WEBHOOK_SECRET:'isolated-callback',SMTP2GO_TRANSACTIONAL_API_KEY:'captured-only'});
 const delivered=await r.order(),queued=await r.order();
 const first=rows(r,'merch_confirmation').find(row=>row.entity_id===delivered.id),second=rows(r,'merch_confirmation').find(row=>row.entity_id===queued.id);
 r.db.prepare("UPDATE email_outbox SET status='sent',provider_message_id='already-sent' WHERE id=?").run(first.id);
 if(!enabled)r.db.exec('UPDATE transactional_email_control SET enabled=0 WHERE id=1');
 const previous=globalThis.fetch,calls=[],waits=[];globalThis.fetch=async(url,options)=>{calls.push(url);return Response.json({request_id:'unexpected-send',data:JSON.parse(options.body).emails.map((_,i)=>({email_id:'unexpected-'+i}))})};
 try{
  const body={id:'actual-handler-callback',event:'delivered',email_id:'already-sent',rcpt:'member@example.invalid',time:1792742400,'X-E36-Mail-Type':'transactional','X-E36-Transaction-Id':first.id};
  const req=new Request('https://api.e36united.cz/api/mailing/smtp2go-webhook',{method:'POST',headers:{Authorization:'Bearer isolated-callback','Content-Type':'application/json'},body:JSON.stringify(body)});
  const response=await worker.fetch(req,r.env,{waitUntil:p=>waits.push(p)});await Promise.all(waits);
  assert.equal(response.status,200);assert.equal((await response.json()).inserted,1);
  assert.equal(r.db.prepare('SELECT status FROM email_outbox WHERE id=?').get(first.id).status,'delivered');
  assert.equal(calls.length,0,'a provider callback must not send unrelated queued mail');
  assert.equal(waits.length,0,'a provider callback must not schedule an outbox drain');
  assert.deepEqual({...r.db.prepare('SELECT status,attempts FROM email_outbox WHERE id=?').get(second.id)},{status:'queued',attempts:0});
 }finally{await Promise.all(waits);globalThis.fetch=previous}
});
