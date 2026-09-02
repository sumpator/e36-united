import { clean } from "../../utils/text.js";

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

export {
  buildSpayd,
  ensureReservationPaymentVs,
  findReservationPayment,
  isPaymentOverdue,
  paymentBalanceCzk,
  paymentStatusFor,
  reservationPayment,
};
