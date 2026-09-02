import { cors } from "../http/cors.js";
import { json } from "../http/responses.js";
import { validateImageFile } from "./media.js";

function accommodationPhotoKey(eventId, optionId) {
  return `accommodation/${encodeURIComponent(String(eventId || ""))}/${encodeURIComponent(String(optionId || ""))}/cover`;
}

async function accommodationVisualMetadata(env, eventId, optionId) {
  const fallback = { hasCustomPhoto: false, imageUrl: null, version: null };
  if (!env.MEDIA?.head || !eventId || !optionId) return fallback;
  let object = null;
  try { object = await env.MEDIA.head(accommodationPhotoKey(eventId, optionId)); }
  catch (error) { console.warn("Accommodation photo metadata unavailable", optionId, error); return fallback; }
  if (!object) return fallback;
  const version = object.httpEtag || object.etag || String(object.uploaded?.getTime?.() || object.size || "current");
  return {
    hasCustomPhoto: true,
    imageUrl: `/api/accommodation/media/${encodeURIComponent(optionId)}?v=${encodeURIComponent(version)}`,
    version,
  };
}

async function findAccommodationOption(env, optionId) {
  if (!optionId || optionId.length > 128) return null;
  return await env.DB.prepare(`
    SELECT id, event_id, name
    FROM event_accommodation_options
    WHERE id = ?
    LIMIT 1
  `).bind(optionId).first();
}

async function publicAccommodationMedia(env, optionId, url, origin) {
  const option = await findAccommodationOption(env, optionId);
  if (!option) return json({ ok: false, error: "accommodation_not_found", message: "Typ ubytování nebyl nalezen." }, 404, origin);
  const object = await env.MEDIA.get(accommodationPhotoKey(option.event_id, option.id));
  if (!object?.body) return json({ ok: false, error: "accommodation_photo_not_found", message: "Ubytování používá generovaný vizuál." }, 404, origin);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag || object.etag || "");
  headers.set("Cache-Control", url.searchParams.has("v") ? "public, max-age=31536000, immutable" : "public, max-age=300");
  return cors(new Response(object.body, { status: 200, headers }), origin);
}

async function putAdminAccommodationPhoto(request, env, auth, optionId, origin) {
  const option = await findAccommodationOption(env, optionId);
  if (!option) return json({ ok: false, error: "accommodation_not_found", message: "Typ ubytování nebyl nalezen." }, 404, origin);
  let form;
  try { form = await request.formData(); }
  catch { return json({ ok: false, error: "invalid_accommodation_photo", message: "Požadavek neobsahuje platný formulář s fotografií." }, 400, origin); }
  const file = form.get("file");
  const validation = validateImageFile(file);
  if (validation) return json({ ok: false, error: "invalid_accommodation_photo", message: validation }, 400, origin);
  await env.MEDIA.put(accommodationPhotoKey(option.event_id, option.id), file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { owner: auth.uid, kind: "accommodation", eventId: option.event_id, optionId: option.id },
  });
  return json({ ok: true, optionId: option.id, visual: await accommodationVisualMetadata(env, option.event_id, option.id) }, 200, origin);
}

async function deleteAdminAccommodationPhoto(env, auth, optionId, origin) {
  const option = await findAccommodationOption(env, optionId);
  if (!option) return json({ ok: false, error: "accommodation_not_found", message: "Typ ubytování nebyl nalezen." }, 404, origin);
  await env.MEDIA.delete(accommodationPhotoKey(option.event_id, option.id));
  return json({ ok: true, optionId: option.id, removedBy: auth.uid, visual: { hasCustomPhoto: false, imageUrl: null, version: null } }, 200, origin);
}

export {
  accommodationPhotoKey,
  accommodationVisualMetadata,
  deleteAdminAccommodationPhoto,
  publicAccommodationMedia,
  putAdminAccommodationPhoto,
};
