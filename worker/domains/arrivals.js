import { json } from '../http/responses.js';
import { requireAdmin } from '../auth/admin.js';
import { resourceRevision, runAdminCommand } from '../admin/commands.js';
import { parseMemberQr } from '../admin/member-qr.js';
import { paymentStatusFor } from './reservations/payments.js';
import { saveCompetitionPhoto, competitionCarMedia } from './live.js';

const bodies = new Set(['Sedan','Coupé','Touring','Cabrio','Compact','Z3']);
const clean = (v, n=120) => typeof v==='string' ? v.trim().slice(0,n) : '';
const rows = async (env,sql,...args) => (await env.DB.prepare(sql).bind(...args).all()).results;
const one = (env,sql,...args) => env.DB.prepare(sql).bind(...args).first();
const bad = (message,status=400) => {throw Object.assign(new Error(message),{status})};
const money = (v,nullable=false) => {if(nullable&&(v===null||v===''))return null;if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0||v>1000000)bad('Částka musí být celé nezáporné číslo.');return v};
export const normalizePlate = value => clean(value,20).toUpperCase().replace(/[\s-]/g,'');
export async function tokenHash(token) {return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))].map(v=>v.toString(16).padStart(2,'0')).join('')}
const paidSql = `COALESCE((SELECT SUM(p.amount_czk) FROM event_payments p WHERE (a.reservation_id IS NOT NULL AND p.reservation_id=a.reservation_id) OR (a.reservation_id IS NULL AND p.arrival_id=a.id)),0)`;
export function arrivalView(a) {
  const due=a.services_czk+(a.free_reason?0:a.admission_czk),paid=Number(a.paid||0);
  return {...a,label:a.nickname||a.name||'Návštěvník '+a.id.slice(-8).toUpperCase(),due,paid,balance:due-paid,paymentStatus:paymentStatusFor(due,paid)};
}
export async function getArrival(env,eventId,id) {
  const a=await one(env,`SELECT a.*,EXISTS(SELECT 1 FROM live_car_photos f WHERE f.event_id=a.event_id AND f.car_id=a.car_key) hasPhoto,${paidSql} paid,o.status invitation_status FROM event_arrivals a LEFT JOIN arrival_invitations i ON i.arrival_id=a.id LEFT JOIN email_outbox o ON o.id=i.outbox_id WHERE a.event_id=? AND a.id=?`,eventId,id);
  if(!a)bad('Příjezd nebyl nalezen.',404);
  const payments=await rows(env,`SELECT p.* FROM event_payments p WHERE (p.reservation_id=? AND ? IS NOT NULL) OR p.arrival_id=? ORDER BY p.created_at,p.id`,a.reservation_id,a.reservation_id,id);
  return {...arrivalView(a),payments};
}
export async function arrivalList(env,eventId) {
  const event=await one(env,'SELECT id,year,title,admission_registered_czk,admission_onsite_czk FROM events WHERE id=?',eventId);if(!event)bad('Ročník nebyl nalezen.',404);
  const list=(await rows(env,`SELECT a.*,EXISTS(SELECT 1 FROM live_car_photos f WHERE f.event_id=a.event_id AND f.car_id=a.car_key) hasPhoto,${paidSql} paid,o.status invitation_status FROM event_arrivals a LEFT JOIN arrival_invitations i ON i.arrival_id=a.id LEFT JOIN email_outbox o ON o.id=i.outbox_id WHERE a.event_id=? ORDER BY a.arrived_at DESC,a.id`,eventId)).map(arrivalView);
  const expected=await rows(env,`SELECT r.id reservationId,r.member_id memberId,r.car_id carId,r.crew,r.status,m.name,m.nickname,r.car_model model,r.car_body body,r.amount_due_czk due,r.amount_paid_czk paid FROM reservations r JOIN members m ON m.id=r.member_id WHERE r.event_id=? AND r.status IN ('approved','pending') AND NOT EXISTS(SELECT 1 FROM event_arrivals a WHERE a.reservation_id=r.id AND a.arrived_at IS NOT NULL) ORDER BY m.name,r.id`,eventId);
  const cash=await one(env,"SELECT COALESCE(SUM(amount_czk),0) total FROM event_payments WHERE event_id=? AND method='cash' AND arrival_id IS NOT NULL",eventId);
  return {ok:true,event,revision:await resourceRevision(env,'arrivals',eventId),arrivals:list,expected,counts:{expected:expected.filter(r=>r.status==='approved').length,arrived:list.filter(a=>a.arrived_at).length,unregistered:list.filter(a=>a.arrived_at&&!a.registered).length,people:list.filter(a=>a.arrived_at).reduce((n,a)=>n+a.crew,0),cash:cash.total}};
}
export async function findArrivalMembers(env,eventId,q='',qr=null) {
  const token=qr?parseMemberQr(qr):null;if(qr&&!token)bad('Neplatný členský QR.');
  const needle='%'+clean(q,80).replace(/[\\%_]/g,'\\$&')+'%';
  return rows(env,`SELECT m.id,m.name,m.nickname,m.email,m.phone,m.member_code memberCode,r.id reservationId,r.status reservationStatus,r.car_id registeredCarId,r.crew,r.accommodation,r.arrival,r.admission_czk,r.amount_due_czk due,r.amount_paid_czk paid,
    (SELECT json_group_array(json_object('id',c.id,'model',c.model,'body',c.body,'source',c.source,'photoId',c.photo_id)) FROM live_vehicle_catalog c WHERE c.member_id=m.id AND (c.event_id IS NULL OR c.event_id=?)) carsJson
    FROM members m LEFT JOIN reservations r ON r.member_id=m.id AND r.event_id=? WHERE m.status='active' AND ${token?'EXISTS(SELECT 1 FROM member_qr_identities qr WHERE qr.member_id=m.id AND qr.token=?)':`(m.name LIKE ? ESCAPE '\\' OR m.nickname LIKE ? ESCAPE '\\' OR m.email LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM event_arrivals a WHERE a.member_id=m.id AND a.event_id=? AND a.plate LIKE ? ESCAPE '\\'))`} ORDER BY COALESCE(m.nickname,m.name) LIMIT 50`,eventId,eventId,...(token?[token]:[needle,needle,needle,eventId,needle]));
}

// New reservation prices snapshot the admission separately. Unknown is never zero.
export function reservationPrice(admission,services) {
  return {admission:money(admission,true),services:money(services),total:admission==null?services:admission+services};
}
export function paymentStatement(env,{id,eventId,reservationId=null,arrivalId=null,amount,method,actorId,reason,reversesId=null}) {
  if(!Number.isSafeInteger(amount)||!amount||Math.abs(amount)>1000000||!['cash','bank'].includes(method)||!clean(reason,240))bad('Neplatný platební záznam.');
  return env.DB.prepare('INSERT INTO event_payments(id,event_id,reservation_id,arrival_id,amount_czk,method,actor_id,reason,reverses_id) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,eventId,reservationId,arrivalId,amount,method,actorId,clean(reason,240),reversesId);
}
function audit(env,auth,id,old,next,reason) {return env.DB.prepare("INSERT INTO admin_actions(id,admin_member_id,action_type,entity_type,entity_id,old_state_json,new_state_json,note) VALUES(?,?,'arrival_update','arrival',?,?,?,?)").bind(crypto.randomUUID(),auth.uid,id,JSON.stringify(old),JSON.stringify(next),reason)}

async function confirmArrival(env,auth,eventId,b) {
  const event=await one(env,'SELECT * FROM events WHERE id=?',eventId);
  const memberId=clean(b.memberId,128)||null;
  const member=memberId?await one(env,"SELECT * FROM members WHERE id=? AND status='active'",memberId):null;
  if(memberId&&!member)bad('Člen nebyl nalezen.',404);
  const reservation=memberId?await one(env,"SELECT * FROM reservations WHERE event_id=? AND member_id=? AND status='approved'",eventId,memberId):null;
  // An additional car is a separate on-site admission, never another copy of the reservation.
  const reserved=reservation&&b.additionalCar!==true?reservation:null;
  const existing=reserved?await one(env,'SELECT id FROM event_arrivals WHERE reservation_id=?',reserved.id):null;
  if(existing)return {ok:true,alreadyArrived:true,arrival:await getArrival(env,eventId,existing.id)};
  const id=clean(b.id,128);if(!/^[a-z0-9_-]{8,128}$/i.test(id))bad('Chybí stabilní ID příjezdu.');
  const carId=clean(b.carId,128),car=carId?await one(env,'SELECT * FROM live_vehicle_catalog WHERE id=? AND member_id=? AND (event_id IS NULL OR event_id=?)',carId,memberId,eventId):null;
  if(carId&&!car)bad('Auto nepatří vybranému účastníkovi.');
  const model=car?.model||clean(b.model),body=car?.body||clean(b.body),plate=normalizePlate(b.plate);
  if(!model||!bodies.has(body))bad('Vyplň model a karoserii skutečného auta.');
  const key=carId||'gate-'+id;
  const duplicate=await one(env,"SELECT id FROM event_arrivals WHERE event_id=? AND (car_key=? OR (plate<>'' AND plate=?))",eventId,key,plate);
  if(duplicate)return {ok:true,alreadyArrived:true,arrival:await getArrival(env,eventId,duplicate.id)};
  const crew=Number(b.crew);if(!Number.isInteger(crew)||crew<1||crew>99)bad('Počet osob musí být od 1 do 99.');
  const free=b.free===true,reason=free?clean(b.freeReason,240):null;if(free&&!reason)bad('Uveď důvod FREE VSTUPU.');
  let admission=reserved?.admission_czk??event.admission_onsite_czk,services=0,paid=0;
  if(reserved){
    if(reserved.admission_czk==null)bad('Tato stará testovací rezervace nemá nové cenové položky. Použij novou testovací sadu.',409);
    services=reserved.amount_due_czk-reserved.admission_czk;
    paid=Number((await one(env,'SELECT COALESCE(SUM(amount_czk),0) paid FROM event_payments WHERE reservation_id=?',reserved.id)).paid);
    if(services<0||paid!==reserved.amount_paid_czk)bad('Rezervace neodpovídá nové cenové a platební evidenci.',409);
  }
  if(admission==null&&!free)bad('Nejdřív doplň sazbu vstupného v nastavení ročníku.',409);
  admission=money(admission??0);const cash=money(b.cash??0),due=services+(free?0:admission);
  if(due>paid+cash&&b.acceptDebt!==true)bad('Potvrď příjezd se zbývajícím nedoplatkem.');
  const email=member?.email||clean(b.email,254).toLowerCase();if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))bad('Zkontroluj e-mail.');
  if(!member&&b.matchesReviewed!==true)bad('Nejdřív ověř možné shody existujících členů.');
  const compId=car?.source==='competition'?carId:(!carId&&memberId?key:null);
  const name=member?.name||clean(b.name),nickname=member?.nickname||clean(b.nickname),phone=member?.phone||clean(b.phone,40);
  const statements=[env.DB.prepare(`INSERT INTO event_arrivals(id,event_id,member_id,reservation_id,name,nickname,email,phone,car_key,garage_car_id,model,body,plate,crew,registered,admission_czk,services_czk,free_reason,free_by,free_at,arrived_at,confirmed_by)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CASE WHEN ? IS NOT NULL THEN CURRENT_TIMESTAMP END,CURRENT_TIMESTAMP,?
    WHERE EXISTS(SELECT 1 FROM members WHERE id=? AND status='active' AND role='admin')
    AND EXISTS(SELECT 1 FROM events WHERE id=? AND admission_onsite_czk IS ?)
    AND (? IS NULL OR EXISTS(SELECT 1 FROM reservations WHERE id=? AND status='approved' AND amount_due_czk=? AND amount_paid_czk=? AND admission_czk=?))`)
    .bind(id,eventId,memberId,reserved?.id||null,name,nickname,email,phone,key,car?.source==='garage'?carId:null,model,body,plate,crew,reserved?1:0,admission,services,reason,free?auth.uid:null,reason,auth.uid,auth.uid,eventId,event.admission_onsite_czk,reserved?.id||null,reserved?.id||null,reserved?.amount_due_czk??0,reserved?.amount_paid_czk??0,reserved?.admission_czk??0)];
  if(compId&&!carId)statements.push(env.DB.prepare('INSERT INTO live_competition_cars(id,event_id,member_id,model,body,created_by) VALUES(?,?,?,?,?,?)').bind(compId,eventId,memberId,model,body,auth.uid));
  if(compId)statements.push(env.DB.prepare('UPDATE event_arrivals SET competition_car_id=? WHERE id=?').bind(compId,id));
  if(reserved&&free)statements.push(env.DB.prepare('UPDATE reservations SET amount_due_czk=?,admission_czk=0 WHERE id=?').bind(services,reserved.id));
  if(cash)statements.push(paymentStatement(env,{id:crypto.randomUUID(),eventId,reservationId:reserved?.id||null,arrivalId:id,amount:cash,method:'cash',actorId:auth.uid,reason:'Hotovost při příjezdu'}));
  if(!memberId&&email){
    const token=crypto.randomUUID()+crypto.randomUUID(),hash=await tokenHash(token),outboxId=crypto.randomUUID();
    statements.push(env.DB.prepare("INSERT INTO email_outbox(id,template_key,recipient_email,subject,status,payload_json) VALUES(?,'arrival_invitation',?,'Tvoje účast na E36 United','queued',?)").bind(outboxId,email,JSON.stringify({token,arrivalId:id})));
    statements.push(env.DB.prepare("INSERT INTO arrival_invitations(id,arrival_id,token_hash,email,expires_at,outbox_id) VALUES(?,?,?,?,datetime('now','+7 days'),?)").bind(crypto.randomUUID(),id,hash,email,outboxId));
  }
  statements.push(audit(env,auth,id,null,{carKey:key,crew,cash,admission,services,freeReason:reason},'Potvrzení příjezdu'));
  await env.DB.batch(statements);
  return {ok:true,arrival:await getArrival(env,eventId,id)};
}

async function correctArrival(env,auth,eventId,id,b) {
  const old=await getArrival(env,eventId,id),reason=clean(b.reason,240);if(!reason)bad('Uveď důvod opravy.');
  if(b.version!==old.version)bad('Detail se mezitím změnil. Obnov jej.',409);
  const crew=b.crew==null?old.crew:Number(b.crew);if(!Number.isInteger(crew)||crew<1||crew>99)bad('Neplatný počet osob.');
  let actual=null;
  if(b.car){
    if(await one(env,'SELECT 1 FROM live_entry_vehicles WHERE event_id=? AND car_id=?',eventId,old.car_key))bad('Auto už má soutěžní účast. Oprav ji samostatně; příjezd ji nesmí přepsat.',409);
    const carId=clean(b.car.id,128),car=carId?await one(env,'SELECT * FROM live_vehicle_catalog WHERE id=? AND member_id=? AND (event_id IS NULL OR event_id=?)',carId,old.member_id,eventId):null;
    if(carId&&!car)bad('Auto nepatří účastníkovi.');
    actual={key:carId||old.car_key,garage:car?.source==='garage'?carId:null,competition:car?.source==='competition'?carId:null,model:car?.model||clean(b.car.model),body:car?.body||clean(b.car.body),plate:normalizePlate(b.car.plate)};
    if(!actual.model||!bodies.has(actual.body))bad('Vyplň skutečné auto a karoserii.');
    // A correction of a garage car to an event-only car gets its own stable event key.
    if(!carId){actual.key='gate-'+id;actual.competition=old.member_id?actual.key:null}
  }
  const statements=[env.DB.prepare(`UPDATE event_arrivals SET crew=?,version=version+1 WHERE id=? AND event_id=? AND version=? AND EXISTS(SELECT 1 FROM members WHERE id=? AND status='active' AND role='admin') AND (?=0 OR NOT EXISTS(SELECT 1 FROM live_entry_vehicles WHERE event_id=? AND car_id=?))`).bind(crew,id,eventId,b.version,auth.uid,actual?1:0,eventId,old.car_key)];
  if(actual){
    if(actual.competition&&!b.car.id)statements.push(env.DB.prepare('INSERT INTO live_competition_cars(id,event_id,member_id,model,body,created_by) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET model=excluded.model,body=excluded.body').bind(actual.key,eventId,old.member_id,actual.model,actual.body,auth.uid));
    statements.push(env.DB.prepare('UPDATE event_arrivals SET car_key=?,garage_car_id=?,competition_car_id=?,model=?,body=?,plate=? WHERE id=?').bind(actual.key,actual.garage,actual.competition,actual.model,actual.body,actual.plate,id));
  }
  if(b.payment){
    const p=b.payment;
    if(p.reversesId){const original=old.payments.find(x=>x.id===p.reversesId);if(!original||original.reverses_id||old.payments.some(x=>x.reverses_id===original.id))bad('Platbu nelze znovu stornovat.');statements.push(paymentStatement(env,{id:crypto.randomUUID(),eventId,reservationId:old.reservation_id,arrivalId:id,amount:-original.amount_czk,method:original.method,actorId:auth.uid,reason,reversesId:original.id}));}
    else{const amount=money(p.amount);if(!amount)bad('Zadej přijatou částku.');statements.push(paymentStatement(env,{id:crypto.randomUUID(),eventId,reservationId:old.reservation_id,arrivalId:id,amount,method:p.method,actorId:auth.uid,reason}));}
  }
  statements.push(audit(env,auth,id,old,{crew,car:actual,payment:b.payment||null},reason));await env.DB.batch(statements);
  return {ok:true,arrival:await getArrival(env,eventId,id)};
}

export async function routeArrivals({request,env,url,origin,auth}) {
  if(!await requireAdmin(env,auth))return json({ok:false,error:'admin_forbidden'},403,origin);
  const match=url.pathname.match(/^\/api\/admin\/events\/([^/]+)\/arrivals(?:\/([^/]+))?(?:\/(photo))?$/);if(!match)return json({ok:false,error:'not_found'},404,origin);
  const eventId=decodeURIComponent(match[1]),part=match[2]||'';
  try {
    if(match[3]){
      const a=await getArrival(env,eventId,part);
      if(request.method==='POST')return saveCompetitionPhoto(request,env,auth,eventId,a.car_key,origin);
      if(request.method==='GET')return competitionCarMedia(env,eventId,a.car_key,origin);
      return json({ok:false,error:'method_not_allowed'},405,origin);
    }
    if(request.method==='GET'){
      if(part==='search')return json({ok:true,members:await findArrivalMembers(env,eventId,url.searchParams.get('q')||'')},200,origin);
      if(part==='export'){const data=await arrivalList(env,eventId);return json({...data,exportedAt:new Date().toISOString()},200,origin)}
      if(part)return json({ok:true,arrival:await getArrival(env,eventId,part),revision:await resourceRevision(env,'arrivals',eventId)},200,origin);
      return json(await arrivalList(env,eventId),200,origin);
    }
    if(part==='qr'&&request.method==='POST'){const b=await request.json();return json({ok:true,members:await findArrivalMembers(env,eventId,'',b.payload)},200,origin)}
    return await runAdminCommand(request,env,auth,'arrivals',eventId,origin,async safe=>{
      try {
        const b=await request.json();let result;
        if(part==='rates'&&request.method==='PUT'){
          const registered=money(b.registered,true),onsite=money(b.onsite,true);
          await safe.DB.batch([safe.DB.prepare('UPDATE events SET admission_registered_czk=?,admission_onsite_czk=? WHERE id=?').bind(registered,onsite,eventId),audit(safe,auth,eventId,await one(safe,'SELECT admission_registered_czk,admission_onsite_czk FROM events WHERE id=?',eventId),{registered,onsite},'Nastavení vstupného')]);result={ok:true};
        } else if(part==='invitation-retry'&&request.method==='POST'){
          const id=clean(b.arrivalId,128);
          const invite=await one(safe,"SELECT i.id,i.outbox_id,o.status FROM arrival_invitations i JOIN event_arrivals a ON a.id=i.arrival_id JOIN email_outbox o ON o.id=i.outbox_id WHERE a.id=? AND a.event_id=? AND i.consumed_at IS NULL AND i.expires_at>datetime('now') AND o.payload_json IS NOT NULL",id,eventId);
          if(!invite||!['queued','failed'].includes(invite.status))bad('Pozvánku nelze bezpečně zopakovat. Odeslaný nebo nejistý výsledek neopakujeme.',409);
          await safe.DB.batch([safe.DB.prepare("UPDATE email_outbox SET status='queued',error_message=NULL WHERE id=? AND status IN ('queued','failed') AND EXISTS(SELECT 1 FROM arrival_invitations WHERE id=? AND consumed_at IS NULL AND expires_at>datetime('now'))").bind(invite.outbox_id,invite.id),audit(safe,auth,id,{invitationStatus:invite.status},{invitationStatus:'queued'},'Výslovné opakování bezpečně neodeslané pozvánky')]);
          result={ok:true,arrival:await getArrival(safe,eventId,id)};
        } else if(part==='reservation-payment'&&request.method==='POST'){
          const r=await one(safe,'SELECT * FROM reservations WHERE id=? AND event_id=?',clean(b.reservationId,128),eventId);
          if(!r||r.admission_czk==null)bad('Platba vyžaduje rezervaci s novými cenovými položkami.',409);
          const recorded=await one(safe,'SELECT COALESCE(SUM(amount_czk),0) paid FROM event_payments WHERE reservation_id=?',r.id);
          if(recorded.paid!==r.amount_paid_czk)bad('Souhrn úhrad neodpovídá novým platebním záznamům.',409);
          const amount=money(b.amount);if(!amount)bad('Zadej přijatou částku.');
          await safe.DB.batch([safe.DB.prepare('UPDATE reservations SET id=id WHERE id=? AND amount_paid_czk=? AND admission_czk IS NOT NULL').bind(r.id,r.amount_paid_czk),paymentStatement(safe,{id:crypto.randomUUID(),eventId,reservationId:r.id,amount,method:b.method,actorId:auth.uid,reason:b.reason}),audit(safe,auth,r.id,null,{amount,method:b.method},clean(b.reason,240))]);result={ok:true};
        } else if(!part&&request.method==='POST')result=await confirmArrival(safe,auth,eventId,b);
        else if(part&&request.method==='PATCH')result=await correctArrival(safe,auth,eventId,part,b);
        else return json({ok:false,error:'method_not_allowed'},405,origin);
        return json(result,200,origin);
      }catch(e){if(e.status)return json({ok:false,error:'arrival_validation',message:e.message},e.status,origin);throw e}
    });
  }catch(e){if(e.status)return json({ok:false,error:'arrival_validation',message:e.message},e.status,origin);throw e}
}
