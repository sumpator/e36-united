import { cors } from "../http/cors.js";
import { json } from "../http/responses.js";
import { validateImageFile } from "./media.js";

function accommodationPhotoKey(eventId, optionId) {
  return `accommodation/${encodeURIComponent(String(eventId || ""))}/${encodeURIComponent(String(optionId || ""))}/cover`;
}

function accommodationGalleryPhotoKey(eventId, optionId, photoId) {
  return `accommodation/${encodeURIComponent(String(eventId || ""))}/${encodeURIComponent(String(optionId || ""))}/gallery/${encodeURIComponent(String(photoId || ""))}`;
}

function galleryPhotoMetadata(row) {
  if (!row) return null;
  const version = row.updated_at || row.created_at || row.id;
  return {
    id: row.id,
    role: "additional",
    imageUrl: `/api/accommodation/media/${encodeURIComponent(row.option_id)}/${encodeURIComponent(row.id)}?v=${encodeURIComponent(version)}`,
    version,
    sortOrder: Number(row.sort_order || 0),
  };
}

async function listAccommodationGalleryRows(env, eventId) {
  if (!eventId) return [];
  const rows = await env.DB.prepare(`
    WITH ordered AS (
      SELECT p.id, p.option_id, p.sort_order, p.created_at, p.updated_at,
             ROW_NUMBER() OVER (PARTITION BY p.option_id ORDER BY p.sort_order ASC, p.id ASC) AS photo_rank
      FROM event_accommodation_photos p
      JOIN event_accommodation_options o ON o.id = p.option_id
      WHERE o.event_id = ?
    )
    SELECT id, option_id, sort_order, created_at, updated_at
    FROM ordered
    WHERE photo_rank <= 5
    ORDER BY option_id ASC, sort_order ASC, id ASC
  `).bind(eventId).all();
  return rows.results || [];
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

async function hydrateAccommodationMedia(env, eventId, options) {
  const rows = await listAccommodationGalleryRows(env, eventId);
  const byOption = new Map();
  for (const row of rows) {
    if (!byOption.has(row.option_id)) byOption.set(row.option_id, []);
    byOption.get(row.option_id).push(galleryPhotoMetadata(row));
  }
  await Promise.all(options.map(async option => {
    const cover = await accommodationVisualMetadata(env, eventId, option.id);
    const additional = byOption.get(option.id) || [];
    option.photos = [
      ...(cover.hasCustomPhoto ? [{ id: "cover", role: "cover", imageUrl: cover.imageUrl, version: cover.version, sortOrder: 0 }] : []),
      ...additional,
    ];
    option.visual = cover.hasCustomPhoto
      ? cover
      : additional.length
        ? { hasCustomPhoto: true, imageUrl: additional[0].imageUrl, version: additional[0].version }
        : cover;
  }));
  return options;
}

async function accommodationMediaMetadata(env, eventId, optionId, galleryRows = null) {
  const [cover, rows] = await Promise.all([
    accommodationVisualMetadata(env, eventId, optionId),
    galleryRows ? Promise.resolve(galleryRows) : listAccommodationGalleryRows(env, eventId),
  ]);
  const additional = rows.filter(row => row.option_id === optionId).map(galleryPhotoMetadata);
  return {
    visual: cover.hasCustomPhoto
      ? cover
      : additional.length
        ? { hasCustomPhoto: true, imageUrl: additional[0].imageUrl, version: additional[0].version }
        : cover,
    photos: [
      ...(cover.hasCustomPhoto ? [{ id: "cover", role: "cover", imageUrl: cover.imageUrl, version: cover.version, sortOrder: 0 }] : []),
      ...additional,
    ],
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

async function publicAccommodationGalleryMedia(env, optionId, photoId, url, origin) {
  if (!optionId || !photoId || optionId.length > 128 || photoId.length > 128) {
    return json({ ok: false, error: "accommodation_photo_not_found", message: "Fotografie nebyla nalezena." }, 404, origin);
  }
  const photo = await env.DB.prepare(`
    SELECT p.r2_key
    FROM event_accommodation_photos p
    JOIN event_accommodation_options o ON o.id = p.option_id
    WHERE p.id = ? AND p.option_id = ?
    LIMIT 1
  `).bind(photoId, optionId).first();
  if (!photo) return json({ ok: false, error: "accommodation_photo_not_found", message: "Fotografie nebyla nalezena." }, 404, origin);
  const object = await env.MEDIA.get(photo.r2_key);
  if (!object?.body) return json({ ok: false, error: "accommodation_photo_not_found", message: "Fotografie nebyla nalezena." }, 404, origin);
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
  const existingCover = await env.MEDIA.head(accommodationPhotoKey(option.event_id, option.id));
  if (!existingCover) {
    const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM event_accommodation_photos WHERE option_id = ?").bind(option.id).first();
    if (Number(row?.count || 0) >= 5) return json({ ok: false, error: "accommodation_photo_limit", message: "Galerie už obsahuje maximálně 5 fotografií. Nejdřív jednu doplňkovou fotografii odeber." }, 409, origin);
  }
  await env.MEDIA.put(accommodationPhotoKey(option.event_id, option.id), file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { owner: auth.uid, kind: "accommodation", eventId: option.event_id, optionId: option.id },
  });
  return json({ ok: true, optionId: option.id, ...(await accommodationMediaMetadata(env, option.event_id, option.id)) }, 200, origin);
}

async function deleteAdminAccommodationPhoto(env, auth, optionId, origin) {
  const option = await findAccommodationOption(env, optionId);
  if (!option) return json({ ok: false, error: "accommodation_not_found", message: "Typ ubytování nebyl nalezen." }, 404, origin);
  await env.MEDIA.delete(accommodationPhotoKey(option.event_id, option.id));
  return json({ ok: true, optionId: option.id, removedBy: auth.uid, ...(await accommodationMediaMetadata(env, option.event_id, option.id)) }, 200, origin);
}

async function postAdminAccommodationGalleryPhoto(request, env, auth, optionId, origin) {
  const option = await findAccommodationOption(env, optionId);
  if (!option) return json({ ok: false, error: "accommodation_not_found", message: "Typ ubytování nebyl nalezen." }, 404, origin);
  let form;
  try { form = await request.formData(); }
  catch { return json({ ok: false, error: "invalid_accommodation_photo", message: "Požadavek neobsahuje platný formulář s fotografií." }, 400, origin); }
  const file = form.get("file");
  const validation = validateImageFile(file);
  if (validation) return json({ ok: false, error: "invalid_accommodation_photo", message: validation }, 400, origin);
  const cover = await env.MEDIA.head(accommodationPhotoKey(option.event_id, option.id));
  const maxAdditional = cover ? 4 : 5;
  const photoId = crypto.randomUUID();
  const key = accommodationGalleryPhotoKey(option.event_id, option.id, photoId);
  await env.MEDIA.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { owner: auth.uid, kind: "accommodation-gallery", eventId: option.event_id, optionId: option.id, photoId },
  });
  try {
    const result = await env.DB.prepare(`
      INSERT INTO event_accommodation_photos (id, option_id, r2_key, mime_type, size_bytes, sort_order)
      SELECT ?, ?, ?, ?, ?, COALESCE(MAX(sort_order), 0) + 1
      FROM event_accommodation_photos
      WHERE option_id = ?
      HAVING COUNT(*) < ?
    `).bind(photoId, option.id, key, file.type, file.size, option.id, maxAdditional).run();
    if (!result?.meta?.changes) {
      await env.MEDIA.delete(key);
      return json({ ok: false, error: "accommodation_photo_limit", message: "Galerie už obsahuje maximálně 5 fotografií." }, 409, origin);
    }
  } catch (error) {
    await env.MEDIA.delete(key);
    throw error;
  }
  return json({ ok: true, optionId: option.id, ...(await accommodationMediaMetadata(env, option.event_id, option.id)) }, 201, origin);
}

async function deleteAdminAccommodationGalleryPhoto(env, auth, optionId, photoId, origin) {
  const photo = await env.DB.prepare(`
    SELECT p.id, p.option_id, p.r2_key, o.event_id
    FROM event_accommodation_photos p
    JOIN event_accommodation_options o ON o.id = p.option_id
    WHERE p.id = ? AND p.option_id = ?
    LIMIT 1
  `).bind(photoId, optionId).first();
  if (!photo) return json({ ok: false, error: "accommodation_photo_not_found", message: "Fotografie nebyla nalezena." }, 404, origin);
  await env.MEDIA.delete(photo.r2_key);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM event_accommodation_photos WHERE id = ? AND option_id = ?").bind(photoId, optionId),
    env.DB.prepare(`
      UPDATE event_accommodation_photos
      SET sort_order = (SELECT COUNT(*) FROM event_accommodation_photos before_photo WHERE before_photo.option_id = event_accommodation_photos.option_id AND (before_photo.sort_order < event_accommodation_photos.sort_order OR (before_photo.sort_order = event_accommodation_photos.sort_order AND before_photo.id <= event_accommodation_photos.id))), updated_at = CURRENT_TIMESTAMP
      WHERE option_id = ? AND id <> ?
    `).bind(optionId, photoId),
  ]);
  return json({ ok: true, optionId, photoId, removedBy: auth.uid, ...(await accommodationMediaMetadata(env, photo.event_id, optionId)) }, 200, origin);
}

async function patchAdminAccommodationGalleryPhoto(request, env, auth, optionId, photoId, origin) {
  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: "invalid_json", message: "Požadavek nemá platný JSON." }, 400, origin); }
  if (!['up', 'down'].includes(body?.direction)) return json({ ok: false, error: "invalid_photo_order", message: "Směr pořadí není platný." }, 400, origin);
  const photos = await env.DB.prepare(`
    SELECT p.id, p.sort_order, o.event_id
    FROM event_accommodation_photos p
    JOIN event_accommodation_options o ON o.id = p.option_id
    WHERE p.option_id = ?
    ORDER BY p.sort_order ASC, p.id ASC
  `).bind(optionId).all();
  const ordered = photos.results || [];
  const index = ordered.findIndex(photo => photo.id === photoId);
  if (index < 0) return json({ ok: false, error: "accommodation_photo_not_found", message: "Fotografie nebyla nalezena." }, 404, origin);
  const target = body.direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= ordered.length) return json({ ok: true, unchanged: true, optionId, ...(await accommodationMediaMetadata(env, ordered[index].event_id, optionId)) }, 200, origin);
  const current = ordered[index], adjacent = ordered[target];
  await env.DB.prepare(`
    UPDATE event_accommodation_photos
    SET sort_order = CASE id WHEN ? THEN ? WHEN ? THEN ? ELSE sort_order END, updated_at = CURRENT_TIMESTAMP
    WHERE option_id = ? AND id IN (?, ?)
  `).bind(current.id, adjacent.sort_order, adjacent.id, current.sort_order, optionId, current.id, adjacent.id).run();
  return json({ ok: true, optionId, movedBy: auth.uid, ...(await accommodationMediaMetadata(env, current.event_id, optionId)) }, 200, origin);
}

export {
  accommodationPhotoKey,
  accommodationGalleryPhotoKey,
  accommodationMediaMetadata,
  accommodationVisualMetadata,
  deleteAdminAccommodationGalleryPhoto,
  deleteAdminAccommodationPhoto,
  hydrateAccommodationMedia,
  listAccommodationGalleryRows,
  patchAdminAccommodationGalleryPhoto,
  postAdminAccommodationGalleryPhoto,
  publicAccommodationGalleryMedia,
  publicAccommodationMedia,
  putAdminAccommodationPhoto,
};
