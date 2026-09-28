import { tokenHash } from './arrivals.js';
import { json } from '../http/responses.js';
import { createSmtp2goAdapter, senderConfig } from './mailing/provider/smtp2go.js';

// The local fixture injects a transport; its environment has no provider credentials.
export async function deliverArrivalInvitations(env,arrivalId,{transport}={}) {
  const row=await env.DB.prepare("SELECT o.* FROM email_outbox o JOIN arrival_invitations i ON i.outbox_id=o.id WHERE i.arrival_id=? AND o.status='queued'").bind(arrivalId).first();
  if(!row)return;
  if(!transport&&!env.SMTP2GO_API_KEY)return; // Remains queued, clearly visible; no blind retry.
  const lock=await env.DB.prepare("UPDATE email_outbox SET status='sending' WHERE id=? AND status='queued'").bind(row.id).run();if(!lock.meta.changes)return;
  try {
    const {token}=JSON.parse(row.payload_json),sender=senderConfig(env);
    const link='https://e36united.cz/member.html#arrival-invite='+encodeURIComponent(token);
    const result=await (transport||createSmtp2goAdapter(env)).sendBatch([{sender:sender.sender,to:[row.recipient_email],subject:row.subject,text_body:`Děkujeme za příjezd na E36 United. Přihlas se nebo založ účet a ověř svoji e-mailovou adresu. Potom můžeš připojit účast: ${link}\nOdkaz platí 7 dní a lze použít jednou. Newsletter tím nezapínáš.`,custom_headers:[{header:'Reply-To',value:sender.replyTo}]}]);
    await env.DB.prepare("UPDATE email_outbox SET status='sent',provider_message_id=?,sent_at=CURRENT_TIMESTAMP,payload_json=NULL WHERE id=?").bind(result.emailIds?.[0]||null,row.id).run();
  } catch(e) {
    await env.DB.prepare("UPDATE email_outbox SET status=?,error_message=? WHERE id=?").bind(e.definiteRejection?'failed':'uncertain',e.code||'delivery_unconfirmed',row.id).run();
  }
}

export async function claimArrival(request,env,auth,origin) {
  if(!auth.emailVerified)return json({ok:false,error:'verified_email_required',message:'Nejdřív ověř e-mail svého účtu.'},403,origin);
  const b=await request.json(),token=typeof b.token==='string'?b.token:'';
  if(!/^[a-f0-9-]{72}$/.test(token))return json({ok:false,error:'invalid_invitation'},400,origin);
  const hash=await tokenHash(token),email=String(auth.email||'').trim().toLowerCase();
  if(b.preview===true){
    const preview=await env.DB.prepare(`SELECT a.name,a.nickname,a.phone,a.model,a.event_id eventId,i.consumed_by FROM arrival_invitations i JOIN event_arrivals a ON a.id=i.arrival_id JOIN members m ON m.id=? AND m.status='active' AND lower(m.email)=i.email WHERE i.token_hash=? AND i.email=? AND i.expires_at>datetime('now') AND (i.consumed_at IS NULL OR i.consumed_by=?)`).bind(auth.uid,hash,email,auth.uid).first();
    return preview?json({ok:true,preview,alreadyLinked:preview.consumed_by===auth.uid},200,origin):json({ok:false,error:'invitation_unavailable'},409,origin);
  }
  const invitation=await env.DB.prepare(`SELECT i.*,a.event_id,a.car_key,a.garage_car_id,a.competition_car_id,a.model,a.body,a.confirmed_by FROM arrival_invitations i JOIN event_arrivals a ON a.id=i.arrival_id JOIN members m ON m.id=? AND m.status='active' AND lower(m.email)=i.email WHERE i.token_hash=? AND i.email=? AND i.consumed_at IS NULL AND i.expires_at>datetime('now') AND a.member_id IS NULL`).bind(auth.uid,hash,email).first();
  if(!invitation)return json({ok:false,error:'invitation_unavailable',message:'Pozvánka není dostupná pro tento ověřený účet nebo už byla použita.'},409,origin);
  const claimId=crypto.randomUUID();
  const guard=`EXISTS(SELECT 1 FROM arrival_invitations WHERE id=? AND consumed_by=? AND claim_id=?)`;
  const result=await env.DB.batch([
    env.DB.prepare("UPDATE arrival_invitations SET consumed_by=?,consumed_at=CURRENT_TIMESTAMP,claim_id=? WHERE id=? AND consumed_at IS NULL AND expires_at>datetime('now') AND EXISTS(SELECT 1 FROM members WHERE id=? AND status='active' AND lower(email)=?)").bind(auth.uid,claimId,invitation.id,auth.uid,email),
    env.DB.prepare(`UPDATE event_arrivals SET member_id=?,version=version+1 WHERE id=? AND member_id IS NULL AND ${guard}`).bind(auth.uid,invitation.arrival_id,invitation.id,auth.uid,claimId),
    env.DB.prepare(`INSERT INTO admin_actions(id,admin_member_id,action_type,entity_type,entity_id,new_state_json,note) SELECT ?,?,'arrival_claim','arrival',?,?,'Propojení přes ověřený e-mail a jednorázovou pozvánku' WHERE ${guard}`).bind(crypto.randomUUID(),auth.uid,invitation.arrival_id,JSON.stringify({memberId:auth.uid}),invitation.id,auth.uid,claimId),
  ]);
  return result[0].meta.changes?json({ok:true,arrivalId:invitation.arrival_id},200,origin):json({ok:false,error:'invitation_already_used'},409,origin);
}
