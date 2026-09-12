import { reservationListQuery, reservationFilterSql } from '../../admin/lists.js';
import { getCurrentEvent, getRequestedAdminEvent, publicAdminEvent } from "../events.js";
import { json } from "../../http/responses.js";
import { clean } from "../../utils/text.js";
import {
  accommodationCapacityConflict,
  hydrateReservationAccommodationVisual,
  listMemberAccommodationOptions,
} from "./capacity.js";
import { ensureReservationPaymentVs, paymentStatusFor, reservationPayment } from "./payments.js";
import { calculateAccommodationPricing, mapAccommodationSnapshot } from "./pricing.js";
import { linkPlannerReservation } from '../planner/funnel.js';
import { attachAdminReservationContext, attachMemberReservationRequest, requestView } from './requests.js';

const MAX_RESERVATION_CREW = 5;

async function getAdminReservations(env, url, origin) {
  const event = await getRequestedAdminEvent(env, url);
  if (!event) {
    if (clean(url.searchParams.get("eventId"))) {
      return json({ ok: false, error: "event_not_found", message: "Event nebyl nalezen." }, 404, origin);
    }
    return json({ ok: true, event: null, reservations: [] }, 200, origin);
  }

  const page = reservationListQuery(url);
  const detailOnly=env.ADMIN_READ && !!url.searchParams.get("id") && url.searchParams.get("projection")==="detail";
  const commandDetail=detailOnly&&url.searchParams.get('presentation')==='command';
  const workflowProjection=env.ADMIN_READ&&url.searchParams.get('include')==='workflow';
  const workflowDetail=commandDetail&&workflowProjection;
  const order="CASE r.status WHEN 'pending' THEN 0 WHEN 'rejected' THEN 1 WHEN 'approved' THEN 2 ELSE 3 END, r.submitted_at DESC, r.updated_at DESC, r.id";
  const query = `
    WITH ${env.ADMIN_READ ? `requested AS MATERIALIZED (
      SELECT r.* FROM reservations r
      JOIN members m ON m.id=r.member_id JOIN events e ON e.id=r.event_id
      WHERE r.event_id=? AND ${page.where}
      ORDER BY ${order} LIMIT ? OFFSET ?
    ),` : ''} approved_usage AS MATERIALIZED (
      SELECT a.option_id,SUM(a.unit_count) AS units
      FROM reservation_accommodation a JOIN reservations approved ON approved.id=a.reservation_id
      WHERE approved.status='approved'
      ${env.ADMIN_READ ? "AND a.option_id IN (SELECT a.option_id FROM requested p JOIN reservation_accommodation a ON a.reservation_id=p.id WHERE p.status='pending')" : ''}
      GROUP BY a.option_id
    )
    SELECT
      r.id, r.member_id, r.event_id, r.car_id, r.car_model, r.car_body, r.car_year, r.car_color, r.car_nickname,
      r.attendance_type, r.arrival, r.crew, r.accommodation, r.accommodation_units,
      r.show_shine, r.note, r.status, r.payment_status, r.payment_vs, r.paid_at,
      r.amount_due_czk, r.amount_paid_czk,
      ${workflowProjection?`rr.id AS request_id,rr.request_type,rr.status AS request_status,rr.original_json AS request_original_json,
      rr.proposed_json AS request_proposed_json,rr.member_note AS request_member_note,rr.admin_comment AS request_admin_comment,
      rr.created_at AS request_created_at,rr.updated_at AS request_updated_at,rr.decided_at AS request_decided_at,rr.decided_by AS request_decided_by,
      `:''}${env.ADMIN_READ ? "COALESCE((SELECT revision FROM admin_resource_versions WHERE resource_type='reservation' AND resource_id=r.id),0)" : '0'} AS admin_revision,
      r.submitted_at, r.updated_at, r.reviewed_at, r.review_note,
      ${commandDetail?`EXISTS(SELECT 1 FROM member_qr_identities q WHERE q.member_id=r.member_id) AS qr_issued,
      (SELECT p.id FROM car_photos p JOIN cars c ON c.id=p.car_id WHERE c.id=r.car_id AND c.member_id=r.member_id ORDER BY p.sort_order,p.id LIMIT 1) AS selected_photo_id,
      `:''}e.year AS event_year, e.currency AS payment_currency, e.payment_deadline,
      e.payment_recipient_name, e.payment_account_display, e.payment_iban,
      e.payment_message_prefix, e.payment_test_mode,
      ra.option_id AS accommodation_option_id,
      ra.option_name AS accommodation_option_name,
      ra.kind AS accommodation_option_kind,
      ao.capacity_per_unit AS accommodation_capacity_per_unit,
      CASE
        WHEN r.status = 'pending' AND ao.inventory_mode = 'limited' AND
          ra.unit_count + COALESCE((SELECT units FROM approved_usage WHERE option_id=ra.option_id),0) > ao.units_total
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
    FROM ${env.ADMIN_READ ? 'requested' : 'reservations'} r
    JOIN members m ON m.id = r.member_id
    JOIN events e ON e.id = r.event_id
    LEFT JOIN reservation_accommodation ra ON ra.reservation_id = r.id
    LEFT JOIN event_accommodation_options ao ON ao.id = ra.option_id
    ${workflowProjection?"LEFT JOIN reservation_requests rr ON rr.reservation_id=r.id AND rr.status='pending'\n    ":''}${env.ADMIN_READ ? '' : 'WHERE r.event_id = ?'}
    ORDER BY
      CASE r.status WHEN 'pending' THEN 0 WHEN 'rejected' THEN 1 WHEN 'approved' THEN 2 ELSE 3 END,
      r.submitted_at DESC,
      r.updated_at DESC, r.id

  `;
  let rows, pagination, counts;
  if(detailOnly){
    // The source drawer does not consume event-wide list facets. Legacy/default
    // responses retain them; only this explicit read projection omits the scans.
    rows=await env.DB.prepare(query).bind(event.id,...page.bindings,page.pageSize,0).all();
    const total=rows.results.length;
    pagination={page:1,pageSize:page.pageSize,total,totalPages:1};
  }else if(env.ADMIN_READ){
    const base="FROM reservations r JOIN members m ON m.id=r.member_id JOIN events e ON e.id=r.event_id WHERE r.event_id=?";
    const tabs=['all','action','active','complete','pending','approved','rejected','cancelled','payment','unpaid','underpaid','paid','overpaid','attention'];
    const results=await env.DB.batch([
      env.DB.prepare(query).bind(event.id,...page.bindings,page.pageSize,(page.page-1)*page.pageSize),
      env.DB.prepare(`SELECT COUNT(*) total ${base} AND ${page.where}`).bind(event.id,...page.bindings),
      env.DB.prepare('SELECT '+tabs.map(key=>`COUNT(CASE WHEN ${reservationFilterSql(key,key==='attention')} THEN 1 END) AS "${key}"`).join(',')+' '+base).bind(event.id),
    ]);
    rows=results[0];const total=Number(results[1].results[0].total);counts=results[2].results[0];
    pagination={page:page.page,pageSize:page.pageSize,total,totalPages:Math.max(1,Math.ceil(total/page.pageSize))};
  }else rows=await env.DB.prepare(query).bind(event.id).all();

  for (const reservation of rows.results || []) {
    if (!env.ADMIN_READ && !reservation.payment_vs) reservation.payment_vs = await ensureReservationPaymentVs(env, reservation.id, reservation.event_year);
    if(workflowProjection&&reservation.request_id)reservation.admin_requests=[requestView({
      id:reservation.request_id,reservation_id:reservation.id,request_type:reservation.request_type,status:reservation.request_status,
      original_json:reservation.request_original_json,proposed_json:reservation.request_proposed_json,member_note:reservation.request_member_note,
      admin_comment:reservation.request_admin_comment,created_at:reservation.request_created_at,updated_at:reservation.request_updated_at,
      decided_at:reservation.request_decided_at,decided_by:reservation.request_decided_by,
    })];
  }
  const visualCache = new Map();
  await Promise.all((rows.results || []).map(reservation => hydrateReservationAccommodationVisual(env, reservation, visualCache)));
  if(workflowDetail)await Promise.all((rows.results||[]).map(reservation=>attachAdminReservationContext(env,reservation)));

  return json({
    ok: true,
    event: publicAdminEvent(event),
    reservations: (rows.results || []).map(row=>({...publicAdminReservation(row),...(commandDetail?{reviewContext:{version:1,qrIssued:!!row.qr_issued,
      selectedCarPhoto:row.selected_photo_id?`/api/admin/members/${encodeURIComponent(row.member_id)}/media/cars/${encodeURIComponent(row.car_id)}/${encodeURIComponent(row.selected_photo_id)}`:null}}:{})})),
    ...(env.ADMIN_READ?{pagination,counts,context:{eventId:event.id,sourceType:'reservation'},freshness:{generatedAt:new Date().toISOString(),businessUpdatedAt:null,consistency:detailOnly?'primary-detail':'primary-batch-list-and-total'}}:{}),
  }, 200, origin);
}

function publicAdminReservation(reservation) {
  return {
    id: reservation.id,
    eventId: reservation.event_id,
    revision: Number(reservation.admin_revision || 0),
    sourceType: 'reservation', sourceId: reservation.id, memberId: reservation.member_id,
    member: {
      id: reservation.member_id,
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
    changePending: reservation.status === "pending" && !!reservation.reviewed_at || reservation.admin_requests?.some(item=>item.status==='pending'&&item.type==='change') || false,
    cancellationPending: reservation.admin_requests?.some(item=>item.status==='pending'&&item.type==='cancellation')||false,
    paymentStatus: paymentStatusFor(reservation.amount_due_czk, reservation.amount_paid_czk),
    amountDueCzk: Number(reservation.amount_due_czk || 0),
    amountPaidCzk: Number(reservation.amount_paid_czk || 0),
    submittedAt: reservation.submitted_at || null,
    updatedAt: reservation.updated_at || null,
    reviewedAt: reservation.reviewed_at || null,
    reviewNote: reservation.review_note || "",
    ...(Object.hasOwn(reservation,'member_comment')?{memberComment:reservation.member_comment||''}:{}),
    requests: reservation.admin_requests || [],
    history: reservation.admin_history || [],
    payment: reservationPayment(reservation, { admin: true }),
  };
}

async function findCurrentReservation(env, memberId, eventId) {
  return await env.DB.prepare(`
    SELECT
      r.id, r.member_id, r.event_id, r.car_id,
      r.car_model, r.car_body, r.car_year, r.car_color, r.car_nickname,
      r.arrival, r.crew, r.accommodation, r.show_shine, r.note, r.status,
      r.attendance_type, r.accommodation_units,
      r.amount_due_czk, r.amount_paid_czk, r.payment_status, r.payment_vs,
      r.paid_at, r.submitted_at, r.created_at, r.updated_at, r.reviewed_at, r.review_note,
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
      r.paid_at, r.submitted_at, r.created_at, r.updated_at, r.reviewed_at, r.review_note,
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
    if (reservation) { await hydrateReservationAccommodationVisual(env, reservation); await attachMemberReservationRequest(env,reservation); }
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
  if (reservation) { await hydrateReservationAccommodationVisual(env, reservation); await attachMemberReservationRequest(env,reservation); }
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
  if(existing?.status==='approved')return json({ok:false,error:'reservation_change_request_required',message:'Schválenou rezervaci změň přes žádost o změnu.'},409,origin);
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
  let conversionDraft=null;
  if(body.plannerDraftId){
    try{
      const row=await env.DB.prepare('SELECT payload_json FROM member_planner_drafts WHERE member_id=? AND event_id=? AND draft_id=?').bind(auth.uid,event.id,body.plannerDraftId).first();
      conversionDraft=row?JSON.parse(row.payload_json):null;
    }catch{console.warn('planner_conversion_draft_unavailable')}
  }
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
  await linkPlannerReservation(env, { draftId: body.plannerDraftId, uid: auth.uid, eventId: event.id, reservationId: reservation.id, ownedDraft: conversionDraft });
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
    changePending: reservation.status === "pending" && !!reservation.reviewed_at || reservation.member_request?.status==='pending'&&reservation.member_request?.type==='change' || false,
    cancellationPending: reservation.member_request?.status==='pending'&&reservation.member_request?.type==='cancellation' || false,
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
    memberComment: reservation.member_comment || "",
    request: reservation.member_request || null,
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

function createWriteToken() {
  return `${new Date().toISOString()}-${crypto.randomUUID()}`;
}

export {
  MAX_RESERVATION_CREW,
  createWriteToken,
  getAdminReservations,
  getCurrentReservation,
  publicAdminReservation,
  putCurrentReservation,
};
