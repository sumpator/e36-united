import { cors } from '../http/cors.js';
import { json } from '../http/responses.js';
import { clean } from '../utils/text.js';
import { MEMBER_QR_PREFIX, parseMemberQr } from '../admin/member-qr.js';
import { extensionFor, validateImageFile } from './media.js';

const DISCIPLINES = new Set(['show_shine', 'best_exhaust']);
const LIVE_STATES = new Set(['idle', 'live', 'paused', 'closed', 'published']);
export const SHOW_SHINE_CATEGORIES = Object.freeze(['Sedan', 'Coupé', 'Touring', 'Cabrio', 'Compact', 'Z3', '///M Power']);
const SHOW_SHINE_CATEGORY_SET = new Set(SHOW_SHINE_CATEGORIES);
export const DEFAULT_JUDGE_CRITERIA = Object.freeze(['overall', 'condition', 'cohesion', 'originality']);

const validId = value => typeof value === 'string' && /^[a-z0-9_-]{1,128}$/i.test(value);
const score = value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 10 ? Number(value) : null;
const all = async (env, sql, bindings = []) => (await env.DB.prepare(sql).bind(...bindings).all()).results || [];
const one = (env, sql, bindings = []) => env.DB.prepare(sql).bind(...bindings).first();
const nowPrague = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date()).replace(' ', 'T');

async function readBody(request) {
  if (Number(request.headers.get('Content-Length') || 0) > 64_000) throw Object.assign(new Error('invalid_body'), { status: 413 });
  let body;
  try { body = await request.json(); } catch { throw Object.assign(new Error('invalid_json'), { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw Object.assign(new Error('invalid_json'), { status: 400 });
  return body;
}

async function activeLiveEvent(env) {
  return one(env, `SELECT id,year,title,starts_on,ends_on,venue_name,registration_status,is_current,live_enabled
    FROM events WHERE live_enabled=1 ORDER BY year DESC LIMIT 1`);
}
async function eventById(env, eventId) {
  return validId(eventId) ? one(env, `SELECT id,year,title,starts_on,ends_on,venue_name,registration_status,is_current,live_enabled
    FROM events WHERE id=? LIMIT 1`, [eventId]) : null;
}
const eventView = event => event ? ({ id:event.id, year:Number(event.year), title:event.title, startsOn:event.starts_on||null, endsOn:event.ends_on||null, venue:event.venue_name||'', registrationStatus:event.registration_status, isCurrent:!!event.is_current, liveEnabled:!!event.live_enabled }) : null;

function programView(row) { return { id:row.id, day:row.day, startsAt:row.starts_at, endsAt:row.ends_at||null, title:row.title, venue:row.venue||'', description:row.description||'', status:row.status, visible:!!row.visible }; }
async function programFor(env, eventId, includeHidden = false) {
  return (await all(env, `SELECT id,day,starts_at,ends_at,title,venue,description,status,visible FROM event_program_items
    WHERE event_id=? ${includeHidden ? '' : 'AND visible=1'} ORDER BY day,starts_at,sort_order,id`, [eventId])).map(programView);
}

async function stateRows(env, eventId) {
  const states = await all(env, `SELECT s.discipline,s.status,s.version,s.updated_at,e.id entry_id,e.member_id,e.car_id,e.category,e.presented_at,
    c.model,c.body,c.nickname,m.name,m.nickname member_nickname,
    (SELECT p.id FROM car_photos p WHERE p.car_id=c.id ORDER BY p.sort_order,p.id LIMIT 1) photo_id
    FROM live_competition_state s LEFT JOIN live_entries e ON e.id=s.current_entry_id
    LEFT JOIN cars c ON c.id=e.car_id LEFT JOIN members m ON m.id=e.member_id
    WHERE s.event_id=? ORDER BY s.discipline`, [eventId]);
  return Object.fromEntries(states.map(row => [row.discipline, {
    discipline:row.discipline, status:row.status, version:Number(row.version), updatedAt:row.updated_at,
    entry:row.entry_id ? { id:row.entry_id, memberId:row.member_id, carId:row.car_id, category:row.category||'', presentedAt:row.presented_at, car:{ model:row.model, body:row.body||'', nickname:row.nickname||'' }, member:{ name:row.member_nickname||row.name }, imageUrl:row.photo_id?`/api/live/entries/${encodeURIComponent(row.entry_id)}/media`:null } : null,
  }]));
}

async function categoryRows(env,eventId){
  const [states,counts]=await Promise.all([
    all(env,`SELECT category,status,version,updated_at updatedAt FROM live_category_state WHERE event_id=? AND discipline='show_shine'`,[eventId]),
    all(env,`SELECT e.category,COUNT(DISTINCT e.car_id) loaded,
      COUNT(DISTINCT CASE WHEN EXISTS(SELECT 1 FROM live_judge_scores s WHERE s.entry_id=e.id AND s.submitted=1) THEN e.car_id END) scored
      FROM live_entries e WHERE e.event_id=? AND e.discipline='show_shine' AND e.category IS NOT NULL GROUP BY e.category`,[eventId]),
  ]);
  const stateByCategory=new Map(states.map(row=>[row.category,row])),countByCategory=new Map(counts.map(row=>[row.category,row]));
  return SHOW_SHINE_CATEGORIES.map(category=>{const state=stateByCategory.get(category),count=countByCategory.get(category);return{category,status:state?.status||'idle',version:Number(state?.version||1),updatedAt:state?.updatedAt||null,loaded:Number(count?.loaded||0),scored:Number(count?.scored||0)}});
}

function currentProgram(program, clock = nowPrague()) {
  const visible = program.filter(item => item.status !== 'cancelled');
  const running = visible.find(item => item.startsAt <= clock && (!item.endsAt || item.endsAt >= clock));
  const next = visible.find(item => item.startsAt > clock);
  return { clock, current:running||null, next:next||null };
}

async function memberContext(env, eventId, memberId) {
  const reservation = await one(env, `SELECT r.id,r.status,r.arrival,r.attendance_type,r.crew,r.accommodation,r.show_shine,r.car_id,r.car_model,r.car_body,r.car_nickname,r.amount_due_czk,r.amount_paid_czk,r.payment_status,
    ra.option_name stay_name,ra.people_count stay_people,ra.nights stay_nights
    FROM reservations r LEFT JOIN reservation_accommodation ra ON ra.reservation_id=r.id
    WHERE r.event_id=? AND r.member_id=? LIMIT 1`, [eventId, memberId]);
  const presence = await one(env, 'SELECT present FROM event_member_presence WHERE event_id=? AND member_id=?', [eventId, memberId]);
  const qr = await one(env, 'SELECT token FROM member_qr_identities WHERE member_id=?', [memberId]);
  const judge = await one(env, `SELECT 1 assigned FROM members m WHERE m.id=? AND m.status='active'
    AND (m.role='admin' OR EXISTS(SELECT 1 FROM event_live_judges j WHERE j.event_id=? AND j.member_id=m.id))`, [memberId, eventId]);
  return {
    memberId,
    reservation:reservation ? { id:reservation.id,status:reservation.status,arrival:reservation.arrival||'',attendanceType:reservation.attendance_type||'',crew:Number(reservation.crew||1),accommodation:reservation.stay_name||reservation.accommodation||'Bez ubytování',stayPeople:Number(reservation.stay_people||0),stayNights:Number(reservation.stay_nights||0),showShine:reservation.show_shine||'',carId:reservation.car_id||null,car:[reservation.car_nickname,reservation.car_model,reservation.car_body].filter(Boolean).join(' · '),payment:{due:Number(reservation.amount_due_czk||0),paid:Number(reservation.amount_paid_czk||0),status:reservation.payment_status||'unpaid'}}:null,
    present:presence?.present === 1,
    eligible:reservation?.status === 'approved',
    qrPayload:qr ? MEMBER_QR_PREFIX + qr.token : null,
    judge:!!judge,
  };
}

async function voteHistory(env, eventId, memberId) {
  return all(env, `SELECT v.entry_id entryId,v.discipline,v.score,v.updated_at updatedAt,e.presented_at presentedAt,c.model,c.nickname,m.name,m.nickname memberNickname
    FROM live_public_votes v JOIN live_entries e ON e.id=v.entry_id JOIN cars c ON c.id=e.car_id JOIN members m ON m.id=e.member_id
    WHERE v.event_id=? AND v.voter_id=? ORDER BY v.updated_at DESC`, [eventId, memberId]);
}

async function judgeWork(env, eventId, memberId) {
  const rows=await all(env,`SELECT e.id entryId,e.member_id memberId,e.car_id carId,e.category,e.presented_at presentedAt,c.model,c.body,c.nickname,m.name,m.nickname memberNickname,
    s.scores_json scoresJson,s.note,s.submitted,s.updated_at updatedAt
    FROM live_entries e JOIN cars c ON c.id=e.car_id JOIN members m ON m.id=e.member_id
    LEFT JOIN live_judge_scores s ON s.entry_id=e.id AND s.judge_id=?
    WHERE e.event_id=? AND e.discipline='show_shine' AND e.presented_at IS NOT NULL ORDER BY e.presented_at DESC,e.id`,[memberId,eventId]);
  const photos=await all(env,`SELECT id,entry_id entryId,created_at createdAt FROM live_judge_photos WHERE event_id=? AND judge_id=? ORDER BY created_at,id`,[eventId,memberId]);
  const byEntry=new Map();for(const photo of photos)(byEntry.get(photo.entryId)||byEntry.set(photo.entryId,[]).get(photo.entryId)).push({...photo,imageUrl:`/api/live/judge/photos/${encodeURIComponent(photo.id)}`});
  return rows.map(row=>{let scores={};try{scores=JSON.parse(row.scoresJson||'{}')}catch{}return{entryId:row.entryId,memberId:row.memberId,carId:row.carId,category:row.category||'',presentedAt:row.presentedAt,car:{model:row.model,body:row.body||'',nickname:row.nickname||''},member:{name:row.memberNickname||row.name},scores,note:row.note||'',submitted:row.submitted===1,updatedAt:row.updatedAt||null,photos:byEntry.get(row.entryId)||[]}});
}

async function publishedResults(env, eventId, includeUnpublished = false) {
  const published = await all(env, "SELECT discipline FROM live_competition_state WHERE event_id=? AND status='published'", [eventId]);
  const allowed = new Set(published.map(row=>row.discipline));
  if (!includeUnpublished && !allowed.size) return {};
  const publicRows = await all(env, `SELECT e.discipline,e.id entryId,c.model,c.nickname,m.name,m.nickname memberNickname,e.category,ROUND(AVG(v.score),2) average,COUNT(v.id) votes
    FROM live_entries e JOIN cars c ON c.id=e.car_id JOIN members m ON m.id=e.member_id LEFT JOIN live_public_votes v ON v.entry_id=e.id
    WHERE e.event_id=? AND e.presented_at IS NOT NULL GROUP BY e.id ORDER BY e.discipline,average DESC,votes DESC,e.id`, [eventId]);
  const juryRows = await all(env, `SELECT e.id entryId,ROUND(AVG((json_extract(j.scores_json,'$.overall')+json_extract(j.scores_json,'$.condition')+json_extract(j.scores_json,'$.cohesion')+json_extract(j.scores_json,'$.originality'))/4.0),2) average,COUNT(j.id) judges,
    ROUND(AVG(json_extract(j.scores_json,'$.overall')),2) overall,ROUND(AVG(json_extract(j.scores_json,'$.condition')),2) condition,ROUND(AVG(json_extract(j.scores_json,'$.cohesion')),2) cohesion,ROUND(AVG(json_extract(j.scores_json,'$.originality')),2) originality
    FROM live_entries e LEFT JOIN live_judge_scores j ON j.entry_id=e.id AND j.submitted=1 WHERE e.event_id=? AND e.discipline='show_shine' GROUP BY e.id`, [eventId]);
  const jury = new Map(juryRows.map(row=>[row.entryId,row]));
  const grouped={};
  for(const row of publicRows){if(!includeUnpublished&&!allowed.has(row.discipline))continue;(grouped[row.discipline]||=[]).push({...row,average:row.votes?Number(row.average):null,votes:Number(row.votes),published:allowed.has(row.discipline),jury:row.discipline==='show_shine'&&jury.get(row.entryId)?{average:jury.get(row.entryId).judges?Number(jury.get(row.entryId).average):null,judges:Number(jury.get(row.entryId).judges),criteria:{overall:Number(jury.get(row.entryId).overall)||null,condition:Number(jury.get(row.entryId).condition)||null,cohesion:Number(jury.get(row.entryId).cohesion)||null,originality:Number(jury.get(row.entryId).originality)||null}}:null});}
  for(const items of Object.values(grouped)){let publicRank=0,lastPublic=null,juryRank=0,lastJury=null;items.forEach((item,index)=>{if(item.average!==lastPublic){publicRank=index+1;lastPublic=item.average}item.publicRank=item.average==null?null:publicRank});[...items].sort((a,b)=>(b.jury?.average??-1)-(a.jury?.average??-1)).forEach((item,index)=>{const value=item.jury?.average??null;if(value!==lastJury){juryRank=index+1;lastJury=value}item.juryRank=value==null?null:juryRank})}
  return grouped;
}

export async function getMemberLive(env, auth, origin) {
  const event=await activeLiveEvent(env);
  if(!event)return json({ok:true,active:false,event:null},200,origin);
  const [program,states,context]=await Promise.all([programFor(env,event.id),stateRows(env,event.id),memberContext(env,event.id,auth.uid)]);
  const [votes,results,gallery,ownUploads,judgeHistory]=await Promise.all([
    voteHistory(env,event.id,auth.uid),publishedResults(env,event.id),
    all(env,`SELECT id,caption,created_at createdAt FROM gallery_submissions WHERE event_id=? AND status='approved' ORDER BY created_at DESC,id DESC LIMIT 30`,[event.id]),
    all(env,`SELECT id,caption,status,created_at createdAt FROM gallery_submissions WHERE event_id=? AND member_id=? ORDER BY created_at DESC,id DESC LIMIT 20`,[event.id,auth.uid]),
    context.judge?judgeWork(env,event.id,auth.uid):Promise.resolve([]),
  ]);
  return json({ok:true,active:true,event:eventView(event),program,now:currentProgram(program),states,me:context,votes,results,gallery:gallery.map(item=>({...item,imageUrl:`/api/gallery/media/${encodeURIComponent(item.id)}`})),ownUploads,judgeHistory,judgeCriteria:DEFAULT_JUDGE_CRITERIA},200,origin);
}

export async function getLiveState(env, auth, url, origin) {
  const event=await activeLiveEvent(env);if(!event)return json({ok:true,active:false},200,origin);
  const [states,program]=await Promise.all([stateRows(env,event.id),programFor(env,event.id)]);
  return json({ok:true,active:true,event:eventView(event),states,now:currentProgram(program)},200,origin);
}

export async function saveLiveVote(request, env, auth, entryId, origin) {
  const body=await readBody(request),value=score(body.score);if(!value)return json({ok:false,error:'invalid_score'},400,origin);
  const entry=await one(env,`SELECT e.*,s.status,cs.status category_status FROM live_entries e JOIN events ev ON ev.id=e.event_id AND ev.live_enabled=1 JOIN live_competition_state s ON s.event_id=e.event_id AND s.discipline=e.discipline LEFT JOIN live_category_state cs ON cs.event_id=e.event_id AND cs.discipline=e.discipline AND cs.category=e.category WHERE e.id=?`,[entryId]);
  if(!entry)return json({ok:false,error:'entry_not_available'},404,origin);
  if(entry.category_status==='closed')return json({ok:false,error:'category_closed'},409,origin);
  if(!['live','paused'].includes(entry.status)||!entry.presented_at)return json({ok:false,error:'voting_not_open'},409,origin);
  if(entry.status==='paused')return json({ok:false,error:'voting_paused'},409,origin);
  if(entry.member_id===auth.uid)return json({ok:false,error:'own_car_vote'},403,origin);
  const context=await memberContext(env,entry.event_id,auth.uid);if(!context.eligible)return json({ok:false,error:'approved_registration_required'},403,origin);
  await env.DB.prepare(`INSERT INTO live_public_votes(id,event_id,discipline,entry_id,voter_id,score) VALUES(?,?,?,?,?,?)
    ON CONFLICT(event_id,discipline,entry_id,voter_id) DO UPDATE SET score=excluded.score,updated_at=CURRENT_TIMESTAMP`).bind(crypto.randomUUID(),entry.event_id,entry.discipline,entry.id,auth.uid,value).run();
  return json({ok:true,entryId,score:value},200,origin);
}

export async function saveJudgeScore(request,env,auth,entryId,origin){
  const body=await readBody(request),entry=await one(env,`SELECT e.*,s.status,cs.status category_status FROM live_entries e JOIN events ev ON ev.id=e.event_id AND ev.live_enabled=1 JOIN live_competition_state s ON s.event_id=e.event_id AND s.discipline=e.discipline LEFT JOIN live_category_state cs ON cs.event_id=e.event_id AND cs.discipline=e.discipline AND cs.category=e.category WHERE e.id=? AND e.discipline='show_shine'`,[entryId]);
  if(!entry)return json({ok:false,error:'entry_not_available'},404,origin);
  const allowed=await one(env,`SELECT 1 ok FROM members m WHERE m.id=? AND m.status='active'
    AND (m.role='admin' OR EXISTS(SELECT 1 FROM event_live_judges j WHERE j.event_id=? AND j.member_id=m.id))`,[auth.uid,entry.event_id]);if(!allowed)return json({ok:false,error:'judge_forbidden'},403,origin);
  if(entry.member_id===auth.uid)return json({ok:false,error:'own_car_score'},403,origin);
  if(!entry.presented_at)return json({ok:false,error:'entry_not_presented'},409,origin);
  if(entry.category_status==='closed'||['closed','published'].includes(entry.status))return json({ok:false,error:'judging_closed'},409,origin);
  const invalid=DEFAULT_JUDGE_CRITERIA.some(key=>body.scores?.[key]!==''&&body.scores?.[key]!=null&&score(body.scores[key])===null);if(invalid)return json({ok:false,error:'invalid_score'},400,origin);
  const scores=Object.fromEntries(DEFAULT_JUDGE_CRITERIA.map(key=>[key,score(body.scores?.[key])]));
  const submitted=body.submitted===true;if(submitted&&Object.values(scores).some(value=>!value))return json({ok:false,error:'incomplete_score'},400,origin);
  await env.DB.prepare(`INSERT INTO live_judge_scores(id,event_id,entry_id,judge_id,scores_json,note,submitted) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(event_id,entry_id,judge_id) DO UPDATE SET scores_json=excluded.scores_json,note=excluded.note,submitted=excluded.submitted,updated_at=CURRENT_TIMESTAMP`).bind(crypto.randomUUID(),entry.event_id,entry.id,auth.uid,JSON.stringify(scores),clean(body.note).slice(0,1000)||null,submitted?1:0).run();
  return json({ok:true,entryId,scores,note:clean(body.note).slice(0,1000),submitted},200,origin);
}

export async function uploadLivePhoto(request,env,auth,origin){
  const event=await activeLiveEvent(env);if(!event)return json({ok:false,error:'live_disabled'},409,origin);
  const form=await request.formData(),file=form.get('file'),validation=validateImageFile(file);if(validation)return json({ok:false,error:validation},400,origin);
  const caption=clean(form.get('caption')).slice(0,240),carId=clean(form.get('carId'));
  if(carId&&!validId(carId))return json({ok:false,error:'invalid_car'},400,origin);
  const id=crypto.randomUUID(),key=`gallery/${auth.uid}/${id}.${extensionFor(file.type)}`;
  await env.MEDIA.put(key,file.stream(),{httpMetadata:{contentType:file.type},customMetadata:{owner:auth.uid,kind:'gallery',submissionId:id,eventId:event.id}});
  try{await env.DB.prepare("INSERT INTO gallery_submissions(id,member_id,car_id,event_id,r2_key,caption,status) VALUES(?,?,?,?,?,?,'pending')").bind(id,auth.uid,carId||null,event.id,key,caption||null).run()}catch(error){await env.MEDIA.delete(key);throw error}
  return json({ok:true,submission:{id,status:'pending',caption}},201,origin);
}

export async function uploadJudgePhoto(request,env,auth,entryId,origin){
  const entry=await one(env,`SELECT e.* FROM live_entries e JOIN events ev ON ev.id=e.event_id AND ev.live_enabled=1 WHERE e.id=?`,[entryId]);if(!entry)return json({ok:false,error:'entry_not_available'},404,origin);
  const allowed=await one(env,`SELECT 1 ok FROM members m WHERE m.id=? AND m.status='active'
    AND (m.role='admin' OR EXISTS(SELECT 1 FROM event_live_judges j WHERE j.event_id=? AND j.member_id=m.id))`,[auth.uid,entry.event_id]);if(!allowed)return json({ok:false,error:'judge_forbidden'},403,origin);
  if(entry.member_id===auth.uid)return json({ok:false,error:'own_car_score'},403,origin);
  const form=await request.formData(),file=form.get('file'),validation=validateImageFile(file);if(validation)return json({ok:false,error:validation},400,origin);
  const id=crypto.randomUUID(),key=`live-judge/${entry.event_id}/${entry.id}/${auth.uid}/${id}.${extensionFor(file.type)}`;
  await env.MEDIA.put(key,file.stream(),{httpMetadata:{contentType:file.type},customMetadata:{owner:auth.uid,kind:'live-judge',entryId:entry.id,eventId:entry.event_id}});
  try{await env.DB.prepare('INSERT INTO live_judge_photos(id,event_id,entry_id,judge_id,r2_key,mime_type,size_bytes) VALUES(?,?,?,?,?,?,?)').bind(id,entry.event_id,entry.id,auth.uid,key,file.type,file.size).run()}catch(error){await env.MEDIA.delete(key);throw error}
  return json({ok:true,photo:{id,entryId,status:'internal'}},201,origin);
}

export async function liveEntryMedia(env,auth,entryId,origin){
  const row=await one(env,`SELECT p.r2_key,p.mime_type FROM live_entries e JOIN events ev ON ev.id=e.event_id AND ev.live_enabled=1 JOIN car_photos p ON p.car_id=e.car_id WHERE e.id=? ORDER BY p.sort_order,p.id LIMIT 1`,[entryId]);
  if(!row)return json({ok:false,error:'media_not_found'},404,origin);const object=await env.MEDIA.get(row.r2_key);if(!object)return json({ok:false,error:'media_not_found'},404,origin);
  return cors(new Response(object.body,{headers:{'Content-Type':row.mime_type||object.httpMetadata?.contentType||'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}}),origin);
}

export async function judgePhotoMedia(env,auth,photoId,origin){
  const row=await one(env,`SELECT p.r2_key,p.mime_type,p.judge_id,p.event_id FROM live_judge_photos p WHERE p.id=? AND (p.judge_id=? OR EXISTS(SELECT 1 FROM members m WHERE m.id=? AND m.role='admin' AND m.status='active'))`,[photoId,auth.uid,auth.uid]);
  if(!row)return json({ok:false,error:'media_not_found'},404,origin);const object=await env.MEDIA.get(row.r2_key);if(!object)return json({ok:false,error:'media_not_found'},404,origin);
  return cors(new Response(object.body,{headers:{'Content-Type':row.mime_type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}}),origin);
}

async function adminLivePayload(env,eventId){
  const event=await eventById(env,eventId);if(!event)return null;
  const [program,states,categories,judges,entries,results]=await Promise.all([
    programFor(env,event.id,true),stateRows(env,event.id),
    categoryRows(env,event.id),
    all(env,`SELECT j.member_id memberId,m.name,m.nickname FROM event_live_judges j JOIN members m ON m.id=j.member_id WHERE j.event_id=? ORDER BY COALESCE(m.nickname,m.name)`,[event.id]),
    all(env,`SELECT e.id,e.discipline,e.member_id memberId,e.car_id carId,e.category,e.presented_at presentedAt,c.model,c.body,c.nickname,m.name,m.nickname memberNickname,
      (SELECT COUNT(*) FROM live_public_votes v WHERE v.entry_id=e.id) votes,(SELECT COUNT(*) FROM live_judge_scores s WHERE s.entry_id=e.id AND s.submitted=1) judgeScores
      FROM live_entries e JOIN cars c ON c.id=e.car_id JOIN members m ON m.id=e.member_id WHERE e.event_id=? ORDER BY e.created_at DESC`,[event.id]),
    publishedResults(env,event.id,true),
  ]);
  return {ok:true,event:eventView(event),activeEvent:eventView(await activeLiveEvent(env)),program,states,categories,judges,entries,results,judgeCriteria:DEFAULT_JUDGE_CRITERIA};
}

export async function getAdminLive(env,url,origin){const payload=await adminLivePayload(env,clean(url.searchParams.get('eventId')));return payload?json(payload,200,origin):json({ok:false,error:'event_not_found'},404,origin)}

export async function setAdminLiveEnabled(request,env,auth,eventId,origin){
  const body=await readBody(request),event=await eventById(env,eventId);if(!event)return json({ok:false,error:'event_not_found'},404,origin);
  const enabled=body.enabled===true;
  if(enabled)await env.DB.batch([
    env.DB.prepare("UPDATE live_competition_state SET status='idle',current_entry_id=NULL,version=version+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE event_id IN (SELECT id FROM events WHERE live_enabled=1 AND id<>?) AND status IN ('live','paused')").bind(auth.uid,eventId),
    env.DB.prepare('UPDATE events SET live_enabled=0 WHERE live_enabled=1 AND id<>?').bind(eventId),
    env.DB.prepare('UPDATE events SET live_enabled=1,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(eventId),
  ]);
  else await env.DB.batch([
    env.DB.prepare('UPDATE events SET live_enabled=0,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(eventId),
    env.DB.prepare("UPDATE live_competition_state SET status='idle',current_entry_id=NULL,version=version+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE event_id=? AND status IN ('live','paused')").bind(auth.uid,eventId),
  ]);
  return json(await adminLivePayload(env,eventId),200,origin);
}

export async function saveProgramItem(request,env,auth,eventId,itemId,origin){
  const body=await readBody(request),event=await eventById(env,eventId);if(!event)return json({ok:false,error:'event_not_found'},404,origin);
  const day=clean(body.day),startsAt=clean(body.startsAt),endsAt=clean(body.endsAt),title=clean(body.title).slice(0,120),venue=clean(body.venue).slice(0,120),description=clean(body.description).slice(0,400),status=clean(body.status)||'scheduled';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(startsAt)||endsAt&&!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(endsAt)||endsAt&&endsAt<=startsAt||!title||!['scheduled','changed','cancelled'].includes(status))return json({ok:false,error:'invalid_program_item'},400,origin);
  const id=itemId||crypto.randomUUID();if(itemId&&!validId(itemId))return json({ok:false,error:'invalid_program_item'},400,origin);
  await env.DB.prepare(`INSERT INTO event_program_items(id,event_id,day,starts_at,ends_at,title,venue,description,status,visible,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET day=excluded.day,starts_at=excluded.starts_at,ends_at=excluded.ends_at,title=excluded.title,venue=excluded.venue,description=excluded.description,status=excluded.status,visible=excluded.visible,sort_order=excluded.sort_order,updated_at=CURRENT_TIMESTAMP WHERE event_id=excluded.event_id`).bind(id,eventId,day,startsAt,endsAt||null,title,venue||null,description||null,status,body.visible===false?0:1,Number.isInteger(Number(body.sortOrder))?Number(body.sortOrder):0).run();
  return json({ok:true,itemId:id,program:await programFor(env,eventId,true)},200,origin);
}
export async function deleteProgramItem(env,eventId,itemId,origin){await env.DB.prepare('DELETE FROM event_program_items WHERE id=? AND event_id=?').bind(itemId,eventId).run();return json({ok:true},200,origin)}

export async function assignLiveJudge(request,env,auth,eventId,origin){
  const body=await readBody(request),memberId=clean(body.memberId);if(!validId(memberId))return json({ok:false,error:'invalid_member'},400,origin);
  if(body.assigned===false)await env.DB.prepare('DELETE FROM event_live_judges WHERE event_id=? AND member_id=?').bind(eventId,memberId).run();
  else await env.DB.prepare('INSERT INTO event_live_judges(event_id,member_id,created_by) SELECT ?,id,? FROM members WHERE id=? AND status=\'active\' ON CONFLICT(event_id,member_id) DO NOTHING').bind(eventId,auth.uid,memberId).run();
  return json({ok:true,judges:(await adminLivePayload(env,eventId))?.judges||[]},200,origin);
}

export async function searchLiveMembers(env,eventId,url,origin){
  const q=clean(url.searchParams.get('q')).slice(0,80);if(q&&q.replace(/\W/g,'').length<2)return json({ok:true,members:[]},200,origin);const needle=`%${q.replace(/[\\%_]/g,'\\$&')}%`,searchAll=q?1:0;
  const rows=await all(env,`SELECT m.id memberId,m.member_code memberCode,m.name,m.nickname,r.status,r.show_shine showShine,p.present,r.car_id registeredCarId,
    (SELECT COUNT(*) FROM live_entries le WHERE le.event_id=? AND le.member_id=m.id) competitionEntries,
    (SELECT json_group_array(json_object('id',c2.id,'model',c2.model,'body',COALESCE(c2.body,''),'nickname',COALESCE(c2.nickname,''),'primary',c2.is_primary,'photoId',(SELECT cp.id FROM car_photos cp WHERE cp.car_id=c2.id ORDER BY cp.sort_order,cp.id LIMIT 1))) FROM cars c2 WHERE c2.member_id=m.id) carsJson
    FROM members m LEFT JOIN reservations r ON r.member_id=m.id AND r.event_id=? LEFT JOIN event_member_presence p ON p.member_id=m.id AND p.event_id=?
    WHERE (?=1 OR r.id IS NOT NULL) AND (?='' OR m.name LIKE ? ESCAPE '\\' OR m.nickname LIKE ? ESCAPE '\\' OR m.member_code LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM cars cs WHERE cs.member_id=m.id AND (cs.model LIKE ? ESCAPE '\\' OR cs.nickname LIKE ? ESCAPE '\\')))
    ORDER BY CASE WHEN r.id IS NULL THEN 1 ELSE 0 END,COALESCE(m.nickname,m.name) LIMIT 50`,[eventId,eventId,eventId,searchAll,q,...Array(5).fill(needle)]);
  return json({ok:true,members:rows.map(row=>{let cars=[];try{cars=JSON.parse(row.carsJson||'[]')}catch{}return{...row,cars,present:row.present===1,competitionEntries:Number(row.competitionEntries||0)}})},200,origin);
}

export async function resolveLiveQr(request,env,eventId,origin){
  const body=await readBody(request),token=parseMemberQr(clean(body.payload));if(!token)return json({ok:false,error:'invalid_qr'},400,origin);
  const row=await one(env,`SELECT m.id memberId,m.member_code memberCode,m.name,m.nickname,r.status,r.show_shine showShine,r.car_id registeredCarId,p.present,
    (SELECT COUNT(*) FROM live_entries le WHERE le.event_id=? AND le.member_id=m.id) competitionEntries,
    (SELECT json_group_array(json_object('id',c2.id,'model',c2.model,'body',COALESCE(c2.body,''),'nickname',COALESCE(c2.nickname,''),'primary',c2.is_primary,'photoId',(SELECT cp.id FROM car_photos cp WHERE cp.car_id=c2.id ORDER BY cp.sort_order,cp.id LIMIT 1))) FROM cars c2 WHERE c2.member_id=m.id) carsJson
    FROM member_qr_identities q JOIN members m ON m.id=q.member_id LEFT JOIN reservations r ON r.member_id=m.id AND r.event_id=? LEFT JOIN event_member_presence p ON p.member_id=m.id AND p.event_id=? WHERE q.token=?`,[eventId,eventId,eventId,token]);
  if(!row)return json({ok:false,error:'member_not_found'},404,origin);let cars=[];try{cars=JSON.parse(row.carsJson||'[]')}catch{}return json({ok:true,member:{...row,cars,present:row.present===1,competitionEntries:Number(row.competitionEntries||0)}},200,origin);
}

export async function setLivePresence(request,env,auth,eventId,memberId,origin){
  const body=await readBody(request),present=body.present!==false;
  await env.DB.prepare(`INSERT INTO event_member_presence(event_id,member_id,present,confirmed_by) SELECT ?,id,?,? FROM members WHERE id=?
    ON CONFLICT(event_id,member_id) DO UPDATE SET present=excluded.present,confirmed_by=excluded.confirmed_by,confirmed_at=CURRENT_TIMESTAMP`).bind(eventId,present?1:0,auth.uid,memberId).run();
  return json({ok:true,memberId,present},200,origin);
}

export async function createLiveEntry(request,env,auth,eventId,origin){
  const body=await readBody(request),discipline=clean(body.discipline),memberId=clean(body.memberId),carId=clean(body.carId),category=clean(body.category).slice(0,60);if(!DISCIPLINES.has(discipline)||![memberId,carId].every(validId))return json({ok:false,error:'invalid_entry'},400,origin);
  const event=await eventById(env,eventId);if(!event?.live_enabled)return json({ok:false,error:'live_disabled'},409,origin);
  const eligible=await one(env,`SELECT r.id,r.show_shine,c.body,p.present FROM reservations r JOIN cars c ON c.id=? AND c.member_id=r.member_id LEFT JOIN event_member_presence p ON p.event_id=r.event_id AND p.member_id=r.member_id WHERE r.event_id=? AND r.member_id=? AND r.status='approved'`,[carId,eventId,memberId]);if(!eligible)return json({ok:false,error:'approved_registration_required'},409,origin);
  if(eligible.present!==1)return json({ok:false,error:'presence_required'},409,origin);
  if(discipline==='show_shine'){
    if(eligible.show_shine!=='Ano')return json({ok:false,error:'show_shine_not_registered'},409,origin);
    if(!SHOW_SHINE_CATEGORY_SET.has(category))return json({ok:false,error:'category_required'},409,origin);
    if(eligible.body!==category)return json({ok:false,error:'category_mismatch',actualCategory:eligible.body||null},409,origin);
    const categoryState=await one(env,"SELECT status FROM live_category_state WHERE event_id=? AND discipline='show_shine' AND category=?",[eventId,category]);
    if(categoryState?.status==='closed')return json({ok:false,error:'category_closed',category},409,origin);
  }
  const id=crypto.randomUUID();await env.DB.prepare('INSERT INTO live_entries(id,event_id,discipline,member_id,car_id,category) VALUES(?,?,?,?,?,?) ON CONFLICT(event_id,discipline,car_id) DO NOTHING').bind(id,eventId,discipline,memberId,carId,discipline==='show_shine'?category:null).run();
  const row=await one(env,'SELECT id FROM live_entries WHERE event_id=? AND discipline=? AND car_id=?',[eventId,discipline,carId]);return json({ok:true,entryId:row.id},201,origin);
}

export async function startLiveEntry(request,env,auth,eventId,origin){
  const body=await readBody(request),discipline=clean(body.discipline),memberId=clean(body.memberId),carId=clean(body.carId),category=clean(body.category).slice(0,60),expected=Number(body.expectedVersion);
  if(!DISCIPLINES.has(discipline)||![memberId,carId].every(validId)||!Number.isInteger(expected)||expected<1)return json({ok:false,error:'invalid_entry'},400,origin);
  const event=await eventById(env,eventId);if(!event?.live_enabled)return json({ok:false,error:'live_disabled'},409,origin);
  const eligible=await one(env,`SELECT r.status,r.show_shine,c.body,p.present FROM reservations r JOIN cars c ON c.id=? AND c.member_id=r.member_id LEFT JOIN event_member_presence p ON p.event_id=r.event_id AND p.member_id=r.member_id WHERE r.event_id=? AND r.member_id=? LIMIT 1`,[carId,eventId,memberId]);
  if(!eligible||eligible.status!=='approved')return json({ok:false,error:'approved_registration_required'},409,origin);
  if(eligible.present!==1)return json({ok:false,error:'presence_required'},409,origin);
  if(discipline==='show_shine'){
    if(eligible.show_shine!=='Ano')return json({ok:false,error:'show_shine_not_registered'},409,origin);
    if(!SHOW_SHINE_CATEGORY_SET.has(category))return json({ok:false,error:'category_required'},409,origin);
    if(eligible.body!==category)return json({ok:false,error:'category_mismatch',actualCategory:eligible.body||null},409,origin);
    const categoryState=await one(env,"SELECT status FROM live_category_state WHERE event_id=? AND discipline='show_shine' AND category=?",[eventId,category]);
    if(categoryState?.status==='closed')return json({ok:false,error:'category_closed',category},409,origin);
  }
  await env.DB.prepare("INSERT INTO live_competition_state(event_id,discipline,status,updated_by) VALUES(?,?,'idle',?) ON CONFLICT DO NOTHING").bind(eventId,discipline,auth.uid).run();
  const [state,existing,competing]=await Promise.all([
    one(env,'SELECT * FROM live_competition_state WHERE event_id=? AND discipline=?',[eventId,discipline]),
    one(env,'SELECT id,member_id,category,presented_at FROM live_entries WHERE event_id=? AND discipline=? AND car_id=?',[eventId,discipline,carId]),
    one(env,"SELECT discipline FROM live_competition_state WHERE event_id=? AND discipline<>? AND status IN ('live','paused')",[eventId,discipline]),
  ]);
  if(existing&&existing.member_id!==memberId)return json({ok:false,error:'entry_owner_conflict'},409,origin);
  if(existing?.category&&discipline==='show_shine'&&existing.category!==category)return json({ok:false,error:'entry_category_conflict',actualCategory:existing.category},409,origin);
  if(state?.status==='published')return json({ok:false,error:'judging_closed'},409,origin);
  if(existing&&state?.status==='live'&&state.current_entry_id===existing.id)return json({ok:true,entryId:existing.id,states:await stateRows(env,eventId),categories:await categoryRows(env,eventId),replayed:true},200,origin);
  if(competing)return json({ok:false,error:'other_discipline_active',discipline:competing.discipline},409,origin);
  if(Number(state?.version)!==expected)return json({ok:false,error:'stale_live_state',currentVersion:Number(state?.version||0)},409,origin);
  const entryId=existing?.id||crypto.randomUUID(),categoryValue=discipline==='show_shine'?category:null;
  const guard=`EXISTS(SELECT 1 FROM events ev JOIN live_competition_state s ON s.event_id=ev.id AND s.discipline=? WHERE ev.id=? AND ev.live_enabled=1 AND s.version=? AND s.status<>'published')`;
  const eligibleGuard=`EXISTS(SELECT 1 FROM reservations r JOIN cars c ON c.id=? AND c.member_id=r.member_id LEFT JOIN event_member_presence p ON p.event_id=r.event_id AND p.member_id=r.member_id WHERE r.event_id=? AND r.member_id=? AND r.status='approved' AND p.present=1${discipline==='show_shine'?" AND r.show_shine='Ano' AND c.body=?":''})`,eligibleBindings=[carId,eventId,memberId,...(discipline==='show_shine'?[category]:[])];
  const statements=[];
  if(discipline==='show_shine')statements.push(env.DB.prepare(`INSERT INTO live_category_state(event_id,discipline,category,status,updated_by) SELECT ?,'show_shine',?,'idle',? WHERE ${guard} AND ${eligibleGuard} ON CONFLICT DO NOTHING`).bind(eventId,category,auth.uid,discipline,eventId,expected,...eligibleBindings));
  statements.push(env.DB.prepare(`INSERT INTO live_entries(id,event_id,discipline,member_id,car_id,category) SELECT ?,?,?,?,?,? WHERE ${guard} AND ${eligibleGuard} ON CONFLICT(event_id,discipline,car_id) DO NOTHING`).bind(entryId,eventId,discipline,memberId,carId,categoryValue,discipline,eventId,expected,...eligibleBindings));
  if(discipline==='show_shine')statements.push(env.DB.prepare(`UPDATE live_entries SET category=? WHERE event_id=? AND discipline='show_shine' AND car_id=? AND member_id=? AND category IS NULL AND ${guard}`).bind(category,eventId,carId,memberId,discipline,eventId,expected));
  if(discipline==='show_shine')statements.push(env.DB.prepare(`UPDATE live_category_state SET status='live',version=CASE WHEN status='idle' THEN version+1 ELSE version END,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE event_id=? AND discipline='show_shine' AND category=? AND status<>'closed' AND ${guard} AND EXISTS(SELECT 1 FROM live_entries e WHERE e.event_id=? AND e.discipline='show_shine' AND e.car_id=? AND e.category=?)`).bind(auth.uid,eventId,category,discipline,eventId,expected,eventId,carId,category));
  statements.push(env.DB.prepare(`UPDATE live_competition_state SET status='live',current_entry_id=(SELECT id FROM live_entries WHERE event_id=? AND discipline=? AND car_id=?),version=version+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE event_id=? AND discipline=? AND version=? AND status<>'published' AND EXISTS(SELECT 1 FROM events WHERE id=? AND live_enabled=1) AND EXISTS(SELECT 1 FROM live_entries e WHERE e.event_id=? AND e.discipline=? AND e.car_id=?)${discipline==='show_shine'?" AND EXISTS(SELECT 1 FROM live_category_state cs WHERE cs.event_id=? AND cs.discipline='show_shine' AND cs.category=? AND cs.status='live')":''}`).bind(eventId,discipline,carId,auth.uid,eventId,discipline,expected,eventId,eventId,discipline,carId,...(discipline==='show_shine'?[eventId,category]:[])));
  statements.push(env.DB.prepare('UPDATE live_entries SET presented_at=COALESCE(presented_at,CURRENT_TIMESTAMP) WHERE event_id=? AND discipline=? AND car_id=? AND id=(SELECT current_entry_id FROM live_competition_state WHERE event_id=? AND discipline=?)').bind(eventId,discipline,carId,eventId,discipline));
  const results=await env.DB.batch(statements),stateResult=results[results.length-2];
  const [confirmedState,confirmedEntry]=await Promise.all([one(env,'SELECT * FROM live_competition_state WHERE event_id=? AND discipline=?',[eventId,discipline]),one(env,'SELECT id,category,presented_at FROM live_entries WHERE event_id=? AND discipline=? AND car_id=?',[eventId,discipline,carId])]);
  if(!confirmedEntry||confirmedState?.current_entry_id!==confirmedEntry.id||confirmedState.status!=='live')return json({ok:false,error:stateResult?.meta?.changes?'entry_start_failed':'stale_live_state',currentVersion:Number(confirmedState?.version||0)},409,origin);
  const replayed=!!existing||entryId!==confirmedEntry.id||!stateResult?.meta?.changes;
  return json({ok:true,entryId:confirmedEntry.id,states:await stateRows(env,eventId),categories:await categoryRows(env,eventId),replayed},replayed?200:201,origin);
}

export async function controlLive(request,env,auth,eventId,discipline,origin){
  if(!DISCIPLINES.has(discipline))return json({ok:false,error:'invalid_discipline'},400,origin);const event=await eventById(env,eventId);if(!event?.live_enabled)return json({ok:false,error:'live_disabled'},409,origin);const body=await readBody(request),action=clean(body.action),expected=Number(body.expectedVersion);
  let current=await one(env,'SELECT * FROM live_competition_state WHERE event_id=? AND discipline=?',[eventId,discipline]);
  if(!current){await env.DB.prepare("INSERT INTO live_competition_state(event_id,discipline,status,updated_by) VALUES(?,?,'idle',?) ON CONFLICT DO NOTHING").bind(eventId,discipline,auth.uid).run();current=await one(env,'SELECT * FROM live_competition_state WHERE event_id=? AND discipline=?',[eventId,discipline])}
  if(action==='close_category'){
    if(discipline!=='show_shine')return json({ok:false,error:'invalid_transition'},409,origin);
    const category=clean(body.category),expectedCategoryVersion=Number(body.expectedCategoryVersion);if(!SHOW_SHINE_CATEGORY_SET.has(category)||!Number.isInteger(expectedCategoryVersion))return json({ok:false,error:'invalid_category'},400,origin);
    const categoryState=await one(env,"SELECT * FROM live_category_state WHERE event_id=? AND discipline='show_shine' AND category=?",[eventId,category]);
    if(!categoryState||categoryState.status==='idle')return json({ok:false,error:'category_not_started'},409,origin);
    if(categoryState.status==='closed')return json({ok:true,states:await stateRows(env,eventId),categories:await categoryRows(env,eventId),replayed:true},200,origin);
    if(Number(categoryState.version)!==expectedCategoryVersion)return json({ok:false,error:'stale_category_state',currentVersion:Number(categoryState.version)},409,origin);
    const results=await env.DB.batch([
      env.DB.prepare("UPDATE live_category_state SET status='closed',version=version+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE event_id=? AND discipline='show_shine' AND category=? AND status='live' AND version=?").bind(auth.uid,eventId,category,expectedCategoryVersion),
      env.DB.prepare("UPDATE live_competition_state SET status='idle',current_entry_id=NULL,version=version+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE event_id=? AND discipline='show_shine' AND current_entry_id IN (SELECT id FROM live_entries WHERE event_id=? AND discipline='show_shine' AND category=?)").bind(auth.uid,eventId,eventId,category),
    ]);
    if(!results[0]?.meta?.changes)return json({ok:false,error:'stale_category_state'},409,origin);
    return json({ok:true,states:await stateRows(env,eventId),categories:await categoryRows(env,eventId),results:await publishedResults(env,eventId)},200,origin);
  }
  if(expected!==Number(current.version))return json({ok:false,error:'stale_live_state',currentVersion:Number(current.version)},409,origin);
  let status=current.status,entryId=current.current_entry_id;
  if(action==='present'){
    const competing=await one(env,"SELECT discipline FROM live_competition_state WHERE event_id=? AND discipline<>? AND status IN ('live','paused')",[eventId,discipline]);if(competing)return json({ok:false,error:'other_discipline_active',discipline:competing.discipline},409,origin);
    entryId=clean(body.entryId);const entry=await one(env,'SELECT id FROM live_entries WHERE id=? AND event_id=? AND discipline=?',[entryId,eventId,discipline]);if(!entry)return json({ok:false,error:'entry_not_found'},404,origin);status='live';
    await env.DB.prepare('UPDATE live_entries SET presented_at=COALESCE(presented_at,CURRENT_TIMESTAMP) WHERE id=?').bind(entryId).run();
  }else if(action==='pause'&&status==='live')status='paused';
  else if(action==='resume'&&status==='paused'){const competing=await one(env,"SELECT discipline FROM live_competition_state WHERE event_id=? AND discipline<>? AND status IN ('live','paused')",[eventId,discipline]);if(competing)return json({ok:false,error:'other_discipline_active',discipline:competing.discipline},409,origin);status='live';}
  else if(action==='close'&&['live','paused','idle'].includes(status)){status='closed';entryId=null;}
  else if(action==='publish'&&discipline==='show_shine'){
    const openCategory=await one(env,"SELECT 1 open FROM live_category_state WHERE event_id=? AND discipline='show_shine' AND status='live' LIMIT 1",[eventId]);
    const closedCategory=await one(env,"SELECT 1 closed FROM live_category_state WHERE event_id=? AND discipline='show_shine' AND status='closed' LIMIT 1",[eventId]);
    if(openCategory||!closedCategory)return json({ok:false,error:'categories_not_closed'},409,origin);status='published';entryId=null;
  }else if(action==='publish'&&status==='closed'){status='published';entryId=null;}
  else return json({ok:false,error:'invalid_transition'},409,origin);
  const result=await env.DB.prepare('UPDATE live_competition_state SET status=?,current_entry_id=?,version=version+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE event_id=? AND discipline=? AND version=?').bind(status,entryId||null,auth.uid,eventId,discipline,expected).run();
  if(!result.meta?.changes)return json({ok:false,error:'stale_live_state'},409,origin);return json({ok:true,states:await stateRows(env,eventId),categories:await categoryRows(env,eventId),results:await publishedResults(env,eventId)},200,origin);
}

export async function createEvent(request,env,auth,origin){
  const body=await readBody(request),year=Number(body.year),title=clean(body.title).slice(0,100),startsOn=clean(body.startsOn),endsOn=clean(body.endsOn),venue=clean(body.venue).slice(0,160);
  if(!Number.isInteger(year)||year<2012||year>2200||!title||startsOn&&!/^\d{4}-\d{2}-\d{2}$/.test(startsOn)||endsOn&&!/^\d{4}-\d{2}-\d{2}$/.test(endsOn)||startsOn&&endsOn&&endsOn<startsOn)return json({ok:false,error:'invalid_event'},400,origin);
  const id=`united-${year}`;try{await env.DB.prepare(`INSERT INTO events(id,year,title,starts_on,ends_on,venue_name,registration_status,is_current,live_enabled,updated_at) VALUES(?,?,?,?,?,?,'closed',0,0,CURRENT_TIMESTAMP)`).bind(id,year,title,startsOn||null,endsOn||null,venue||null).run()}catch(error){if(String(error).includes('UNIQUE'))return json({ok:false,error:'event_exists'},409,origin);throw error}
  return json({ok:true,event:eventView(await eventById(env,id))},201,origin);
}

export const liveInternals={score,currentProgram,DEFAULT_JUDGE_CRITERIA,SHOW_SHINE_CATEGORIES,categoryRows};
