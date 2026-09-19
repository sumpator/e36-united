import { getCurrentEvent, getRequestedAdminEvent } from '../events.js';
import { json } from '../../http/responses.js';

const fail=(error,message,origin,status=409)=>json({ok:false,error,message},status,origin);
export const preliminaryView=row=>row?{
  id:row.id,eventId:row.event_id,memberId:row.member_id,status:row.status,
  preferences:JSON.parse(row.preferences_json),revision:Number(row.revision),createdAt:row.created_at,updatedAt:row.updated_at,
}:null;
async function readBody(request,origin){
  const reader=request.body?.getReader(),chunks=[];let size=0;
  if(reader){try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
    if(size>8192){await reader.cancel();return {response:fail('payload_too_large','Příliš dlouhý požadavek.',origin,413)};}chunks.push(value);
  }}finally{reader.releaseLock();}}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const text=new TextDecoder().decode(bytes);
  try{const body=JSON.parse(text);if(!body||typeof body!=='object'||Array.isArray(body))throw new Error();return {body};}
  catch{return {response:fail('invalid_json','Neplatný JSON.',origin,400)};}
}
async function configuration(env,eventId){
  const row=await env.DB.prepare('SELECT enabled,revision FROM event_preliminary_settings WHERE event_id=?').bind(eventId).first();
  return {enabled:row?.enabled===1,revision:Number(row?.revision||0)};
}
export async function getPreliminaryReservation(env,auth,origin){
  const event=await getCurrentEvent(env);
  if(!event)return json({ok:true,event:null,enabled:false,registrationOpen:false,preliminary:null},200,origin);
  const settings=await configuration(env,event.id);
  const row=await env.DB.prepare('SELECT * FROM preliminary_reservations WHERE member_id=? AND event_id=?').bind(auth.uid,event.id).first();
  return json({ok:true,event:{id:event.id,year:event.year},enabled:settings.enabled,registrationOpen:event.registration_status==='open',preliminary:preliminaryView(row)},200,origin);
}
async function validatePreferences(env,uid,event,body){
  const fields=['eventId','revision','carId','arrival','crew','crewDetails','accommodation','accommodationOptionId','accommodationUnits','showShine','note'];
  if(Object.keys(body).some(key=>!fields.includes(key)))return 'Požadavek obsahuje nepovolená pole.';
  if(!['Pátek','Sobota','Jen na otočku'].includes(body.arrival)||!['Ne','Možná','Ano'].includes(body.showShine))return 'Vyber příjezd a Show & Shine.';
  if(!Number.isInteger(body.crew)||body.crew<1||body.crew>5)return 'Posádka musí mít 1 až 5 osob.';
  if(typeof body.note!=='string'||body.note.length>1000)return 'Poznámka smí mít nejvýše 1000 znaků.';
  const carId=body.carId==null||body.carId===''?null:body.carId;
  if(carId!==null&&(typeof carId!=='string'||!await env.DB.prepare('SELECT id FROM cars WHERE id=? AND member_id=?').bind(carId,uid).first()))return 'Vyber vlastní auto z garáže.';
  const crewDetails=body.crewDetails??[];
  if(!Array.isArray(crewDetails)||crewDetails.length>body.crew||crewDetails.some(value=>typeof value!=='string'||value.length>100))return 'Údaje posádky nejsou platné.';
  if(!['Chatka','Stan','Bez ubytování'].includes(body.accommodation))return 'Vyber ubytování.';
  const wants=body.arrival!=='Jen na otočku'&&body.accommodation!=='Bez ubytování';
  if(wants){
    if(!Number.isInteger(body.accommodationUnits)||body.accommodationUnits<1||body.accommodationUnits>body.crew)return 'Počet ubytovaných nesmí překročit posádku.';
    if(typeof body.accommodationOptionId!=='string')return 'Vyber typ ubytování.';
    const option=await env.DB.prepare('SELECT kind FROM event_accommodation_options WHERE id=? AND event_id=? AND active=1').bind(body.accommodationOptionId,event.id).first();
    if(!option||option.kind!==(body.accommodation==='Chatka'?'cabin':'tent'))return 'Vybraný typ ubytování není v nabídce eventu.';
  }
  // Preferences deliberately contain neither price nor availability snapshots.
  return {carId,arrival:body.arrival,crew:body.crew,crewDetails,
    accommodation:wants?body.accommodation:'Bez ubytování',accommodationOptionId:wants?body.accommodationOptionId:null,
    accommodationUnits:wants?body.accommodationUnits:0,showShine:body.showShine,note:body.note};
}
export async function putPreliminaryReservation(request,env,auth,origin){
  const parsed=await readBody(request,origin);if(parsed.response)return parsed.response;
  const body=parsed.body,event=await getCurrentEvent(env);
  if(!event||body.eventId!==event.id)return fail('event_changed','Aktuální event se změnil. Obnov stránku.',origin);
  if(event.registration_status==='open'||!(await configuration(env,event.id)).enabled)return fail('preliminary_disabled','Ukládání nezávazných plánů nyní není otevřené.',origin);
  if(!Number.isInteger(body.revision)||body.revision<0)return fail('revision_required','Nejdřív načti aktuální předběžnou rezervaci.',origin,400);
  const preferences=await validatePreferences(env,auth.uid,event,body);
  if(typeof preferences==='string')return fail('invalid_preferences',preferences,origin,400);
  // The write itself rechecks eligibility: configuration/registration changes cannot race this insert.
  const result=await env.DB.prepare(`INSERT INTO preliminary_reservations(id,event_id,member_id,status,preferences_json)
    SELECT ?,e.id,?,'active',? FROM events e JOIN event_preliminary_settings s ON s.event_id=e.id
    WHERE e.id=? AND e.registration_status!='open' AND s.enabled=1
      AND (e.is_current=1 OR NOT EXISTS(SELECT 1 FROM events WHERE is_current=1))
      AND EXISTS(SELECT 1 FROM members WHERE id=? AND status='active')
      AND (? IS NULL OR EXISTS(SELECT 1 FROM cars WHERE id=? AND member_id=?))
      AND NOT EXISTS(SELECT 1 FROM reservations WHERE member_id=? AND event_id=e.id)
      AND (?=0 OR EXISTS(SELECT 1 FROM preliminary_reservations WHERE member_id=? AND event_id=e.id AND revision=?))
    ON CONFLICT(member_id,event_id) DO UPDATE SET status='active',preferences_json=excluded.preferences_json,
      revision=preliminary_reservations.revision+1,updated_at=CURRENT_TIMESTAMP
    WHERE preliminary_reservations.revision=? AND preliminary_reservations.status IN ('active','cancelled')
  `).bind(crypto.randomUUID(),auth.uid,JSON.stringify(preferences),event.id,auth.uid,preferences.carId,preferences.carId,auth.uid,auth.uid,
    body.revision,auth.uid,body.revision,body.revision).run();
  if(!result.meta?.changes)return fail('preliminary_conflict','Plán nebyl uložen: stav se změnil nebo už máš skutečnou rezervaci. Obnov stránku.',origin);
  return getPreliminaryReservation(env,auth,origin);
}
export async function cancelPreliminaryReservation(request,env,auth,origin){
  const parsed=await readBody(request,origin);if(parsed.response)return parsed.response;
  const {eventId,revision}=parsed.body;
  if(typeof eventId!=='string'||!Number.isInteger(revision))return fail('invalid_fields','Chybí event nebo revize.',origin,400);
  const result=await env.DB.prepare("UPDATE preliminary_reservations SET status='cancelled',revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE member_id=? AND event_id=? AND status='active' AND revision=?").bind(auth.uid,eventId,revision).run();
  if(!result.meta?.changes)return fail('preliminary_conflict','Plán se změnil. Obnov stránku.',origin);
  return getPreliminaryReservation(env,auth,origin);
}
export async function listAdminPreliminaryReservations(env,url,origin){
  const event=await getRequestedAdminEvent(env,url);
  if(!event)return fail('event_not_found','Event nebyl nalezen.',origin,404);
  const page=Math.max(1,Math.min(100000,Number.parseInt(url.searchParams.get('page'),10)||1));
  const [settings,count,rows]=await Promise.all([
    configuration(env,event.id),
    env.DB.prepare("SELECT COUNT(*) total FROM preliminary_reservations WHERE event_id=? AND status='active'").bind(event.id).first(),
    env.DB.prepare(`SELECT p.*,m.name,m.nickname,m.email FROM preliminary_reservations p JOIN members m ON m.id=p.member_id
      WHERE p.event_id=? AND p.status='active' ORDER BY p.updated_at DESC,p.id LIMIT 20 OFFSET ?`).bind(event.id,(page-1)*20).all(),
  ]);
  return json({ok:true,eventId:event.id,settings,total:Number(count.total),page,pageSize:20,
    items:rows.results.map(row=>({...preliminaryView(row),member:{name:row.name,nickname:row.nickname,email:row.email}}))},200,origin);
}
export async function savePreliminarySettings(request,env,auth,eventId,origin){
  const parsed=await readBody(request,origin);if(parsed.response)return parsed.response;
  const {enabled,revision}=parsed.body;
  if(typeof enabled!=='boolean'||!Number.isInteger(revision)||revision<0||Object.keys(parsed.body).some(k=>!['enabled','revision'].includes(k)))return fail('invalid_fields','Neplatné nastavení.',origin,400);
  const token=crypto.randomUUID();
  const results=await env.DB.batch([
    env.DB.prepare(`INSERT INTO event_preliminary_settings(event_id,enabled,write_token)
      SELECT id,?,? FROM events WHERE id=? AND (?=0 OR EXISTS(SELECT 1 FROM event_preliminary_settings WHERE event_id=events.id AND revision=?))
      ON CONFLICT(event_id) DO UPDATE SET enabled=excluded.enabled,revision=event_preliminary_settings.revision+1,write_token=excluded.write_token,updated_at=CURRENT_TIMESTAMP
      WHERE event_preliminary_settings.revision=?`).bind(enabled?1:0,token,eventId,revision,revision,revision),
    env.DB.prepare(`INSERT INTO admin_actions(id,admin_member_id,action_type,entity_type,entity_id,new_state_json,created_at)
      SELECT ?,?,'preliminary_settings_changed','event',event_id,?,CURRENT_TIMESTAMP FROM event_preliminary_settings WHERE event_id=? AND write_token=?`)
      .bind(crypto.randomUUID(),auth.uid,JSON.stringify({enabled}),eventId,token),
  ]);
  if(!results[0].meta?.changes)return fail('settings_conflict','Nastavení se změnilo nebo event neexistuje. Obnov přehled.',origin);
  return json({ok:true,settings:await configuration(env,eventId)},200,origin);
}
