import {json} from '../../http/responses.js';
import {readJsonObject} from '../../http/request.js';
import {mailingEligibility} from './contacts.js';
export async function memberMailingPreference(request,env,auth,origin){
 const member=await env.DB.prepare("SELECT id,email,name,nickname FROM members WHERE id=? AND status='active'").bind(auth.uid).first();
 if(!member)return json({error:'active_member_required'},403,origin);
 const email=member.email.trim().toLowerCase();
 if(request.method==='PUT'){
  const parsed=await readJsonObject(request,origin);if(parsed.response)return parsed.response;
  if(typeof parsed.body.subscribed!=='boolean'||Object.keys(parsed.body).length!==1)return json({error:'invalid_preference'},400,origin);
  const linked=await env.DB.prepare('SELECT normalized_email FROM mailing_contacts WHERE current_member_id=?').bind(auth.uid).first();if(linked&&linked.normalized_email!==email)return json({error:'mailing_address_changed',message:'Vazbu nové adresy musí nejprve zkontrolovat správce. Původní souhlas se nepřenáší.'},409,origin);
  const conflict=await env.DB.prepare('SELECT current_member_id FROM mailing_contacts WHERE normalized_email=?').bind(email).first();
  if(conflict?.current_member_id&&conflict.current_member_id!==auth.uid)return json({error:'mailing_contact_conflict',message:'Vazbu adresy musí nejprve zkontrolovat správce.'},409,origin);
  const choice=parsed.body.subscribed?'yes':'no',reference=crypto.randomUUID(),source='member_account_explicit',now=new Date().toISOString();
  await env.DB.batch([
   env.DB.prepare(`INSERT INTO mailing_contacts(id,email,normalized_email,name,nickname,current_member_id,mailing_consent_status,mailing_consent_source,mailing_consent_at,suppression_status)
    VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(normalized_email) DO UPDATE SET current_member_id=excluded.current_member_id,mailing_consent_status=excluded.mailing_consent_status,mailing_consent_source=excluded.mailing_consent_source,mailing_consent_at=excluded.mailing_consent_at,
    suppression_status=CASE WHEN excluded.mailing_consent_status='no' AND mailing_contacts.suppression_status='eligible' THEN 'unsubscribed' ELSE mailing_contacts.suppression_status END,updated_at=excluded.mailing_consent_at
    WHERE (mailing_contacts.current_member_id IS NULL OR mailing_contacts.current_member_id=excluded.current_member_id) AND mailing_contacts.mailing_consent_status<>excluded.mailing_consent_status`)
    .bind(crypto.randomUUID(),email,email,member.name,member.nickname,auth.uid,choice,source,now,choice==='no'?'unsubscribed':'eligible'),
   env.DB.prepare(`INSERT INTO mailing_contact_sources(id,contact_id,source_type,source_reference,source_date,mailing_consent_status,consent_source,consent_at,original_record_json)
    SELECT ?,id,'current_member',?,?,?, ?,?,? FROM mailing_contacts WHERE normalized_email=? AND current_member_id=? AND changes()=1`)
    .bind(crypto.randomUUID(),reference,now,choice,source,now,JSON.stringify({subscribed:parsed.body.subscribed,source}),email,auth.uid),
  ]);
 }
 const c=await env.DB.prepare('SELECT mailing_consent_status,mailing_consent_source,mailing_consent_at,suppression_status,deliverability_status FROM mailing_contacts WHERE normalized_email=? AND (current_member_id=? OR current_member_id IS NULL)').bind(email,auth.uid).first();
 const eligibility=mailingEligibility({mailingConsentStatus:c?.mailing_consent_status,suppressionStatus:c?.suppression_status,deliverabilityStatus:c?.deliverability_status});
 const response=json({ok:true,subscribed:c?.mailing_consent_status==='yes',status:c?.mailing_consent_status||'unknown',source:c?.mailing_consent_source||null,at:c?.mailing_consent_at||null,eligibility},200,origin);response.headers.set('Cache-Control','no-store');return response;
}
