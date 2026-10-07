// Historical budget evidence stays frozen. These explicit projection additions
// were approved for LIVE/event identity and the arrivals price model; joins,
// predicates, ordering and pagination must still match the accepted baseline.
export const normalizeSql = sql => sql.replace(/\s+/g, ' ').trim();
export function currentBudgetSql(sql) {
  return normalizeSql(sql)
    .replace('SELECT id, year, registration_status', 'SELECT id, year, title, registration_status')
    .replace('is_current, COALESCE((SELECT', 'is_current, COALESCE(live_enabled,0) AS live_enabled, COALESCE((SELECT')
    .replace('full_weekend_nights, saturday_only_nights, booking_commitment_czk', 'full_weekend_nights, saturday_only_nights, admission_registered_czk, admission_onsite_czk, booking_commitment_czk')
    .replace('r.paid_at, r.amount_due_czk', 'r.paid_at, r.admission_czk, r.amount_due_czk');
}
export const MEMBER_ARRIVALS_SQL = "SELECT a.id,a.model,a.plate,a.arrived_at arrivedAt,a.crew,a.services_czk+CASE WHEN a.free_reason IS NULL THEN a.admission_czk ELSE 0 END due,COALESCE((SELECT SUM(p.amount_czk) FROM event_payments p WHERE (a.reservation_id IS NOT NULL AND p.reservation_id=a.reservation_id) OR (a.reservation_id IS NULL AND p.arrival_id=a.id)),0) paid FROM event_arrivals a WHERE a.member_id=? AND a.event_id=? ORDER BY a.arrived_at DESC";
