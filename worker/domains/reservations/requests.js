import { json } from '../../http/responses.js';
import { clean } from '../../utils/text.js';
import { calculateAccommodationPricing } from './pricing.js';
import { accommodationCapacityConflict, getReservationChangeCapacity } from './capacity.js';
import { paymentStatusFor } from './payments.js';

const MAX_CREW=5;

const parseJson=value=>{try{return value?JSON.parse(value):null}catch{return null}};
const requestView=row=>row?{
  id:row.id,type:row.request_type,status:row.status,
  original:parseJson(row.original_json),proposed:parseJson(row.proposed_json),
  memberNote:row.member_note||'',adminComment:row.admin_comment||'',
  createdAt:row.created_at,updatedAt:row.updated_at,decidedAt:row.decided_at||null,
  memberAcknowledgedAt:row.member_acknowledged_at||null,
}:null;

function reservationSnapshot(row){
  return {
    arrival:row.arrival||'',attendanceType:row.attendance_type||'',crew:Number(row.crew||1),
    accommodation:row.accommodation||'Bez ubytování',accommodationOptionId:row.accommodation_option_id||null,
    accommodationUnits:Number(row.accommodation_units||0),showShine:row.show_shine||'Ne',note:row.note||'',
    amountDueCzk:Number(row.amount_due_czk||0),amountPaidCzk:Number(row.amount_paid_czk||0),
    accommodationSnapshot:row.accommodation_option_id?{optionId:row.accommodation_option_id,optionName:row.accommodation_option_name||row.accommodation,kind:row.accommodation_option_kind||''}:null,
  };
}

async function reservationRequestSource(env,reservationId,memberId=null){
  return env.DB.prepare(`SELECT r.*,e.year AS event_year,e.full_weekend_nights,e.saturday_only_nights,
    ra.option_id AS accommodation_option_id,ra.option_name AS accommodation_option_name,ra.kind AS accommodation_option_kind
    FROM reservations r JOIN events e ON e.id=r.event_id
    LEFT JOIN reservation_accommodation ra ON ra.reservation_id=r.id
    WHERE r.id=? ${memberId?'AND r.member_id=?':''} LIMIT 1`).bind(reservationId,...(memberId?[memberId]:[])).first();
}

async function normalizeProposal(env,row,body){
  const arrival=clean(body.arrival),crew=Number(body.crew),requestedAccommodation=clean(body.accommodation);
  const showShine=clean(body.showShine),note=clean(body.note).slice(0,1000),optionId=clean(body.accommodationOptionId);
  const attendanceType=({Pátek:'full_weekend',Sobota:'saturday_only','Jen na otočku':'day_visit'})[arrival]||'';
  const wantsAccommodation=attendanceType!=='day_visit'&&requestedAccommodation!=='Bez ubytování';
  const accommodationUnits=wantsAccommodation?Number(body.accommodationUnits):0;
  if(!['Pátek','Sobota','Jen na otočku'].includes(arrival))throw Object.assign(new Error('Vyber platný příjezd.'),{code:'invalid_arrival'});
  if(!Number.isInteger(crew)||crew<1||crew>MAX_CREW)throw Object.assign(new Error(`Posádka musí mít 1 až ${MAX_CREW} osob.`),{code:'invalid_crew'});
  if(!['Chatka','Stan','Bez ubytování'].includes(requestedAccommodation))throw Object.assign(new Error('Vyber platné ubytování.'),{code:'invalid_accommodation'});
  if(!['Ne','Možná','Ano'].includes(showShine))throw Object.assign(new Error('Vyber platnou možnost Show & Shine.'),{code:'invalid_show_shine'});
  if(!Number.isInteger(accommodationUnits)||accommodationUnits<(wantsAccommodation?1:0)||accommodationUnits>crew)throw Object.assign(new Error('Počet ubytovaných musí být celé číslo od 1 do počtu členů posádky.'),{code:'invalid_accommodation_units'});
  let option=null,pricing=null,accommodation='Bez ubytování';
  if(wantsAccommodation){
    if(!optionId)throw Object.assign(new Error('Vyber konkrétní typ ubytování.'),{code:'accommodation_option_required'});
    option=await env.DB.prepare('SELECT * FROM event_accommodation_options WHERE id=? AND event_id=? AND active=1 LIMIT 1').bind(optionId,row.event_id).first();
    if(!option)throw Object.assign(new Error('Vybrané ubytování už není dostupné.'),{code:'accommodation_option_not_found',status:409});
    const kind=requestedAccommodation==='Chatka'?'cabin':'tent';
    if(option.kind!==kind)throw Object.assign(new Error('Vybraný typ neodpovídá zvolenému ubytování.'),{code:'invalid_accommodation_option'});
    accommodation=kind==='cabin'?'Chatka':'Stan';
    pricing=calculateAccommodationPricing(row,option,accommodationUnits,attendanceType);
  }
  return {arrival,attendanceType,crew,accommodation,accommodationOptionId:option?.id||null,
    accommodationUnits,showShine,note,amountDueCzk:pricing?.totalCzk||0,
    accommodationSnapshot:option?{optionId:option.id,optionName:option.name,kind:option.kind,
      peopleCount:accommodationUnits,...pricing}:null};
}

async function readBody(request,origin){
  try{const body=await request.json();if(!body||typeof body!=='object'||Array.isArray(body))throw new Error();return body}
  catch{return json({ok:false,error:'invalid_json',message:'Požadavek nemá platný JSON.'},400,origin)}
}

async function submitReservationRequest(request,env,auth,reservationId,origin){
  const body=await readBody(request,origin);if(body instanceof Response)return body;
  const allowed=new Set(['reservationId','type','memberNote','arrival','crew','accommodation','accommodationOptionId','accommodationUnits','showShine','note']);
  if(Object.keys(body).some(key=>!allowed.has(key)))return json({ok:false,error:'invalid_fields',message:'Žádost obsahuje nepovolené údaje.'},400,origin);
  const type=clean(body.type),memberNote=clean(body.memberNote).slice(0,1000);
  if(!['change','cancellation'].includes(type))return json({ok:false,error:'invalid_request_type',message:'Vyber změnu nebo zrušení rezervace.'},400,origin);
  const row=await reservationRequestSource(env,reservationId,auth.uid);
  if(!row)return json({ok:false,error:'reservation_not_found',message:'Rezervace nebyla nalezena.'},404,origin);
  if(type==='change'&&row.status!=='approved')return json({ok:false,error:'approved_reservation_required',message:'O změnu lze požádat u schválené rezervace.'},409,origin);
  if(type==='cancellation'&&!['pending','approved'].includes(row.status))return json({ok:false,error:'active_reservation_required',message:'Tuto rezervaci už nelze rušit.'},409,origin);
  let proposed=null;
  if(type==='change'){
    try{proposed=await normalizeProposal(env,row,body)}catch(error){return json({ok:false,error:error.code||'invalid_request',message:error.message},error.status||400,origin)}
  }
  const original=reservationSnapshot(row),payload=proposed?JSON.stringify(proposed):null;
  const pending=await env.DB.prepare("SELECT * FROM reservation_requests WHERE reservation_id=? AND status='pending' LIMIT 1").bind(reservationId).first();
  if(pending){
    if(pending.request_type===type&&(pending.proposed_json||null)===payload&&(pending.member_note||'')===memberNote)
      return json({ok:true,unchanged:true,request:requestView(pending),message:'Stejná žádost už čeká na vyřízení.'},200,origin);
    return json({ok:false,error:'reservation_request_pending',message:'U této rezervace už jedna žádost čeká na vyřízení.'},409,origin);
  }
  const id=crypto.randomUUID();
  try{await env.DB.prepare(`INSERT INTO reservation_requests
    (id,reservation_id,member_id,request_type,status,original_json,proposed_json,member_note)
    VALUES(?,?,?,?,'pending',?,?,?)`).bind(id,reservationId,auth.uid,type,JSON.stringify(original),payload,memberNote||null).run()}
  catch(error){if(/UNIQUE/.test(String(error?.message)))return json({ok:false,error:'reservation_request_pending',message:'U této rezervace už jedna žádost čeká na vyřízení.'},409,origin);throw error}
  const saved=await env.DB.prepare('SELECT * FROM reservation_requests WHERE id=?').bind(id).first();
  return json({ok:true,request:requestView(saved),message:type==='change'?'Žádost o změnu čeká na rozhodnutí United týmu.':'Žádost o zrušení čeká na rozhodnutí United týmu.'},201,origin);
}

async function updateReservationCar(request,env,auth,reservationId,origin){
  const body=await readBody(request,origin);if(body instanceof Response)return body;
  if(Object.keys(body).length!==1||!('carId' in body))return json({ok:false,error:'invalid_fields',message:'Lze změnit pouze auto rezervace.'},400,origin);
  const carId=clean(body.carId);
  const [reservation,car]=await Promise.all([
    env.DB.prepare("SELECT id,car_id,status,event_id FROM reservations WHERE id=? AND member_id=? AND status IN ('pending','approved') LIMIT 1").bind(reservationId,auth.uid).first(),
    env.DB.prepare('SELECT id,model,body,year,color,nickname FROM cars WHERE id=? AND member_id=? LIMIT 1').bind(carId,auth.uid).first(),
  ]);
  if(!reservation)return json({ok:false,error:'reservation_not_found',message:'Aktivní rezervace nebyla nalezena.'},404,origin);
  if(!car)return json({ok:false,error:'car_not_found',message:'Vybrané auto nepatří přihlášenému účtu.'},404,origin);
  if(reservation.car_id===car.id)return json({ok:true,unchanged:true,carId:car.id,message:'Toto auto už je k rezervaci přiřazené.'},200,origin);
  const updatedAt=new Date().toISOString(),actionId=crypto.randomUUID();
  const results=await env.DB.batch([
    env.DB.prepare(`UPDATE reservations SET car_id=?,car_model=?,car_body=?,car_year=?,car_color=?,car_nickname=?,updated_at=?
      WHERE id=? AND member_id=? AND status IN ('pending','approved')`).bind(car.id,car.model,car.body,car.year||null,car.color||null,car.nickname||null,updatedAt,reservationId,auth.uid),
    env.DB.prepare(`INSERT INTO admin_actions(id,admin_member_id,action_type,entity_type,entity_id,old_state_json,new_state_json,note)
      SELECT ?,?,'reservation_car_changed','reservation',?,json_object('carId',?),json_object('carId',?),'Člen změnil auto rezervace.'
      FROM reservations WHERE id=? AND updated_at=? AND car_id=? AND status IN ('pending','approved')`).bind(actionId,auth.uid,reservationId,reservation.car_id,car.id,reservationId,updatedAt,car.id),
  ]);
  if(!results[0]?.meta?.changes||!results[1]?.meta?.changes)throw new Error('Reservation car update was not persisted atomically');
  return json({ok:true,carId:car.id,message:'Auto rezervace bylo změněno.'},200,origin);
}

async function attachMemberReservationRequest(env,reservation){
  if(!reservation)return reservation;
  const [requests,comment]=await env.DB.batch([
    env.DB.prepare('SELECT * FROM reservation_requests WHERE reservation_id=? ORDER BY created_at DESC,id DESC LIMIT 1').bind(reservation.id),
    env.DB.prepare('SELECT member_comment FROM reservation_member_comments WHERE reservation_id=?').bind(reservation.id),
  ]);
  reservation.member_request=requestView(requests.results?.[0]);reservation.member_comment=comment.results?.[0]?.member_comment||'';return reservation;
}

async function attachAdminReservationContext(env,reservation){
  if(!reservation)return reservation;
  const [requests,actions,comment]=await env.DB.batch([
    env.DB.prepare('SELECT * FROM reservation_requests WHERE reservation_id=? ORDER BY created_at DESC,id DESC').bind(reservation.id),
    env.DB.prepare("SELECT action_type,old_state_json,new_state_json,note,created_at,admin_member_id FROM admin_actions WHERE entity_type='reservation' AND entity_id=? ORDER BY created_at DESC,id DESC LIMIT 50").bind(reservation.id),
    env.DB.prepare('SELECT member_comment FROM reservation_member_comments WHERE reservation_id=?').bind(reservation.id),
  ]);
  reservation.admin_requests=(requests.results||[]).map(requestView);
  const pendingChange=reservation.admin_requests.find(item=>item.status==='pending'&&item.type==='change');
  if(pendingChange){
    const proposed=pendingChange.proposed||{};
    pendingChange.capacity=await getReservationChangeCapacity(env,reservation.id,reservation.event_id,
      proposed.accommodationSnapshot?.optionId||proposed.accommodationOptionId||null,
      proposed.accommodationSnapshot?.unitCount??proposed.accommodationUnits??0);
  }
  reservation.member_comment=comment.results?.[0]?.member_comment||'';
  const history=[{type:'reservation_created',at:reservation.created_at||reservation.submitted_at,actor:'member',label:'Rezervace vytvořena'}];
  for(const item of reservation.admin_requests){
    history.push({type:`request_${item.type}`,at:item.createdAt,actor:'member',label:item.type==='change'?'Žádost o změnu':'Žádost o zrušení',comment:item.memberNote});
    if(item.decidedAt)history.push({type:`request_${item.status}`,at:item.decidedAt,actor:'admin',label:item.status==='approved'?'Žádost schválena':'Žádost zamítnuta',comment:item.adminComment});
  }
  for(const action of actions.results||[]){
    if(['reservation_request_rejected','reservation_change_approved','reservation_cancellation_approved'].includes(action.action_type))continue;
    history.push({type:action.action_type,at:action.created_at,actor:action.admin_member_id===reservation.member_id?'member':'admin',label:action.action_type==='reservation_payment_update'?'Platba upravena':action.action_type==='reservation_car_changed'?'Auto rezervace změněno':action.action_type==='reservation_notes_changed'?'Poznámky rezervace upraveny':'Stav rezervace změněn',comment:action.note||'',oldState:parseJson(action.old_state_json),newState:parseJson(action.new_state_json)});
  }
  reservation.admin_history=history.filter(item=>item.at).sort((a,b)=>String(b.at).localeCompare(String(a.at)));
  return reservation;
}

async function reviewReservationRequest(request,env,auth,reservationId,requestId,origin){
  const body=await readBody(request,origin);if(body instanceof Response)return body;
  const allowed=new Set(['decision','adminComment']);if(Object.keys(body).some(key=>!allowed.has(key)))return json({ok:false,error:'invalid_fields',message:'Lze změnit pouze rozhodnutí a komentář pro člena.'},400,origin);
  const decision=clean(body.decision),comment=clean(body.adminComment).slice(0,1000);
  if(!['approved','rejected'].includes(decision))return json({ok:false,error:'invalid_decision',message:'Vyber schválení nebo zamítnutí.'},400,origin);
  const requestRow=await env.DB.prepare(`SELECT rr.*,r.status AS reservation_status,r.event_id,r.member_id,r.amount_paid_czk,r.amount_due_czk,
    e.full_weekend_nights,e.saturday_only_nights FROM reservation_requests rr JOIN reservations r ON r.id=rr.reservation_id
    JOIN events e ON e.id=r.event_id WHERE rr.id=? AND rr.reservation_id=? LIMIT 1`).bind(requestId,reservationId).first();
  if(!requestRow)return json({ok:false,error:'reservation_request_not_found',message:'Žádost nebyla nalezena.'},404,origin);
  if(requestRow.status!=='pending')return json({ok:false,error:'reservation_request_decided',message:'O této žádosti už bylo rozhodnuto.'},409,origin);
  const actionId=crypto.randomUUID(),updatedAt=new Date().toISOString();
  if(decision==='rejected'){
    const results=await env.DB.batch([
      env.DB.prepare("UPDATE reservation_requests SET status='rejected',admin_comment=?,decided_at=CURRENT_TIMESTAMP,decided_by=?,updated_at=? WHERE id=? AND status='pending'").bind(comment||null,auth.uid,updatedAt,requestId),
      env.DB.prepare(`INSERT INTO admin_actions(id,admin_member_id,action_type,entity_type,entity_id,new_state_json,note)
        SELECT ?,?,'reservation_request_rejected','reservation',?,json_object('requestId',?,'type',request_type,'decision','rejected'),? FROM reservation_requests WHERE id=? AND updated_at=?`).bind(actionId,auth.uid,reservationId,requestId,comment||null,requestId,updatedAt),
    ]);
    if(!results[0]?.meta?.changes)return json({ok:false,error:'reservation_request_decided',message:'O této žádosti už bylo rozhodnuto.'},409,origin);
    return json({ok:true,request:{id:requestId,status:'rejected',adminComment:comment},message:'Žádost byla zamítnuta. Původní rezervace zůstala beze změny.'},200,origin);
  }
  if(requestRow.request_type==='cancellation'){
    const results=await env.DB.batch([
      env.DB.prepare("UPDATE reservations SET status='cancelled',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,updated_at=? WHERE id=? AND status IN ('pending','approved') AND EXISTS(SELECT 1 FROM reservation_requests WHERE id=? AND reservation_id=? AND status='pending')").bind(auth.uid,updatedAt,reservationId,requestId,reservationId),
      env.DB.prepare("UPDATE reservation_requests SET status='approved',admin_comment=?,decided_at=CURRENT_TIMESTAMP,decided_by=?,updated_at=? WHERE id=? AND status='pending' AND EXISTS(SELECT 1 FROM reservations WHERE id=? AND updated_at=?)").bind(comment||null,auth.uid,updatedAt,requestId,reservationId,updatedAt),
      env.DB.prepare(`INSERT INTO admin_actions(id,admin_member_id,action_type,entity_type,entity_id,new_state_json,note)
        SELECT ?,?,'reservation_cancellation_approved','reservation',?,json_object('requestId',?,'status','cancelled'),? FROM reservation_requests WHERE id=? AND updated_at=?`).bind(actionId,auth.uid,reservationId,requestId,comment||null,requestId,updatedAt),
    ]);
    if(!results[0]?.meta?.changes)return json({ok:false,error:'reservation_state_changed',message:'Rezervace se mezitím změnila. Obnov detail.'},409,origin);
    return json({ok:true,request:{id:requestId,status:'approved',adminComment:comment},reservation:{id:reservationId,status:'cancelled'},message:'Zrušení bylo schváleno. Evidované platby zůstaly zachovány.'},200,origin);
  }
  const proposed=parseJson(requestRow.proposed_json);
  if(!proposed)return json({ok:false,error:'invalid_request_data',message:'Navržené údaje nelze bezpečně načíst.'},409,origin);
  let normalized;try{normalized=await normalizeProposal(env,requestRow,proposed)}catch(error){return json({ok:false,error:error.code||'invalid_request',message:error.message},error.status||409,origin)}
  const snapshot=normalized.accommodationSnapshot,option=snapshot?await env.DB.prepare('SELECT * FROM event_accommodation_options WHERE id=? AND event_id=? AND active=1').bind(snapshot.optionId,requestRow.event_id).first():null;
  const capacity=await getReservationChangeCapacity(env,reservationId,requestRow.event_id,snapshot?.optionId||null,snapshot?.unitCount||0);
  if(snapshot&&!capacity)return json({ok:false,error:'accommodation_option_not_found',message:'Vybrané ubytování už není dostupné. Obnov detail žádosti.'},409,origin);
  if(capacity&&!capacity.available)return accommodationCapacityConflict(capacity.optionName,origin,
    `Pro schválení chybí ${capacity.deficitUnits} ${capacity.deficitUnits===1?'ubytovací jednotka':'ubytovací jednotky'}. Rezervace zůstala beze změny.`,{capacity});
  const statements=[env.DB.prepare(`UPDATE reservations SET arrival=?,crew=?,accommodation=?,show_shine=?,note=?,attendance_type=?,accommodation_units=?,amount_due_czk=?,
    payment_status=CASE WHEN amount_paid_czk>? THEN 'overpaid' WHEN ?<=0 THEN 'not_required' WHEN amount_paid_czk<=0 THEN 'unpaid' WHEN amount_paid_czk<? THEN 'underpaid' ELSE 'paid' END,
    reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,updated_at=? WHERE id=? AND status='approved'
    AND EXISTS(SELECT 1 FROM reservation_requests pending_request WHERE pending_request.id=? AND pending_request.reservation_id=? AND pending_request.status='pending')
    ${snapshot?`AND EXISTS(SELECT 1 FROM event_accommodation_options current_option
      WHERE current_option.id=? AND current_option.event_id=? AND current_option.active=1
      AND (current_option.inventory_mode='unlimited' OR current_option.units_total>=?+
        (SELECT COALESCE(SUM(ra.unit_count),0) FROM reservation_accommodation ra JOIN reservations r2 ON r2.id=ra.reservation_id
          WHERE ra.option_id=? AND r2.status='approved' AND r2.id<>?)))`:''}`)
    .bind(normalized.arrival,normalized.crew,normalized.accommodation,normalized.showShine,normalized.note||null,normalized.attendanceType,normalized.accommodationUnits,normalized.amountDueCzk,
      normalized.amountDueCzk,normalized.amountDueCzk,normalized.amountDueCzk,auth.uid,updatedAt,reservationId,requestId,reservationId,
      ...(snapshot?[snapshot.optionId,requestRow.event_id,snapshot.unitCount,snapshot.optionId,reservationId]:[]))];
  if(snapshot)statements.push(env.DB.prepare(`INSERT INTO reservation_accommodation(reservation_id,option_id,option_name,kind,people_count,unit_count,unit_price_czk,person_price_czk,bedding_fee_per_person_czk,city_tax_per_person_per_night_czk,nights,base_total_czk,person_total_czk,bedding_total_czk,city_tax_total_czk,total_czk,updated_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM reservations WHERE id=? AND updated_at=?) AND EXISTS(SELECT 1 FROM reservation_requests WHERE id=? AND status='pending')
    ON CONFLICT(reservation_id) DO UPDATE SET option_id=excluded.option_id,option_name=excluded.option_name,kind=excluded.kind,people_count=excluded.people_count,unit_count=excluded.unit_count,unit_price_czk=excluded.unit_price_czk,person_price_czk=excluded.person_price_czk,bedding_fee_per_person_czk=excluded.bedding_fee_per_person_czk,city_tax_per_person_per_night_czk=excluded.city_tax_per_person_per_night_czk,nights=excluded.nights,base_total_czk=excluded.base_total_czk,person_total_czk=excluded.person_total_czk,bedding_total_czk=excluded.bedding_total_czk,city_tax_total_czk=excluded.city_tax_total_czk,total_czk=excluded.total_czk,updated_at=excluded.updated_at`)
    .bind(reservationId,snapshot.optionId,snapshot.optionName,snapshot.kind,snapshot.peopleCount,snapshot.unitCount,snapshot.unitPriceCzk,snapshot.personPriceCzk,snapshot.beddingFeePerPersonCzk,snapshot.cityTaxPerPersonPerNightCzk,snapshot.nights,snapshot.baseTotalCzk,snapshot.personTotalCzk,snapshot.beddingTotalCzk,snapshot.cityTaxTotalCzk,snapshot.totalCzk,updatedAt,reservationId,updatedAt,requestId));
  else statements.push(env.DB.prepare("DELETE FROM reservation_accommodation WHERE reservation_id=? AND EXISTS(SELECT 1 FROM reservations WHERE id=? AND updated_at=?) AND EXISTS(SELECT 1 FROM reservation_requests WHERE id=? AND status='pending')").bind(reservationId,reservationId,updatedAt,requestId));
  statements.push(env.DB.prepare("UPDATE reservation_requests SET status='approved',admin_comment=?,proposed_json=?,decided_at=CURRENT_TIMESTAMP,decided_by=?,updated_at=? WHERE id=? AND status='pending' AND EXISTS(SELECT 1 FROM reservations WHERE id=? AND updated_at=?)").bind(comment||null,JSON.stringify(normalized),auth.uid,updatedAt,requestId,reservationId,updatedAt));
  statements.push(env.DB.prepare(`INSERT INTO admin_actions(id,admin_member_id,action_type,entity_type,entity_id,old_state_json,new_state_json,note)
    SELECT ?,?,'reservation_change_approved','reservation',?,original_json,proposed_json,? FROM reservation_requests WHERE id=? AND updated_at=?`).bind(actionId,auth.uid,reservationId,comment||null,requestId,updatedAt));
  const results=await env.DB.batch(statements);
  if(!results[0]?.meta?.changes)return option?accommodationCapacityConflict(option.name,origin,'Požadovaná změna už nemá dostupnou kapacitu. Rezervace zůstala beze změny.'):json({ok:false,error:'reservation_state_changed',message:'Rezervace se mezitím změnila. Obnov detail.'},409,origin);
  return json({ok:true,request:{id:requestId,status:'approved',adminComment:comment},reservation:{id:reservationId,status:'approved',amountDueCzk:normalized.amountDueCzk,amountPaidCzk:Number(requestRow.amount_paid_czk||0),paymentStatus:paymentStatusFor(normalized.amountDueCzk,requestRow.amount_paid_czk)},message:'Změna byla schválena a cena přepočítána. Evidované platby zůstaly zachovány.'},200,origin);
}

async function acknowledgeReservationRequest(env,auth,reservationId,requestId,origin){
  const result=await env.DB.prepare(`UPDATE reservation_requests
    SET member_acknowledged_at=CURRENT_TIMESTAMP
    WHERE id=? AND reservation_id=? AND member_id=? AND request_type='change' AND status='approved'
      AND member_acknowledged_at IS NULL
      AND EXISTS(SELECT 1 FROM reservations WHERE id=? AND member_id=?)`).bind(requestId,reservationId,auth.uid,reservationId,auth.uid).run();
  const row=await env.DB.prepare(`SELECT rr.* FROM reservation_requests rr
    JOIN reservations r ON r.id=rr.reservation_id
    WHERE rr.id=? AND rr.reservation_id=? AND rr.member_id=? AND r.member_id=? LIMIT 1`).bind(requestId,reservationId,auth.uid,auth.uid).first();
  if(!row)return json({ok:false,error:'reservation_request_not_found',message:'Žádost nebyla nalezena.'},404,origin);
  if(row.request_type!=='change'||row.status!=='approved')return json({ok:false,error:'reservation_request_not_acknowledgeable',message:'Tuto žádost nelze potvrdit.'},409,origin);
  return json({ok:true,unchanged:!result.meta?.changes,request:requestView(row),message:'Potvrzení bylo uloženo.'},200,origin);
}

export {acknowledgeReservationRequest,attachAdminReservationContext,attachMemberReservationRequest,requestView,reviewReservationRequest,submitReservationRequest,updateReservationCar};
