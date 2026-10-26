import test from 'node:test';
import assert from 'node:assert/strict';
import {merchRuntime} from './helpers/merch-runtime.mjs';
import {changeOrder,readOrder} from '../worker/domains/merch/service.js';
import {deliverTransactionalEmails,transactionalContent} from '../worker/domains/mailing/transactional.js';
import {renderTransactionalEmail} from '../worker/domains/mailing/transactional-template.js';
import {handleSmtp2goWebhook} from '../worker/domains/mailing/tracking.js';
import {orderMarkup} from '../merch/order-view.js';
import {routeMerch} from '../worker/domains/merch/index.js';
import {routeTransactionalEmails} from '../worker/domains/mailing/transactional-routes.js';

const address={name:'Isolated Member',email:'member@example.invalid',phone:'+420777000000',street:'Test 1',city:'Praha',postalCode:'11000'};
const mail=(r,id,kind)=>r.db.prepare('SELECT * FROM email_outbox WHERE entity_id=? AND template_key=? ORDER BY rowid DESC').get(id,kind);
const mails=r=>r.db.prepare('SELECT COUNT(*) n FROM email_outbox WHERE tx_version=1').get().n;
async function setup(t,shipping='pickup'){
 const r=await merchRuntime();t.after(r.close);r.db.exec('UPDATE transactional_email_control SET enabled=1 WHERE id=1');
 let order=await r.order({shipping,address});
 return {r,get order(){return order},async change(action,extra={},operationKey=crypto.randomUUID()){
  const input={action,revision:order.revision,operationKey,...extra};order=await changeOrder(r.env,'admin',order.id,input,true);return {order,input};
 }};
}
const capture=()=>{const messages=[];return {messages,async sendBatch(items){messages.push(...items);return {emailIds:['mail-'+messages.length],requestId:'request-'+messages.length}}}};
async function render(r,id,kind){const row=mail(r,id,kind);assert.ok(row,kind+' has a real business intent');const data=await transactionalContent(r.env,row);assert.ok(data);return renderTransactionalEmail(kind,data)}

for(const shipping of ['pickup','address'])test(`ready copy and order UI respect the stored ${shipping} mode`,async t=>{
 const x=await setup(t,shipping);await x.change('paid',{date:new Date().toISOString().slice(0,10)});await x.change('status',{status:'preparing'});await x.change('status',{status:'ready'});
 const message=await render(x.r,x.order.id,'merch_ready'),markup=orderMarkup(x.order,{admin:true});
 if(shipping==='address'){
  assert.match(message.subject,/připravená k odeslání/);assert.doesNotMatch(message.text,/Pokyny k převzetí|převezmi podle/);
  assert.match(markup,/Připraveno k odeslání/);assert.doesNotMatch(markup,/Připraveno k převzetí/);
 }else{assert.match(message.subject,/připravená k převzetí/);assert.match(message.text,/Pokyny k převzetí/);assert.match(markup,/Připraveno k převzetí/)}
 assert.match(message.text,/Zbývá: 0/);assert.doesNotMatch(message.text,/Účet:/);
});

for(const shipping of ['pickup','address'])test(`completion of ${shipping} order emits one truthful intent and idempotent retry`,async t=>{
 const x=await setup(t,shipping),{r}=x,transport=capture();
 await x.change('paid',{date:new Date().toISOString().slice(0,10)});await x.change('status',{status:'preparing'});
 await x.change('status',shipping==='pickup'?{status:'ready'}:{status:'sent',carrier:'Fixture',trackingNumber:'TEST123',trackingUrl:'https://example.invalid/track/TEST123'});
 const before=mails(r),done=await x.change('status',{status:'completed'});
 assert.equal(mails(r),before+1);assert.equal(mail(r,x.order.id,'merch_completed').status,'queued');
 await changeOrder(r.env,'admin',x.order.id,done.input,true);assert.equal(mails(r),before+1);
 await deliverTransactionalEmails(r.env,{id:mail(r,x.order.id,'merch_completed').id,transport});
 await deliverTransactionalEmails(r.env,{id:mail(r,x.order.id,'merch_completed').id,transport});assert.equal(transport.messages.length,1);
 assert.match(transport.messages[0].text_body,/Objednávka je dokončená/);assert.match(transport.messages[0].text_body,new RegExp(x.order.number));
 assert.match(transport.messages[0].text_body,/UNITED tým/);assert.doesNotMatch(transport.messages[0].text_body,/Účet:|Uhraď/);
 assert.equal((await readOrder(r.env,x.order.id,'member')).state.status,'completed');assert.deepEqual(r.db.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('marking a shipment completed preserves tracking and immutable checkout snapshot',async t=>{
 const x=await setup(t,'address'),snapshot=structuredClone(x.order.snapshot);
 await x.change('paid',{date:new Date().toISOString().slice(0,10)});await x.change('status',{status:'preparing'});
 await x.change('status',{status:'sent',carrier:'Fixture',trackingNumber:'TEST123',trackingUrl:'https://example.invalid/track/TEST123'});const tracking=structuredClone(x.order.state.tracking);
 await x.change('status',{status:'completed'});assert.deepEqual(x.order.state.tracking,tracking);assert.deepEqual(x.order.snapshot,snapshot);
 // A queued dispatch message may still be sent after completion: it must retain shipment evidence.
 assert.match((await render(x.r,x.order.id,'merch_sent')).text,/TEST123/);
});

test('authenticated webhook projection is deduplicated and based on event chronology, not callback arrival',async t=>{
 const x=await setup(t),{r}=x;r.env.SMTP2GO_WEBHOOK_SECRET='isolated-only';const row=mail(r,x.order.id,'merch_confirmation');
 r.db.exec("INSERT INTO mailing_contacts(id,email,normalized_email,deliverability_status) VALUES('contact','member@example.invalid','member@example.invalid','deliverable')");
 await deliverTransactionalEmails(r.env,{id:row.id,transport:capture()});
 const state=()=>r.db.prepare('SELECT status,error_message,delivered_at FROM email_outbox WHERE id=?').get(row.id);
 const hook=async(event,id,time,extra={})=>{
  const response=await handleSmtp2goWebhook(new Request('https://api.e36united.cz/api/mailing/smtp2go-webhook',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer isolated-only'},body:JSON.stringify({event,id,time,email_id:'mail-1',rcpt:'member@example.invalid',headers:{'X-E36-Mail-Type':'transactional','X-E36-Transaction-Id':row.id},...extra})}),r.env);
  assert.equal(response.status,200);return response.json();
 };
 await hook('bounce','soft',1792742400,{bounce:'soft'});assert.equal(state().error_message,'soft_bounce');
 await hook('delivered','delivered',1792742460);assert.equal(state().status,'delivered');assert.equal(state().error_message,null);
 assert.equal((await hook('bounce','soft',1792742400,{bounce:'soft'})).inserted,0);
 await hook('bounce','older-soft',1792742390,{bounce:'soft'});assert.equal(state().error_message,null);
 // Even a malformed duplicate with a different payload must not alter the persisted event projection.
 assert.equal((await hook('bounce','delivered',1792742500,{bounce:'soft'})).inserted,0);assert.equal(state().error_message,null);
 assert.equal((await hook('bounce','delivered',1792742500,{bounce:'hard'})).inserted,0);
 assert.equal(r.db.prepare("SELECT deliverability_status FROM mailing_contacts WHERE id='contact'").get().deliverability_status,'deliverable');
 await hook('bounce','hard',1792742500,{bounce:'hard'});await hook('processed','late-processed',1792742350);
 assert.equal(state().status,'failed');assert.equal(state().error_message,'hard_bounce');
 await hook('bounce','later-soft',1792742510,{bounce:'soft'});assert.equal(state().error_message,'hard_bounce');
 assert.equal(r.db.prepare('SELECT COUNT(*) n FROM transactional_email_events WHERE outbox_id=?').get(row.id).n,6);
});

test('real Merch routes recover lost create/payment responses and rejected mail without duplicate orders or money',async t=>{
 const r=await merchRuntime();t.after(r.close);r.db.exec('UPDATE transactional_email_control SET enabled=1 WHERE id=1');
 const call=async(path,method='GET',body,admin=false)=>{
  const url=new URL('https://api.e36united.cz/api/'+(admin?'admin/':'')+'merch'+path);
  const response=await routeMerch({env:r.env,url,auth:{uid:admin?'admin':'member'},origin:'https://e36united.cz',request:new Request(url,{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})})},admin);
  assert.equal(response.status,200);return response.json();
 };
 const q=await call('/quote','POST',r.input),input={...r.input,requestKey:'lost-create-response',quoteHash:q.hash,termsVersion:q.quote.termsVersion,termsAccepted:true};
 const [first,second]=await Promise.all([call('/orders','POST',input),call('/orders','POST',input)]);
 assert.equal(first.order.id,second.order.id);const id=first.order.id;assert.equal(r.db.prepare('SELECT COUNT(*) n FROM merch_orders').get().n,1);
 assert.equal((await call('/requests/'+input.requestKey)).order.id,id);assert.equal((await call('/orders/'+id,'GET',undefined,true)).order.id,id);
 const snapshot=structuredClone(first.order.snapshot),confirmation=mail(r,id,'merch_confirmation');
 await deliverTransactionalEmails(r.env,{id:confirmation.id,transport:{async sendBatch(){throw {code:'provider_rejected',definiteRejection:true}}}});
 assert.equal(mail(r,id,'merch_confirmation').status,'failed');assert.equal((await call('/orders','POST',input)).order.id,id);
 const retryUrl=new URL('https://api.e36united.cz/api/admin/mailing/transactional/'+confirmation.id+'/retry');
 const retry=await routeTransactionalEmails({env:r.env,url:retryUrl,auth:{uid:'admin'},origin:'https://e36united.cz',request:new Request(retryUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason:'Výslovný retry jednoznačně odmítnutého potvrzení'})})});assert.equal(retry.status,201);
 const replacement=r.db.prepare('SELECT * FROM email_outbox WHERE retry_of=?').get(confirmation.id),transport=capture();await deliverTransactionalEmails(r.env,{id:replacement.id,transport});
 assert.equal(transport.messages.length,1);assert.match(transport.messages[0].text_body,new RegExp(first.order.variableSymbol));assert.match(transport.messages[0].text_body,/Účet: 19-2000145399\/0800/);
 let order=(await call('/orders/'+id)).order;const pay={action:'payment',amountMinor:20000,date:new Date().toISOString().slice(0,10),revision:order.revision,operationKey:'lost-partial-payment'};
 await call('/orders/'+id,'PATCH',pay,true);order=(await call('/orders/'+id,'PATCH',pay,true)).order;
 assert.equal(order.state.payments.length,1);assert.equal(order.payment.remainingMinor,snapshot.totalMinor-20000);assert.match(order.payment.spayd,/AM:690.00/);
 await deliverTransactionalEmails(r.env,{id:mail(r,id,'merch_payment').id,transport});assert.match(transport.messages.at(-1).text_body,/Zbývá: 690/);
 order=(await call('/orders/'+id,'PATCH',{action:'paid',date:pay.date,revision:order.revision,operationKey:'balance'},true)).order;
 assert.equal(order.payment.remainingMinor,0);assert.equal(order.payment.spayd,null);assert.equal(order.state.payments.length,2);
 await deliverTransactionalEmails(r.env,{id:mail(r,id,'merch_payment').id,transport});assert.match(transport.messages.at(-1).text_body,/Zbývá: 0/);assert.doesNotMatch(transport.messages.at(-1).text_body,/Účet:/);
 order=(await call('/orders/'+id,'PATCH',{action:'cancel',revision:order.revision,operationKey:'cancel'},true)).order;assert.equal(order.state.status,'cancelled');assert.equal(order.payment.paidMinor,snapshot.totalMinor);
 const refund={action:'refund',amountMinor:snapshot.totalMinor,reason:'Izolovaně ověřené vrácení',revision:order.revision,operationKey:'refund'};
 await call('/orders/'+id,'PATCH',refund,true);order=(await call('/orders/'+id,'PATCH',refund,true)).order;
 assert.equal(order.state.refunds.length,1);assert.equal(order.payment.refundedMinor,snapshot.totalMinor);assert.deepEqual(order.snapshot,snapshot);
 await deliverTransactionalEmails(r.env,{id:mail(r,id,'merch_refund').id,transport});assert.match(transport.messages.at(-1).text_body,/Vrácená částka: 890/);assert.doesNotMatch(transport.messages.at(-1).text_body,/Účet:/);
 assert.equal(r.db.prepare('SELECT COUNT(*) n FROM merch_orders').get().n,1);assert.deepEqual(r.db.prepare('PRAGMA foreign_key_check').all(),[]);
});
