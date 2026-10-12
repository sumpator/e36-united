import { cors } from "../http/cors.js";
import { json } from "../http/responses.js";
import { clean } from "../utils/text.js";
import { extensionFor, validateImageFile,verifiedImage,boundedImageBytes } from "./media.js";
import { uploadIdentity } from './upload-identity.js';
import {MAX_GALLERY_DAILY,imageDigest,claimGalleryAttempt,finishGalleryAttempt,abandonGalleryAttempt,cleanExpiredGalleryAttempts} from './member-gallery-uploads.js';

async function uploadGallerySubmission(request, env, auth, origin) {
  const form = await request.formData();
  let id;
  try { id = await uploadIdentity(form, `member-gallery:${auth.uid}`); }
  catch { return json({ok:false,error:'invalid_upload_id'},400,origin); }
  const file = form.get("file");
  const validation = await validateImageFile(file);
  if (validation) return json({ ok: false, error: validation }, 400, origin);
  const image=verifiedImage(file),sha=await imageDigest(image.bytes);
  const receipt=()=>env.DB.prepare('SELECT id,caption,status,r2_key,created_at AS createdAt FROM gallery_submissions WHERE id=? AND member_id=?').bind(id,auth.uid).first();
  const success=(row,status,replayed=false)=>{const {r2_key,...submission}=row;return json({ok:true,submission,...(replayed?{replayed:true}:{})},status,origin)};
  const conflict=()=>json({ok:false,error:'upload_content_conflict',message:'Tento klíč nahrávání už patří jiné fotografii.'},409,origin);
  const replay=async row=>{
    const recorded=await env.DB.prepare('SELECT content_sha256 FROM member_gallery_upload_attempts WHERE upload_id=? AND member_id=? LIMIT 1').bind(id,auth.uid).first();
    if(recorded)return recorded.content_sha256===sha?success(row,200,true):conflict();
    // No backfill or image revalidation: compare a legacy retry to its existing bytes.
    const object=await env.MEDIA.get(row.r2_key);if(!object)return json({ok:false,error:'media_unavailable',message:'Uloženou fotografii se nepodařilo ověřit. Zkus to znovu.'},503,origin);
    const old=await boundedImageBytes(new Response(object.body).body,object.size||undefined);
    return await imageDigest(old)===sha?success(row,200,true):conflict();
  };
  const existing=await receipt();if(existing)return replay(existing);
  const previous=await env.DB.prepare('SELECT content_sha256,state,expires_at FROM member_gallery_upload_attempts WHERE upload_id=? AND member_id=?').bind(id,auth.uid).all();
  if(previous.results?.some(row=>row.content_sha256!==sha))return conflict();
  if(previous.results?.some(row=>row.state==='committed'))return json({ok:false,error:'upload_removed',message:'Tato fotografie již není dostupná.'},409,origin);
  await cleanExpiredGalleryAttempts(env,auth.uid);
  const caption = clean(form.get("caption") || "").slice(0, 240);
  const attemptId=crypto.randomUUID(),key=`gallery/${auth.uid}/${id}-${attemptId}.${extensionFor(image.type)}`;
  const attempt={attemptId,id,memberId:auth.uid,sha,key,caption};let claimed;
  try {
    claimed=await claimGalleryAttempt(env,attempt);
  } catch (error) {
    await abandonGalleryAttempt(env,attemptId);
    throw error;
  }
  if(!claimed.meta?.changes){
    const saved=await receipt();if(saved)return replay(saved);
    const rejected=await env.DB.prepare('SELECT content_sha256,state,expires_at FROM member_gallery_upload_attempts WHERE upload_id=? AND member_id=?').bind(id,auth.uid).all();
    if(rejected.results?.some(row=>row.content_sha256!==sha))return conflict();
    if(rejected.results?.some(row=>row.state==='committed'))return json({ok:false,error:'upload_removed',message:'Tato fotografie již není dostupná.'},409,origin);
    const busy=await env.DB.prepare("SELECT 1 busy FROM member_gallery_upload_attempts WHERE upload_id=? AND member_id=? AND state='pending' AND expires_at>CURRENT_TIMESTAMP LIMIT 1").bind(id,auth.uid).first();
    if(busy)return json({ok:false,error:'upload_in_progress',message:'Tato fotografie se ještě ukládá. Zkus stejnou položku znovu.'},409,origin);
    return json({ok:false,error:'Daily upload limit reached',message:`Za posledních 24 hodin lze nahrát nejvýše ${MAX_GALLERY_DAILY} fotografií.`},429,origin);
  }
  try{
    if(request.signal.aborted)throw new DOMException('Upload interrupted','AbortError');
    await env.MEDIA.put(key,image.bytes,{httpMetadata:{contentType:image.type},customMetadata:{owner:auth.uid,kind:'gallery',submissionId:id,contentSHA256:sha}});
    if(request.signal.aborted)throw new DOMException('Upload interrupted','AbortError');
    const result=await finishGalleryAttempt(env,attempt),saved=await receipt();
    if(result[0]?.meta?.changes&&saved)return success(saved,201);
    await abandonGalleryAttempt(env,attemptId);
    if(saved)return replay(saved);
    const expired=await env.DB.prepare("SELECT 1 expired FROM member_gallery_upload_attempts WHERE attempt_id=? AND expires_at<=CURRENT_TIMESTAMP").bind(attemptId).first();
    return expired?json({ok:false,error:'upload_attempt_expired',message:'Nahrávání se přerušilo. Zkus tuto fotografii znovu.'},409,origin):json({ok:false,error:'Daily upload limit reached',message:'Limit 24 fotografií za posledních 24 hodin byl dosažen.'},429,origin);
  }catch(error){await abandonGalleryAttempt(env,attemptId);throw error}
}

async function listMyGallery(env, auth, url, origin) {
  const rawLimit = Number(url.searchParams.get("limit") || 24);
  const rawOffset = Number(url.searchParams.get("offset") || 0);
  const limit = Math.max(1, Math.min(48, Number.isFinite(rawLimit) ? Math.trunc(rawLimit) : 24));
  const offset = Math.max(0, Math.min(10000, Number.isFinite(rawOffset) ? Math.trunc(rawOffset) : 0));
  const rows = await env.DB.prepare(`
    SELECT id, caption, status, created_at, reviewed_at
    FROM gallery_submissions
    WHERE member_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).bind(auth.uid, limit + 1, offset).all();
  const found = rows.results || [];
  const page = found.slice(0, limit);
  return json({
    ok: true,
    submissions: page.map(row => ({ id: row.id, caption: row.caption || "", status: row.status, createdAt: row.created_at, reviewedAt: row.reviewed_at || null, imageUrl: `/api/gallery/mine/media/${encodeURIComponent(row.id)}` })),
    pagination: { limit, offset, nextOffset: offset + page.length, hasMore: found.length > limit },
  }, 200, origin);
}

async function privateMemberGalleryMedia(env, auth, submissionId, origin) {
  const row = await env.DB.prepare(`
    SELECT r2_key
    FROM gallery_submissions
    WHERE id = ? AND member_id = ?
    LIMIT 1
  `).bind(submissionId, auth.uid).first();
  if (!row) return json({ ok: false, error: "Photo not found" }, 404, origin);
  const object = await env.MEDIA.get(row.r2_key);
  if (!object) return json({ ok: false, error: "Media not found" }, 404, origin);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("ETag", object.httpEtag || object.etag || "");
  return cors(new Response(object.body, { status: 200, headers }), origin);
}

export { listMyGallery, privateMemberGalleryMedia, uploadGallerySubmission };
