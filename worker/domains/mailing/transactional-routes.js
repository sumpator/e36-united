import {json} from '../../http/responses.js';
import {readMailingBody} from './request.js';
import {requireAdmin} from '../../auth/admin.js';
import {TRANSACTIONAL_TYPES,renderTransactionalEmail,portalLink,czk} from './transactional-template.js';
import {transactionalReady,transactionalContent,safeEmailError,transactionalTransportState} from './transactional.js';

export const EMAIL_STATUS_LABELS={skipped:'Vynecháno před první aktivací',queued:'Čeká ve frontě',sending:'Zpracovává se',sent:'Přijato SMTP2GO',delivered:'Doručeno',failed:'Jednoznačné selhání',uncertain:'Výsledek je nejasný — nejprve ověř poskytovatele',superseded:'Nahrazeno aktuálním stavem',blocked:'Zablokovaná adresa'};
const errorLabels={before_initial_activation:'Událost vznikla před první aktivací. Automaticky se neodešle; případné nové odeslání vyžaduje výslovnou kontrolu aktuálnosti.',provider_rejected:'Poskytovatel zprávu odmítl.',provider_invalid_key:'Poskytovatel odmítl přístup odesílatele.',provider_rate_limit:'Poskytovatel zprávu nepřijal kvůli limitu.',provider_timeout:'Poskytovatel včas nepotvrdil výsledek. Před opakováním jej ověř.',provider_unavailable:'Nepodařilo se potvrdit výsledek u poskytovatele.',provider_malformed:'Odpověď poskytovatele nebyla jednoznačná.',provider_batch_ambiguous:'Poskytovatel nepotvrdil všechny zprávy jednoznačně.',suppressed_address:'Adresa je zablokovaná kvůli doručitelnosti nebo výslovnému zákazu.',content_unavailable:'Související obsah už není aktuální nebo dostupný.',hard_bounce:'Zprávu nelze na adresu doručit.',soft_bounce:'Doručení bylo dočasně odmítnuto.',blocked:'Poskytovatel oznámil stížnost nebo blokaci.',rejected:'Zpráva byla odmítnuta.'};
const triggers={account_created:'První úspěšný serverový bootstrap členského profilu; nikdy běžný login.',preliminary_saved:'První výslovné uložení předběžného plánu; ne průběžné změny Planneru.',reservation_submitted:'Vložení skutečné rezervace nebo její opětovné odeslání do pending.',reservation_approved:'Skutečný přechod rezervace do approved.',reservation_rejected:'Skutečný přechod rezervace do rejected; pouze veřejný komentář.',reservation_cancelled:'Dokončené zrušení rezervace, přímo nebo schválením žádosti.',reservation_changed:'Potvrzená změna ceny schválené rezervace nebo změna platebních údajů ročníku u nezaplacené schválené rezervace.',reservation_payment:'Skutečná změna souhrnu přijatých plateb z platného platebního handleru/ledgeru.',request_change:'Uložení nové žádosti o změnu.',request_cancellation:'Uložení nové žádosti o zrušení.',request_approved:'Schválení žádosti o změnu, nikoli pouhé přijetí.',request_rejected:'Zamítnutí žádosti, s veřejným vyjádřením.',merch_confirmation:'Atomické vytvoření nové objednávky a jejího outbox intentu.',merch_payment:'Nová úhrada nebo auditovaná oprava skutečné úhrady.',merch_ready:'Potvrzený přechod objednávky do ready.',merch_sent:'Potvrzený přechod objednávky do sent.',merch_cancel_request:'Přijetí žádosti o zrušení již částečně/plně placené objednávky.',merch_cancelled:'Skutečný přechod objednávky do cancelled.',merch_withdraw:'Přijetí požadavku na odstoupení.',merch_complaint:'Přijetí reklamace.',merch_refund:'Zápis evidované refundace, ne žádost o ni.',merch_resolved:'Výslovné vyřízení konkrétního zákaznického požadavku.',arrival_invitation:'Potvrzený příjezd hosta s adresou a bezpečnou jednorázovou pozvánkou.'};
export function transactionalExample(kind){
 const merch=kind.startsWith('merch'),items=merch?Array.from({length:kind==='merch_confirmation'?6:1},(_,i)=>({name:i?'Tričko s dlouhým názvem kolekce E36 UNITED — zkušební rekapitulace':'Not Fast, Not Furious',color:'Tmavě šedá',size:'XL',quantity:1,unitPriceMinor:69000,imageUrl:'https://e36united.cz/assets/images/merch/not-fast-not-furious-dark-grey-card.webp'})):[];
 const total=merch?items.reduce((sum,item)=>sum+item.unitPriceMinor*item.quantity,0)/100:1380,paid=kind==='merch_confirmation'?0:merch?690:690;
 const financial=merch||kind.includes('payment')||kind==='reservation_approved'||kind==='reservation_changed',remaining=total-paid;
 return {reference:kind.startsWith('merch')?'UM-0000123':'United 2026 · ukázka',url:portalLink(kind.startsWith('merch')?'merch':kind.includes('payment')?'payments':'reservation'),
  facts:[['Jméno','Eva Nováková'],['Ročník','United 2026'],...(kind.includes('payment')?[['Přijatá částka',czk(paid)]]:[]),...(financial?[['Celkem',czk(total)],['Celkem uhrazeno',czk(paid)],['Zbývá',czk(remaining)],...(remaining?[['Účet','19-2000145399/0800 · pouze ukázka'],['Variabilní symbol','2026000123']]:[])]:[])],
  ...(merch?{items}:{}),
  next:kind==='reset_password'?'Pokud jsi o změnu nežádal, zprávu ignoruj. Heslo se pouhým otevřením odkazu nezmění.':financial&&remaining?'Zkontroluj aktuální zbývající částku a platební údaje v portálu. Jde o ukázková data, ne pokyn k platbě.':'Teď nemusíš nic dělat.',
  reason:'Ukázka verzované šablony. Není to skutečné odeslání ani platební pokyn.'};
}
function publicRow(row){return {id:row.id,kind:row.template_key,recipient:row.recipient_email,subject:row.subject,status:row.status,statusLabel:EMAIL_STATUS_LABELS[row.status]||row.status,entityType:row.entity_type,entityId:row.entity_id,reservationId:row.reservation_id,eventId:row.event_id,createdAt:row.created_at,acceptedAt:row.sent_at,deliveredAt:row.delivered_at,error:row.error_message?safeEmailError(row.error_message):null,errorMessage:row.error_message?(errorLabels[safeEmailError(row.error_message)]||'Výsledek odeslání není potvrzený; nejprve jej ověř u poskytovatele.'):null,retryOf:row.retry_of,attempts:row.attempts}}
const reply=(data,status,origin)=>{const response=json(data,status,origin);response.headers.set('Cache-Control','no-store');return response};
// Synthetic candidates only; no recipient selection or transport is part of this helper.
export function transactionalTestExample(kind){
 if(!['reservation_payment','merch_confirmation','reservation_rejected','arrival_invitation'].includes(kind))throw Error('unsupported_restricted_test');
 const sample=transactionalExample(kind);
 return {...sample,title:'[TEST] '+TRANSACTIONAL_TYPES[kind][1],reference:'TEST – syntetický vzorek',url:null,
  facts:sample.facts.filter(([label])=>!['Účet','Variabilní symbol'].includes(label)),
  intro:'TESTOVACÍ UKÁZKA. Nejde o skutečnou platbu, rezervaci, objednávku ani pozvánku.',
  next:'Toto je pouze test. Nic neplať, nic nepotvrzuj. Pozvánka neobsahuje použitelný token ani odkaz k propojení.',
  reason:'Výslovně označená testovací zpráva. Příjemce i počet odeslání vyžadují samostatné schválení.'};
}
export async function routeTransactionalEmails({request,env,url,auth,origin}){
 const base='/api/admin/mailing/transactional';if(!url.pathname.startsWith(base))return null;
 if(!await requireAdmin(env,auth))return reply({error:'admin_forbidden'},403,origin);
 if(!await transactionalReady(env))return reply({error:'transactional_migration_required',message:'Provozní e-maily vyžadují připravenou migraci.'},503,origin);
 if(url.pathname===base+'/templates'&&request.method==='GET')return reply({templates:Object.entries(TRANSACTIONAL_TYPES).map(([kind,[area,title]])=>({kind,area,title,available:!['verify_email','reset_password'].includes(kind),trigger:triggers[kind]||'Dosavadní Firebase tok; vlastní grafika čeká na privilegované generování akčních odkazů.'}))},200,origin);
 const template=url.pathname.match(/^\/api\/admin\/mailing\/transactional\/templates\/([a-z_]+)$/);
 if(template&&request.method==='GET')return Object.hasOwn(TRANSACTIONAL_TYPES,template[1])?reply({preview:renderTransactionalEmail(template[1],transactionalExample(template[1]))},200,origin):reply({error:'template_not_found'},404,origin);
 if(url.pathname===base&&request.method==='GET'){
  const status=url.searchParams.get('status')||'',kind=url.searchParams.get('kind')||'',entity=url.searchParams.get('entity')||'',page=Math.max(1,Math.min(100000,Number.parseInt(url.searchParams.get('page'))||1));
  if(status&&!Object.hasOwn(EMAIL_STATUS_LABELS,status)||kind&&!Object.hasOwn(TRANSACTIONAL_TYPES,kind))return reply({error:'invalid_filter'},400,origin);
  const where="tx_version=1 AND (?='' OR status=?) AND (?='' OR template_key=?) AND (?='' OR entity_id=? OR reservation_id=?)",args=[status,status,kind,kind,entity,entity,entity];
  const [rows,count]=await env.DB.batch([env.DB.prepare(`SELECT * FROM email_outbox WHERE ${where} ORDER BY datetime(created_at) DESC,id DESC LIMIT 25 OFFSET ?`).bind(...args,(page-1)*25),env.DB.prepare(`SELECT COUNT(*) n FROM email_outbox WHERE ${where}`).bind(...args)]);
  return reply({transport:await transactionalTransportState(env),messages:rows.results.map(publicRow),page,total:count.results[0].n,hasMore:page*25<count.results[0].n},200,origin);
 }
 const match=url.pathname.match(/^\/api\/admin\/mailing\/transactional\/([a-z0-9-]+)(?:\/(retry|resolve))?$/);
 if(!match)return reply({error:'transactional_not_found'},404,origin);
 const row=await env.DB.prepare('SELECT * FROM email_outbox WHERE id=? AND tx_version=1').bind(match[1]).first();if(!row)return reply({error:'message_not_found'},404,origin);
 if(request.method==='GET'&&!match[2]){
  let preview=null;
  if(row.template_key==='arrival_invitation')preview=renderTransactionalEmail(row.template_key,{...transactionalExample(row.template_key),next:'Bezpečnostní odkaz v administrativním náhledu není zobrazený.'});
  else if(row.rendered_html)preview={html:row.rendered_html,text:row.rendered_text,subject:row.subject};
  else {const content=await transactionalContent(env,row);if(content)preview=renderTransactionalEmail(row.template_key,content)}
  const events=await env.DB.prepare('SELECT event_type,occurred_at FROM transactional_email_events WHERE outbox_id=? ORDER BY occurred_at').bind(row.id).all();
  return reply({message:publicRow(row),preview,events:events.results},200,origin);
 }
 if(request.method!=='POST'||!match[2])return reply({error:'method_not_allowed'},405,origin);
 let body;try{body=await readMailingBody(request,4096)}catch{return reply({error:'invalid_request'},400,origin)}
 const reason=String(body.reason||'').trim();if(reason.length<10||reason.length>1000)return reply({error:'reason_required',message:'Napiš konkrétní důvod (10–1000 znaků).'},400,origin);
 if(match[2]==='resolve'){
  const evidence=String(body.evidence||'').trim();if(row.status!=='uncertain'||body.confirmedNotSent!==true||evidence.length<10||evidence.length>1000)return reply({error:'provider_verification_required',message:'Nejdřív ověř u poskytovatele, že zpráva nebyla přijata. Dolož výsledek kontroly.'},409,origin);
  const result=await env.DB.batch([
   env.DB.prepare("UPDATE email_outbox SET status='failed',error_message='provider_rejected' WHERE id=? AND status='uncertain'").bind(row.id),
   env.DB.prepare("INSERT INTO transactional_email_audit(id,outbox_id,actor_id,action,reason) SELECT ?,?,?,'verified_not_sent',? WHERE changes()=1").bind(crypto.randomUUID(),row.id,auth.uid,reason+' | Ověření poskytovatele: '+evidence),
  ]);
  return reply({ok:!!result[0].meta.changes,message:'Ověření je zapsané. Případné opakování musíš potvrdit samostatně.'},result[0].meta.changes?200:409,origin);
 }
 if(!(await transactionalTransportState(env)).activatedAt||!['failed','skipped'].includes(row.status)||['hard_bounce','blocked','suppressed_address'].includes(row.error_message)||!await transactionalContent(env,row))return reply({error:'retry_not_safe',message:'Opakování není bezpečné: transport ještě nebyl aktivován, zpráva není jednoznačně neodeslaná, adresa je blokovaná nebo obsah už není aktuální.'},409,origin);
 const id=crypto.randomUUID();
 const results=await env.DB.batch([
  env.DB.prepare(`INSERT INTO email_outbox(id,member_id,reservation_id,template_key,recipient_email,subject,tx_version,event_key,entity_type,entity_id,event_id,payload_json,retry_of)
   SELECT ?,member_id,reservation_id,template_key,recipient_email,subject,1,?,entity_type,entity_id,event_id,payload_json,id FROM email_outbox WHERE id=? AND status IN ('failed','skipped') AND EXISTS(SELECT 1 FROM transactional_email_control WHERE id=1 AND activated_at IS NOT NULL)
   ON CONFLICT(retry_of) WHERE retry_of IS NOT NULL DO NOTHING`).bind(id,'retry:'+row.id,row.id),
  env.DB.prepare("INSERT INTO transactional_email_audit(id,outbox_id,actor_id,action,reason) SELECT ?,?,?,'retry_requested',? WHERE EXISTS(SELECT 1 FROM email_outbox WHERE id=?)").bind(crypto.randomUUID(),row.id,auth.uid,reason,id),
 ]);
 return reply({ok:!!results[0].meta.changes,id:results[0].meta.changes?id:null},results[0].meta.changes?201:409,origin);
}
