import { json } from "../http/responses.js";
import { clean } from "../utils/text.js";

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

export {
  getAdminEvents,
  getCurrentEvent,
  getEventById,
  getRequestedAdminEvent,
  publicAdminEvent,
};
