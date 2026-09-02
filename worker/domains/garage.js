import { cors } from "../http/cors.js";
import { json } from "../http/responses.js";
import { clean } from "../utils/text.js";
import { profilePointStatement } from "./club/points.js";
import { extensionFor, validateImageFile } from "./media.js";

const MAX_CAR_PHOTOS = 3;

async function listCars(env, auth, origin) {
  const rows = await env.DB.prepare(`
    SELECT
      c.id, c.nickname, c.model, c.body, c.year, c.color, c.is_primary, c.created_at, c.updated_at,
      p.id AS photo_id, p.mime_type AS photo_mime, p.size_bytes AS photo_size, p.sort_order AS photo_sort
    FROM cars c
    LEFT JOIN car_photos p ON p.car_id = c.id
    WHERE c.member_id = ?
    ORDER BY c.is_primary DESC, c.created_at ASC, p.sort_order ASC, p.created_at ASC
  `).bind(auth.uid).all();

  const map = new Map();
  for (const row of rows.results || []) {
    if (!map.has(row.id)) {
      map.set(row.id, {
        id: row.id,
        nickname: row.nickname || "",
        model: row.model || "",
        body: row.body || "",
        year: row.year || "",
        color: row.color || "",
        primary: !!row.is_primary,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        photos: [],
      });
    }
    if (row.photo_id) map.get(row.id).photos.push({ id: row.photo_id, mimeType: row.photo_mime || "image/jpeg", sizeBytes: row.photo_size || 0 });
  }
  return json({ ok: true, cars: [...map.values()] }, 200, origin);
}

async function createCar(request, env, auth, origin) {
  let body = {};
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON" }, 400, origin); }

  const nickname = clean(body.nickname || "").slice(0, 80);
  const model = clean(body.model || "").slice(0, 80);
  const carBody = clean(body.body || "").slice(0, 40);
  const color = clean(body.color || "").slice(0, 80);
  const year = body.year ? Number(body.year) : null;
  if (!model || !carBody) return json({ ok: false, error: "Model and body are required" }, 400, origin);
  if (year && (year < 1990 || year > 2030)) return json({ ok: false, error: "Invalid year" }, 400, origin);

  const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM cars WHERE member_id = ?").bind(auth.uid).first();
  const primary = body.primary === true || Number(count?.count || 0) === 0;
  const id = crypto.randomUUID();

  const statements = [];
  if (primary) statements.push(env.DB.prepare("UPDATE cars SET is_primary = 0, updated_at = CURRENT_TIMESTAMP WHERE member_id = ?").bind(auth.uid));
  statements.push(env.DB.prepare(`
    INSERT INTO cars (id, member_id, nickname, model, body, year, color, is_primary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, auth.uid, nickname || null, model, carBody, year, color || null, primary ? 1 : 0));
  statements.push(profilePointStatement(env, auth.uid));
  await env.DB.batch(statements);

  return json({ ok: true, car: { id, nickname, model, body: carBody, year, color, primary, photos: [] } }, 201, origin);
}

async function updateCar(request, env, auth, carId, origin) {
  let body = {};
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON" }, 400, origin); }

  const car = await env.DB.prepare("SELECT id, is_primary FROM cars WHERE id = ? AND member_id = ? LIMIT 1").bind(carId, auth.uid).first();
  if (!car) return json({ ok: false, error: "Car not found" }, 404, origin);

  const nickname = clean(body.nickname || "").slice(0, 80);
  const model = clean(body.model || "").slice(0, 80);
  const carBody = clean(body.body || "").slice(0, 40);
  const color = clean(body.color || "").slice(0, 80);
  const year = body.year ? Number(body.year) : null;
  if (!model || !carBody) return json({ ok: false, error: "Model and body are required" }, 400, origin);
  if (year && (year < 1990 || year > 2030)) return json({ ok: false, error: "Invalid year" }, 400, origin);

  const requestedPrimary = body.primary === true;
  let primary = requestedPrimary || !!car.is_primary;
  let replacementPrimaryId = "";
  const statements = [];
  if (requestedPrimary) {
    statements.push(env.DB.prepare("UPDATE cars SET is_primary = 0, updated_at = CURRENT_TIMESTAMP WHERE member_id = ?").bind(auth.uid));
    primary = true;
  } else if (car.is_primary) {
    const replacement = await env.DB.prepare("SELECT id FROM cars WHERE member_id = ? AND id <> ? ORDER BY created_at ASC LIMIT 1").bind(auth.uid, carId).first();
    if (replacement?.id) {
      primary = false;
      replacementPrimaryId = replacement.id;
    }
  }
  statements.push(env.DB.prepare(`
    UPDATE cars
    SET nickname = ?, model = ?, body = ?, year = ?, color = ?, is_primary = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND member_id = ?
  `).bind(nickname || null, model, carBody, year, color || null, primary ? 1 : 0, carId, auth.uid));
  if (replacementPrimaryId) statements.push(env.DB.prepare("UPDATE cars SET is_primary = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND member_id = ?").bind(replacementPrimaryId, auth.uid));
  const results = await env.DB.batch(statements);
  const carUpdateResult = results[requestedPrimary ? 1 : 0];
  if (!carUpdateResult?.meta?.changes) return json({ ok: false, error: "Car not found" }, 404, origin);

  return json({ ok: true, car: { id: carId, nickname, model, body: carBody, year, color, primary } }, 200, origin);
}

async function setPrimaryCar(env, auth, carId, origin) {
  const owned = await env.DB.prepare("SELECT id FROM cars WHERE id = ? AND member_id = ? LIMIT 1").bind(carId, auth.uid).first();
  if (!owned) return json({ ok: false, error: "Car not found" }, 404, origin);
  await env.DB.batch([
    env.DB.prepare("UPDATE cars SET is_primary = 0, updated_at = CURRENT_TIMESTAMP WHERE member_id = ?").bind(auth.uid),
    env.DB.prepare("UPDATE cars SET is_primary = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND member_id = ?").bind(carId, auth.uid),
  ]);
  return json({ ok: true }, 200, origin);
}

async function deleteCar(env, auth, carId, origin) {
  const car = await env.DB.prepare("SELECT id, is_primary FROM cars WHERE id = ? AND member_id = ? LIMIT 1").bind(carId, auth.uid).first();
  if (!car) return json({ ok: false, error: "Car not found" }, 404, origin);
  const photos = await env.DB.prepare("SELECT r2_key FROM car_photos WHERE car_id = ?").bind(carId).all();
  for (const photo of photos.results || []) {
    try { await env.MEDIA.delete(photo.r2_key); } catch (error) { console.warn("Unable to delete R2 car photo", error); }
  }
  await env.DB.prepare("DELETE FROM cars WHERE id = ? AND member_id = ?").bind(carId, auth.uid).run();
  if (car.is_primary) {
    const next = await env.DB.prepare("SELECT id FROM cars WHERE member_id = ? ORDER BY created_at ASC LIMIT 1").bind(auth.uid).first();
    if (next?.id) await env.DB.prepare("UPDATE cars SET is_primary = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(next.id).run();
  }
  return json({ ok: true }, 200, origin);
}

async function uploadCarPhoto(request, env, auth, carId, origin) {
  const car = await env.DB.prepare("SELECT id FROM cars WHERE id = ? AND member_id = ? LIMIT 1").bind(carId, auth.uid).first();
  if (!car) return json({ ok: false, error: "Car not found" }, 404, origin);
  const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM car_photos WHERE car_id = ?").bind(carId).first();
  if (Number(count?.count || 0) >= MAX_CAR_PHOTOS) return json({ ok: false, error: "Maximum 3 photos per car" }, 409, origin);

  const form = await request.formData();
  const file = form.get("file");
  const validation = validateImageFile(file);
  if (validation) return json({ ok: false, error: validation }, 400, origin);

  const id = crypto.randomUUID();
  const ext = extensionFor(file.type);
  const key = `cars/${auth.uid}/${carId}/${id}.${ext}`;
  const sortOrder = Number(count?.count || 0);

  await env.MEDIA.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { owner: auth.uid, kind: "car", carId, photoId: id },
  });
  try {
    await env.DB.prepare(`
      INSERT INTO car_photos (id, car_id, r2_key, mime_type, size_bytes, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, carId, key, file.type, file.size, sortOrder).run();
  } catch (error) {
    await env.MEDIA.delete(key);
    throw error;
  }
  return json({ ok: true, photo: { id, mimeType: file.type, sizeBytes: file.size } }, 201, origin);
}

async function replaceCarPhoto(request, env, auth, carId, origin) {
  const car = await env.DB.prepare("SELECT id FROM cars WHERE id = ? AND member_id = ? LIMIT 1").bind(carId, auth.uid).first();
  if (!car) return json({ ok: false, error: "Car not found" }, 404, origin);

  const form = await request.formData();
  const file = form.get("file");
  const validation = validateImageFile(file);
  if (validation) return json({ ok: false, error: validation }, 400, origin);

  const previous = await env.DB.prepare("SELECT id, r2_key FROM car_photos WHERE car_id = ? ORDER BY sort_order ASC, created_at ASC").bind(carId).all();
  const id = crypto.randomUUID();
  const ext = extensionFor(file.type);
  const key = `cars/${auth.uid}/${carId}/${id}.${ext}`;
  await env.MEDIA.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { owner: auth.uid, kind: "car", carId, photoId: id },
  });
  try {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM car_photos WHERE car_id = ?").bind(carId),
      env.DB.prepare(`
        INSERT INTO car_photos (id, car_id, r2_key, mime_type, size_bytes, sort_order)
        VALUES (?, ?, ?, ?, ?, 0)
      `).bind(id, carId, key, file.type, file.size),
    ]);
  } catch (error) {
    try { await env.MEDIA.delete(key); } catch (cleanupError) { console.warn("Unable to clean up failed R2 car replacement", cleanupError); }
    throw error;
  }
  for (const photo of previous.results || []) {
    if (!photo.r2_key || photo.r2_key === key) continue;
    try { await env.MEDIA.delete(photo.r2_key); } catch (error) { console.warn("Unable to delete replaced R2 car photo", error); }
  }
  return json({ ok: true, photo: { id, mimeType: file.type, sizeBytes: file.size }, replaced: (previous.results || []).map(photo => photo.id) }, 200, origin);
}

async function privateCarMedia(env, auth, photoId, origin) {
  const row = await env.DB.prepare(`
    SELECT p.r2_key, p.mime_type
    FROM car_photos p
    JOIN cars c ON c.id = p.car_id
    WHERE p.id = ? AND c.member_id = ?
    LIMIT 1
  `).bind(photoId, auth.uid).first();
  if (!row) return json({ ok: false, error: "Photo not found" }, 404, origin);
  const object = await env.MEDIA.get(row.r2_key);
  if (!object) return json({ ok: false, error: "Media not found" }, 404, origin);
  const headers = new Headers({ "Content-Type": row.mime_type || "image/jpeg", "Cache-Control": "private, no-store" });
  return cors(new Response(object.body, { status: 200, headers }), origin);
}

export {
  createCar,
  deleteCar,
  listCars,
  privateCarMedia,
  replaceCarPhoto,
  setPrimaryCar,
  updateCar,
  uploadCarPhoto,
};
