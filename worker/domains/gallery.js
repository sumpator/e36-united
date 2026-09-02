import { cors } from "../http/cors.js";
import { json } from "../http/responses.js";

async function publicGalleryList(env, url, origin) {
  const rawLimit = Number(url.searchParams.get("limit") || 60);
  const limit = Math.max(1, Math.min(100, Number.isFinite(rawLimit) ? rawLimit : 60));
  const rows = await env.DB.prepare(`
    SELECT g.id, g.caption, g.created_at, m.nickname, m.name
    FROM gallery_submissions g
    JOIN members m ON m.id = g.member_id
    WHERE g.status = 'approved'
    ORDER BY COALESCE(g.reviewed_at, g.created_at) DESC
    LIMIT ?
  `).bind(limit).all();
  return json({ ok: true, photos: (rows.results || []).map(row => ({
    id: row.id,
    caption: row.caption || "",
    author: row.nickname || row.name || "United member",
    createdAt: row.created_at,
    imageUrl: `/api/gallery/media/${encodeURIComponent(row.id)}`,
  })) }, 200, origin);
}

async function publicGalleryMedia(env, submissionId, origin) {
  const row = await env.DB.prepare("SELECT r2_key FROM gallery_submissions WHERE id = ? AND status = 'approved' LIMIT 1").bind(submissionId).first();
  if (!row) return json({ ok: false, error: "Photo not found" }, 404, origin);
  const object = await env.MEDIA.get(row.r2_key);
  if (!object) return json({ ok: false, error: "Media not found" }, 404, origin);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "no-store");
  headers.set("ETag", object.httpEtag || object.etag || "");
  return cors(new Response(object.body, { status: 200, headers }), origin);
}

export { publicGalleryList, publicGalleryMedia };
