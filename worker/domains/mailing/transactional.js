import {createSmtp2goAdapter,senderConfig} from './provider/smtp2go.js';
import {renderTransactionalEmail,portalLink,czk} from './transactional-template.js';
import {reservationPayment} from '../reservations/payments.js';
import {readOrder} from '../merch/service.js';

const one=(env,sql,...args)=>env.DB.prepare(sql).bind(...args).first();
export async function transactionalReady(env){return !!await one(env,"SELECT id FROM schema_migrations WHERE id='2026-10-23-transactional-emails'")}
export async function transactionalTransportState(env){
 try{
  if(!await transactionalReady(env))return {enabled:false,phase:'unavailable',activatedAt:null,revision:null};
  const c=await one(env,'SELECT enabled,activated_at,revision FROM transactional_email_control WHERE id=1');
  if(!c||![0,1].includes(c.enabled)||!Number.isSafeInteger(c.revision)||c.revision<0||c.activated_at!==null&&(!c.activated_at||!Number.isFinite(Date.parse(c.activated_at))))return {enabled:false,phase:'unavailable',activatedAt:null,revision:null};
  const enabled=c.enabled===1&&c.activated_at!==null;
  return {enabled,phase:!c.activated_at?'not_activated':enabled?'enabled':'paused',activatedAt:c.activated_at,revision:c.revision};
 }catch{return {enabled:false,phase:'unavailable',activatedAt:null,revision:null}}
}
const paymentNext=p=>!p.actionable?'Teď nemusíš nic dělat.':p.configurationReady?'Zbývající částku uhraď podle uvedených údajů. Aktuální platební QR najdeš bezpečně v portálu.':'Zbývá doplatek. Aktuální ověřené platební instrukce zkontroluj v portálu.';
const paymentFacts=p=>[['Celkem',czk(p.amountDueCzk)],['Celkem uhrazeno',czk(p.amountPaidCzk)],['Zbývá',czk(p.remainingCzk)],...(p.overpaymentCzk?[['Přeplatek',czk(p.overpaymentCzk)]]:[]),...(p.actionable&&p.configurationReady?[['Účet',p.accountDisplay],['Variabilní symbol',p.variableSymbol],['Splatnost',p.deadline]]:[])];
export async function transactionalContent(env,row){
 const payload=JSON.parse(row.payload_json||'{}'),kind=row.template_key;
 if(row.entity_type==='account'){
  const m=await one(env,"SELECT * FROM members WHERE id=? AND status='active'",row.member_id);
  if(!m||m.email.toLowerCase()!==row.recipient_email.toLowerCase())return null;
  return {reference:m.member_code,facts:[['Jméno',m.name],['Členský kód',m.member_code]],url:portalLink('account'),next:'Doplň profil, auto a případně si samostatně podej rezervaci na sraz. Samotný účet účast nerezervuje.'};
 }
 if(row.entity_type==='arrival'){
  const i=await one(env,`WITH RECURSIVE attempts(id,retry_of) AS (
   SELECT id,retry_of FROM email_outbox WHERE id=?
   UNION ALL SELECT o.id,o.retry_of FROM email_outbox o JOIN attempts a ON o.id=a.retry_of
  ) SELECT i.*,e.title FROM arrival_invitations i JOIN event_arrivals a ON a.id=i.arrival_id JOIN events e ON e.id=a.event_id
   WHERE i.outbox_id IN (SELECT id FROM attempts) AND i.consumed_at IS NULL AND i.expires_at>datetime('now')`,row.id);
  if(!i||!payload.token||i.email.toLowerCase()!==row.recipient_email.toLowerCase())return null;
  return {reference:i.title,facts:[['Platnost odkazu',i.expires_at]],url:'https://e36united.cz/member.html#arrival-invite='+encodeURIComponent(payload.token),next:'Přihlas se nebo založ účet a ověř e-mail. Potom výslovně potvrď propojení účasti. Odkaz je jednorázový; jeho otevření účast samo nepřipojí. Newsletter tím nezapínáš.'};
 }
 if(row.entity_type==='preliminary'){
  const p=await one(env,"SELECT p.*,m.email,e.title FROM preliminary_reservations p JOIN members m ON m.id=p.member_id JOIN events e ON e.id=p.event_id WHERE p.id=? AND p.status='active'",row.entity_id);
  if(!p||p.email.toLowerCase()!==row.recipient_email.toLowerCase())return null;
  const data=JSON.parse(p.preferences_json);return {reference:p.title,facts:[['Příjezd',data.arrival],['Posádka',data.crew],['Ubytování',data.accommodation]],url:portalLink('reservation'),next:'Teď nic neplať. Plán je nezávazný; skutečnou rezervaci odešleš samostatně po otevření registrací.'};
 }
 if(row.entity_type==='reservation'||row.entity_type==='request'){
  const r=await one(env,`SELECT r.*,m.email,e.title,e.year AS event_year,e.currency AS payment_currency,e.payment_deadline,e.payment_recipient_name,e.payment_account_display,e.payment_iban,e.payment_message_prefix,e.payment_test_mode,
   (SELECT member_comment FROM reservation_member_comments WHERE reservation_id=r.id) public_comment FROM reservations r JOIN members m ON m.id=r.member_id JOIN events e ON e.id=r.event_id WHERE r.id=?`,row.reservation_id);
  if(!r||r.email.toLowerCase()!==row.recipient_email.toLowerCase())return null;
  let request=null;
  if(row.entity_type==='request'){
   request=await one(env,'SELECT * FROM reservation_requests WHERE id=? AND reservation_id=?',row.entity_id,r.id);
   if(!request||(['request_change','request_cancellation'].includes(kind)&&request.status!=='pending')||(kind==='request_approved'&&request.status!=='approved')||(kind==='request_rejected'&&request.status!=='rejected'))return null;
   const latest=await one(env,'SELECT id FROM reservation_requests WHERE reservation_id=? ORDER BY rowid DESC LIMIT 1',r.id);
   if(latest?.id!==request.id||kind==='request_rejected'&&r.status==='cancelled'||['request_change','request_cancellation'].includes(kind)&&!['pending','approved'].includes(r.status))return null;
  }
  if((kind==='reservation_submitted'&&r.status!=='pending')||(['reservation_approved','request_approved','reservation_changed'].includes(kind)&&r.status!=='approved')||(kind==='reservation_cancelled'&&r.status!=='cancelled')||(kind==='reservation_rejected'&&r.status!=='rejected'))return null;
  const p=reservationPayment(r),actionable=['reservation_approved','request_approved','reservation_changed','reservation_payment'].includes(kind)&&r.status==='approved';
  const details={reference:r.id,facts:[['Ročník',r.title],['Rezervace',r.id],['Příjezd',r.arrival],['Posádka',r.crew],['Ubytování',r.accommodation]],comment:request?.admin_comment||r.public_comment,url:portalLink(kind.includes('payment')||kind==='reservation_changed'?'payments':'reservation',{reservation:r.id,event:r.event_id})};
  if(request)details.facts.push(['Žádost',request.id]);
  if(kind==='reservation_payment'){
   details.facts.push([payload.deltaCzk>=0?'Přijatá částka':'Oprava evidence úhrady',czk(payload.deltaCzk)]);
   if(payload.deltaCzk<0)details.title='Evidence platby byla opravena';
  }
  if(actionable){details.facts.push(...paymentFacts(p));details.next=paymentNext(p)}
  else if(kind==='reservation_payment'){details.facts.push(...paymentFacts(p));details.next='Teď neposílej novou platbu. Aktuální stav rezervace a finanční vypořádání najdeš v portálu.'}
  else if(kind==='reservation_cancelled')details.next='Teď nemusíš nic dělat. Případná refundace vyžaduje samostatné vypořádání a není touto zprávou potvrzená.';
  else if(['reservation_submitted','request_change','request_cancellation'].includes(kind))details.next='Počkej na rozhodnutí UNITED týmu. Z této zprávy nevzniká nová povinnost platby.';
  return details;
 }
 if(row.entity_type==='merch'){
  const o=await readOrder(env,row.entity_id),s=o.snapshot,p=o.payment;
  if((kind==='merch_confirmation'&&['cancelled','expired'].includes(o.state.status))||(kind==='merch_ready'&&o.state.status!=='ready')||(kind==='merch_sent'&&!['sent','completed'].includes(o.state.status))||(kind==='merch_completed'&&o.state.status!=='completed')||(kind==='merch_cancelled'&&o.state.status!=='cancelled'))return null;
  if(['merch_cancel_request','merch_withdraw','merch_complaint'].includes(kind)){
   const match=o.state.requests.find(r=>payload.event?.requestId?r.id===payload.event.requestId:r.kind===payload.event?.action&&r.at===payload.event?.at);
   if(!match||match.resolved||kind==='merch_cancel_request'&&o.state.status==='cancelled')return null;
  }
  const active=!['cancelled','expired','completed'].includes(o.state.status),remaining=active?p.remainingMinor:0;
  const facts=[['Objednávka',o.number],['Cena položek',czk(s.lines.reduce((n,l)=>n+l.unitPriceMinor*l.quantity,0)/100)],['Sleva',czk(s.discountMinor/100)],['Doprava',czk(s.shippingMinor/100)],['Celkem',czk(s.totalMinor/100)],['Celkem uhrazeno',czk(p.paidMinor/100)],['Evidované refundace',czk(p.refundedMinor/100)],['Zbývá',czk(remaining/100)]];
  if(payload.event?.amountMinor)facts.push([kind==='merch_refund'?'Vrácená částka':'Částka operace',czk(payload.event.amountMinor/100)]);
  facts.push(['Způsob převzetí',s.shipping==='address'?'Doručení na adresu':'Osobní převzetí']);
  if(remaining&&kind!=='merch_refund')facts.push(['Účet',s.bank.accountDisplay],['Variabilní symbol',o.variableSymbol],['Platba do',o.expiresAt]);
  if(kind==='merch_ready'&&s.shipping==='pickup')facts.push(['Pokyny k převzetí',s.pickupInstructions||'Pokyny ověř u UNITED týmu.']);
  if(kind==='merch_sent')facts.push(['Dopravce',o.state.tracking?.carrier],['Sledovací číslo',o.state.tracking?.number],['Sledování',o.state.tracking?.url]);
  const address=o.state.deliveryAddress||s.address;if(s.shipping==='address')facts.push(['Doručení',[address.name,address.street,address.city,address.postalCode].filter(Boolean).join(', ')]);
  return {reference:o.number,facts,items:s.lines.map(l=>({...l,imageUrl:l.image?.startsWith('r2:')?'https://api.e36united.cz/api/merch/media/'+encodeURIComponent(l.image.slice(3)):/^[a-z0-9-]+$/.test(l.image||'')?'https://e36united.cz/assets/images/merch/'+l.image+'-card.webp':null})),
   ...(kind==='merch_ready'&&s.shipping==='address'?{title:'Objednávka je připravená k odeslání',intro:'Objednávku jsme připravili. O jejím odeslání dostaneš samostatnou zprávu.'}:{}),
   ...(payload.event?.action==='void-payment'?{title:'Evidence úhrady objednávky byla opravena'}:{}),comment:['merch_resolved','merch_refund'].includes(kind)?payload.event?.reason:null,url:portalLink('merch',{order:o.id}),next:kind==='merch_refund'?'Teď nemusíš nic dělat. Zpráva potvrzuje zaevidované vrácení peněz; nepředstavuje novou výzvu k úhradě.':['merch_cancel_request','merch_withdraw','merch_complaint'].includes(kind)?'Počkej na vyřízení požadavku UNITED týmem. Přijetí požadavku není potvrzením zrušení ani refundace.':remaining?'Uhraď pouze aktuální zbývající částku. QR a platbu najdeš v detailu objednávky.':kind==='merch_ready'?(s.shipping==='pickup'?'Objednávku převezmi podle uvedených pokynů.':'Počkej na zprávu o odeslání. Teď nemusíš nic dělat.'):'Teď nemusíš nic dělat.'};
 }
 return null;
}
async function sourceStatus(env,row,status,error=null){if(row.source_outbox_id)await env.DB.prepare('UPDATE merch_outbox SET status=?,error_code=?,sent_at=CASE WHEN ?=\'sent\' THEN CURRENT_TIMESTAMP ELSE sent_at END WHERE id=?').bind(status,error,status,row.source_outbox_id).run()}
const safeErrors=new Set(['before_initial_activation','provider_not_configured','provider_invalid_key','provider_rate_limit','provider_rejected','provider_timeout','provider_unavailable','provider_malformed','provider_batch_ambiguous','suppressed_address','content_unavailable','hard_bounce','soft_bounce','blocked','rejected']);
export const safeEmailError=code=>safeErrors.has(code)?code:'delivery_unconfirmed';
export async function deliverTransactionalEmails(env,{transport,limit=5,id,arrivalId,orderId}={}){
 const control=await transactionalTransportState(env);if(!control.enabled)return {processed:0,transport:control};
 // A crash after hand-off cannot be distinguished from accepted mail: never blind-retry.
 await env.DB.prepare("UPDATE email_outbox SET status='uncertain',error_message='delivery_unconfirmed' WHERE tx_version=1 AND status='sending' AND started_at<datetime('now','-10 minutes')").run();
 await env.DB.prepare("UPDATE merch_outbox SET status='uncertain',error_code='delivery_unconfirmed' WHERE status='sending' AND id IN (SELECT source_outbox_id FROM email_outbox WHERE tx_version=1 AND status='uncertain')").run();
 if(!transport&&!env.SMTP2GO_TRANSACTIONAL_API_KEY)return {processed:0};
 const rows=await env.DB.prepare(`SELECT * FROM email_outbox WHERE tx_version=1 AND status='queued'
  ${id?'AND id=?':''}${arrivalId?"AND entity_type='arrival' AND entity_id=?":''}${orderId?"AND entity_type='merch' AND entity_id=?":''} ORDER BY created_at,id LIMIT ?`).bind(...[id,arrivalId,orderId].filter(Boolean),Math.min(5,Math.max(1,limit))).all();
 const provider=transport||createSmtp2goAdapter(env,{purpose:'transactional'}),sender=senderConfig(env);let processed=0;
 for(const row of rows.results){
  const lock=await env.DB.prepare("UPDATE email_outbox SET status='sending',started_at=CURRENT_TIMESTAMP,attempts=attempts+1 WHERE id=? AND status='queued' AND EXISTS(SELECT 1 FROM transactional_email_control WHERE id=1 AND enabled=1 AND activated_at IS NOT NULL AND revision=?)").bind(row.id,control.revision).run();if(!lock.meta.changes)continue;
  processed++;
  let handedOff=false;
  try{
   const suppression=await one(env,`SELECT 1 FROM mailing_contacts WHERE normalized_email=lower(?) AND (deliverability_status IN ('hard_bounce','blocked') OR suppression_status IN ('hard_bounce','blocked','manually_suppressed'))
    UNION ALL SELECT 1 FROM email_outbox o JOIN transactional_email_events e ON e.outbox_id=o.id WHERE lower(o.recipient_email)=lower(?) AND e.event_type IN ('hard_bounce','blocked') LIMIT 1`,row.recipient_email,row.recipient_email);
   if(suppression){await env.DB.prepare("UPDATE email_outbox SET status='blocked',error_message='suppressed_address' WHERE id=? AND status='sending'").bind(row.id).run();await sourceStatus(env,row,'failed','suppressed_address');continue}
   const data=await transactionalContent(env,row);
   if(!data){await env.DB.prepare("UPDATE email_outbox SET status='superseded',error_message='content_unavailable' WHERE id=? AND status='sending'").bind(row.id).run();await sourceStatus(env,row,'failed','content_unavailable');continue}
   const message=renderTransactionalEmail(row.template_key,data);
   const permission=await env.DB.prepare("UPDATE email_outbox SET subject=?,rendered_html=?,rendered_text=? WHERE id=? AND status='sending' AND EXISTS(SELECT 1 FROM transactional_email_control WHERE id=1 AND enabled=1 AND activated_at IS NOT NULL AND revision=?)").bind(message.subject,message.html,message.text,row.id,control.revision).run();
   if(!permission.meta.changes){await env.DB.prepare("UPDATE email_outbox SET status='queued',started_at=NULL WHERE id=? AND status='sending'").bind(row.id).run();continue}
   handedOff=true;
   const result=await provider.sendBatch([{sender:sender.sender,to:[row.recipient_email],subject:message.subject,html_body:message.html,text_body:message.text,custom_headers:[{header:'Reply-To',value:sender.replyTo},{header:'X-E36-Mail-Type',value:'transactional'},{header:'X-E36-Transaction-Id',value:row.id}]}]);
   if(!result?.emailIds?.[0])throw {code:'provider_malformed'};
   await env.DB.prepare("UPDATE email_outbox SET status=CASE WHEN delivered_at IS NOT NULL THEN 'delivered' ELSE 'sent' END,provider_message_id=?,provider_request_id=?,sent_at=COALESCE(sent_at,CURRENT_TIMESTAMP),payload_json=CASE WHEN template_key='arrival_invitation' THEN NULL ELSE payload_json END WHERE id=? AND status IN ('sending','sent','delivered')").bind(result.emailIds[0],result.requestId||null,row.id).run();
   await sourceStatus(env,row,'sent');
  }catch(error){
   const status=!handedOff||error.definiteRejection?'failed':'uncertain',code=safeEmailError(error.code||(!handedOff?'content_unavailable':null));
   await env.DB.prepare("UPDATE email_outbox SET status=?,error_message=? WHERE id=? AND status='sending'").bind(status,code,row.id).run();await sourceStatus(env,row,status,code);
  }
 }
 return {processed};
}

export async function recordTransactionalWebhook(env,event,outboxId){
 if(!await transactionalReady(env))return {ignored:1};
 const row=await one(env,`SELECT * FROM email_outbox WHERE tx_version=1 AND lower(recipient_email)=? AND
  ((provider_message_id IS NOT NULL AND provider_message_id=?) OR (id=? AND (provider_message_id IS NULL OR provider_message_id=?))) LIMIT 1`,event.email,event.emailId,outboxId,event.emailId);
 if(!row)return {ignored:1};
 const result=await env.DB.batch([
  env.DB.prepare('INSERT INTO transactional_email_events(id,outbox_id,provider_event_key,event_type,occurred_at) VALUES(?,?,?,?,?) ON CONFLICT(provider_event_key) DO NOTHING').bind(crypto.randomUUID(),row.id,event.providerEventKey,event.type,event.occurredAt),
  env.DB.prepare(`UPDATE email_outbox SET delivered_at=(SELECT MAX(occurred_at) FROM transactional_email_events WHERE outbox_id=? AND event_type='delivered'),
   sent_at=COALESCE(sent_at,(SELECT MIN(occurred_at) FROM transactional_email_events WHERE outbox_id=? AND event_type IN ('sent','delivered'))),
   provider_message_id=COALESCE(provider_message_id,?),status=CASE
    WHEN EXISTS(SELECT 1 FROM transactional_email_events WHERE outbox_id=? AND event_type IN ('hard_bounce','blocked','rejected')) THEN 'failed'
    WHEN EXISTS(SELECT 1 FROM transactional_email_events WHERE outbox_id=? AND event_type='delivered') THEN 'delivered'
    WHEN EXISTS(SELECT 1 FROM transactional_email_events WHERE outbox_id=? AND event_type='sent') THEN 'sent' ELSE status END,
   error_message=CASE
    WHEN EXISTS(SELECT 1 FROM transactional_email_events WHERE outbox_id=email_outbox.id AND event_type='blocked') THEN 'blocked'
    WHEN EXISTS(SELECT 1 FROM transactional_email_events WHERE outbox_id=email_outbox.id AND event_type='hard_bounce') THEN 'hard_bounce'
    WHEN EXISTS(SELECT 1 FROM transactional_email_events WHERE outbox_id=email_outbox.id AND event_type='rejected') THEN 'rejected'
    WHEN COALESCE((SELECT MAX(occurred_at) FROM transactional_email_events WHERE outbox_id=email_outbox.id AND event_type='soft_bounce'),'')>
     COALESCE((SELECT MAX(occurred_at) FROM transactional_email_events WHERE outbox_id=email_outbox.id AND event_type='delivered'),'') THEN 'soft_bounce'
    WHEN EXISTS(SELECT 1 FROM transactional_email_events WHERE outbox_id=email_outbox.id AND event_type IN ('sent','delivered')) THEN NULL
    ELSE error_message END WHERE id=?`).bind(row.id,row.id,event.emailId||null,row.id,row.id,row.id,row.id),
 ]);
 if(result[0].meta.changes&&['hard_bounce','blocked'].includes(event.type))await env.DB.prepare("UPDATE mailing_contacts SET deliverability_status=? WHERE normalized_email=?").bind(event.type,event.email).run();
 return {inserted:result[0].meta.changes?1:0};
}
