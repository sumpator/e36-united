// A small per-attempt ledger, not an in-process lock or a background task system.
// Every object key belongs to one fenced attempt and is never reused on retry.
export const MAX_GALLERY_DAILY=24;
export const GALLERY_UPLOAD_LEASE_MINUTES=10;
export async function imageDigest(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('')}

export async function abandonGalleryAttempt(env,attemptId){
 try{
  const changed=await env.DB.prepare(`UPDATE member_gallery_upload_attempts SET state='failed'
   WHERE attempt_id=? AND state<>'committed'
   AND NOT EXISTS(SELECT 1 FROM gallery_submissions g WHERE g.r2_key=member_gallery_upload_attempts.r2_key)`).bind(attemptId).run();
  if(!changed.meta?.changes)return;
  const row=await env.DB.prepare("SELECT r2_key FROM member_gallery_upload_attempts WHERE attempt_id=? AND state='failed'").bind(attemptId).first();
  if(!row)return;await env.MEDIA.delete(row.r2_key);
  await env.DB.prepare('UPDATE member_gallery_upload_attempts SET cleanup_checked_at=CURRENT_TIMESTAMP WHERE attempt_id=?').bind(attemptId).run();
 }catch(error){console.warn('Gallery attempt cleanup deferred',error)}
}

export async function cleanExpiredGalleryAttempts(env,memberId){
 // Bounded, fair opportunistic cleanup; interrupted puts may finish after a first
 // delete, so failed attempts retain their key and can be checked again later.
 const rows=await env.DB.prepare(`SELECT attempt_id FROM member_gallery_upload_attempts
  WHERE member_id=? AND (state='failed' OR (state='pending' AND expires_at<=CURRENT_TIMESTAMP))
  ORDER BY COALESCE(cleanup_checked_at,'0000'),attempt_id LIMIT 8`).bind(memberId).all();
 for(const row of rows.results||[])await abandonGalleryAttempt(env,row.attempt_id);
}

export async function claimGalleryAttempt(env,{attemptId,id,memberId,sha,key}){
 return env.DB.prepare(`INSERT INTO member_gallery_upload_attempts(attempt_id,upload_id,member_id,content_sha256,r2_key,expires_at)
  SELECT ?,?,?,?,?,datetime('now','+${GALLERY_UPLOAD_LEASE_MINUTES} minutes')
  WHERE NOT EXISTS(SELECT 1 FROM gallery_submissions WHERE id=?)
   AND NOT EXISTS(SELECT 1 FROM member_gallery_upload_attempts WHERE upload_id=? AND member_id=?
    AND (content_sha256<>? OR state='committed' OR (state='pending' AND expires_at>CURRENT_TIMESTAMP)))
   AND (SELECT COUNT(*) FROM gallery_submissions WHERE member_id=? AND created_at>=datetime('now','-1 day'))+
    (SELECT COUNT(*) FROM member_gallery_upload_attempts a WHERE a.member_id=? AND a.state='pending' AND a.expires_at>CURRENT_TIMESTAMP
     AND NOT EXISTS(SELECT 1 FROM gallery_submissions g WHERE g.id=a.upload_id))<?`)
  .bind(attemptId,id,memberId,sha,key,id,id,memberId,sha,memberId,memberId,MAX_GALLERY_DAILY).run();
}

export async function finishGalleryAttempt(env,{attemptId,id,memberId,key,caption}){
 return env.DB.batch([
  env.DB.prepare(`INSERT INTO gallery_submissions(id,member_id,r2_key,caption,status)
   SELECT ?,?,?,?,'pending' WHERE EXISTS(SELECT 1 FROM member_gallery_upload_attempts
    WHERE attempt_id=? AND upload_id=? AND member_id=? AND r2_key=? AND state='pending' AND expires_at>CURRENT_TIMESTAMP)
   AND (SELECT COUNT(*) FROM gallery_submissions WHERE member_id=? AND created_at>=datetime('now','-1 day'))<?
   ON CONFLICT(id) DO NOTHING`).bind(id,memberId,key,caption||null,attemptId,id,memberId,key,memberId,MAX_GALLERY_DAILY),
  env.DB.prepare(`UPDATE member_gallery_upload_attempts SET state='committed' WHERE attempt_id=? AND state='pending'
   AND EXISTS(SELECT 1 FROM gallery_submissions WHERE id=? AND r2_key=?)`).bind(attemptId,id,key),
 ]);
}
