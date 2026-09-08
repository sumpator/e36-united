import { json } from '../http/responses.js';
import { cors } from '../http/cors.js';
import { deriveUnitedAchievements, deriveMemberRating } from '../domains/club/achievements.js';
import { MEMBER_QR_PREFIX, parseMemberQr } from './member-qr.js';

const validId=value=>typeof value==='string'&&/^[a-z0-9_-]{1,128}$/i.test(value);
const identity='m.id AS memberId,m.member_code AS memberCode,m.name,m.nickname,m.email,m.phone,m.status,m.role,m.created_at AS createdAt,m.updated_at AS updatedAt';
const pageOf=url=>Math.min(100000,Math.max(1,Math.trunc(Number(url.searchParams.get('page')))||1));
const statement=(env,sql,args=[])=>env.DB.prepare(sql).bind(...args);
const all=async(env,sql,args=[])=>(await statement(env,sql,args).all()).results||[];
async function response(payload,origin){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)));
  const dataVersion=[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
  return json({ok:true,...payload,dataVersion,freshness:{generatedAt:new Date().toISOString()}},200,origin);
}

export function memberSearchQuery(url){
  const q=(url.searchParams.get('q')||'').trim().slice(0,100),status=url.searchParams.get('status');
  const where=[],args=[];
  if(status&&['active','inactive','blocked','suspended'].includes(status)){where.push('m.status=?');args.push(status)}
  if(q){
    if(q.replace(/[^\p{L}\p{N}]/gu,'').length<2||q.startsWith('E36U'))return null;
    const needle='%'+q.replace(/[\\%_]/g,'\\$&')+'%';
    where.push("(m.name LIKE ? ESCAPE '\\' OR m.nickname LIKE ? ESCAPE '\\' OR m.email LIKE ? ESCAPE '\\' OR m.member_code LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM cars c WHERE c.member_id=m.id AND (c.model LIKE ? ESCAPE '\\' OR c.nickname LIKE ? ESCAPE '\\')))");args.push(...Array(6).fill(needle));
  }
  return {where:where.length?' WHERE '+where.join(' AND '):'',args,q};
}
export async function listAdminMembers(env,url,origin){
  const query=memberSearchQuery(url);if(!query)return json({error:'invalid_search'},400,origin);
  const page=pageOf(url),pageSize=query.q?20:30;
  const result=await env.DB.batch([
    statement(env,`SELECT ${identity} FROM members m${query.where} ORDER BY m.created_at DESC,m.id LIMIT ? OFFSET ?`,[...query.args,pageSize,(page-1)*pageSize]),
    statement(env,`SELECT COUNT(*) total FROM members m${query.where}`,query.args),
  ]);
  const total=Number(result[1].results[0].total);
  return response({members:result[0].results,pagination:{page,pageSize,total,totalPages:Math.max(1,Math.ceil(total/pageSize))}},origin);
}

async function paged(env,select,from,where,args,page){
  const pageSize=20;
  const results=await env.DB.batch([
    statement(env,`SELECT ${select} FROM ${from} WHERE ${where} LIMIT ? OFFSET ?`,[...args,pageSize,(page-1)*pageSize]),
    statement(env,`SELECT COUNT(*) total FROM ${from} WHERE ${where.replace(/ ORDER BY [\s\S]*$/,'')}`,args),
  ]);
  const total=Number(results[1].results[0].total);
  return {items:results[0].results,pagination:{page,pageSize,total,totalPages:Math.max(1,Math.ceil(total/pageSize))}};
}
const reservationFields='r.id,r.member_id AS memberId,r.event_id AS eventId,e.year,e.title,r.status,r.crew,r.attendance_type AS attendanceType,r.accommodation,r.accommodation_units AS accommodationUnits,r.car_id AS carId,r.car_model AS carModel,r.show_shine AS showShine,r.amount_due_czk AS amountDueCzk,r.amount_paid_czk AS amountPaidCzk,r.payment_vs AS variableSymbol,r.created_at AS createdAt,r.arrival,r.payment_status AS storedPaymentStatus,r.paid_at AS paidAt,ra.option_name AS stayName,ra.people_count AS stayPeople,ra.unit_count AS stayUnits,ra.nights AS stayNights';

export async function getAdminMember(env,url,memberId,tab,origin){
  if(!validId(memberId))return json({error:'invalid_member'},400,origin);
  const member=await statement(env,`SELECT ${identity} FROM members m WHERE m.id=?`,[memberId]).first();
  if(!member)return json({error:'member_not_found'},404,origin);
  const eventId=url.searchParams.get('eventId')||'',page=pageOf(url);
  if(eventId&&!validId(eventId))return json({error:'invalid_event'},400,origin);
  const context={memberId,eventId,tab:tab||'header',page};let data;
  if(!tab){
    const event=eventId?await statement(env,'SELECT id,year,title FROM events WHERE id=?',[eventId]).first():null;
    if(eventId&&!event)return json({error:'event_not_found'},404,origin);
    const reservations=eventId?await all(env,`SELECT ${reservationFields} FROM reservations r JOIN events e ON e.id=r.event_id LEFT JOIN reservation_accommodation ra ON ra.reservation_id=r.id WHERE r.member_id=? AND r.event_id=? ORDER BY r.created_at DESC,r.id LIMIT 20`,[memberId,eventId]):[];
    return response({context,member,event,reservations},origin);
  }
  if(tab==='reservations')data=await paged(env,reservationFields,'reservations r JOIN events e ON e.id=r.event_id LEFT JOIN reservation_accommodation ra ON ra.reservation_id=r.id','r.member_id=? ORDER BY e.year DESC,r.id',[memberId],page);
  else if(tab==='garage'){
    data=await paged(env,'c.id,c.member_id AS memberId,c.model,c.nickname,c.body,c.year,c.color,c.is_primary AS primaryCar','cars c','c.member_id=? ORDER BY c.is_primary DESC,c.created_at,c.id',[memberId],page);
    if(data.items.length){const ids=data.items.map(item=>item.id);const photos=await all(env,`SELECT p.id,p.car_id AS carId,p.created_at AS version FROM car_photos p JOIN cars c ON c.id=p.car_id WHERE c.member_id=? AND p.car_id IN (${ids.map(()=>'?').join(',')}) ORDER BY p.sort_order,p.id`,[memberId,...ids]);for(const car of data.items)car.photos=photos.filter(p=>p.carId===car.id).map(p=>({...p,mediaPath:`/api/admin/members/${encodeURIComponent(memberId)}/media/cars/${encodeURIComponent(car.id)}/${encodeURIComponent(p.id)}`}))}
  }else if(tab==='photos'){
    data=await paged(env,'g.id,g.member_id AS memberId,g.car_id AS carId,g.caption,g.status,g.created_at AS version,g.review_note AS reviewNote','gallery_submissions g','g.member_id=? ORDER BY g.created_at DESC,g.id',[memberId],page);
    for(const item of data.items)item.mediaPath=`/api/admin/members/${encodeURIComponent(memberId)}/media/photos/${encodeURIComponent(item.id)}`;
  }else if(tab==='history'){
    data=await paged(env,'h.id,h.member_id AS memberId,h.event_id AS eventId,e.year,h.attendance_status AS attendanceStatus,h.sns_status AS snsStatus,h.sns_category AS category,h.sns_placement AS placement,h.sns_best_of_best AS bestOfBest,h.sns_best_exhaust AS bestExhaust,h.attendance_review_note AS attendanceNote,h.sns_review_note AS snsNote,h.submitted_at AS submittedAt','united_history_claims h JOIN events e ON e.id=h.event_id','h.member_id=? ORDER BY e.year DESC,h.id',[memberId],page);
    if(data.items.length){const ids=data.items.map(item=>item.id);const evidence=await all(env,`SELECT p.id,p.claim_id AS claimId,p.created_at AS version FROM united_history_evidence p JOIN united_history_claims h ON h.id=p.claim_id WHERE p.member_id=? AND h.member_id=? AND p.claim_id IN (${ids.map(()=>'?').join(',')}) ORDER BY p.sort_order,p.id`,[memberId,memberId,...ids]);for(const claim of data.items)claim.photos=evidence.filter(p=>p.claimId===claim.id).map(p=>({...p,mediaPath:`/api/admin/members/${encodeURIComponent(memberId)}/media/history/${encodeURIComponent(claim.id)}/${encodeURIComponent(p.id)}`}))}
  }else if(tab==='points')data=await paged(env,'p.id,p.member_id AS memberId,p.delta,p.reason,p.event_id AS eventId,p.created_at AS createdAt','united_points_ledger p','p.member_id=? ORDER BY p.created_at DESC,p.id',[memberId],page);
  else if(tab==='club'){
    // Only the compact fields needed by the EXISTING pure achievement derivation.
    const history=await all(env,'SELECT h.event_id,e.year,h.attendance_status,h.sns_status,h.sns_placement,h.sns_category,h.sns_best_of_best,h.sns_best_exhaust FROM united_history_claims h JOIN events e ON e.id=h.event_id WHERE h.member_id=?',[memberId]);
    const mapped=history.map(h=>({eventId:h.event_id,eventYear:h.year,attendance:{status:h.attendance_status},showShine:{status:h.sns_status,placement:h.sns_placement,category:h.sns_category,bestOfBest:!!h.sns_best_of_best,bestExhaust:!!h.sns_best_exhaust}}));
    const points=await statement(env,'SELECT COALESCE(SUM(delta),0) available,COALESCE(SUM(CASE WHEN delta>0 THEN delta ELSE 0 END),0) lifetime FROM united_points_ledger WHERE member_id=?',[memberId]).first();
    const photos=await statement(env,"SELECT COUNT(*) total FROM gallery_submissions WHERE member_id=? AND status='approved'",[memberId]).first();
    const derived=deriveUnitedAchievements(mapped,Number(photos.total));data={points,rating:deriveMemberRating(points.lifetime),achievements:derived.achievements,approvedPhotoCount:Number(photos.total)};
  }else if(tab==='mailing'){
    // Actual foreign-key linkage only. Historical matching emails are NOT ownership.
    const contact=await statement(env,'SELECT id,email,suppression_status AS suppressionStatus,deliverability_status AS deliverabilityStatus,mailing_consent_status AS mailingConsent FROM mailing_contacts WHERE current_member_id=?',[memberId]).first();
    data=await paged(env,'p.id,p.member_id AS memberId,p.campaign_id AS campaignId,c.internal_name AS campaign,p.delivery_status AS deliveryStatus,p.sent_at AS sentAt,p.created_at AS createdAt','mailing_campaign_recipients p JOIN mailing_campaigns c ON c.id=p.campaign_id','(p.member_id=? OR p.contact_id=?) ORDER BY p.created_at DESC,p.id',[memberId,contact?.id||''],page);data.contact=contact||null;
  }else if(tab==='qr'){
    const qr=await statement(env,'SELECT token FROM member_qr_identities WHERE member_id=?',[memberId]).first();data={payload:qr?MEMBER_QR_PREFIX+qr.token:null};
  }else return json({error:'unknown_member_section'},404,origin);
  return response({context,...data},origin);
}

export async function resolveAdminMemberQr(request,env,origin){
  if(Number(request.headers.get('Content-Length'))>256)return json({error:'invalid_qr'},400,origin);
  const reader=request.body?.getReader();let size=0,chunks=[];
  if(reader){for(;;){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>256){await reader.cancel();return json({error:'invalid_qr'},400,origin)}chunks.push(value)}}
  let payload;try{const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}payload=JSON.parse(new TextDecoder().decode(bytes)).payload}catch{return json({error:'invalid_qr'},400,origin)}
  const token=parseMemberQr(payload);if(!token)return json({error:'invalid_qr'},400,origin);
  const row=await statement(env,'SELECT q.member_id AS memberId FROM member_qr_identities q JOIN members m ON m.id=q.member_id WHERE q.token=?',[token]).first();
  return row?response(row,origin):json({error:'member_not_found'},404,origin);
}

export async function adminMemberMedia(env,memberId,kind,parentId,photoId,origin){
  if(![memberId,parentId,photoId].every(validId))return json({error:'invalid_media'},400,origin);
  let sql,args;
  if(kind==='cars'){sql='SELECT p.r2_key FROM car_photos p JOIN cars c ON c.id=p.car_id WHERE c.member_id=? AND c.id=? AND p.id=?';args=[memberId,parentId,photoId]}
  else if(kind==='history'){sql='SELECT p.r2_key FROM united_history_evidence p JOIN united_history_claims h ON h.id=p.claim_id WHERE h.member_id=? AND p.member_id=? AND h.id=? AND p.id=?';args=[memberId,memberId,parentId,photoId]}
  else if(kind==='photos'){sql='SELECT g.r2_key FROM gallery_submissions g WHERE g.member_id=? AND g.id=? AND (g.car_id IS NULL OR EXISTS(SELECT 1 FROM cars c WHERE c.id=g.car_id AND c.member_id=g.member_id))';args=[memberId,photoId]}
  else return json({error:'invalid_media'},404,origin);
  const row=await statement(env,sql,args).first();if(!row)return json({error:'media_not_found'},404,origin);
  const object=await env.MEDIA.get(row.r2_key);if(!object)return json({error:'media_not_found'},404,origin);
  return cors(new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType||'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}}),origin);
}
