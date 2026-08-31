import { cors } from "./http/cors.js";
import { readJsonObject } from "./http/request.js";
import { json } from "./http/responses.js";
import { clean } from "./utils/text.js";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_GALLERY_DAILY = 24;
const MAX_CAR_PHOTOS = 3;
const MAX_HISTORY_EVIDENCE = 4;
const MAX_PAYMENT_CZK = 10_000_000;
const MAX_RESERVATION_CREW = 5;
const UNITED_REWARD_THRESHOLD = 12;
const PLANNER_CLOCK_SKEW_MS = 5 * 60 * 1000;
const SHOW_SHINE_CATEGORIES = new Set(["sedan", "coupe", "touring", "cabrio", "compact", "z3", "mpower"]);

const EVENT_SELECT = `
  SELECT
    id, year, registration_status, is_current,
    accommodation_capacity, reservation_capacity,
    full_weekend_nights, saturday_only_nights,
    booking_commitment_czk, booking_due_at, booking_paid_czk,
    event_end_at,
    currency, payment_deadline,
    payment_recipient_name, payment_account_display, payment_iban,
    payment_message_prefix, payment_test_mode
  FROM events
`;

async function getCurrentEvent(env) {
  return await env.DB.prepare(`${EVENT_SELECT}
    ORDER BY is_current DESC, year DESC
    LIMIT 1
  `).first();
}

async function getEventById(env, eventId) {
  if (!eventId) return null;
  return await env.DB.prepare(`${EVENT_SELECT}
    WHERE id = ?
    LIMIT 1
  `).bind(eventId).first();
}

async function getRequestedAdminEvent(env, url) {
  const eventId = clean(url.searchParams.get("eventId"));
  return eventId ? await getEventById(env, eventId) : await getCurrentEvent(env);
}

function publicAdminEvent(event) {
  if (!event) return null;
  return {
    id: event.id,
    year: Number(event.year || 0),
    isCurrent: !!event.is_current,
    registrationStatus: event.registration_status || "",
    accommodationCapacity: Number(event.accommodation_capacity || 0),
    reservationCapacity: Number(event.reservation_capacity || 0),
    fullWeekendNights: Number(event.full_weekend_nights ?? 2),
    saturdayOnlyNights: Number(event.saturday_only_nights ?? 1),
    bookingCommitmentCzk: Number(event.booking_commitment_czk || 0),
    bookingDueAt: event.booking_due_at || null,
    bookingPaidCzk: Number(event.booking_paid_czk || 0),
    currency: event.currency || "CZK",
    paymentDeadline: event.payment_deadline || null,
    eventEndAt: event.event_end_at || null,
    paymentTestMode: event.payment_test_mode !== 0,
  };
}

async function getAdminEvents(env, origin) {
  const rows = await env.DB.prepare(`${EVENT_SELECT}
    ORDER BY year DESC
  `).all();
  return json({ ok: true, events: (rows.results || []).map(publicAdminEvent) }, 200, origin);
}

async function getAdminOverview(env, url, origin) {
  const event = await getRequestedAdminEvent(env, url);
  const gallery = await getAdminGalleryCounts(env);
  const history = await getAdminHistoryCounts(env);
  if (!event) {
    if (clean(url.searchParams.get("eventId"))) {
      return json({ ok: false, error: "event_not_found", message: "Event nebyl nalezen." }, 404, origin);
    }
    return json({ ok: true, event: null, overview: { ...emptyAdminOverview(), gallery, history } }, 200, origin);
  }

  const totals = await env.DB.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN status IN ('pending', 'approved') THEN 1 ELSE 0 END), 0) AS reservation_count,
      COALESCE(SUM(CASE WHEN status IN ('pending', 'approved') THEN crew ELSE 0 END), 0) AS people_count,
      COUNT(DISTINCT CASE WHEN status IN ('pending', 'approved') AND car_id IS NOT NULL THEN car_id END) AS car_count,
      COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS status_pending,
      COALESCE(SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END), 0) AS status_approved,
      COALESCE(SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END), 0) AS status_rejected,
      COALESCE(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END), 0) AS status_cancelled,
      COALESCE(SUM(CASE WHEN status IN ('pending', 'approved') AND attendance_type = 'full_weekend' THEN 1 ELSE 0 END), 0) AS attendance_full_weekend,
      COALESCE(SUM(CASE WHEN status IN ('pending', 'approved') AND attendance_type = 'saturday_only' THEN 1 ELSE 0 END), 0) AS attendance_saturday_only,
      COALESCE(SUM(CASE WHEN status IN ('pending', 'approved') AND attendance_type = 'day_visit' THEN 1 ELSE 0 END), 0) AS attendance_day_visit,
      COALESCE(SUM(CASE WHEN status IN ('pending', 'approved') AND show_shine = 'Ano' THEN 1 ELSE 0 END), 0) AS show_shine_yes,
      COALESCE(SUM(CASE WHEN status IN ('pending', 'approved') AND show_shine = 'Ne' THEN 1 ELSE 0 END), 0) AS show_shine_no,
      COALESCE(SUM(CASE WHEN status IN ('pending', 'approved') AND show_shine = 'Možná' THEN 1 ELSE 0 END), 0) AS show_shine_maybe,
      COALESCE(SUM(CASE WHEN status IN ('pending', 'approved') THEN accommodation_units ELSE 0 END), 0) AS accommodation_units,
      COALESCE(SUM(CASE WHEN status IN ('pending', 'approved') AND accommodation = 'Chatka' THEN accommodation_units ELSE 0 END), 0) AS accommodation_cabin,
      COALESCE(SUM(CASE WHEN status IN ('pending', 'approved') AND accommodation = 'Stan' THEN accommodation_units ELSE 0 END), 0) AS accommodation_tent,
      COALESCE(SUM(CASE WHEN status IN ('pending', 'approved') AND accommodation = 'Bez ubytování' THEN 1 ELSE 0 END), 0) AS accommodation_none,
      COALESCE(SUM(CASE WHEN status IN ('pending', 'approved') AND amount_due_czk > 0 AND amount_paid_czk = 0 THEN 1 ELSE 0 END), 0) AS payment_unpaid,
      COALESCE(SUM(CASE WHEN status IN ('pending', 'approved') AND amount_due_czk > 0 AND amount_paid_czk > 0 AND amount_paid_czk < amount_due_czk THEN 1 ELSE 0 END), 0) AS payment_underpaid,
      COALESCE(SUM(CASE WHEN status IN ('pending', 'approved') AND amount_due_czk > 0 AND amount_paid_czk = amount_due_czk THEN 1 ELSE 0 END), 0) AS payment_paid,
      COALESCE(SUM(CASE WHEN status IN ('pending', 'approved') AND amount_paid_czk > amount_due_czk THEN 1 ELSE 0 END), 0) AS payment_overpaid,
      COALESCE(SUM(CASE WHEN status IN ('pending', 'approved') AND amount_due_czk <= 0 AND amount_paid_czk <= 0 THEN 1 ELSE 0 END), 0) AS payment_not_required,
      COALESCE(SUM(CASE WHEN status = 'approved' AND amount_due_czk > amount_paid_czk AND e.payment_deadline IS NOT NULL AND date(e.payment_deadline) < date('now') THEN 1 ELSE 0 END), 0) AS payment_overdue,
      COALESCE(SUM(CASE WHEN status IN ('pending', 'approved') THEN amount_due_czk ELSE 0 END), 0) AS amount_due_czk,
      COALESCE(SUM(CASE WHEN status IN ('pending', 'approved') THEN amount_paid_czk ELSE 0 END), 0) AS amount_paid_czk,
      COALESCE(SUM(CASE WHEN status IN ('pending', 'approved') THEN MAX(amount_due_czk - amount_paid_czk, 0) ELSE 0 END), 0) AS amount_remaining_czk
    FROM reservations r
    JOIN events e ON e.id = r.event_id
    WHERE r.event_id = ?
  `).bind(event.id).first();

  return json({ ok: true, event: publicAdminEvent(event), overview: { ...mapAdminOverview(totals), gallery, history } }, 200, origin);
}

async function getAdminGalleryCounts(env) {
  const row = await env.DB.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
      COALESCE(SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END), 0) AS approved,
      COALESCE(SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END), 0) AS rejected,
      COUNT(*) AS total
    FROM gallery_submissions
  `).first();

  return {
    pending: Number(row?.pending || 0),
    approved: Number(row?.approved || 0),
    rejected: Number(row?.rejected || 0),
    total: Number(row?.total || 0),
  };
}

async function getAdminHistoryCounts(env) {
  const row = await env.DB.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN c.attendance_status = 'pending' THEN 1 ELSE 0 END), 0) AS attendance_pending,
      COALESCE(SUM(CASE WHEN c.sns_status = 'pending' THEN 1 ELSE 0 END), 0) AS sns_pending,
      COALESCE(SUM(CASE WHEN c.attendance_status = 'pending' OR c.sns_status = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
      COALESCE(SUM(CASE WHEN c.attendance_status = 'approved' OR c.sns_status = 'approved' THEN 1 ELSE 0 END), 0) AS approved,
      COALESCE(SUM(CASE WHEN c.attendance_status = 'rejected' OR c.sns_status = 'rejected' THEN 1 ELSE 0 END), 0) AS rejected,
      MAX(CASE WHEN c.attendance_status = 'pending' OR c.sns_status = 'pending' THEN e.year END) AS latest_pending_year,
      MAX(e.year) AS latest_year,
      COUNT(*) AS total
    FROM united_history_claims c
    JOIN events e ON e.id = c.event_id
  `).first();
  const attendancePending = Number(row?.attendance_pending || 0);
  const snsPending = Number(row?.sns_pending || 0);
  const pending = Number(row?.pending || 0);
  const latestPendingYear = row?.latest_pending_year == null ? null : Number(row.latest_pending_year);
  const latestYear = row?.latest_year == null ? null : Number(row.latest_year);
  let latestYearPending = 0;
  if (latestPendingYear != null) {
    const latest = await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM united_history_claims c
      JOIN events e ON e.id = c.event_id
      WHERE e.year = ? AND (c.attendance_status = 'pending' OR c.sns_status = 'pending')
    `).bind(latestPendingYear).first();
    latestYearPending = Number(latest?.count || 0);
  }
  return {
    attendancePending,
    snsPending,
    pending,
    approved: Number(row?.approved || 0),
    rejected: Number(row?.rejected || 0),
    total: Number(row?.total || 0),
    latestPendingYear,
    latestYear,
    latestYearPending,
    olderPending: Math.max(0, pending - latestYearPending),
  };
}

function emptyAdminOverview() {
  return mapAdminOverview({});
}

function mapAdminOverview(row = {}) {
  return {
    reservations: Number(row.reservation_count || 0),
    people: Number(row.people_count || 0),
    cars: Number(row.car_count || 0),
    statuses: {
      pending: Number(row.status_pending || 0),
      approved: Number(row.status_approved || 0),
      rejected: Number(row.status_rejected || 0),
      cancelled: Number(row.status_cancelled || 0),
    },
    attendance: {
      fullWeekend: Number(row.attendance_full_weekend || 0),
      saturdayOnly: Number(row.attendance_saturday_only || 0),
      dayVisit: Number(row.attendance_day_visit || 0),
    },
    showShine: {
      yes: Number(row.show_shine_yes || 0),
      no: Number(row.show_shine_no || 0),
      maybe: Number(row.show_shine_maybe || 0),
    },
    accommodation: {
      units: Number(row.accommodation_units || 0),
      cabin: Number(row.accommodation_cabin || 0),
      tent: Number(row.accommodation_tent || 0),
      none: Number(row.accommodation_none || 0),
    },
    payments: {
      paid: Number(row.payment_paid || 0),
      unpaid: Number(row.payment_unpaid || 0),
      underpaid: Number(row.payment_underpaid || 0),
      overpaid: Number(row.payment_overpaid || 0),
      notRequired: Number(row.payment_not_required || 0),
      overdue: Number(row.payment_overdue || 0),
      amountDueCzk: Number(row.amount_due_czk || 0),
      amountPaidCzk: Number(row.amount_paid_czk || 0),
      amountRemainingCzk: Number(row.amount_remaining_czk || 0),
    },
  };
}

async function getAdminReservations(env, url, origin) {
  const event = await getRequestedAdminEvent(env, url);
  if (!event) {
    if (clean(url.searchParams.get("eventId"))) {
      return json({ ok: false, error: "event_not_found", message: "Event nebyl nalezen." }, 404, origin);
    }
    return json({ ok: true, event: null, reservations: [] }, 200, origin);
  }

  const rows = await env.DB.prepare(`
    SELECT
      r.id, r.event_id, r.car_id, r.car_model, r.car_body, r.car_year, r.car_color, r.car_nickname,
      r.attendance_type, r.arrival, r.crew, r.accommodation, r.accommodation_units,
      r.show_shine, r.note, r.status, r.payment_status, r.payment_vs, r.paid_at,
      r.amount_due_czk, r.amount_paid_czk,
      r.submitted_at, r.updated_at, r.reviewed_at, r.review_note,
      e.year AS event_year, e.currency AS payment_currency, e.payment_deadline,
      e.payment_recipient_name, e.payment_account_display, e.payment_iban,
      e.payment_message_prefix, e.payment_test_mode,
      ra.option_id AS accommodation_option_id,
      ra.option_name AS accommodation_option_name,
      ra.kind AS accommodation_option_kind,
      ao.capacity_per_unit AS accommodation_capacity_per_unit,
      CASE
        WHEN r.status = 'pending' AND ao.inventory_mode = 'limited' AND
          ra.unit_count + (
            SELECT COALESCE(SUM(approved_allocation.unit_count), 0)
            FROM reservation_accommodation approved_allocation
            JOIN reservations approved_reservation ON approved_reservation.id = approved_allocation.reservation_id
            WHERE approved_allocation.option_id = ra.option_id
              AND approved_reservation.status = 'approved'
          ) > ao.units_total
        THEN 1 ELSE 0
      END AS accommodation_capacity_conflict,
      ra.people_count AS accommodation_people_count,
      ra.unit_count AS accommodation_unit_count,
      ra.unit_price_czk AS accommodation_unit_price_czk,
      ra.person_price_czk AS accommodation_person_price_czk,
      ra.bedding_fee_per_person_czk AS accommodation_bedding_fee_czk,
      ra.city_tax_per_person_per_night_czk AS accommodation_city_tax_czk,
      ra.nights AS accommodation_nights,
      ra.base_total_czk AS accommodation_base_total_czk,
      ra.person_total_czk AS accommodation_person_total_czk,
      ra.bedding_total_czk AS accommodation_bedding_total_czk,
      ra.city_tax_total_czk AS accommodation_city_tax_total_czk,
      ra.total_czk AS accommodation_total_czk,
      m.name AS member_name, m.nickname AS member_nickname,
      m.email AS member_email, m.member_code
    FROM reservations r
    JOIN members m ON m.id = r.member_id
    JOIN events e ON e.id = r.event_id
    LEFT JOIN reservation_accommodation ra ON ra.reservation_id = r.id
    LEFT JOIN event_accommodation_options ao ON ao.id = ra.option_id
    WHERE r.event_id = ?
    ORDER BY
      CASE r.status WHEN 'pending' THEN 0 WHEN 'rejected' THEN 1 WHEN 'approved' THEN 2 ELSE 3 END,
      r.submitted_at DESC,
      r.updated_at DESC
  `).bind(event.id).all();

  for (const reservation of rows.results || []) {
    if (!reservation.payment_vs) reservation.payment_vs = await ensureReservationPaymentVs(env, reservation.id, reservation.event_year);
  }
  const visualCache = new Map();
  await Promise.all((rows.results || []).map(reservation => hydrateReservationAccommodationVisual(env, reservation, visualCache)));

  return json({
    ok: true,
    event: publicAdminEvent(event),
    reservations: (rows.results || []).map(publicAdminReservation),
  }, 200, origin);
}

function publicAdminReservation(reservation) {
  return {
    id: reservation.id,
    member: {
      name: reservation.member_name || "",
      nickname: reservation.member_nickname || "",
      email: reservation.member_email || "",
      memberCode: reservation.member_code || "",
    },
    carSnapshot: {
      id: reservation.car_id,
      model: reservation.car_model || "",
      body: reservation.car_body || "",
      year: reservation.car_year || "",
      color: reservation.car_color || "",
      nickname: reservation.car_nickname || "",
    },
    attendanceType: reservation.attendance_type || "",
    arrival: reservation.arrival || "",
    crew: Number(reservation.crew || 0),
    accommodation: reservation.accommodation || "",
    accommodationUnits: Number(reservation.accommodation_units || 0),
    accommodationSnapshot: mapAccommodationSnapshot(reservation),
    capacityConflict: !!reservation.accommodation_capacity_conflict,
    showShine: reservation.show_shine || "Ne",
    note: reservation.note || "",
    status: reservation.status || "pending",
    changePending: reservation.status === "pending" && !!reservation.reviewed_at,
    paymentStatus: paymentStatusFor(reservation.amount_due_czk, reservation.amount_paid_czk),
    amountDueCzk: Number(reservation.amount_due_czk || 0),
    amountPaidCzk: Number(reservation.amount_paid_czk || 0),
    submittedAt: reservation.submitted_at || null,
    updatedAt: reservation.updated_at || null,
    reviewedAt: reservation.reviewed_at || null,
    reviewNote: reservation.review_note || "",
    payment: reservationPayment(reservation, { admin: true }),
  };
}

async function getPublicCurrentEvent(env, origin) {
  const event = await getCurrentEvent(env);
  if (!event) return json({ ok: true, event: null, accommodationOptions: [] }, 200, origin);
  const options = await listAccommodationOptions(env, event.id, true);
  return json({
    ok: true,
    event: {
      id: event.id,
      year: Number(event.year || 0),
      registrationStatus: event.registration_status || "closed",
      registrationOpen: event.registration_status === "open",
      reservationCapacity: Number(event.reservation_capacity || 0),
      fullWeekendNights: Number(event.full_weekend_nights ?? 2),
      saturdayOnlyNights: Number(event.saturday_only_nights ?? 1),
    },
    accommodationOptions: options,
  }, 200, origin);
}

async function listAccommodationOptions(env, eventId, activeOnly = false) {
  const rows = await env.DB.prepare(`
    SELECT
      o.id, o.event_id, o.name, o.kind, o.inventory_mode,
      o.units_total, o.capacity_per_unit,
      o.unit_price_czk, o.person_price_czk,
      o.bedding_fee_per_person_czk,
      o.city_tax_per_person_per_night_czk,
      o.active, o.sort_order, o.created_at, o.updated_at,
      COALESCE(SUM(CASE WHEN r.status = 'approved' THEN ra.unit_count ELSE 0 END), 0) AS approved_units,
      COALESCE(SUM(CASE WHEN r.status = 'pending' THEN ra.unit_count ELSE 0 END), 0) AS pending_units
    FROM event_accommodation_options o
    LEFT JOIN reservation_accommodation ra ON ra.option_id = o.id
    LEFT JOIN reservations r ON r.id = ra.reservation_id
    WHERE o.event_id = ? AND (? = 0 OR o.active = 1)
    GROUP BY
      o.id, o.event_id, o.name, o.kind, o.inventory_mode,
      o.units_total, o.capacity_per_unit,
      o.unit_price_czk, o.person_price_czk,
      o.bedding_fee_per_person_czk,
      o.city_tax_per_person_per_night_czk,
      o.active, o.sort_order, o.created_at, o.updated_at
    ORDER BY o.sort_order ASC, o.name COLLATE NOCASE ASC
  `).bind(eventId, activeOnly ? 1 : 0).all();
  const options = (rows.results || []).map(mapAccommodationOption);
  await Promise.all(options.map(async option => {
    option.visual = await accommodationVisualMetadata(env, option.eventId, option.id);
  }));
  return options;
}

async function listMemberAccommodationOptions(env, eventId, reservation = null) {
  const options = await listAccommodationOptions(env, eventId, true);
  const ownSnapshot = reservation ? mapAccommodationSnapshot(reservation) : null;
  if (ownSnapshot && reservation.status === "approved") {
    const ownOption = options.find(option => option.id === ownSnapshot.optionId && option.inventoryMode === "limited");
    if (ownOption) {
      ownOption.freeUnits = Math.min(ownOption.unitsTotal, ownOption.freeUnits + ownSnapshot.unitCount);
      ownOption.soldOut = ownOption.freeUnits === 0;
    }
  }
  return options;
}

function mapAccommodationOption(row) {
  const limited = row.inventory_mode === "limited";
  const total = Number(row.units_total || 0);
  const approved = Number(row.approved_units || 0);
  const pending = Number(row.pending_units || 0);
  const free = limited ? Math.max(0, total - approved) : null;
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    kind: row.kind,
    inventoryMode: row.inventory_mode,
    unitsTotal: total,
    blockedUnits: approved,
    approvedUnits: approved,
    pendingUnits: pending,
    pendingConflictUnits: limited ? Math.max(0, pending - free) : 0,
    freeUnits: free,
    capacityPerUnit: Number(row.capacity_per_unit || 1),
    unitPriceCzk: Number(row.unit_price_czk || 0),
    personPriceCzk: Number(row.person_price_czk || 0),
    beddingFeePerPersonCzk: Number(row.bedding_fee_per_person_czk || 0),
    cityTaxPerPersonPerNightCzk: Number(row.city_tax_per_person_per_night_czk || 0),
    active: !!row.active,
    sortOrder: Number(row.sort_order || 0),
    soldOut: limited && free === 0,
  };
}

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

async function hydrateReservationAccommodationVisual(env, reservation, cache = new Map()) {
  if (!reservation?.accommodation_option_id) return reservation;
  const key = `${reservation.event_id}:${reservation.accommodation_option_id}`;
  let visual = cache.get(key);
  if (!visual) {
    visual = await accommodationVisualMetadata(env, reservation.event_id, reservation.accommodation_option_id);
    cache.set(key, visual);
  }
  reservation.accommodation_visual = visual;
  return reservation;
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

async function getAdminAccommodation(env, url, origin) {
  const event = await getRequestedAdminEvent(env, url);
  if (!event) return json({ ok: false, error: "event_not_found", message: "Event nebyl nalezen." }, 404, origin);
  return json({ ok: true, event: publicAdminEvent(event), options: await listAccommodationOptions(env, event.id) }, 200, origin);
}

function readAccommodationConfig(body, current = null) {
  const value = (key, fallback) => Object.prototype.hasOwnProperty.call(body, key) ? body[key] : fallback;
  const config = {
    name: clean(value("name", current?.name)).slice(0, 80),
    kind: clean(value("kind", current?.kind)),
    inventoryMode: clean(value("inventoryMode", current?.inventory_mode)),
    unitsTotal: Number(value("unitsTotal", current?.units_total ?? 0)),
    capacityPerUnit: Number(value("capacityPerUnit", current?.capacity_per_unit ?? 1)),
    unitPriceCzk: Number(value("unitPriceCzk", current?.unit_price_czk ?? 0)),
    personPriceCzk: Number(value("personPriceCzk", current?.person_price_czk ?? 0)),
    beddingFeePerPersonCzk: Number(value("beddingFeePerPersonCzk", current?.bedding_fee_per_person_czk ?? 0)),
    cityTaxPerPersonPerNightCzk: Number(value("cityTaxPerPersonPerNightCzk", current?.city_tax_per_person_per_night_czk ?? 0)),
    active: value("active", current ? !!current.active : true) === true,
    sortOrder: Number(value("sortOrder", current?.sort_order ?? 0)),
  };
  if (config.name.length < 2) return { error: "Název ubytování musí mít alespoň 2 znaky." };
  if (!["cabin", "tent"].includes(config.kind)) return { error: "Vyber platný druh ubytování." };
  if (!["limited", "unlimited"].includes(config.inventoryMode)) return { error: "Vyber platný režim kapacity." };
  for (const key of ["unitsTotal", "capacityPerUnit", "unitPriceCzk", "personPriceCzk", "beddingFeePerPersonCzk", "cityTaxPerPersonPerNightCzk", "sortOrder"]) {
    if (!Number.isInteger(config[key])) return { error: "Číselné hodnoty musí být celá čísla." };
  }
  if (config.unitsTotal < 0 || config.capacityPerUnit < 1 || config.capacityPerUnit > 8) return { error: "Kapacita jednotky musí být 1 až 8 osob a počet jednotek nesmí být záporný." };
  if ([config.unitPriceCzk, config.personPriceCzk, config.beddingFeePerPersonCzk, config.cityTaxPerPersonPerNightCzk].some(amount => amount < 0)) return { error: "Ceny nesmí být záporné." };
  return { config };
}

async function createAdminAccommodation(request, env, auth, origin) {
  const parsed = await readJsonObject(request, origin);
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  const allowedKeys = new Set(["eventId", "name", "kind", "inventoryMode", "unitsTotal", "capacityPerUnit", "unitPriceCzk", "personPriceCzk", "beddingFeePerPersonCzk", "cityTaxPerPersonPerNightCzk", "active", "sortOrder"]);
  if (Object.keys(body).some(key => !allowedKeys.has(key))) return json({ ok: false, error: "invalid_fields", message: "Požadavek obsahuje nepovolená pole." }, 400, origin);
  const event = await getEventById(env, clean(body.eventId));
  if (!event) return json({ ok: false, error: "event_not_found", message: "Event nebyl nalezen." }, 404, origin);
  const result = readAccommodationConfig(body);
  if (result.error) return json({ ok: false, error: "invalid_accommodation", message: result.error }, 400, origin);
  const config = result.config;
  const duplicate = await env.DB.prepare("SELECT id FROM event_accommodation_options WHERE event_id = ? AND name = ? COLLATE NOCASE LIMIT 1").bind(event.id, config.name).first();
  if (duplicate) return json({ ok: false, error: "duplicate_accommodation", message: "Ubytování s tímto názvem už u eventu existuje." }, 409, origin);

  const id = crypto.randomUUID();
  const actionId = crypto.randomUUID();
  const newState = JSON.stringify({ ...config, eventId: event.id });
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO event_accommodation_options (
        id, event_id, name, kind, inventory_mode, units_total, capacity_per_unit,
        unit_price_czk, person_price_czk, bedding_fee_per_person_czk,
        city_tax_per_person_per_night_czk, active, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, event.id, config.name, config.kind, config.inventoryMode, config.unitsTotal, config.capacityPerUnit, config.unitPriceCzk, config.personPriceCzk, config.beddingFeePerPersonCzk, config.cityTaxPerPersonPerNightCzk, config.active ? 1 : 0, config.sortOrder),
    env.DB.prepare(`
      INSERT INTO admin_actions (id, admin_member_id, action_type, entity_type, entity_id, old_state_json, new_state_json, note, created_at)
      VALUES (?, ?, 'accommodation_option_created', 'event_accommodation_option', ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(actionId, auth.uid, id, JSON.stringify(null), newState, config.name),
  ]);
  const option = (await listAccommodationOptions(env, event.id)).find(item => item.id === id);
  return json({ ok: true, option }, 201, origin);
}

async function getAccommodationUsage(env, optionId) {
  const row = await env.DB.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN r.status = 'approved' THEN ra.unit_count ELSE 0 END), 0) AS approved_units,
      COALESCE(SUM(CASE WHEN r.status = 'pending' THEN ra.unit_count ELSE 0 END), 0) AS pending_units
    FROM reservation_accommodation ra
    JOIN reservations r ON r.id = ra.reservation_id
    WHERE ra.option_id = ?
  `).bind(optionId).first();
  return { approved: Number(row?.approved_units || 0), pending: Number(row?.pending_units || 0) };
}

async function patchAdminAccommodation(request, env, auth, optionId, origin) {
  const parsed = await readJsonObject(request, origin);
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  const allowedKeys = new Set(["name", "kind", "inventoryMode", "unitsTotal", "capacityPerUnit", "unitPriceCzk", "personPriceCzk", "beddingFeePerPersonCzk", "cityTaxPerPersonPerNightCzk", "active", "sortOrder"]);
  if (!Object.keys(body).length || Object.keys(body).some(key => !allowedKeys.has(key))) return json({ ok: false, error: "invalid_fields", message: "Požadavek obsahuje nepovolená pole." }, 400, origin);
  const current = await env.DB.prepare("SELECT * FROM event_accommodation_options WHERE id = ? LIMIT 1").bind(optionId).first();
  if (!current) return json({ ok: false, error: "accommodation_not_found", message: "Typ ubytování nebyl nalezen." }, 404, origin);
  const result = readAccommodationConfig(body, current);
  if (result.error) return json({ ok: false, error: "invalid_accommodation", message: result.error }, 400, origin);
  const config = result.config;
  const duplicate = await env.DB.prepare("SELECT id FROM event_accommodation_options WHERE event_id = ? AND name = ? COLLATE NOCASE AND id <> ? LIMIT 1").bind(current.event_id, config.name, optionId).first();
  if (duplicate) return json({ ok: false, error: "duplicate_accommodation", message: "Ubytování s tímto názvem už u eventu existuje." }, 409, origin);
  const usage = await getAccommodationUsage(env, optionId);
  if (config.inventoryMode === "limited" && config.unitsTotal < usage.approved) {
    return accommodationCapacityConflict(config.name, origin, `Kapacitu nelze snížit na ${config.unitsTotal}. Aktuálně je potvrzeno ${usage.approved} jednotek.`);
  }

  const oldStateObject = accommodationState(current);
  const newStateObject = { ...config, eventId: current.event_id };
  if (JSON.stringify(oldStateObject) === JSON.stringify(newStateObject)) {
    const option = mapAccommodationOption({ ...current, approved_units: usage.approved, pending_units: usage.pending });
    option.visual = await accommodationVisualMetadata(env, option.eventId, option.id);
    return json({ ok: true, unchanged: true, option }, 200, origin);
  }

  const writeToken = createWriteToken();
  const actionId = crypto.randomUUID();
  const results = await env.DB.batch([
    env.DB.prepare(`
      UPDATE event_accommodation_options
      SET name = ?, kind = ?, inventory_mode = ?, units_total = ?, capacity_per_unit = ?,
          unit_price_czk = ?, person_price_czk = ?, bedding_fee_per_person_czk = ?,
          city_tax_per_person_per_night_czk = ?, active = ?, sort_order = ?, updated_at = ?
      WHERE id = ? AND (
        ? <> 'limited' OR ? >= (
          SELECT COALESCE(SUM(ra.unit_count), 0)
          FROM reservation_accommodation ra
          JOIN reservations r ON r.id = ra.reservation_id
          WHERE ra.option_id = event_accommodation_options.id AND r.status = 'approved'
        )
      )
    `).bind(config.name, config.kind, config.inventoryMode, config.unitsTotal, config.capacityPerUnit, config.unitPriceCzk, config.personPriceCzk, config.beddingFeePerPersonCzk, config.cityTaxPerPersonPerNightCzk, config.active ? 1 : 0, config.sortOrder, writeToken, optionId, config.inventoryMode, config.unitsTotal),
    env.DB.prepare(`
      INSERT INTO admin_actions (id, admin_member_id, action_type, entity_type, entity_id, old_state_json, new_state_json, note, created_at)
      SELECT ?, ?, 'accommodation_option_changed', 'event_accommodation_option', ?, ?, ?, ?, CURRENT_TIMESTAMP
      FROM event_accommodation_options WHERE id = ? AND updated_at = ?
    `).bind(actionId, auth.uid, optionId, JSON.stringify(oldStateObject), JSON.stringify(newStateObject), config.name, optionId, writeToken),
  ]);
  if (!results[0]?.meta?.changes) return accommodationCapacityConflict(config.name, origin, "Kapacita se mezitím obsadila. Obnov data a zkus to znovu.");
  const option = (await listAccommodationOptions(env, current.event_id)).find(item => item.id === optionId);
  return json({ ok: true, option }, 200, origin);
}

function accommodationState(row) {
  return {
    name: row.name,
    kind: row.kind,
    inventoryMode: row.inventory_mode,
    unitsTotal: Number(row.units_total || 0),
    capacityPerUnit: Number(row.capacity_per_unit || 1),
    unitPriceCzk: Number(row.unit_price_czk || 0),
    personPriceCzk: Number(row.person_price_czk || 0),
    beddingFeePerPersonCzk: Number(row.bedding_fee_per_person_czk || 0),
    cityTaxPerPersonPerNightCzk: Number(row.city_tax_per_person_per_night_czk || 0),
    active: !!row.active,
    sortOrder: Number(row.sort_order || 0),
    eventId: row.event_id,
  };
}

async function patchAdminEvent(request, env, auth, eventId, origin) {
  const parsed = await readJsonObject(request, origin);
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  const allowedKeys = new Set(["isCurrent", "registrationStatus", "reservationCapacity", "fullWeekendNights", "saturdayOnlyNights", "bookingCommitmentCzk", "bookingDueAt", "bookingPaidCzk", "eventEndAt"]);
  if (!Object.keys(body).length || Object.keys(body).some(key => !allowedKeys.has(key))) return json({ ok: false, error: "invalid_fields", message: "Požadavek obsahuje nepovolená pole." }, 400, origin);
  const current = await getEventById(env, eventId);
  if (!current) return json({ ok: false, error: "event_not_found", message: "Event nebyl nalezen." }, 404, origin);

  const next = {
    isCurrent: Object.prototype.hasOwnProperty.call(body, "isCurrent") ? body.isCurrent === true : !!current.is_current,
    registrationStatus: Object.prototype.hasOwnProperty.call(body, "registrationStatus") ? clean(body.registrationStatus) : current.registration_status,
    reservationCapacity: Number(Object.prototype.hasOwnProperty.call(body, "reservationCapacity") ? body.reservationCapacity : current.reservation_capacity),
    fullWeekendNights: Number(Object.prototype.hasOwnProperty.call(body, "fullWeekendNights") ? body.fullWeekendNights : current.full_weekend_nights),
    saturdayOnlyNights: Number(Object.prototype.hasOwnProperty.call(body, "saturdayOnlyNights") ? body.saturdayOnlyNights : current.saturday_only_nights),
    bookingCommitmentCzk: Number(Object.prototype.hasOwnProperty.call(body, "bookingCommitmentCzk") ? body.bookingCommitmentCzk : current.booking_commitment_czk),
    bookingDueAt: Object.prototype.hasOwnProperty.call(body, "bookingDueAt") ? clean(body.bookingDueAt) || null : current.booking_due_at || null,
    bookingPaidCzk: Number(Object.prototype.hasOwnProperty.call(body, "bookingPaidCzk") ? body.bookingPaidCzk : current.booking_paid_czk),
    eventEndAt: Object.prototype.hasOwnProperty.call(body, "eventEndAt") ? clean(body.eventEndAt) || null : current.event_end_at || null,
  };
  if (Object.prototype.hasOwnProperty.call(body, "isCurrent") && body.isCurrent !== true) return json({ ok: false, error: "invalid_current_event", message: "Aktuální event lze pouze přepnout na jiný event." }, 400, origin);
  if (!["open", "closed"].includes(next.registrationStatus)) return json({ ok: false, error: "invalid_registration_status", message: "Stav rezervací musí být open nebo closed." }, 400, origin);
  for (const key of ["reservationCapacity", "fullWeekendNights", "saturdayOnlyNights", "bookingCommitmentCzk", "bookingPaidCzk"]) {
    if (!Number.isInteger(next[key]) || next[key] < 0) return json({ ok: false, error: "invalid_event_value", message: "Číselné hodnoty eventu musí být nezáporná celá čísla." }, 400, origin);
  }
  if (next.fullWeekendNights > 14 || next.saturdayOnlyNights > 14) return json({ ok: false, error: "invalid_nights", message: "Počet nocí musí být 0 až 14." }, 400, origin);
  if (next.bookingDueAt && !/^\d{4}-\d{2}-\d{2}$/.test(next.bookingDueAt)) return json({ ok: false, error: "invalid_booking_due_at", message: "Splatnost musí být ve formátu RRRR-MM-DD." }, 400, origin);
  if (next.eventEndAt && !/^\d{4}-\d{2}-\d{2}$/.test(next.eventEndAt)) return json({ ok: false, error: "invalid_event_end_at", message: "Konec eventu musí být ve formátu RRRR-MM-DD." }, 400, origin);

  const oldState = eventState(current);
  if (JSON.stringify(oldState) === JSON.stringify(next)) return json({ ok: true, unchanged: true, event: publicAdminEvent(current) }, 200, origin);
  const statements = [];
  if (next.isCurrent && !current.is_current) statements.push(env.DB.prepare("UPDATE events SET is_current = 0 WHERE is_current = 1"));
  statements.push(env.DB.prepare(`
    UPDATE events
    SET is_current = ?, registration_status = ?, reservation_capacity = ?,
        full_weekend_nights = ?, saturday_only_nights = ?,
        booking_commitment_czk = ?, booking_due_at = ?, booking_paid_czk = ?, event_end_at = ?
    WHERE id = ?
  `).bind(next.isCurrent ? 1 : 0, next.registrationStatus, next.reservationCapacity, next.fullWeekendNights, next.saturdayOnlyNights, next.bookingCommitmentCzk, next.bookingDueAt, next.bookingPaidCzk, next.eventEndAt, eventId));
  statements.push(env.DB.prepare(`
    INSERT INTO admin_actions (id, admin_member_id, action_type, entity_type, entity_id, old_state_json, new_state_json, note, created_at)
    VALUES (?, ?, 'event_settings_changed', 'event', ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).bind(crypto.randomUUID(), auth.uid, eventId, JSON.stringify(oldState), JSON.stringify(next), next.isCurrent && !current.is_current ? "Nastaven aktuální event" : null));
  const results = await env.DB.batch(statements);
  const updateResult = results[next.isCurrent && !current.is_current ? 1 : 0];
  if (!updateResult?.meta?.changes) throw new Error("Event was not updated");
  return json({ ok: true, event: publicAdminEvent(await getEventById(env, eventId)) }, 200, origin);
}

function eventState(row) {
  return {
    isCurrent: !!row.is_current,
    registrationStatus: row.registration_status || "closed",
    reservationCapacity: Number(row.reservation_capacity || 0),
    fullWeekendNights: Number(row.full_weekend_nights ?? 2),
    saturdayOnlyNights: Number(row.saturday_only_nights ?? 1),
    bookingCommitmentCzk: Number(row.booking_commitment_czk || 0),
    bookingDueAt: row.booking_due_at || null,
    bookingPaidCzk: Number(row.booking_paid_czk || 0),
    eventEndAt: row.event_end_at || null,
  };
}

async function patchAdminReservation(request, env, auth, reservationId, origin) {
  let body = {};
  try {
    body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid JSON object");
  } catch {
    return json({ ok: false, error: "invalid_json", message: "Požadavek nemá platný JSON." }, 400, origin);
  }

  const allowedKeys = new Set(["status", "reviewNote"]);
  if (Object.keys(body).some(key => !allowedKeys.has(key))) {
    return json({ ok: false, error: "invalid_fields", message: "Lze změnit pouze stav a admin poznámku." }, 400, origin);
  }

  const status = clean(body.status);
  const reviewNote = clean(body.reviewNote).slice(0, 1000);
  if (!["pending", "approved", "rejected", "cancelled"].includes(status)) {
    return json({ ok: false, error: "invalid_status", message: "Neplatný stav rezervace." }, 400, origin);
  }

  const reservation = await env.DB.prepare(`
    SELECT r.id, r.status, r.review_note, ra.option_name
    FROM reservations r
    LEFT JOIN reservation_accommodation ra ON ra.reservation_id = r.id
    WHERE r.id = ?
    LIMIT 1
  `).bind(reservationId).first();
  if (!reservation) return json({ ok: false, error: "reservation_not_found", message: "Rezervace nebyla nalezena." }, 404, origin);

  const currentReviewNote = reservation.review_note || "";
  if (reservation.status === status && currentReviewNote === reviewNote) {
    return json({ ok: true, unchanged: true, reservation: { id: reservationId, status, reviewNote } }, 200, origin);
  }

  const oldState = JSON.stringify({ status: reservation.status, reviewNote: currentReviewNote });
  const newState = JSON.stringify({ status, reviewNote });
  const actionId = crypto.randomUUID();
  const writeToken = createWriteToken();
  const requiresCapacityCheck = reservation.status !== "approved" && status === "approved";

  const results = await env.DB.batch([
    env.DB.prepare(`
      UPDATE reservations
      SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = ?
      WHERE id = ? AND (
        ? = 0 OR NOT EXISTS (
          SELECT 1
          FROM reservation_accommodation own_allocation
          JOIN event_accommodation_options option ON option.id = own_allocation.option_id
          WHERE own_allocation.reservation_id = reservations.id
            AND option.inventory_mode = 'limited'
            AND option.units_total < own_allocation.unit_count + (
              SELECT COALESCE(SUM(other_allocation.unit_count), 0)
              FROM reservation_accommodation other_allocation
              JOIN reservations other_reservation ON other_reservation.id = other_allocation.reservation_id
              WHERE other_allocation.option_id = own_allocation.option_id
                AND other_reservation.status = 'approved'
                AND other_reservation.id <> reservations.id
            )
        )
      )
    `).bind(status, reviewNote || null, auth.uid, writeToken, reservationId, requiresCapacityCheck ? 1 : 0),
    env.DB.prepare(`
      INSERT INTO admin_actions (
        id, admin_member_id, action_type, entity_type, entity_id,
        old_state_json, new_state_json, note, created_at
      )
      SELECT ?, ?, 'reservation_status_changed', 'reservation', ?, ?, ?, ?, CURRENT_TIMESTAMP
      FROM reservations WHERE id = ? AND updated_at = ?
    `).bind(actionId, auth.uid, reservationId, oldState, newState, reviewNote || null, reservationId, writeToken),
  ]);

  if (!results[0]?.meta?.changes) {
    if (requiresCapacityCheck) return accommodationCapacityConflict(reservation.option_name || "Vybrané ubytování", origin);
    throw new Error("Reservation was not updated");
  }

  return json({
    ok: true,
    reservation: {
      id: reservationId,
      status,
      reviewNote,
      reviewedBy: auth.uid,
    },
  }, 200, origin);
}

async function patchAdminReservationPayment(request, env, auth, reservationId, origin) {
  const parsed = await readJsonObject(request, origin);
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  if (Object.keys(body).length !== 1 || !("amountPaidCzk" in body)) {
    return json({ ok: false, error: "invalid_fields", message: "Lze změnit pouze skutečně uhrazenou částku." }, 400, origin);
  }

  const amountPaidCzk = Number(body.amountPaidCzk);
  if (!Number.isInteger(amountPaidCzk) || amountPaidCzk < 0 || amountPaidCzk > MAX_PAYMENT_CZK) {
    return json({ ok: false, error: "invalid_amount_paid", message: `Uhrazená částka musí být celé číslo od 0 do ${MAX_PAYMENT_CZK} Kč.` }, 400, origin);
  }

  let reservation = await findReservationPayment(env, reservationId);
  if (!reservation) return json({ ok: false, error: "reservation_not_found", message: "Rezervace nebyla nalezena." }, 404, origin);
  if (!reservation.payment_vs) {
    await ensureReservationPaymentVs(env, reservation.id, reservation.event_year);
    reservation = await findReservationPayment(env, reservationId);
  }

  const amountDueCzk = Number(reservation.amount_due_czk || 0);
  const paymentStatus = paymentStatusFor(amountDueCzk, amountPaidCzk);
  if (Number(reservation.amount_paid_czk || 0) === amountPaidCzk && reservation.payment_status === paymentStatus) {
    return json({ ok: true, unchanged: true, reservation: { id: reservationId, payment: reservationPayment(reservation, { admin: true }) } }, 200, origin);
  }

  const oldState = {
    amountDueCzk,
    amountPaidCzk: Number(reservation.amount_paid_czk || 0),
    paymentStatus: paymentStatusFor(amountDueCzk, Number(reservation.amount_paid_czk || 0)),
    paidAt: reservation.paid_at || null,
  };
  const newState = { amountDueCzk, amountPaidCzk, paymentStatus };
  const writeToken = createWriteToken();
  const actionId = crypto.randomUUID();
  const note = `Uhrazená částka změněna z ${oldState.amountPaidCzk} Kč na ${amountPaidCzk} Kč.`;

  const results = await env.DB.batch([
    env.DB.prepare(`
      UPDATE reservations
      SET amount_paid_czk = ?, payment_status = ?,
          payment_confirmed_by = ?, payment_confirmed_at = CURRENT_TIMESTAMP,
          paid_at = CASE
            WHEN ? IN ('paid', 'overpaid') THEN COALESCE(paid_at, CURRENT_TIMESTAMP)
            ELSE NULL
          END,
          updated_at = ?
      WHERE id = ?
    `).bind(amountPaidCzk, paymentStatus, auth.uid, paymentStatus, writeToken, reservationId),
    env.DB.prepare(`
      INSERT INTO admin_actions (
        id, admin_member_id, action_type, entity_type, entity_id,
        old_state_json, new_state_json, note, created_at
      )
      SELECT ?, ?, 'reservation_payment_update', 'reservation', ?, ?, ?, ?, CURRENT_TIMESTAMP
      FROM reservations WHERE id = ? AND updated_at = ?
    `).bind(actionId, auth.uid, reservationId, JSON.stringify(oldState), JSON.stringify(newState), note, reservationId, writeToken),
  ]);
  if (!results[0]?.meta?.changes || !results[1]?.meta?.changes) throw new Error("Payment update was not persisted atomically");

  reservation = await findReservationPayment(env, reservationId);
  return json({ ok: true, reservation: { id: reservationId, payment: reservationPayment(reservation, { admin: true }) } }, 200, origin);
}

async function findReservationPayment(env, reservationId) {
  return await env.DB.prepare(`
    SELECT
      r.id, r.status, r.amount_due_czk, r.amount_paid_czk, r.payment_status,
      r.payment_vs, r.paid_at,
      e.year AS event_year, e.currency AS payment_currency, e.payment_deadline,
      e.payment_recipient_name, e.payment_account_display, e.payment_iban,
      e.payment_message_prefix, e.payment_test_mode
    FROM reservations r
    JOIN events e ON e.id = r.event_id
    WHERE r.id = ?
    LIMIT 1
  `).bind(reservationId).first();
}

async function getAdminGallery(env, origin) {
  const rows = await env.DB.prepare(`
    SELECT
      g.id, g.caption, g.status, g.created_at, g.review_note,
      m.name AS member_name, m.nickname AS member_nickname,
      m.email AS member_email, m.member_code
    FROM gallery_submissions g
    JOIN members m ON m.id = g.member_id
    WHERE g.status IN ('pending', 'approved', 'rejected')
    ORDER BY g.created_at DESC
  `).all();

  return json({
    ok: true,
    photos: (rows.results || []).map(row => ({
      id: row.id,
      caption: row.caption || "",
      status: row.status,
      createdAt: row.created_at,
      reviewNote: row.review_note || "",
      member: {
        name: row.member_name || "",
        nickname: row.member_nickname || "",
        email: row.member_email || "",
        memberCode: row.member_code || "",
      },
    })),
  }, 200, origin);
}

async function adminGalleryMedia(env, submissionId, origin) {
  const row = await env.DB.prepare(`
    SELECT r2_key
    FROM gallery_submissions
    WHERE id = ? AND status IN ('pending', 'approved', 'rejected')
    LIMIT 1
  `).bind(submissionId).first();
  if (!row) return json({ ok: false, error: "gallery_not_found", message: "Fotografie nebyla nalezena." }, 404, origin);

  const object = await env.MEDIA.get(row.r2_key);
  if (!object) return json({ ok: false, error: "media_not_found", message: "Soubor fotografie nebyl nalezen." }, 404, origin);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("ETag", object.httpEtag || object.etag || "");
  return cors(new Response(object.body, { status: 200, headers }), origin);
}

async function patchAdminGallery(request, env, auth, submissionId, origin) {
  let body = {};
  try {
    body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid JSON object");
  } catch {
    return json({ ok: false, error: "invalid_json", message: "Požadavek nemá platný JSON." }, 400, origin);
  }

  const allowedKeys = new Set(["status", "reviewNote"]);
  if (Object.keys(body).some(key => !allowedKeys.has(key))) {
    return json({ ok: false, error: "invalid_fields", message: "Lze změnit pouze stav a admin poznámku." }, 400, origin);
  }

  const status = clean(body.status);
  const reviewNote = clean(body.reviewNote).slice(0, 1000);
  if (!["pending", "approved", "rejected"].includes(status)) {
    return json({ ok: false, error: "invalid_status", message: "Neplatný stav fotografie." }, 400, origin);
  }

  const submission = await env.DB.prepare(`
    SELECT id, member_id, status, review_note
    FROM gallery_submissions
    WHERE id = ?
    LIMIT 1
  `).bind(submissionId).first();
  if (!submission) return json({ ok: false, error: "gallery_not_found", message: "Fotografie nebyla nalezena." }, 404, origin);

  const currentReviewNote = submission.review_note || "";
  if (submission.status === status && currentReviewNote === reviewNote) {
    return json({ ok: true, unchanged: true, photo: { id: submissionId, status, reviewNote } }, 200, origin);
  }

  const oldState = JSON.stringify({ status: submission.status, reviewNote: currentReviewNote });
  const newState = JSON.stringify({ status, reviewNote });
  const actionId = crypto.randomUUID();
  const statements = [
    env.DB.prepare(`
      UPDATE gallery_submissions
      SET status = ?, review_note = ?, reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(status, reviewNote || null, submissionId),
    env.DB.prepare(`
      INSERT INTO admin_actions (
        id, admin_member_id, action_type, entity_type, entity_id,
        old_state_json, new_state_json, note, created_at
      )
      VALUES (?, ?, 'gallery_status_changed', 'gallery_submission', ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(actionId, auth.uid, submissionId, oldState, newState, reviewNote || null),
  ];
  if (status === "approved") statements.push(...galleryPointStatements(env, submission.member_id), profilePointStatement(env, submission.member_id));
  const results = await env.DB.batch(statements);

  if (!results[0]?.meta?.changes) throw new Error("Gallery submission was not updated");
  return json({ ok: true, photo: { id: submissionId, status, reviewNote } }, 200, origin);
}

function ledgerInsertStatement(env, memberId, delta, sourceType, sourceKey, reason, eventId = null, relatedObjectId = null) {
  return env.DB.prepare(`
    INSERT OR IGNORE INTO united_points_ledger (
      id, member_id, delta, source_type, source_key, reason, event_id, related_object_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), memberId, delta, sourceType, sourceKey, reason, eventId, relatedObjectId);
}

function thresholdPointStatement(env, memberId, { delta, sourceType, sourceKey, reason, countSql, threshold }) {
  return env.DB.prepare(`
    INSERT OR IGNORE INTO united_points_ledger (
      id, member_id, delta, source_type, source_key, reason
    )
    SELECT ?, ?, ?, ?, ?, ?
    WHERE (${countSql}) >= ?
  `).bind(crypto.randomUUID(), memberId, delta, sourceType, sourceKey, reason, memberId, threshold);
}

function attendancePointStatements(env, claim) {
  return [
    ledgerInsertStatement(env, claim.member_id, 1, "attendance", `attendance:event:${claim.event_id}`, `Schválená účast na United ${claim.event_year}`, claim.event_id, claim.id),
    thresholdPointStatement(env, claim.member_id, {
      delta: 3,
      sourceType: "attendance_milestone",
      sourceKey: "attendance:milestone:3",
      reason: "Milník 3 schválených United",
      countSql: "SELECT COUNT(*) FROM united_history_claims WHERE member_id = ? AND attendance_status = 'approved'",
      threshold: 3,
    }),
    thresholdPointStatement(env, claim.member_id, {
      delta: 3,
      sourceType: "attendance_milestone",
      sourceKey: "attendance:milestone:5",
      reason: "Milník 5 schválených United",
      countSql: "SELECT COUNT(*) FROM united_history_claims WHERE member_id = ? AND attendance_status = 'approved'",
      threshold: 5,
    }),
  ];
}

function galleryPointStatements(env, memberId) {
  const countSql = "SELECT COUNT(*) FROM gallery_submissions WHERE member_id = ? AND status = 'approved'";
  return [
    thresholdPointStatement(env, memberId, { delta: 1, sourceType: "community_photo_milestone", sourceKey: "community-photos:5", reason: "5 schválených komunitních fotek", countSql, threshold: 5 }),
    thresholdPointStatement(env, memberId, { delta: 1, sourceType: "community_photo_milestone", sourceKey: "community-photos:25", reason: "25 schválených komunitních fotek", countSql, threshold: 25 }),
    thresholdPointStatement(env, memberId, { delta: 3, sourceType: "community_photo_milestone", sourceKey: "community-photos:50", reason: "50 schválených komunitních fotek", countSql, threshold: 50 }),
  ];
}

function profilePointStatement(env, memberId) {
  return env.DB.prepare(`
    INSERT OR IGNORE INTO united_points_ledger (
      id, member_id, delta, source_type, source_key, reason
    )
    SELECT ?, ?, 1, 'profile_completion', 'profile:complete', 'Kompletní United profil'
    WHERE EXISTS (
      SELECT 1 FROM members m
      WHERE m.id = ?
        AND trim(COALESCE(m.name, '')) <> ''
        AND trim(COALESCE(m.email, '')) <> ''
        AND trim(COALESCE(m.member_code, '')) <> ''
        AND m.history_completed_at IS NOT NULL
    )
      AND EXISTS (SELECT 1 FROM cars WHERE member_id = ?)
      AND (SELECT COUNT(*) FROM gallery_submissions WHERE member_id = ? AND status = 'approved') >= 5
  `).bind(crypto.randomUUID(), memberId, memberId, memberId, memberId);
}

function showShinePointStatements(env, claim) {
  const statements = [];
  const placement = Number(claim.sns_placement || 0);
  if ([1, 2, 3].includes(placement)) {
    const delta = placement === 1 ? 3 : placement === 2 ? 2 : 1;
    statements.push(ledgerInsertStatement(env, claim.member_id, delta, "show_shine_placement", `sns:placement:event:${claim.event_id}`, `Show & Shine ${placement}. místo · ${claim.event_year}`, claim.event_id, claim.id));
  }
  if (claim.sns_best_of_best) {
    statements.push(ledgerInsertStatement(env, claim.member_id, 1, "show_shine_award", `sns:best-of-best:event:${claim.event_id}`, `Best of the Best · ${claim.event_year}`, claim.event_id, claim.id));
  }
  if (claim.sns_best_exhaust) {
    statements.push(ledgerInsertStatement(env, claim.member_id, 1, "show_shine_award", `sns:best-exhaust:event:${claim.event_id}`, `Best Exhaust · ${claim.event_year}`, claim.event_id, claim.id));
  }
  return statements;
}

async function getAdminHistoryClaims(env, url, origin) {
  const q = clean(url.searchParams.get("q")).slice(0, 120);
  const status = clean(url.searchParams.get("status") || "pending");
  const claimType = clean(url.searchParams.get("type") || "all");
  const requestedYear = clean(url.searchParams.get("year"));
  const page = Math.max(1, Math.min(10000, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1));
  const pageSize = Math.max(12, Math.min(50, Number.parseInt(url.searchParams.get("pageSize") || "24", 10) || 24));
  if (!["all", "pending", "approved", "rejected"].includes(status)) {
    return json({ ok: false, error: "invalid_status", message: "Neplatný filtr stavu." }, 400, origin);
  }
  if (!["all", "attendance", "show_shine", "best_of_best", "best_exhaust"].includes(claimType)) {
    return json({ ok: false, error: "invalid_claim_type", message: "Neplatný filtr typu žádosti." }, 400, origin);
  }
  if (requestedYear && requestedYear !== "all" && !/^\d{4}$/.test(requestedYear)) {
    return json({ ok: false, error: "invalid_year", message: "Neplatný filtr ročníku." }, 400, origin);
  }

  const counts = await getAdminHistoryCounts(env);
  const defaultYear = counts.latestPendingYear ?? counts.latestYear;
  const selectedYear = requestedYear === "all" ? null : requestedYear ? Number(requestedYear) : defaultYear;
  const yearsResult = await env.DB.prepare(`
    SELECT e.year,
      COUNT(*) AS total,
      SUM(CASE WHEN c.attendance_status = 'pending' OR c.sns_status = 'pending' THEN 1 ELSE 0 END) AS pending
    FROM united_history_claims c
    JOIN events e ON e.id = c.event_id
    GROUP BY e.year
    ORDER BY e.year DESC
  `).all();
  const years = (yearsResult.results || []).map(row => ({ year: Number(row.year), total: Number(row.total || 0), pending: Number(row.pending || 0) }));

  const where = [`(
    ? = '' OR lower(m.name) LIKE '%' || lower(?) || '%'
    OR lower(COALESCE(m.nickname, '')) LIKE '%' || lower(?) || '%'
    OR lower(m.email) LIKE '%' || lower(?) || '%'
    OR lower(m.member_code) LIKE '%' || lower(?) || '%'
  )`];
  const bindings = [q, q, q, q, q];
  if (selectedYear != null) { where.push("e.year = ?"); bindings.push(selectedYear); }

  const statusColumn = claimType === "attendance" ? "c.attendance_status" : "c.sns_status";
  if (status !== "all") {
    if (claimType === "all") {
      where.push("(c.attendance_status = ? OR c.sns_status = ?)");
      bindings.push(status, status);
    } else {
      where.push(`${statusColumn} = ?`);
      bindings.push(status);
    }
  }
  if (claimType === "show_shine") where.push("c.sns_competed = 1");
  if (claimType === "best_of_best") where.push("c.sns_competed = 1 AND c.sns_best_of_best = 1");
  if (claimType === "best_exhaust") where.push("c.sns_competed = 1 AND c.sns_best_exhaust = 1");

  const whereSql = where.join(" AND ");
  const totalRow = await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM united_history_claims c
    JOIN events e ON e.id = c.event_id
    JOIN members m ON m.id = c.member_id
    WHERE ${whereSql}
  `).bind(...bindings).first();
  const filteredTotal = Number(totalRow?.count || 0);
  const totalPages = Math.max(1, Math.ceil(filteredTotal / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;

  const rows = await env.DB.prepare(`
    SELECT
      c.*, e.year AS event_year, e.event_end_at,
      m.name AS member_name, m.nickname AS member_nickname,
      m.email AS member_email, m.member_code
    FROM united_history_claims c
    JOIN events e ON e.id = c.event_id
    JOIN members m ON m.id = c.member_id
    WHERE ${whereSql}
    ORDER BY
      CASE WHEN c.attendance_status = 'pending' OR c.sns_status = 'pending' THEN 0 ELSE 1 END,
      e.year DESC,
      c.submitted_at DESC
    LIMIT ? OFFSET ?
  `).bind(...bindings, pageSize, offset).all();
  const claims = (rows.results || []).map(publicAdminHistoryClaim);
  await attachHistoryEvidence(env, claims, true);
  return json({
    ok: true,
    claims,
    counts,
    facets: { years },
    filters: { status, type: claimType, year: selectedYear == null ? "all" : String(selectedYear), q },
    pagination: { page: safePage, pageSize, total: filteredTotal, totalPages },
  }, 200, origin);
}

function publicAdminHistoryClaim(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    eventYear: Number(row.event_year || 0),
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
    attendance: { status: row.attendance_status, reviewNote: row.attendance_review_note || "", reviewedAt: row.attendance_reviewed_at || null },
    showShine: {
      competed: !!row.sns_competed,
      category: row.sns_category || "",
      placement: row.sns_placement ? Number(row.sns_placement) : null,
      bestOfBest: !!row.sns_best_of_best,
      bestExhaust: !!row.sns_best_exhaust,
      status: row.sns_status,
      reviewNote: row.sns_review_note || "",
      reviewedAt: row.sns_reviewed_at || null,
    },
    member: { id: row.member_id, name: row.member_name || "", nickname: row.member_nickname || "", email: row.member_email || "", memberCode: row.member_code || "" },
    evidence: [],
  };
}

async function attachHistoryEvidence(env, claims, admin = false) {
  if (!claims.length) return claims;
  const ids = claims.map(item => item.id);
  const placeholders = ids.map(() => "?").join(",");
  const rows = await env.DB.prepare(`
    SELECT id, claim_id, mime_type, size_bytes, sort_order, created_at
    FROM united_history_evidence
    WHERE claim_id IN (${placeholders})
    ORDER BY sort_order, created_at
  `).bind(...ids).all();
  const byClaim = new Map(claims.map(item => [item.id, item]));
  for (const row of rows.results || []) {
    const claim = byClaim.get(row.claim_id);
    if (claim) claim.evidence.push({ id: row.id, mimeType: row.mime_type, sizeBytes: Number(row.size_bytes || 0), createdAt: row.created_at, imageUrl: `${admin ? "/api/admin" : "/api"}/history/evidence/${encodeURIComponent(row.id)}` });
  }
  return claims;
}

async function historyEvidenceMedia(env, evidenceId, memberId, origin) {
  const row = memberId
    ? await env.DB.prepare("SELECT r2_key, mime_type FROM united_history_evidence WHERE id = ? AND member_id = ? LIMIT 1").bind(evidenceId, memberId).first()
    : await env.DB.prepare("SELECT r2_key, mime_type FROM united_history_evidence WHERE id = ? LIMIT 1").bind(evidenceId).first();
  if (!row) return json({ ok: false, error: "evidence_not_found", message: "Důkazní fotografie nebyla nalezena." }, 404, origin);
  const object = await env.MEDIA.get(row.r2_key);
  if (!object) return json({ ok: false, error: "media_not_found", message: "Soubor důkazu nebyl nalezen." }, 404, origin);
  const headers = new Headers({ "Content-Type": row.mime_type || "image/jpeg", "Cache-Control": "private, no-store" });
  return cors(new Response(object.body, { status: 200, headers }), origin);
}

async function patchAdminHistoryClaim(request, env, auth, claimId, component, origin) {
  const parsed = await readJsonObject(request, origin);
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  if (Object.keys(body).some(key => !new Set(["status", "reviewNote"]).has(key))) {
    return json({ ok: false, error: "invalid_fields", message: "Lze změnit pouze stav a důvod rozhodnutí." }, 400, origin);
  }
  const status = clean(body.status);
  const reviewNote = clean(body.reviewNote).slice(0, 1000);
  if (!["approved", "rejected"].includes(status)) return json({ ok: false, error: "invalid_status", message: "Rozhodnutí musí být schváleno nebo zamítnuto." }, 400, origin);
  if (status === "rejected" && !reviewNote) return json({ ok: false, error: "rejection_reason_required", message: "Při zamítnutí je důvod povinný." }, 400, origin);

  const claim = await env.DB.prepare(`
    SELECT c.*, e.year AS event_year
    FROM united_history_claims c JOIN events e ON e.id = c.event_id
    WHERE c.id = ? LIMIT 1
  `).bind(claimId).first();
  if (!claim) return json({ ok: false, error: "claim_not_found", message: "Žádost nebyla nalezena." }, 404, origin);
  if (component === "sns" && claim.sns_status === "not_claimed") return json({ ok: false, error: "sns_not_claimed", message: "Show & Shine nebylo nárokováno." }, 409, origin);
  if (component === "sns" && status === "approved" && claim.attendance_status !== "approved") {
    return json({ ok: false, error: "attendance_not_approved", message: "Nejdřív schval docházku na United." }, 409, origin);
  }
  const currentStatus = component === "attendance" ? claim.attendance_status : claim.sns_status;
  const currentNote = (component === "attendance" ? claim.attendance_review_note : claim.sns_review_note) || "";
  if (currentStatus === status && currentNote === reviewNote) return json({ ok: true, unchanged: true }, 200, origin);
  if (currentStatus === "approved") {
    return json({ ok: false, error: "approved_history_locked", message: "Schválený výsledek je uzamčený. Destruktivní oprava vyžaduje samostatný Admin reversal workflow." }, 409, origin);
  }

  const statusColumn = component === "attendance" ? "attendance_status" : "sns_status";
  const noteColumn = component === "attendance" ? "attendance_review_note" : "sns_review_note";
  const byColumn = component === "attendance" ? "attendance_reviewed_by" : "sns_reviewed_by";
  const atColumn = component === "attendance" ? "attendance_reviewed_at" : "sns_reviewed_at";
  const oldState = JSON.stringify({ component, status: currentStatus, reviewNote: currentNote });
  const newState = JSON.stringify({ component, status, reviewNote });
  const statements = [
    env.DB.prepare(`UPDATE united_history_claims SET ${statusColumn} = ?, ${noteColumn} = ?, ${byColumn} = ?, ${atColumn} = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(status, reviewNote || null, auth.uid, claimId),
    env.DB.prepare(`
      INSERT INTO admin_actions (id, admin_member_id, action_type, entity_type, entity_id, old_state_json, new_state_json, note, created_at)
      VALUES (?, ?, ?, 'united_history_claim', ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(crypto.randomUUID(), auth.uid, `history_${component}_reviewed`, claimId, oldState, newState, reviewNote || null),
  ];
  if (status === "approved" && component === "attendance") statements.push(...attendancePointStatements(env, claim), profilePointStatement(env, claim.member_id));
  if (status === "approved" && component === "sns") statements.push(...showShinePointStatements(env, claim));
  const results = await env.DB.batch(statements);
  if (!results[0]?.meta?.changes) throw new Error("History claim was not updated");
  return json({ ok: true, claimId, component, status, reviewNote }, 200, origin);
}

function formBoolean(value) {
  return ["1", "true", "yes", "on"].includes(clean(value).toLowerCase());
}

function parseShowShineClaim(form, origin) {
  const competed = formBoolean(form.get("snsCompeted"));
  if (!competed) return { value: { competed: false, category: null, placement: null, bestOfBest: false, bestExhaust: false, status: "not_claimed" } };
  const category = clean(form.get("snsCategory")).toLowerCase();
  const rawPlacement = clean(form.get("snsPlacement"));
  const placement = rawPlacement ? Number(rawPlacement) : null;
  if (!SHOW_SHINE_CATEGORIES.has(category)) return { response: json({ ok: false, error: "invalid_sns_category", message: "Vyber platnou Show & Shine kategorii." }, 400, origin) };
  if (placement !== null && ![1, 2, 3].includes(placement)) return { response: json({ ok: false, error: "invalid_sns_placement", message: "Umístění může být pouze 1., 2. nebo 3. místo." }, 400, origin) };
  return { value: { competed: true, category, placement, bestOfBest: formBoolean(form.get("snsBestOfBest")), bestExhaust: formBoolean(form.get("snsBestExhaust")), status: "pending" } };
}

async function submitHistoryClaim(request, env, auth, origin) {
  let form;
  try { form = await request.formData(); } catch { return json({ ok: false, error: "invalid_form", message: "Formulář se nepodařilo přečíst." }, 400, origin); }
  const eventId = clean(form.get("eventId"));
  const event = await env.DB.prepare(`
    SELECT id, year, event_end_at FROM events
    WHERE id = ? AND event_end_at IS NOT NULL AND date(event_end_at) < date('now')
    LIMIT 1
  `).bind(eventId).first();
  if (!event) return json({ ok: false, error: "event_not_concluded", message: "Historii lze upravit jen u skutečně skončeného ročníku." }, 409, origin);
  const parsedSns = parseShowShineClaim(form, origin);
  if (parsedSns.response) return parsedSns.response;
  const sns = parsedSns.value;
  const existing = await env.DB.prepare("SELECT * FROM united_history_claims WHERE member_id = ? AND event_id = ? LIMIT 1").bind(auth.uid, eventId).first();

  if (existing?.attendance_status === "approved") {
    if (!sns.competed) return json({ ok: false, error: "attendance_locked", message: "Schválenou docházku už nelze odebrat. Lze pouze doplnit Show & Shine." }, 409, origin);
    if (["pending", "approved"].includes(existing.sns_status)) return json({ ok: false, error: "sns_locked", message: "Show & Shine už čeká na kontrolu nebo je schválené." }, 409, origin);
    await env.DB.prepare(`
      UPDATE united_history_claims
      SET sns_competed = 1, sns_category = ?, sns_placement = ?, sns_best_of_best = ?, sns_best_exhaust = ?,
          sns_status = 'pending', sns_review_note = NULL, sns_reviewed_by = NULL, sns_reviewed_at = NULL,
          submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND member_id = ?
    `).bind(sns.category, sns.placement, sns.bestOfBest ? 1 : 0, sns.bestExhaust ? 1 : 0, existing.id, auth.uid).run();
    return json({ ok: true, claimId: existing.id, attendanceStatus: "approved", snsStatus: "pending" }, 200, origin);
  }
  if (existing?.attendance_status === "pending") return json({ ok: false, error: "claim_pending", message: "Tento ročník už čeká na kontrolu." }, 409, origin);

  const files = form.getAll("files");
  if (!files.length || files.length > MAX_HISTORY_EVIDENCE) return json({ ok: false, error: "evidence_required", message: `Přilož 1 až ${MAX_HISTORY_EVIDENCE} důkazní fotografie.` }, 400, origin);
  for (const file of files) {
    const validation = validateImageFile(file);
    if (validation) return json({ ok: false, error: "invalid_evidence", message: validation }, 400, origin);
  }

  const claimId = existing?.id || crypto.randomUUID();
  const uploaded = [];
  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const evidenceId = crypto.randomUUID();
      const key = `history-proof/${auth.uid}/${claimId}/${evidenceId}.${extensionFor(file.type)}`;
      await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { owner: auth.uid, kind: "history-proof", claimId, evidenceId } });
      uploaded.push({ id: evidenceId, key, file, index });
    }
    const statements = [];
    if (existing) {
      statements.push(env.DB.prepare(`
        UPDATE united_history_claims
        SET attendance_status = 'pending', attendance_review_note = NULL, attendance_reviewed_by = NULL, attendance_reviewed_at = NULL,
            sns_competed = ?, sns_category = ?, sns_placement = ?, sns_best_of_best = ?, sns_best_exhaust = ?, sns_status = ?,
            sns_review_note = NULL, sns_reviewed_by = NULL, sns_reviewed_at = NULL,
            submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND member_id = ?
      `).bind(sns.competed ? 1 : 0, sns.category, sns.placement, sns.bestOfBest ? 1 : 0, sns.bestExhaust ? 1 : 0, sns.status, claimId, auth.uid));
      statements.push(env.DB.prepare("DELETE FROM united_history_evidence WHERE claim_id = ? AND member_id = ?").bind(claimId, auth.uid));
    } else {
      statements.push(env.DB.prepare(`
        INSERT INTO united_history_claims (
          id, member_id, event_id, attendance_status,
          sns_competed, sns_category, sns_placement, sns_best_of_best, sns_best_exhaust, sns_status
        ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)
      `).bind(claimId, auth.uid, eventId, sns.competed ? 1 : 0, sns.category, sns.placement, sns.bestOfBest ? 1 : 0, sns.bestExhaust ? 1 : 0, sns.status));
    }
    for (const item of uploaded) {
      statements.push(env.DB.prepare(`INSERT INTO united_history_evidence (id, claim_id, member_id, r2_key, mime_type, size_bytes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(item.id, claimId, auth.uid, item.key, item.file.type, item.file.size, item.index));
    }
    const previous = existing ? await env.DB.prepare("SELECT r2_key FROM united_history_evidence WHERE claim_id = ? AND member_id = ?").bind(claimId, auth.uid).all() : { results: [] };
    await env.DB.batch(statements);
    for (const item of previous.results || []) {
      try { await env.MEDIA.delete(item.r2_key); } catch (error) { console.warn("Unable to delete replaced history evidence", error); }
    }
  } catch (error) {
    for (const item of uploaded) {
      try { await env.MEDIA.delete(item.key); } catch (cleanupError) { console.warn("Unable to clean up history evidence", cleanupError); }
    }
    throw error;
  }
  return json({ ok: true, claimId, attendanceStatus: "pending", snsStatus: sns.status }, existing ? 200 : 201, origin);
}

async function completeMemberHistory(env, auth, origin) {
  const results = await env.DB.batch([
    env.DB.prepare("UPDATE members SET history_completed_at = COALESCE(history_completed_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(auth.uid),
    profilePointStatement(env, auth.uid),
  ]);
  if (!results[0]?.meta?.changes) return json({ ok: false, error: "member_not_found", message: "Členský profil nebyl nalezen." }, 404, origin);
  return json({ ok: true }, 200, origin);
}

function deriveMemberRating(lifetimePoints) {
  const points = Math.max(0, Number(lifetimePoints || 0));
  if (points >= 12) return { key: "m-power", name: "M POWER", minPoints: 12 };
  if (points >= 10) return { key: "328i", name: "328i", minPoints: 10 };
  if (points >= 8) return { key: "325i", name: "325i", minPoints: 8 };
  if (points >= 6) return { key: "323i", name: "323i", minPoints: 6 };
  if (points >= 4) return { key: "320i", name: "320i", minPoints: 4 };
  if (points >= 2) return { key: "318is", name: "318is", minPoints: 2 };
  return { key: "316i", name: "316i", minPoints: 0 };
}

function deriveUnitedAchievements(history, approvedPhotoCount) {
  const approved = history.filter(item => item.attendance.status === "approved");
  const count = approved.length;
  const statusLevels = [
    { min: 6, name: "UNITED LEGEND", tier: "Platinum" },
    { min: 4, name: "UNITED VETERAN", tier: "Gold" },
    { min: 2, name: "UNITED REGULAR", tier: "Silver" },
    { min: 0, name: "UNITED MEMBER", tier: "Member" },
  ];
  const status = statusLevels.find(item => count >= item.min);
  const statusPriority = status.min >= 6 ? 94 : status.min >= 4 ? 93 : status.min >= 2 ? 92 : 70;
  const achievements = [{ id: `attendance-${status.min}`, type: "attendance", name: status.name, tier: status.tier, condition: `${count} schválených účastí`, priority: statusPriority }];
  const photoLevels = [
    { min: 50, name: "BMW PROSPEKT", tier: "Gold", points: 3 },
    { min: 25, name: "BMW PROSPEKT", tier: "Silver", points: 1 },
    { min: 5, name: "BMW PROSPEKT", tier: "Bronze", points: 1 },
  ];
  const photo = photoLevels.find(item => approvedPhotoCount >= item.min);
  if (photo) achievements.push({ id: `photos-${photo.min}`, type: "community", name: photo.name, tier: photo.tier, condition: `${approvedPhotoCount} schválených komunitních fotek`, points: photo.points, priority: photo.min >= 50 ? 84 : photo.min >= 25 ? 83 : 82 });
  if (approved.some(item => item.eventYear <= 2023)) achievements.push({ id: "oldschool", type: "history", name: "OLD SCHOOL", tier: "Legacy", condition: "Schválená účast na United 2023 nebo dříve", priority: 85 });
  if (approved.some(item => item.eventYear === 2021)) achievements.push({ id: "united-first", type: "history", name: "UNITED FIRST", tier: "Founding", condition: "Schválená účast na prvním United 2021", priority: 90 });
  for (const item of approved.filter(entry => entry.showShine.status === "approved")) {
    const placement = Number(item.showShine.placement || 0);
    if ([1, 2, 3].includes(placement)) achievements.push({ id: `sns-top3-${item.eventId}`, type: "show-shine", name: `S&S TOP 3 · ${item.eventYear}`, tier: placement === 1 ? "Gold" : placement === 2 ? "Silver" : "Bronze", condition: `${placement}. místo v kategorii ${item.showShine.category}`, eventId: item.eventId, eventYear: item.eventYear, points: placement === 1 ? 3 : placement === 2 ? 2 : 1, priority: 95 + (4 - placement) });
    if (item.showShine.bestOfBest) achievements.push({ id: `sns-bob-${item.eventId}`, type: "show-shine", name: `BEST OF THE BEST · ${item.eventYear}`, tier: "Gold", condition: `Schválené ocenění Best of the Best na United ${item.eventYear}`, eventId: item.eventId, eventYear: item.eventYear, points: 1, priority: 100 });
    if (item.showShine.bestExhaust) achievements.push({ id: `sns-exhaust-${item.eventId}`, type: "show-shine", name: `NEJ ZVUK VÝFUKU · ${item.eventYear}`, tier: "Gold", condition: `Schválené ocenění Nej zvuk výfuku na United ${item.eventYear}`, eventId: item.eventId, eventYear: item.eventYear, points: 1, priority: 95 });
  }
  const featured = [...achievements].sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name, "cs")).slice(0, 4);
  return { achievements: achievements.map(({ priority, ...item }) => item), featured: featured.map(({ priority, ...item }) => item) };
}

async function getUnitedClub(env, auth, origin) {
  const member = await env.DB.prepare("SELECT id, name, email, member_code, history_completed_at FROM members WHERE id = ? LIMIT 1").bind(auth.uid).first();
  if (!member) return json({ ok: false, error: "member_not_found", message: "Členský profil nebyl nalezen." }, 404, origin);
  const rows = await env.DB.prepare(`
    SELECT
      e.id AS event_id, e.year AS event_year, e.event_end_at,
      c.id, c.attendance_status, c.attendance_review_note, c.attendance_reviewed_at,
      c.sns_competed, c.sns_category, c.sns_placement, c.sns_best_of_best, c.sns_best_exhaust,
      c.sns_status, c.sns_review_note, c.sns_reviewed_at, c.submitted_at, c.updated_at
    FROM events e
    LEFT JOIN united_history_claims c ON c.event_id = e.id AND c.member_id = ?
    ORDER BY e.year DESC
  `).bind(auth.uid).all();
  const history = (rows.results || []).map(row => ({
    id: row.id || null,
    eventId: row.event_id,
    eventYear: Number(row.event_year || 0),
    eventEndAt: row.event_end_at || null,
    concluded: !!row.event_end_at && row.event_end_at < new Date().toISOString().slice(0, 10),
    attendance: { status: row.attendance_status || "not_claimed", reviewNote: row.attendance_review_note || "", reviewedAt: row.attendance_reviewed_at || null },
    showShine: { competed: !!row.sns_competed, category: row.sns_category || "", placement: row.sns_placement ? Number(row.sns_placement) : null, bestOfBest: !!row.sns_best_of_best, bestExhaust: !!row.sns_best_exhaust, status: row.sns_status || "not_claimed", reviewNote: row.sns_review_note || "", reviewedAt: row.sns_reviewed_at || null },
    submittedAt: row.submitted_at || null,
    updatedAt: row.updated_at || null,
    evidence: [],
  }));
  await attachHistoryEvidence(env, history.filter(item => item.id), false);
  const pointRow = await env.DB.prepare(`
    SELECT COALESCE(SUM(delta), 0) AS available, COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0) AS lifetime
    FROM united_points_ledger WHERE member_id = ?
  `).bind(auth.uid).first();
  const photoRow = await env.DB.prepare("SELECT COUNT(*) AS count FROM gallery_submissions WHERE member_id = ? AND status = 'approved'").bind(auth.uid).first();
  const carRow = await env.DB.prepare("SELECT COUNT(*) AS count FROM cars WHERE member_id = ?").bind(auth.uid).first();
  const approvedPhotoCount = Number(photoRow?.count || 0);
  const available = Number(pointRow?.available || 0);
  const lifetime = Number(pointRow?.lifetime || 0);
  const derived = deriveUnitedAchievements(history, approvedPhotoCount);
  const approvedYears = history.filter(item => item.attendance.status === "approved").map(item => item.eventYear);
  const profileCriteria = {
    requiredFields: !!(clean(member.name) && clean(member.email) && clean(member.member_code)),
    historyReviewed: !!member.history_completed_at,
    hasCar: Number(carRow?.count || 0) > 0,
    approvedPhotos: approvedPhotoCount,
  };
  return json({
    ok: true,
    points: { available, lifetime },
    rewardThreshold: UNITED_REWARD_THRESHOLD,
    rating: deriveMemberRating(lifetime),
    memberSince: approvedYears.length ? Math.min(...approvedYears) : null,
    historyCompletedAt: member.history_completed_at || null,
    history,
    approvedPhotoCount,
    profileCompletion: { ...profileCriteria, complete: profileCriteria.requiredFields && profileCriteria.historyReviewed && profileCriteria.hasCar && approvedPhotoCount >= 5 },
    achievements: derived.achievements,
    featuredAchievements: derived.featured,
  }, 200, origin);
}

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

  await env.DB.batch([
    env.DB.prepare(`
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
    `).bind(auth.uid, memberCode, auth.email.toLowerCase(), name, nickname || null, phone || null, auth.emailVerified ? 1 : 0),
    profilePointStatement(env, auth.uid),
  ]);

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

async function findCurrentReservation(env, memberId, eventId) {
  return await env.DB.prepare(`
    SELECT
      r.id, r.member_id, r.event_id, r.car_id,
      r.car_model, r.car_body, r.car_year, r.car_color, r.car_nickname,
      r.arrival, r.crew, r.accommodation, r.show_shine, r.note, r.status,
      r.attendance_type, r.accommodation_units,
      r.amount_due_czk, r.amount_paid_czk, r.payment_status, r.payment_vs,
      r.paid_at, r.submitted_at, r.created_at, r.updated_at, r.reviewed_at,
      e.year AS event_year, e.registration_status AS event_registration_status,
      e.currency AS payment_currency, e.payment_deadline,
      e.payment_recipient_name, e.payment_account_display, e.payment_iban,
      e.payment_message_prefix, e.payment_test_mode,
      ra.option_id AS accommodation_option_id,
      ra.option_name AS accommodation_option_name,
      ra.kind AS accommodation_option_kind,
      ao.capacity_per_unit AS accommodation_capacity_per_unit,
      ra.people_count AS accommodation_people_count,
      ra.unit_count AS accommodation_unit_count,
      ra.unit_price_czk AS accommodation_unit_price_czk,
      ra.person_price_czk AS accommodation_person_price_czk,
      ra.bedding_fee_per_person_czk AS accommodation_bedding_fee_czk,
      ra.city_tax_per_person_per_night_czk AS accommodation_city_tax_czk,
      ra.nights AS accommodation_nights,
      ra.base_total_czk AS accommodation_base_total_czk,
      ra.person_total_czk AS accommodation_person_total_czk,
      ra.bedding_total_czk AS accommodation_bedding_total_czk,
      ra.city_tax_total_czk AS accommodation_city_tax_total_czk,
      ra.total_czk AS accommodation_total_czk
    FROM reservations r
    JOIN events e ON e.id = r.event_id
    LEFT JOIN reservation_accommodation ra ON ra.reservation_id = r.id
    LEFT JOIN event_accommodation_options ao ON ao.id = ra.option_id
    WHERE r.member_id = ? AND r.event_id = ?
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
      r.amount_due_czk, r.amount_paid_czk, r.payment_status, r.payment_vs,
      r.paid_at, r.submitted_at, r.created_at, r.updated_at, r.reviewed_at,
      e.year AS event_year, e.registration_status AS event_registration_status,
      e.currency AS payment_currency, e.payment_deadline,
      e.payment_recipient_name, e.payment_account_display, e.payment_iban,
      e.payment_message_prefix, e.payment_test_mode,
      ra.option_id AS accommodation_option_id,
      ra.option_name AS accommodation_option_name,
      ra.kind AS accommodation_option_kind,
      ao.capacity_per_unit AS accommodation_capacity_per_unit,
      ra.people_count AS accommodation_people_count,
      ra.unit_count AS accommodation_unit_count,
      ra.unit_price_czk AS accommodation_unit_price_czk,
      ra.person_price_czk AS accommodation_person_price_czk,
      ra.bedding_fee_per_person_czk AS accommodation_bedding_fee_czk,
      ra.city_tax_per_person_per_night_czk AS accommodation_city_tax_czk,
      ra.nights AS accommodation_nights,
      ra.base_total_czk AS accommodation_base_total_czk,
      ra.person_total_czk AS accommodation_person_total_czk,
      ra.bedding_total_czk AS accommodation_bedding_total_czk,
      ra.city_tax_total_czk AS accommodation_city_tax_total_czk,
      ra.total_czk AS accommodation_total_czk
    FROM reservations r
    JOIN events e ON e.id = r.event_id
    LEFT JOIN reservation_accommodation ra ON ra.reservation_id = r.id
    LEFT JOIN event_accommodation_options ao ON ao.id = ra.option_id
    WHERE r.member_id = ?
    ORDER BY e.year DESC
    LIMIT 1
  `).bind(memberId).first();
}

async function getCurrentReservation(env, auth, origin) {
  const event = await getCurrentEvent(env);
  if (!event) {
    let reservation = await findLatestReservation(env, auth.uid);
    if (reservation && !reservation.payment_vs) {
      await ensureReservationPaymentVs(env, reservation.id, reservation.event_year);
      reservation = await findLatestReservation(env, auth.uid);
    }
    if (reservation) await hydrateReservationAccommodationVisual(env, reservation);
    return json({
      ok: true,
      registrationOpen: false,
      event: reservation ? { id: reservation.event_id, registrationStatus: reservation.event_registration_status } : null,
      accommodationOptions: [],
      reservation: reservation ? publicReservation(reservation) : null,
      message: reservation ? "Registrace je uzavřená. Zobrazuje se poslední uložená rezervace." : "Registrace na žádný event aktuálně není otevřená.",
    }, 200, origin);
  }

  let reservation = await findCurrentReservation(env, auth.uid, event.id);
  if (reservation && !reservation.payment_vs) {
    await ensureReservationPaymentVs(env, reservation.id, reservation.event_year);
    reservation = await findCurrentReservation(env, auth.uid, event.id);
  }
  if (reservation) await hydrateReservationAccommodationVisual(env, reservation);
  const options = await listMemberAccommodationOptions(env, event.id, reservation);
  return json({
    ok: true,
    registrationOpen: event.registration_status === "open",
    event: publicMemberEvent(event),
    accommodationOptions: options,
    reservation: reservation ? publicReservation(reservation) : null,
    message: reservation
      ? (event.registration_status === "open" ? "Rezervace byla načtena." : "Rezervace je uložená, ale rezervace pro event jsou uzavřené.")
      : (event.registration_status === "open" ? "Rezervace jsou otevřené, ale zatím nemáš rezervaci." : "Rezervace na tento event zatím nejsou otevřené."),
  }, 200, origin);
}

function validatePlannerDraft(candidate, now = Date.now()) {
  if (!candidate || candidate.version !== 1 || candidate.source !== "weekend-planner") return null;
  const draftId = String(candidate.draftId || "");
  const createdAt = Date.parse(candidate.createdAt), expiresAt = Date.parse(candidate.expiresAt);
  const eventYear = Number(candidate.eventYear), crew = Number(candidate.crew), units = Number(candidate.accommodationUnits);
  const lifetime = 7 * 24 * 60 * 60 * 1000;
  const attendanceByArrival = { "Pátek": "full_weekend", "Sobota": "saturday_only", "Jen na otočku": "day_visit" };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(draftId) || !Number.isFinite(createdAt) || !Number.isFinite(expiresAt) || createdAt > now + PLANNER_CLOCK_SKEW_MS || expiresAt <= now || expiresAt <= createdAt || now - createdAt > lifetime || expiresAt - createdAt > lifetime) return null;
  if (!Number.isInteger(eventYear) || eventYear < 2000 || eventYear > 2100) return null;
  if (!attendanceByArrival[candidate.arrival] || candidate.attendanceType !== attendanceByArrival[candidate.arrival]) return null;
  if (!["Chatka", "Stan", "Bez ubytování"].includes(candidate.accommodation) || !Number.isInteger(crew) || crew < 1 || crew > MAX_RESERVATION_CREW || !Number.isInteger(units) || units < 0 || units > crew || !["Ano", "Ne", "Možná"].includes(candidate.showShine)) return null;
  if ((candidate.arrival === "Jen na otočku" || candidate.accommodation === "Bez ubytování") && units !== 0) return null;
  if (candidate.arrival !== "Jen na otočku" && candidate.accommodation !== "Bez ubytování" && units < 1) return null;
  const eventId = candidate.eventId == null ? null : String(candidate.eventId);
  const accommodationOptionId = candidate.accommodationOptionId == null ? null : String(candidate.accommodationOptionId);
  if (eventId !== null && !/^[a-z0-9_-]{1,128}$/i.test(eventId)) return null;
  if (accommodationOptionId !== null && !/^[a-z0-9_-]{1,128}$/i.test(accommodationOptionId)) return null;
  const fallbackDeparture = candidate.arrival === "Jen na otočku" ? "Stejný den" : "Neděle";
  const departure = String(candidate.departure || fallbackDeparture);
  const nights = Number(candidate.nights ?? (candidate.arrival === "Pátek" ? 2 : candidate.arrival === "Sobota" ? 1 : 0));
  const validStay = candidate.arrival === "Pátek"
    ? ((departure === "Sobota" && nights === 1) || (departure === "Neděle" && nights === 2))
    : candidate.arrival === "Sobota" ? (departure === "Neděle" && nights === 1) : (departure === "Stejný den" && nights === 0);
  if (!validStay) return null;
  return { version: 1, draftId, source: "weekend-planner", eventYear, eventId, createdAt: new Date(createdAt).toISOString(), expiresAt: new Date(expiresAt).toISOString(), arrival: candidate.arrival, departure, nights, attendanceType: candidate.attendanceType, accommodation: candidate.accommodation, accommodationOptionId, accommodationUnits: units, crew, showShine: candidate.showShine };
}

function plannerDraftFromRow(row) {
  if (!row?.payload_json) return null;
  try {
    const draft = validatePlannerDraft(JSON.parse(row.payload_json));
    return draft ? { ...draft, serverUpdatedAt: row.updated_at || null } : null;
  } catch { return null; }
}

async function findActivePlannerDraft(env, memberId) {
  const now = new Date().toISOString();
  return await env.DB.prepare(`
    SELECT payload_json, updated_at
    FROM member_planner_drafts
    WHERE member_id = ? AND expires_at > ?
    ORDER BY source_created_at DESC, updated_at DESC
    LIMIT 1
  `).bind(memberId, now).first();
}

async function getPlannerDraft(env, auth, origin) {
  const row = await findActivePlannerDraft(env, auth.uid);
  return json({ ok: true, draft: plannerDraftFromRow(row) }, 200, origin);
}

async function putPlannerDraft(request, env, auth, origin) {
  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: "invalid_json", message: "Požadavek nemá platný JSON." }, 400, origin); }

  const draft = validatePlannerDraft(body?.draft);
  if (!draft || JSON.stringify(draft).length > 4096) return json({ ok: false, error: "invalid_planner_draft", message: "Plán z Weekend Planneru není platný." }, 400, origin);

  const member = await env.DB.prepare("SELECT id FROM members WHERE id = ? LIMIT 1").bind(auth.uid).first();
  if (!member) return json({ ok: false, error: "member_profile_required", message: "Nejdřív dokonči členský profil." }, 409, origin);
  const event = draft.eventId
    ? await env.DB.prepare("SELECT id, year FROM events WHERE id = ? LIMIT 1").bind(draft.eventId).first()
    : await env.DB.prepare("SELECT id, year FROM events WHERE year = ? ORDER BY is_current DESC LIMIT 1").bind(draft.eventYear).first();
  if (!event || Number(event.year) !== draft.eventYear) return json({ ok: false, error: "planner_event_not_found", message: "Plán neodpovídá známému United eventu." }, 400, origin);

  const normalized = { ...draft, eventId: event.id };
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO member_planner_drafts (member_id, event_id, draft_id, payload_json, source_created_at, expires_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(member_id, event_id) DO UPDATE SET
      draft_id = excluded.draft_id,
      payload_json = excluded.payload_json,
      source_created_at = excluded.source_created_at,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at
    WHERE member_planner_drafts.expires_at <= ? OR excluded.source_created_at > member_planner_drafts.source_created_at
  `).bind(auth.uid, event.id, normalized.draftId, JSON.stringify(normalized), normalized.createdAt, normalized.expiresAt, now, now).run();
  const authoritativeRow = await env.DB.prepare("SELECT payload_json, updated_at FROM member_planner_drafts WHERE member_id = ? AND event_id = ? LIMIT 1").bind(auth.uid, event.id).first();
  const authoritative = plannerDraftFromRow(authoritativeRow);
  return json({ ok: true, accepted: authoritative?.draftId === normalized.draftId, draft: authoritative }, 200, origin);
}

async function deletePlannerDraft(env, auth, url, origin) {
  const eventId = clean(url.searchParams.get("eventId"));
  if (!/^[a-z0-9_-]{1,128}$/i.test(eventId)) return json({ ok: false, error: "event_id_required" }, 400, origin);
  const result = await env.DB.prepare("DELETE FROM member_planner_drafts WHERE member_id = ? AND event_id = ?").bind(auth.uid, eventId).run();
  return json({ ok: true, deleted: Number(result?.meta?.changes || 0) > 0 }, 200, origin);
}

async function getMemberNavigationState(env, auth, origin) {
  const now = new Date().toISOString();
  const event = await getCurrentEvent(env);
  const [reservation, planner] = await Promise.all([
    event
      ? env.DB.prepare("SELECT 1 AS found FROM reservations WHERE member_id = ? AND event_id = ? LIMIT 1").bind(auth.uid, event.id).first()
      : Promise.resolve(null),
    env.DB.prepare("SELECT 1 AS found FROM member_planner_drafts WHERE member_id = ? AND expires_at > ? LIMIT 1").bind(auth.uid, now).first(),
  ]);
  return json({ ok: true, hasWaitingPlan: !!planner, hasReservation: !!reservation }, 200, origin);
}

async function putCurrentReservation(request, env, auth, origin) {
  const event = await getCurrentEvent(env);
  if (!event || event.registration_status !== "open") return json({ ok: false, error: "registration_closed", message: "Rezervace na aktuální event nejsou otevřené." }, 409, origin);

  let body = {};
  try {
    body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid JSON object");
  }
  catch { return json({ ok: false, error: "invalid_json", message: "Požadavek nemá platný JSON." }, 400, origin); }

  const protectedFinancialFields = [
    "amountDueCzk", "amountPaidCzk", "paidAmount", "paymentStatus",
    "paymentVs", "variableSymbol", "balance", "balanceCzk",
  ];
  if (protectedFinancialFields.some(key => Object.prototype.hasOwnProperty.call(body, key))) {
    return json({ ok: false, error: "protected_financial_fields", message: "Cenu, přijatou platbu ani platební identitu nelze měnit z členského účtu." }, 400, origin);
  }

  const carId = clean(body.carId);
  const requestedReservationId = clean(body.reservationId);
  const arrival = clean(body.arrival);
  const showShine = clean(body.showShine);
  const note = clean(body.note).slice(0, 1000);
  const crew = Number(body.crew);
  const requestedAccommodation = clean(body.accommodation);
  const accommodationOptionId = clean(body.accommodationOptionId);
  const arrivalTypes = { "Pátek": "full_weekend", "Sobota": "saturday_only", "Jen na otočku": "day_visit" };
  const attendanceType = arrivalTypes[arrival] || "";
  const wantsAccommodation = attendanceType !== "day_visit" && requestedAccommodation !== "Bez ubytování";
  const accommodationUnits = wantsAccommodation ? Number(body.accommodationUnits) : 0;

  if (!carId) return json({ ok: false, error: "car_required", message: "Vyber auto z garáže." }, 400, origin);
  if (!["Pátek", "Sobota", "Jen na otočku"].includes(arrival)) return json({ ok: false, error: "invalid_arrival", message: "Vyber platný příjezd." }, 400, origin);
  if (!["Chatka", "Stan", "Bez ubytování"].includes(requestedAccommodation)) return json({ ok: false, error: "invalid_accommodation", message: "Vyber platné ubytování." }, 400, origin);
  if (!["Ne", "Možná", "Ano"].includes(showShine)) return json({ ok: false, error: "invalid_show_shine", message: "Vyber platnou možnost Show & Shine." }, 400, origin);
  if (!Number.isInteger(crew) || crew < 1 || crew > MAX_RESERVATION_CREW) return json({ ok: false, error: "invalid_crew", message: `Posádka musí mít 1 až ${MAX_RESERVATION_CREW} osob.` }, 400, origin);
  if (!attendanceType) return json({ ok: false, error: "invalid_attendance_type", message: "Vyber platný typ účasti." }, 400, origin);
  if (!Number.isInteger(accommodationUnits) || accommodationUnits < (wantsAccommodation ? 1 : 0) || accommodationUnits > crew) return json({ ok: false, error: "invalid_accommodation_units", message: "Počet ubytovaných musí být celé číslo od 1 do počtu členů posádky." }, 400, origin);
  if (wantsAccommodation && !accommodationOptionId) return json({ ok: false, error: "accommodation_option_required", message: "Vyber konkrétní typ ubytování." }, 400, origin);

  const member = await env.DB.prepare("SELECT id FROM members WHERE id = ? LIMIT 1").bind(auth.uid).first();
  if (!member) return json({ ok: false, error: "member_profile_required", message: "Nejdřív dokonči členský profil." }, 409, origin);

  const car = await env.DB.prepare(`
    SELECT id, model, body, year, color, nickname
    FROM cars
    WHERE id = ? AND member_id = ?
    LIMIT 1
  `).bind(carId, auth.uid).first();
  if (!car) return json({ ok: false, error: "car_not_found", message: "Vybrané auto nepatří přihlášenému účtu." }, 404, origin);

  let option = null;
  let pricing = null;
  let accommodation = "Bez ubytování";
  if (wantsAccommodation) {
    option = await env.DB.prepare(`
      SELECT * FROM event_accommodation_options
      WHERE id = ? AND event_id = ? AND active = 1
      LIMIT 1
    `).bind(accommodationOptionId, event.id).first();
    if (!option) return json({ ok: false, error: "accommodation_option_not_found", message: "Vybrané ubytování už není dostupné." }, 409, origin);
    const expectedKind = requestedAccommodation === "Chatka" ? "cabin" : "tent";
    if (option.kind !== expectedKind) return json({ ok: false, error: "invalid_accommodation_option", message: "Vybraný typ neodpovídá zvolenému ubytování." }, 400, origin);
    accommodation = option.kind === "cabin" ? "Chatka" : "Stan";
    pricing = calculateAccommodationPricing(event, option, accommodationUnits, attendanceType);
  }

  const existing = await env.DB.prepare("SELECT id, status FROM reservations WHERE member_id = ? AND event_id = ? LIMIT 1").bind(auth.uid, event.id).first();
  if (existing && !requestedReservationId) {
    const active = ["pending", "approved"].includes(existing.status);
    return json({
      ok: false,
      error: active ? "active_reservation_exists" : "reservation_edit_required",
      message: active
        ? "Pro tento event už máš aktivní rezervaci. Otevři ji a uprav existující rezervaci."
        : "Pro tento event už máš uloženou rezervaci. Otevři ji a uprav nebo znovu odešli.",
    }, 409, origin);
  }
  if (requestedReservationId && (!existing || requestedReservationId !== existing.id)) {
    return json({ ok: false, error: "reservation_not_found", message: "Rezervace pro tento účet a event nebyla nalezena." }, 404, origin);
  }
  const reservationId = existing?.id || crypto.randomUUID();
  const writeToken = createWriteToken();
  const amountDueCzk = pricing?.totalCzk || 0;
  const reservationStatement = env.DB.prepare(`
    INSERT INTO reservations (
      id, member_id, event_id, car_id,
      car_model, car_body, car_year, car_color, car_nickname,
      arrival, crew, accommodation, show_shine, note,
      status, attendance_type, accommodation_units,
      amount_due_czk, amount_paid_czk, payment_status, submitted_at, updated_at
    )
    SELECT ?, ?, events.id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, 0, 'unpaid', CURRENT_TIMESTAMP, ?
    FROM events
    ${option ? "JOIN event_accommodation_options selected_option ON selected_option.id = ?" : ""}
    WHERE events.id = ?
      AND (events.is_current = 1 OR NOT EXISTS (SELECT 1 FROM events current_event WHERE current_event.is_current = 1))
      AND events.registration_status = 'open'
      ${option ? `AND selected_option.event_id = events.id AND selected_option.active = 1
        AND selected_option.name = ?
        AND selected_option.kind = ?
        AND events.full_weekend_nights = ?
        AND events.saturday_only_nights = ?
        AND selected_option.inventory_mode = ?
        AND selected_option.units_total = ?
        AND selected_option.capacity_per_unit = ?
        AND selected_option.unit_price_czk = ?
        AND selected_option.person_price_czk = ?
        AND selected_option.bedding_fee_per_person_czk = ?
        AND selected_option.city_tax_per_person_per_night_czk = ?
        AND (
          selected_option.inventory_mode = 'unlimited' OR
          selected_option.units_total >= ? + (
            SELECT COALESCE(SUM(other_allocation.unit_count), 0)
            FROM reservation_accommodation other_allocation
            JOIN reservations other_reservation ON other_reservation.id = other_allocation.reservation_id
            WHERE other_allocation.option_id = selected_option.id
              AND other_reservation.status = 'approved'
              AND NOT (other_reservation.member_id = ? AND other_reservation.event_id = events.id)
          )
        )` : ""}
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
      amount_due_czk = excluded.amount_due_czk,
      submitted_at = CURRENT_TIMESTAMP,
      updated_at = excluded.updated_at
    WHERE reservations.id = excluded.id
  `);
  const baseBindings = [
    reservationId, auth.uid, car.id,
    car.model, car.body, car.year || null, car.color || null, car.nickname || null,
    arrival, crew, accommodation, showShine, note || null,
    attendanceType, accommodationUnits, amountDueCzk, writeToken,
  ];
  const optionBindings = option ? [option.id] : [];
  const conditionBindings = option ? [
    option.name, option.kind,
    Number(event.full_weekend_nights ?? 2), Number(event.saturday_only_nights ?? 1),
    option.inventory_mode, Number(option.units_total || 0), Number(option.capacity_per_unit),
    Number(option.unit_price_czk || 0), Number(option.person_price_czk || 0),
    Number(option.bedding_fee_per_person_czk || 0), Number(option.city_tax_per_person_per_night_czk || 0),
    pricing.unitCount, auth.uid,
  ] : [];
  const statements = [reservationStatement.bind(...baseBindings, ...optionBindings, event.id, ...conditionBindings)];
  if (option) {
    statements.push(env.DB.prepare(`
      INSERT INTO reservation_accommodation (
        reservation_id, option_id, option_name, kind, people_count, unit_count,
        unit_price_czk, person_price_czk, bedding_fee_per_person_czk,
        city_tax_per_person_per_night_czk, nights,
        base_total_czk, person_total_czk, bedding_total_czk, city_tax_total_czk, total_czk,
        updated_at
      )
      SELECT current_reservation.id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      FROM reservations current_reservation
      WHERE current_reservation.member_id = ? AND current_reservation.event_id = ? AND current_reservation.updated_at = ?
      ON CONFLICT(reservation_id) DO UPDATE SET
        option_id = excluded.option_id,
        option_name = excluded.option_name,
        kind = excluded.kind,
        people_count = excluded.people_count,
        unit_count = excluded.unit_count,
        unit_price_czk = excluded.unit_price_czk,
        person_price_czk = excluded.person_price_czk,
        bedding_fee_per_person_czk = excluded.bedding_fee_per_person_czk,
        city_tax_per_person_per_night_czk = excluded.city_tax_per_person_per_night_czk,
        nights = excluded.nights,
        base_total_czk = excluded.base_total_czk,
        person_total_czk = excluded.person_total_czk,
        bedding_total_czk = excluded.bedding_total_czk,
        city_tax_total_czk = excluded.city_tax_total_czk,
        total_czk = excluded.total_czk,
        updated_at = excluded.updated_at
    `).bind(option.id, option.name, option.kind, accommodationUnits, pricing.unitCount, pricing.unitPriceCzk, pricing.personPriceCzk, pricing.beddingFeePerPersonCzk, pricing.cityTaxPerPersonPerNightCzk, pricing.nights, pricing.baseTotalCzk, pricing.personTotalCzk, pricing.beddingTotalCzk, pricing.cityTaxTotalCzk, pricing.totalCzk, writeToken, auth.uid, event.id, writeToken));
  } else {
    statements.push(env.DB.prepare(`
      DELETE FROM reservation_accommodation
      WHERE reservation_id = (
        SELECT id FROM reservations WHERE member_id = ? AND event_id = ? AND updated_at = ?
      )
    `).bind(auth.uid, event.id, writeToken));
  }
  statements.push(env.DB.prepare(`
    UPDATE reservations
    SET payment_status = CASE
          WHEN amount_paid_czk > amount_due_czk THEN 'overpaid'
          WHEN amount_due_czk <= 0 THEN 'not_required'
          WHEN amount_paid_czk <= 0 THEN 'unpaid'
          WHEN amount_paid_czk < amount_due_czk THEN 'underpaid'
          ELSE 'paid'
        END
    WHERE member_id = ? AND event_id = ? AND updated_at = ?
  `).bind(auth.uid, event.id, writeToken));
  statements.push(env.DB.prepare(`
    DELETE FROM member_planner_drafts
    WHERE member_id = ? AND event_id = ?
      AND EXISTS (
        SELECT 1 FROM reservations
        WHERE member_id = ? AND event_id = ? AND updated_at = ?
      )
  `).bind(auth.uid, event.id, auth.uid, event.id, writeToken));
  const results = await env.DB.batch(statements);
  if (!results[0]?.meta?.changes) {
    const conflicting = await env.DB.prepare("SELECT id, status FROM reservations WHERE member_id = ? AND event_id = ? LIMIT 1").bind(auth.uid, event.id).first();
    if (conflicting && conflicting.id !== reservationId) {
      const active = ["pending", "approved"].includes(conflicting.status);
      return json({
        ok: false,
        error: active ? "active_reservation_exists" : "reservation_edit_required",
        message: active
          ? "Pro tento event už máš aktivní rezervaci. Otevři ji a uprav existující rezervaci."
          : "Pro tento event už máš uloženou rezervaci. Otevři ji a uprav nebo znovu odešli.",
      }, 409, origin);
    }
    if (option) return accommodationCapacityConflict(option.name, origin);
    return json({ ok: false, error: "registration_closed", message: "Rezervace byly mezitím uzavřeny. Rezervace nebyla uložena." }, 409, origin);
  }

  await ensureReservationPaymentVs(env, reservationId, event.year);
  const reservation = await findCurrentReservation(env, auth.uid, event.id);
  if (!reservation) throw new Error("Reservation was not found after upsert");
  await hydrateReservationAccommodationVisual(env, reservation);

  return json({
    ok: true,
    registrationOpen: true,
    event: publicMemberEvent(event),
    accommodationOptions: await listMemberAccommodationOptions(env, event.id, reservation),
    reservation: publicReservation(reservation),
    message: "Rezervace byla uložena a čeká na schválení.",
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

function validateImageFile(file) {
  if (!file || typeof file !== "object" || typeof file.size !== "number" || typeof file.type !== "string") return "Missing file";
  if (!IMAGE_TYPES.has(file.type)) return "Only JPG, PNG and WEBP are allowed";
  if (file.size < 1 || file.size > MAX_IMAGE_BYTES) return "Image is too large";
  return "";
}
function extensionFor(type) { return type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg"; }

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

function paymentBalanceCzk(amountDueCzk, amountPaidCzk) {
  const due = Math.max(0, Number(amountDueCzk || 0));
  const paid = Math.max(0, Number(amountPaidCzk || 0));
  return due - paid;
}

function paymentStatusFor(amountDueCzk, amountPaidCzk) {
  const due = Math.max(0, Number(amountDueCzk || 0));
  const paid = Math.max(0, Number(amountPaidCzk || 0));
  const balanceCzk = paymentBalanceCzk(due, paid);
  if (balanceCzk < 0) return "overpaid";
  if (balanceCzk === 0) return due === 0 ? "not_required" : "paid";
  return paid > 0 ? "underpaid" : "unpaid";
}

function isPaymentOverdue(deadline, amountDueCzk, amountPaidCzk, now = new Date()) {
  if (!deadline || Number(amountPaidCzk || 0) >= Number(amountDueCzk || 0)) return false;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(String(deadline)) ? `${deadline}T23:59:59Z` : String(deadline);
  const dueDate = new Date(normalized);
  return !Number.isNaN(dueDate.getTime()) && now.getTime() > dueDate.getTime();
}

function spaydDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}${match[2]}${match[3]}` : "";
}

function spaydText(value, maxLength = 60) {
  return clean(value).replace(/\*/g, " ").replace(/\s+/g, " ").slice(0, maxLength);
}

function buildSpayd({ iban, amountCzk, currency = "CZK", variableSymbol, message, deadline }) {
  const normalizedIban = clean(iban).replace(/\s+/g, "").toUpperCase();
  const date = spaydDate(deadline);
  if (!normalizedIban || !/^\d{1,10}$/.test(String(variableSymbol || "")) || Number(amountCzk || 0) <= 0) return null;
  const fields = [
    "SPD", "1.0", `ACC:${normalizedIban}`, `AM:${Number(amountCzk).toFixed(2)}`,
    `CC:${spaydText(currency || "CZK", 3).toUpperCase()}`, `X-VS:${variableSymbol}`,
    `MSG:${spaydText(message)}`,
  ];
  if (date) fields.push(`DT:${date}`);
  return fields.join("*");
}

function reservationPayment(reservation, { admin = false } = {}) {
  if (!reservation) return null;
  const amountDueCzk = Math.max(0, Number(reservation.amount_due_czk || 0));
  const amountPaidCzk = Math.max(0, Number(reservation.amount_paid_czk || 0));
  const balanceCzk = paymentBalanceCzk(amountDueCzk, amountPaidCzk);
  const remainingCzk = Math.max(0, balanceCzk);
  const overpaymentCzk = Math.max(0, -balanceCzk);
  const approved = reservation.status === "approved";
  const revealInstructions = admin || approved;
  const variableSymbol = clean(reservation.payment_vs);
  const messagePrefix = spaydText(reservation.payment_message_prefix);
  const message = [messagePrefix, variableSymbol].filter(Boolean).join(" ");
  const configurationReady = revealInstructions && !!(
    reservation.payment_recipient_name && reservation.payment_account_display &&
    reservation.payment_iban && variableSymbol
  );
  const spayd = configurationReady && approved && remainingCzk > 0
    ? buildSpayd({
        iban: reservation.payment_iban,
        amountCzk: remainingCzk,
        currency: reservation.payment_currency || "CZK",
        variableSymbol,
        message,
        deadline: reservation.payment_deadline,
      })
    : null;
  return {
    amountDueCzk,
    amountPaidCzk,
    balanceCzk,
    remainingCzk,
    overpaymentCzk,
    status: paymentStatusFor(amountDueCzk, amountPaidCzk),
    overdue: approved && isPaymentOverdue(reservation.payment_deadline, amountDueCzk, amountPaidCzk),
    variableSymbol: variableSymbol || null,
    recipientName: revealInstructions ? reservation.payment_recipient_name || null : null,
    accountDisplay: revealInstructions ? reservation.payment_account_display || null : null,
    iban: revealInstructions ? reservation.payment_iban || null : null,
    currency: reservation.payment_currency || "CZK",
    message: revealInstructions ? message || null : null,
    deadline: revealInstructions ? reservation.payment_deadline || null : null,
    testMode: Number(reservation.payment_test_mode) !== 0,
    configurationReady,
    actionable: approved && remainingCzk > 0,
    awaitingApproval: reservation.status === "pending",
    spayd,
    paidAt: reservation.paid_at || null,
  };
}

function randomPaymentSuffix() {
  const range = 1_000_000;
  const limit = Math.floor(0x100000000 / range) * range;
  const values = new Uint32Array(1);
  do crypto.getRandomValues(values); while (values[0] >= limit);
  return String(values[0] % range).padStart(6, "0");
}

async function ensureReservationPaymentVs(env, reservationId, eventYear) {
  const existing = await env.DB.prepare("SELECT payment_vs FROM reservations WHERE id = ? LIMIT 1").bind(reservationId).first();
  if (existing?.payment_vs) return existing.payment_vs;
  const year = String(Math.max(0, Math.min(9999, Number(eventYear || 0)))).padStart(4, "0");
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = `${year}${randomPaymentSuffix()}`;
    const collision = await env.DB.prepare("SELECT id FROM reservations WHERE payment_vs = ? LIMIT 1").bind(candidate).first();
    if (collision) continue;
    try {
      const result = await env.DB.prepare("UPDATE reservations SET payment_vs = ? WHERE id = ? AND payment_vs IS NULL").bind(candidate, reservationId).run();
      if (result?.meta?.changes) return candidate;
    } catch (error) {
      const current = await env.DB.prepare("SELECT payment_vs FROM reservations WHERE id = ? LIMIT 1").bind(reservationId).first();
      if (current?.payment_vs) return current.payment_vs;
      if (!String(error?.message || error).toLowerCase().includes("unique")) throw error;
      continue;
    }
    const current = await env.DB.prepare("SELECT payment_vs FROM reservations WHERE id = ? LIMIT 1").bind(reservationId).first();
    if (current?.payment_vs) return current.payment_vs;
  }
  throw new Error("Unable to allocate a unique payment variable symbol");
}

function publicReservation(reservation) {
  return {
    id: reservation.id,
    eventId: reservation.event_id,
    eventYear: Number(reservation.event_year || 0),
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
    changePending: reservation.status === "pending" && !!reservation.reviewed_at,
    attendanceType: reservation.attendance_type || "",
    accommodationUnits: Number(reservation.accommodation_units || 0),
    accommodationSnapshot: mapAccommodationSnapshot(reservation),
    amountDueCzk: Number(reservation.amount_due_czk || 0),
    amountPaidCzk: Number(reservation.amount_paid_czk || 0),
    payment: reservationPayment(reservation),
    paymentStatus: paymentStatusFor(reservation.amount_due_czk, reservation.amount_paid_czk),
    paidAt: reservation.paid_at || null,
    submittedAt: reservation.submitted_at || null,
    createdAt: reservation.created_at || null,
    updatedAt: reservation.updated_at || null,
  };
}

function mapAccommodationSnapshot(row) {
  if (!row?.accommodation_option_id) return null;
  return {
    optionId: row.accommodation_option_id,
    optionName: row.accommodation_option_name || "",
    kind: row.accommodation_option_kind || "",
    capacityPerUnit: Number(row.accommodation_capacity_per_unit || Math.ceil(Number(row.accommodation_people_count || 0) / Math.max(1, Number(row.accommodation_unit_count || 1))) || 1),
    peopleCount: Number(row.accommodation_people_count || 0),
    unitCount: Number(row.accommodation_unit_count || 0),
    unitPriceCzk: Number(row.accommodation_unit_price_czk || 0),
    personPriceCzk: Number(row.accommodation_person_price_czk || 0),
    beddingFeePerPersonCzk: Number(row.accommodation_bedding_fee_czk || 0),
    cityTaxPerPersonPerNightCzk: Number(row.accommodation_city_tax_czk || 0),
    nights: Number(row.accommodation_nights || 0),
    baseTotalCzk: Number(row.accommodation_base_total_czk || 0),
    personTotalCzk: Number(row.accommodation_person_total_czk || 0),
    beddingTotalCzk: Number(row.accommodation_bedding_total_czk || 0),
    cityTaxTotalCzk: Number(row.accommodation_city_tax_total_czk || 0),
    totalCzk: Number(row.accommodation_total_czk || 0),
    visual: row.accommodation_visual || { hasCustomPhoto: false, imageUrl: null, version: null },
  };
}

function publicMemberEvent(event) {
  return {
    id: event.id,
    year: Number(event.year || 0),
    registrationStatus: event.registration_status || "closed",
    fullWeekendNights: Number(event.full_weekend_nights ?? 2),
    saturdayOnlyNights: Number(event.saturday_only_nights ?? 1),
  };
}

function calculateAccommodationPricing(event, option, peopleCount, attendanceType) {
  const capacityPerUnit = Math.max(1, Number(option.capacity_per_unit || 1));
  const unitCount = Math.ceil(peopleCount / capacityPerUnit);
  const nights = attendanceType === "full_weekend"
    ? Number(event.full_weekend_nights ?? 2)
    : attendanceType === "saturday_only" ? Number(event.saturday_only_nights ?? 1) : 0;
  const unitPriceCzk = Number(option.unit_price_czk || 0);
  const personPriceCzk = Number(option.person_price_czk || 0);
  const beddingFeePerPersonCzk = Number(option.bedding_fee_per_person_czk || 0);
  const cityTaxPerPersonPerNightCzk = Number(option.city_tax_per_person_per_night_czk || 0);
  const baseTotalCzk = unitCount * unitPriceCzk * nights;
  const personTotalCzk = peopleCount * personPriceCzk;
  const beddingTotalCzk = peopleCount * beddingFeePerPersonCzk;
  const cityTaxTotalCzk = peopleCount * nights * cityTaxPerPersonPerNightCzk;
  return {
    unitCount,
    nights,
    unitPriceCzk,
    personPriceCzk,
    beddingFeePerPersonCzk,
    cityTaxPerPersonPerNightCzk,
    baseTotalCzk,
    personTotalCzk,
    beddingTotalCzk,
    cityTaxTotalCzk,
    totalCzk: baseTotalCzk + personTotalCzk + beddingTotalCzk + cityTaxTotalCzk,
  };
}

function accommodationCapacityConflict(name, origin, message = "") {
  return json({
    ok: false,
    error: "accommodation_capacity_exceeded",
    message: message || `${name} už bohužel nemá dost volné kapacity pro tvoji posádku. Vyber jinou možnost.`,
  }, 409, origin);
}

function createWriteToken() {
  return `${new Date().toISOString()}-${crypto.randomUUID()}`;
}

export {
  MAX_RESERVATION_CREW,
  PLANNER_CLOCK_SKEW_MS,
  adminGalleryMedia,
  bootstrapMember,
  buildSpayd,
  calculateAccommodationPricing,
  completeMemberHistory,
  createAdminAccommodation,
  createCar,
  deleteAdminAccommodationPhoto,
  deleteCar,
  deletePlannerDraft,
  deriveMemberRating,
  deriveUnitedAchievements,
  ensureReservationPaymentVs,
  getAdminAccommodation,
  getAdminEvents,
  getAdminGallery,
  getAdminHistoryClaims,
  getAdminHistoryCounts,
  getAdminOverview,
  getAdminReservations,
  getCurrentReservation,
  getMember,
  getMemberNavigationState,
  getPlannerDraft,
  getPublicCurrentEvent,
  getUnitedClub,
  historyEvidenceMedia,
  isPaymentOverdue,
  listCars,
  listMyGallery,
  patchAdminAccommodation,
  patchAdminEvent,
  patchAdminGallery,
  patchAdminHistoryClaim,
  patchAdminReservation,
  patchAdminReservationPayment,
  paymentBalanceCzk,
  paymentStatusFor,
  privateCarMedia,
  privateMemberGalleryMedia,
  publicAccommodationMedia,
  publicGalleryList,
  publicGalleryMedia,
  putAdminAccommodationPhoto,
  putCurrentReservation,
  putPlannerDraft,
  replaceCarPhoto,
  reservationPayment,
  setPrimaryCar,
  submitHistoryClaim,
  updateCar,
  uploadCarPhoto,
  uploadGallerySubmission,
  validatePlannerDraft,
};
