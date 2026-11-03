import {json} from '../http/responses.js';
import {runAdminCommand} from './commands.js';
import {factoryPreferences,validatePreferences} from '../../admin/dashboard-model.js';
import {OVERDUE_SQL} from './lists.js';

export const ADMIN_TREND_SQL=`SELECT date(created_at) AS day,COUNT(*) AS count
 FROM reservations WHERE event_id=? GROUP BY date(created_at) ORDER BY day`;
export const ADMIN_RECENT_SQL=`WITH recent AS MATERIALIZED (
 SELECT id,member_id,created_at,car_model,accommodation,crew,payment_status,status,amount_due_czk,amount_paid_czk
 FROM reservations WHERE event_id=? ORDER BY created_at DESC,id DESC LIMIT 5
 ) SELECT r.id,r.member_id AS memberId,r.created_at AS createdAt,r.car_model AS carModel,
 COALESCE(a.option_name,r.accommodation) AS accommodation,r.crew,r.payment_status AS paymentStatus,r.status,r.amount_due_czk AS amountDueCzk,r.amount_paid_czk AS amountPaidCzk,
 COALESCE(m.nickname,m.name) AS memberName
 FROM recent r JOIN members m ON m.id=r.member_id
 LEFT JOIN reservation_accommodation a ON a.reservation_id=r.id ORDER BY r.created_at DESC,r.id DESC`;
export const ADMIN_DASHBOARD_ATTENTION_SQL=`SELECT
 COALESCE(SUM(r.status IN ('pending','approved') AND r.amount_due_czk>r.amount_paid_czk AND NOT COALESCE(${OVERDUE_SQL},0)),0) AS awaiting,
 MIN(CASE WHEN r.status='pending' THEN r.submitted_at END) AS oldestPendingAt
 FROM reservations r JOIN events e ON e.id=r.event_id WHERE r.event_id=?`;
// Stored prescriptions and recorded movements only; never allocate a joint payment to its components.
export const ADMIN_PAYMENT_OVERVIEW_SQL=`WITH r AS MATERIALIZED (
 SELECT r.*,m.nickname,m.name,a.total_czk AS lodging_czk,
  CASE WHEN r.admission_czk IS NOT NULL AND (a.reservation_id IS NOT NULL OR r.accommodation='Bez ubytování')
    AND r.admission_czk+COALESCE(a.total_czk,0)=r.amount_due_czk THEN 1 ELSE 0 END AS known_breakdown
 FROM reservations r JOIN members m ON m.id=r.member_id
 LEFT JOIN reservation_accommodation a ON a.reservation_id=r.id WHERE r.event_id=?
), movements AS (
 SELECT p.id,p.reservation_id,p.amount_czk,p.created_at,'ledger' AS source FROM event_payments p JOIN r ON r.id=p.reservation_id
 UNION ALL
 SELECT a.id,r.id,CASE WHEN json_valid(a.old_state_json) AND json_valid(a.new_state_json)
  THEN CASE WHEN json_type(a.old_state_json,'$.amountPaidCzk') IN ('integer','real') AND json_type(a.new_state_json,'$.amountPaidCzk') IN ('integer','real')
   THEN json_extract(a.new_state_json,'$.amountPaidCzk')-json_extract(a.old_state_json,'$.amountPaidCzk') END END,
  a.created_at,'legacy-adjustment' FROM admin_actions a JOIN r ON r.id=a.entity_id
  WHERE r.admission_czk IS NULL AND a.entity_type='reservation' AND a.action_type='reservation_payment_update'
), recent AS (SELECT * FROM movements WHERE amount_czk<>0 ORDER BY created_at DESC,id DESC LIMIT 5)
SELECT COUNT(*) AS activeCount,COALESCE(SUM(amount_due_czk),0) AS dueCzk,COALESCE(SUM(amount_paid_czk),0) AS paidCzk,
 COALESCE(SUM(MAX(amount_due_czk-amount_paid_czk,0)),0) AS remainingCzk,
 COALESCE(SUM(MAX(amount_paid_czk-amount_due_czk,0)),0) AS overpaymentCzk,
 COALESCE(SUM(known_breakdown),0) AS breakdownCount,
 COALESCE(SUM(CASE WHEN known_breakdown=1 THEN admission_czk ELSE 0 END),0) AS admissionCzk,
 COALESCE(SUM(CASE WHEN known_breakdown=1 THEN COALESCE(lodging_czk,0) ELSE 0 END),0) AS lodgingCzk,
 (SELECT json_group_array(json(item)) FROM (SELECT json_object('id',p.id,'reservationId',r.id,'memberId',r.member_id,'memberName',COALESCE(r.nickname,r.name),
  'amountCzk',p.amount_czk,'createdAt',p.created_at,'source',p.source,'status',r.status,'amountDueCzk',r.amount_due_czk,'amountPaidCzk',r.amount_paid_czk) AS item
  FROM recent p JOIN r ON r.id=p.reservation_id ORDER BY p.created_at DESC,p.id DESC)) AS recent_json
 FROM r WHERE status IN ('pending','approved')`;
export async function getAdminDashboard(env,url,origin,now=new Date()){
  const eventId=url.searchParams.get('eventId');
  if(!/^[a-z0-9_-]{1,128}$/i.test(eventId||''))return json({error:'invalid_event'},400,origin);
  const event=await env.DB.prepare('SELECT id FROM events WHERE id=?').bind(eventId).first();
  if(!event)return json({error:'event_not_found'},404,origin);
  const command=url.searchParams.get('presentation')==='command';
  const [rows,attention,recent,finance]=await env.DB.batch([env.DB.prepare(ADMIN_TREND_SQL).bind(eventId),
    env.DB.prepare(ADMIN_DASHBOARD_ATTENTION_SQL).bind(eventId),...(command?[env.DB.prepare(ADMIN_RECENT_SQL).bind(eventId),env.DB.prepare(ADMIN_PAYMENT_OVERVIEW_SQL).bind(eventId)]:[])]);
  const paymentOverview=finance?.results?.[0];
  return json({ok:true,context:{eventId,unit:'reservations',population:'all-stored-statuses',timezone:'UTC',timestamp:'created_at'},
    freshness:{generatedAt:now.toISOString(),businessUpdatedAt:null,consistency:'primary-batch'},
    ...(command?{presentation:'command-v1',recent:recent.results,payments:paymentOverview?{...paymentOverview,recent:JSON.parse(paymentOverview.recent_json||'[]'),recent_json:undefined}:null}:{}),
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
