import {json} from '../http/responses.js';
import {runAdminCommand} from './commands.js';
import {factoryPreferences,validatePreferences} from '../../admin/dashboard-model.js';
import {OVERDUE_SQL} from './lists.js';

export const ADMIN_TREND_SQL=`SELECT date(created_at) AS day,COUNT(*) AS count
 FROM reservations WHERE event_id=? GROUP BY date(created_at) ORDER BY day`;
export const ADMIN_DASHBOARD_ATTENTION_SQL=`SELECT
 COALESCE(SUM(r.status IN ('pending','approved') AND r.amount_due_czk>r.amount_paid_czk AND NOT COALESCE(${OVERDUE_SQL},0)),0) AS awaiting,
 MIN(CASE WHEN r.status='pending' THEN r.submitted_at END) AS oldestPendingAt
 FROM reservations r JOIN events e ON e.id=r.event_id WHERE r.event_id=?`;
export async function getAdminDashboard(env,url,origin,now=new Date()){
  const eventId=url.searchParams.get('eventId');
  if(!/^[a-z0-9_-]{1,128}$/i.test(eventId||''))return json({error:'invalid_event'},400,origin);
  const event=await env.DB.prepare('SELECT id FROM events WHERE id=?').bind(eventId).first();
  if(!event)return json({error:'event_not_found'},404,origin);
  const [rows,attention]=await env.DB.batch([env.DB.prepare(ADMIN_TREND_SQL).bind(eventId),
    env.DB.prepare(ADMIN_DASHBOARD_ATTENTION_SQL).bind(eventId)]);
  return json({ok:true,context:{eventId,unit:'reservations',population:'all-stored-statuses',timezone:'UTC',timestamp:'created_at'},
    freshness:{generatedAt:now.toISOString(),businessUpdatedAt:null,consistency:'primary-batch'},
    attention:attention.results[0],days:rows.results.filter(r=>r.day!==null),missingDateCount:rows.results.find(r=>r.day===null)?.count||0},200,origin);
}
export async function getAdminPreferences(env,auth,origin){
  const row=await env.DB.prepare('SELECT schema_version,configuration_json,revision,updated_at FROM admin_preferences WHERE id=?').bind(auth.uid).first();
  return json({ok:true,preferences:row?JSON.parse(row.configuration_json):factoryPreferences(),revision:row?.revision||0,
    stored:!!row,freshness:{generatedAt:new Date().toISOString(),businessUpdatedAt:row?.updated_at||null}},200,origin);
}
export function saveAdminPreferences(request,env,auth,origin){
  return runAdminCommand(request,env,auth,'preferences',auth.uid,origin,async guarded=>{
    let value;try{value=await request.json()}catch{return json({error:'invalid_json'},400,origin)}
    if(!validatePreferences(value))return json({error:'invalid_preferences',message:'Neplatná konfigurace přehledu.'},400,origin);
    await guarded.DB.batch([guarded.DB.prepare(`INSERT INTO admin_preferences(id,schema_version,configuration_json,revision,updated_at)
      VALUES(?,1,?,(SELECT revision FROM admin_resource_versions WHERE resource_type='preferences' AND resource_id=?),CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET schema_version=excluded.schema_version,configuration_json=excluded.configuration_json,
        revision=excluded.revision,updated_at=excluded.updated_at`).bind(auth.uid,JSON.stringify(value),auth.uid)]);
    return json({ok:true,preferences:value},200,origin);
  });
}
