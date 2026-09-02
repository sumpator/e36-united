import { cors } from "../http/cors.js";
import { json } from "../http/responses.js";
import { clean } from "../utils/text.js";
import { extensionFor, validateImageFile } from "./media.js";

const MAX_GALLERY_DAILY = 24;

async function uploadGallerySubmission(request, env, auth, origin) {
  const daily = await env.DB.prepare(`
    SELECT COUNT(*) AS count FROM gallery_submissions
    WHERE member_id = ? AND created_at >= datetime('now', '-1 day')
  `).bind(auth.uid).first();
  if (Number(daily?.count || 0) >= MAX_GALLERY_DAILY) return json({ ok: false, error: "Daily upload limit reached" }, 429, origin);

  const form = await request.formData();
  const file = form.get("file");
  const validation = validateImageFile(file);
  if (validation) return json({ ok: false, error: validation }, 400, origin);
  const caption = clean(form.get("caption") || "").slice(0, 240);

  const id = crypto.randomUUID();
  const ext = extensionFor(file.type);
  const key = `gallery/${auth.uid}/${id}.${ext}`;
  await env.MEDIA.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { owner: auth.uid, kind: "gallery", submissionId: id },
  });
  try {
    await env.DB.prepare(`
      INSERT INTO gallery_submissions (id, member_id, r2_key, caption, status)
      VALUES (?, ?, ?, ?, 'pending')
    `).bind(id, auth.uid, key, caption || null).run();
  } catch (error) {
    await env.MEDIA.delete(key);
    throw error;
  }
  return json({ ok: true, submission: { id, caption, status: "pending", createdAt: new Date().toISOString() } }, 201, origin);
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
