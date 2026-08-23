const FIREBASE_PROJECT_ID = "e36-united";
const FIREBASE_JWKS = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

const ALLOWED_ORIGINS = new Set([
  "https://e36united.cz",
  "https://www.e36united.cz",
  "https://e36-united.pages.dev",
  "https://cloudflare-auth-phase1.e36-united.pages.dev",
]);

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_GALLERY_DAILY = 24;
const MAX_CAR_PHOTOS = 3;

let jwksCache = { keys: [], expiresAt: 0 };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      if (origin && !ALLOWED_ORIGINS.has(origin)) return new Response(null, { status: 403 });
      return cors(new Response(null, { status: 204 }), origin);
    }

    try {
      if (url.pathname === "/api/health" && request.method === "GET") {
        const db = await env.DB.prepare("SELECT COUNT(*) AS count FROM events").first();
        return json({ ok: true, service: "e36-united-api", database: true, events: db?.count ?? 0, media: !!env.MEDIA, auth: "firebase" }, 200, origin);
      }

      // Public approved gallery feed.
      if (url.pathname === "/api/gallery/approved" && request.method === "GET") {
        return await publicGalleryList(env, url, origin);
      }

      // Public media stream only for approved gallery submissions.
      if (url.pathname.startsWith("/api/gallery/media/") && request.method === "GET") {
        return await publicGalleryMedia(env, decodeURIComponent(url.pathname.split("/").pop()), origin);
      }

      if (url.pathname.startsWith("/api/")) {
        if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ ok: false, error: "Origin not allowed" }, 403, origin);

        const auth = await verifyFirebaseRequest(request);
        if (!auth) return json({ ok: false, authenticated: false, error: "Unauthorized" }, 401, origin);

        if (url.pathname === "/api/bootstrap" && request.method === "POST") return await bootstrapMember(request, env, auth, origin);
        if (url.pathname === "/api/me" && request.method === "GET") return await getMember(env, auth, origin);

        if (url.pathname === "/api/reservations/current" && request.method === "GET") return await getCurrentReservation(env, auth, origin);
        if (url.pathname === "/api/reservations/current" && request.method === "PUT") return await putCurrentReservation(request, env, auth, origin);

        if (url.pathname === "/api/cars" && request.method === "GET") return await listCars(env, auth, origin);
        if (url.pathname === "/api/cars" && request.method === "POST") return await createCar(request, env, auth, origin);

        if (url.pathname.startsWith("/api/cars/media/") && request.method === "GET") {
          return await privateCarMedia(env, auth, decodeURIComponent(url.pathname.split("/").pop()), origin);
        }

        const carMatch = url.pathname.match(/^\/api\/cars\/([^/]+)$/);
        if (carMatch && request.method === "DELETE") return await deleteCar(env, auth, decodeURIComponent(carMatch[1]), origin);

        const primaryMatch = url.pathname.match(/^\/api\/cars\/([^/]+)\/primary$/);
        if (primaryMatch && request.method === "POST") return await setPrimaryCar(env, auth, decodeURIComponent(primaryMatch[1]), origin);

        const photoMatch = url.pathname.match(/^\/api\/cars\/([^/]+)\/photos$/);
        if (photoMatch && request.method === "POST") return await uploadCarPhoto(request, env, auth, decodeURIComponent(photoMatch[1]), origin);

        if (url.pathname === "/api/gallery/submissions" && request.method === "POST") return await uploadGallerySubmission(request, env, auth, origin);
        if (url.pathname === "/api/gallery/mine" && request.method === "GET") return await listMyGallery(env, auth, origin);
      }

      return json({ ok: true, service: "E36 United API" }, 200, origin);
    } catch (error) {
      console.error("Worker error:", error);
      return json({ ok: false, error: "Internal server error" }, 500, origin);
    }
  },
};

async function bootstrapMember(request, env, auth, origin) {
  if (!auth.email) return json({ ok: false, error: "Firebase account has no email" }, 400, origin);
  let body = {};
  try { body = await request.json(); } catch {}
  const name = clean(body.name || auth.name || auth.email.split("@")[0]);
  const nickname = clean(body.nickname || "");
  const phone = clean(body.phone || "");
  if (name.length < 2 || name.length > 80) return json({ ok: false, error: "Invalid name" }, 400, origin);
  if (nickname.length > 40) return json({ ok: false, error: "Invalid nickname" }, 400, origin);
  if (phone.length > 30) return json({ ok: false, error: "Invalid phone" }, 400, origin);

  const existing = await env.DB.prepare("SELECT id, member_code FROM members WHERE id = ? LIMIT 1").bind(auth.uid).first();
  const memberCode = existing?.member_code || await createMemberCode(auth.uid);

  await env.DB.prepare(`
    INSERT INTO members (id, member_code, email, name, nickname, phone, role, status, email_verified, last_login_at)
    VALUES (?, ?, ?, ?, ?, ?, 'member', 'active', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      email = excluded.email,
      name = excluded.name,
      nickname = excluded.nickname,
      phone = excluded.phone,
      email_verified = excluded.email_verified,
      updated_at = CURRENT_TIMESTAMP,
      last_login_at = CURRENT_TIMESTAMP
  `).bind(auth.uid, memberCode, auth.email.toLowerCase(), name, nickname || null, phone || null, auth.emailVerified ? 1 : 0).run();

  return await getMember(env, auth, origin);
}

async function getMember(env, auth, origin) {
  const member = await env.DB.prepare(`
    SELECT id, member_code, email, name, nickname, phone, role, status, email_verified, created_at, updated_at
    FROM members WHERE id = ? LIMIT 1
  `).bind(auth.uid).first();

  if (!member) {
    return json({ ok: true, authenticated: true, profileExists: false, firebase: { uid: auth.uid, email: auth.email, emailVerified: auth.emailVerified, name: auth.name || "" } }, 200, origin);
  }

  const emailChanged = auth.email && member.email.toLowerCase() !== auth.email.toLowerCase();
  const verifiedChanged = !!member.email_verified !== !!auth.emailVerified;
  if (emailChanged || verifiedChanged) {
    await env.DB.prepare("UPDATE members SET email = ?, email_verified = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(auth.email.toLowerCase(), auth.emailVerified ? 1 : 0, auth.uid).run();
    member.email = auth.email.toLowerCase();
    member.email_verified = auth.emailVerified ? 1 : 0;
  }

  return json({ ok: true, authenticated: true, profileExists: true, member: publicMember(member) }, 200, origin);
}

async function getOpenEvent(env) {
  return await env.DB.prepare(`
    SELECT id, registration_status
    FROM events
    WHERE registration_status = 'open'
    ORDER BY year DESC
    LIMIT 1
  `).first();
}

async function findCurrentReservation(env, memberId, eventId) {
  return await env.DB.prepare(`
    SELECT
      id, member_id, event_id, car_id,
      car_model, car_body, car_year, car_color, car_nickname,
      arrival, crew, accommodation, show_shine, note, status,
      attendance_type, accommodation_units,
      amount_due_czk, amount_paid_czk, payment_status,
      paid_at, submitted_at, created_at, updated_at
    FROM reservations
    WHERE member_id = ? AND event_id = ?
    LIMIT 1
  `).bind(memberId, eventId).first();
}

async function findLatestReservation(env, memberId) {
  return await env.DB.prepare(`
    SELECT
      r.id, r.member_id, r.event_id, r.car_id,
      r.car_model, r.car_body, r.car_year, r.car_color, r.car_nickname,
      r.arrival, r.crew, r.accommodation, r.show_shine, r.note, r.status,
      r.attendance_type, r.accommodation_units,
      r.amount_due_czk, r.amount_paid_czk, r.payment_status,
      r.paid_at, r.submitted_at, r.created_at, r.updated_at,
      e.registration_status AS event_registration_status
    FROM reservations r
    JOIN events e ON e.id = r.event_id
    WHERE r.member_id = ?
    ORDER BY e.year DESC
    LIMIT 1
  `).bind(memberId).first();
}

async function getCurrentReservation(env, auth, origin) {
  const event = await getOpenEvent(env);
  if (!event) {
    const reservation = await findLatestReservation(env, auth.uid);
    return json({
      ok: true,
      registrationOpen: false,
      event: reservation ? { id: reservation.event_id, registrationStatus: reservation.event_registration_status } : null,
      reservation: reservation ? publicReservation(reservation) : null,
      message: reservation ? "Registrace je uzavřená. Zobrazuje se poslední uložená rezervace." : "Registrace na žádný event aktuálně není otevřená.",
    }, 200, origin);
  }

  const reservation = await findCurrentReservation(env, auth.uid, event.id);
  return json({
    ok: true,
    registrationOpen: true,
    event: { id: event.id, registrationStatus: event.registration_status },
    reservation: reservation ? publicReservation(reservation) : null,
    message: reservation ? "Rezervace byla načtena ze serveru." : "Registrace je otevřená, ale zatím nemáš rezervaci.",
  }, 200, origin);
}

async function putCurrentReservation(request, env, auth, origin) {
  const event = await getOpenEvent(env);
  if (!event) {
    return json({ ok: false, error: "registration_closed", message: "Registrace na žádný event aktuálně není otevřená." }, 409, origin);
  }

  let body = {};
  try {
    body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid JSON object");
  }
  catch { return json({ ok: false, error: "invalid_json", message: "Požadavek nemá platný JSON." }, 400, origin); }

  const carId = clean(body.carId);
  const arrival = clean(body.arrival);
  const accommodation = arrival === "Jen na otočku" ? "Bez ubytování" : clean(body.accommodation);
  const showShine = clean(body.showShine);
  const note = clean(body.note).slice(0, 1000);
  const crew = Number(body.crew);
  const attendanceType = clean(body.attendanceType);
  const accommodationUnits = accommodation === "Bez ubytování" || attendanceType === "day_visit" ? 0 : body.accommodationUnits;

  if (!carId) return json({ ok: false, error: "car_required", message: "Vyber auto z garáže." }, 400, origin);
  if (!["Pátek", "Sobota", "Jen na otočku"].includes(arrival)) return json({ ok: false, error: "invalid_arrival", message: "Vyber platný příjezd." }, 400, origin);
  if (!["Chatka", "Stan", "Bez ubytování"].includes(accommodation)) return json({ ok: false, error: "invalid_accommodation", message: "Vyber platné ubytování." }, 400, origin);
  if (!["Ne", "Možná", "Ano"].includes(showShine)) return json({ ok: false, error: "invalid_show_shine", message: "Vyber platnou možnost Show & Shine." }, 400, origin);
  if (!Number.isInteger(crew) || crew < 1 || crew > 8) return json({ ok: false, error: "invalid_crew", message: "Posádka musí mít 1 až 8 osob." }, 400, origin);
  if (!["full_weekend", "saturday_only", "day_visit"].includes(attendanceType)) return json({ ok: false, error: "invalid_attendance_type", message: "Vyber platný typ účasti." }, 400, origin);
  if (!Number.isInteger(accommodationUnits) || accommodationUnits < 0 || accommodationUnits > crew) return json({ ok: false, error: "invalid_accommodation_units", message: "Počet ubytovacích míst musí být celé číslo od 0 do počtu členů posádky." }, 400, origin);

  const member = await env.DB.prepare("SELECT id FROM members WHERE id = ? LIMIT 1").bind(auth.uid).first();
  if (!member) return json({ ok: false, error: "member_profile_required", message: "Nejdřív dokonči členský profil." }, 409, origin);

  const car = await env.DB.prepare(`
    SELECT id, model, body, year, color, nickname
    FROM cars
    WHERE id = ? AND member_id = ?
    LIMIT 1
  `).bind(carId, auth.uid).first();
  if (!car) return json({ ok: false, error: "car_not_found", message: "Vybrané auto nepatří přihlášenému účtu." }, 404, origin);

  const reservationId = crypto.randomUUID();

  const result = await env.DB.prepare(`
    INSERT INTO reservations (
      id, member_id, event_id, car_id,
      car_model, car_body, car_year, car_color, car_nickname,
      arrival, crew, accommodation, show_shine, note,
      status, attendance_type, accommodation_units,
      amount_due_czk, amount_paid_czk, payment_status, submitted_at
    )
    SELECT ?, ?, events.id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, 0, 0, 'unpaid', CURRENT_TIMESTAMP
    FROM events
    WHERE events.id = ? AND events.registration_status = 'open'
    ON CONFLICT(member_id, event_id) DO UPDATE SET
      car_id = excluded.car_id,
      car_model = excluded.car_model,
      car_body = excluded.car_body,
      car_year = excluded.car_year,
      car_color = excluded.car_color,
      car_nickname = excluded.car_nickname,
      arrival = excluded.arrival,
      crew = excluded.crew,
      accommodation = excluded.accommodation,
      show_shine = excluded.show_shine,
      note = excluded.note,
      status = 'pending',
      attendance_type = excluded.attendance_type,
      accommodation_units = excluded.accommodation_units,
      submitted_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    reservationId, auth.uid, car.id,
    car.model, car.body, car.year || null, car.color || null, car.nickname || null,
    arrival, crew, accommodation, showShine, note || null,
    attendanceType, accommodationUnits,
    event.id,
  ).run();

  if (!result.meta?.changes) {
    return json({ ok: false, error: "registration_closed", message: "Registrace byla mezitím uzavřena. Rezervace nebyla uložena." }, 409, origin);
  }

  const reservation = await findCurrentReservation(env, auth.uid, event.id);
  if (!reservation) throw new Error("Reservation was not found after upsert");

  return json({
    ok: true,
    registrationOpen: true,
    event: { id: event.id, registrationStatus: event.registration_status },
    reservation: publicReservation(reservation),
    message: "Rezervace byla uložena na server a čeká na schválení.",
  }, 200, origin);
}

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
  await env.DB.batch(statements);

  return json({ ok: true, car: { id, nickname, model, body: carBody, year, color, primary, photos: [] } }, 201, origin);
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

async function listMyGallery(env, auth, origin) {
  const rows = await env.DB.prepare(`
    SELECT id, caption, status, created_at, reviewed_at
    FROM gallery_submissions
    WHERE member_id = ?
    ORDER BY created_at DESC
    LIMIT 100
  `).bind(auth.uid).all();
  return json({ ok: true, submissions: (rows.results || []).map(row => ({ id: row.id, caption: row.caption || "", status: row.status, createdAt: row.created_at, reviewedAt: row.reviewed_at || null, imageUrl: row.status === "approved" ? `/api/gallery/media/${encodeURIComponent(row.id)}` : null })) }, 200, origin);
}

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
  headers.set("Cache-Control", "public, max-age=86400, immutable");
  headers.set("ETag", object.httpEtag || object.etag || "");
  return cors(new Response(object.body, { status: 200, headers }), origin);
}

function validateImageFile(file) {
  if (!file || typeof file !== "object" || typeof file.size !== "number" || typeof file.type !== "string") return "Missing file";
  if (!IMAGE_TYPES.has(file.type)) return "Only JPG, PNG and WEBP are allowed";
  if (file.size < 1 || file.size > MAX_IMAGE_BYTES) return "Image is too large";
  return "";
}
function extensionFor(type) { return type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg"; }

async function verifyFirebaseRequest(request) {
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  try { return await verifyFirebaseIdToken(token); }
  catch (error) { console.warn("Firebase token rejected:", error?.message || error); return null; }
}

async function verifyFirebaseIdToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed JWT");
  const [headerPart, payloadPart, signaturePart] = parts;
  const header = JSON.parse(decodeBase64UrlText(headerPart));
  const payload = JSON.parse(decodeBase64UrlText(payloadPart));
  if (header.alg !== "RS256") throw new Error("Invalid JWT algorithm");
  if (!header.kid || typeof header.kid !== "string") throw new Error("Missing JWT kid");

  const now = Math.floor(Date.now() / 1000), clockSkew = 300;
  if (typeof payload.exp !== "number" || payload.exp <= now - clockSkew) throw new Error("Expired token");
  if (typeof payload.iat !== "number" || payload.iat > now + clockSkew) throw new Error("Invalid issued-at time");
  if (typeof payload.auth_time !== "number" || payload.auth_time > now + clockSkew) throw new Error("Invalid auth time");
  if (payload.aud !== FIREBASE_PROJECT_ID) throw new Error("Invalid audience");
  if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) throw new Error("Invalid issuer");
  if (typeof payload.sub !== "string" || payload.sub.length < 1 || payload.sub.length > 128) throw new Error("Invalid subject");

  const jwk = await getFirebaseJwk(header.kid);
  const cryptoKey = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, decodeBase64UrlBytes(signaturePart), new TextEncoder().encode(`${headerPart}.${payloadPart}`));
  if (!valid) throw new Error("Invalid JWT signature");

  return { uid: payload.sub, email: typeof payload.email === "string" ? payload.email : "", emailVerified: payload.email_verified === true, name: typeof payload.name === "string" ? payload.name : "" };
}

async function getFirebaseJwk(kid) {
  let keys = await getFirebaseJwks();
  let key = keys.find(item => item.kid === kid);
  if (!key) { jwksCache.expiresAt = 0; keys = await getFirebaseJwks(); key = keys.find(item => item.kid === kid); }
  if (!key) throw new Error("Firebase signing key not found");
  return key;
}

async function getFirebaseJwks() {
  if (jwksCache.keys.length && Date.now() < jwksCache.expiresAt) return jwksCache.keys;
  const response = await fetch(FIREBASE_JWKS);
  if (!response.ok) throw new Error("Unable to fetch Firebase public keys");
  const data = await response.json();
  if (!Array.isArray(data.keys)) throw new Error("Invalid Firebase JWKS response");
  const cacheControl = response.headers.get("Cache-Control") || "";
  const match = cacheControl.match(/max-age=(\d+)/);
  const maxAge = match ? Number(match[1]) : 3600;
  jwksCache = { keys: data.keys, expiresAt: Date.now() + maxAge * 1000 };
  return jwksCache.keys;
}

async function createMemberCode(uid) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(uid));
  const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 10).toUpperCase();
  return `EU-${hex}`;
}

function publicMember(member) {
  return {
    id: member.id,
    memberCode: member.member_code,
    email: member.email,
    name: member.name,
    nickname: member.nickname || "",
    phone: member.phone || "",
    role: member.role,
    status: member.status,
    emailVerified: !!member.email_verified,
    createdAt: member.created_at,
    updatedAt: member.updated_at,
  };
}

function publicReservation(reservation) {
  return {
    id: reservation.id,
    eventId: reservation.event_id,
    carId: reservation.car_id,
    carSnapshot: {
      id: reservation.car_id,
      model: reservation.car_model || "",
      body: reservation.car_body || "",
      year: reservation.car_year || "",
      color: reservation.car_color || "",
      nickname: reservation.car_nickname || "",
    },
    arrival: reservation.arrival || "",
    crew: Number(reservation.crew || 1),
    accommodation: reservation.accommodation || "",
    showShine: reservation.show_shine || "Ne",
    note: reservation.note || "",
    status: reservation.status || "pending",
    attendanceType: reservation.attendance_type || "",
    accommodationUnits: Number(reservation.accommodation_units || 0),
    amountDueCzk: Number(reservation.amount_due_czk || 0),
    amountPaidCzk: Number(reservation.amount_paid_czk || 0),
    paymentStatus: reservation.payment_status || "unpaid",
    paidAt: reservation.paid_at || null,
    submittedAt: reservation.submitted_at || null,
    createdAt: reservation.created_at || null,
    updatedAt: reservation.updated_at || null,
  };
}

function decodeBase64UrlText(value) { return new TextDecoder().decode(decodeBase64UrlBytes(value)); }
function decodeBase64UrlBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
function clean(value) { return String(value || "").trim(); }

function json(data, status = 200, origin = null) {
  return cors(new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } }), origin);
}

function cors(response, origin) {
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.append("Vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
