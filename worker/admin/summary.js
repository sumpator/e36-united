import { json } from '../http/responses.js';
import { publicAdminEvent } from '../domains/events.js';

// All related operational metrics share ONE SQLite statement/snapshot on the D1 primary.
// No VS allocation, onboarding, Points, provider call or other read-side mutation.
export const ADMIN_SUMMARY_SQL = `
WITH selected AS (
  SELECT *, COALESCE((SELECT revision FROM admin_resource_versions WHERE resource_type='event-settings' AND resource_id='*'),0) AS admin_revision,
    COALESCE((SELECT revision FROM admin_resource_versions WHERE resource_type='accommodation-catalog' AND resource_id=events.id),0) AS accommodation_revision
  FROM events WHERE id = COALESCE(NULLIF(?, ''), (SELECT id FROM events ORDER BY is_current DESC, year DESC LIMIT 1))
), r AS (
 SELECT reservations.*,
   (status='approved' AND amount_due_czk>amount_paid_czk AND
    (SELECT payment_deadline FROM selected) IS NOT NULL AND
    julianday(CASE WHEN length((SELECT payment_deadline FROM selected))=10 THEN (SELECT payment_deadline FROM selected)||'T23:59:59Z' ELSE (SELECT payment_deadline FROM selected) END)<julianday(?)) AS overdue
 FROM reservations WHERE event_id=(SELECT id FROM selected)
), occupancy AS (
 SELECT o.id, o.name, o.kind, o.inventory_mode, o.units_total, o.capacity_per_unit,
   COALESCE(SUM(CASE WHEN r.status='approved' THEN a.unit_count ELSE 0 END),0) AS confirmed,
   COALESCE(SUM(CASE WHEN r.status='pending' THEN a.unit_count ELSE 0 END),0) AS pending,
   COALESCE(SUM(CASE WHEN r.status='approved' THEN a.people_count ELSE 0 END),0) AS people
 FROM event_accommodation_options o LEFT JOIN reservation_accommodation a ON a.option_id=o.id LEFT JOIN r ON r.id=a.reservation_id
 WHERE o.event_id=(SELECT id FROM selected) GROUP BY o.id
), metrics AS (
 SELECT COALESCE(SUM(status IN ('pending','approved')),0) AS reservations,
 COALESCE(SUM(CASE WHEN status IN ('pending','approved') THEN crew ELSE 0 END),0) AS people,
 COALESCE(COUNT(DISTINCT CASE WHEN status IN ('pending','approved') THEN car_id END),0) AS cars,
 COALESCE(SUM(status='pending'),0) AS status_pending,
 COALESCE(SUM(status='approved'),0) AS status_approved,
 COALESCE(SUM(status='rejected'),0) AS status_rejected,
 COALESCE(SUM(status='cancelled'),0) AS status_cancelled,
 COALESCE(SUM(status='draft'),0) AS status_draft,
 COALESCE(SUM(status IN ('pending','approved') AND attendance_type='full_weekend'),0) AS attendance_full_weekend,
 COALESCE(SUM(status IN ('pending','approved') AND attendance_type='saturday_only'),0) AS attendance_saturday_only,
 COALESCE(SUM(status IN ('pending','approved') AND attendance_type='day_visit'),0) AS attendance_day_visit,
 COALESCE(SUM(status IN ('pending','approved') AND show_shine='Ano'),0) AS show_yes,
 COALESCE(SUM(status IN ('pending','approved') AND show_shine='Ne'),0) AS show_no,
 COALESCE(SUM(status IN ('pending','approved') AND show_shine='Možná'),0) AS show_maybe,
 COALESCE(SUM(CASE WHEN status IN ('pending','approved') THEN amount_due_czk ELSE 0 END),0) AS amount_due,
 COALESCE(SUM(amount_paid_czk),0) AS amount_paid,
 COALESCE(SUM(CASE WHEN status IN ('pending','approved') THEN amount_paid_czk ELSE 0 END),0) AS active_paid,
 COALESCE(SUM(CASE WHEN status NOT IN ('pending','approved') THEN amount_paid_czk ELSE 0 END),0) AS inactive_paid,
 COALESCE(SUM(CASE WHEN status IN ('pending','approved') THEN MAX(amount_due_czk-amount_paid_czk,0) ELSE 0 END),0) AS remaining,
 COALESCE(SUM(CASE WHEN status IN ('pending','approved') THEN MIN(amount_due_czk,amount_paid_czk) ELSE 0 END),0) AS applied,
 COALESCE(SUM(MAX(amount_paid_czk-amount_due_czk,0)),0) AS overpayments,
 COALESCE(SUM(amount_due_czk>0 AND amount_paid_czk=0),0) AS pay_unpaid,
 COALESCE(SUM(amount_paid_czk>0 AND amount_paid_czk<amount_due_czk),0) AS pay_underpaid,
 COALESCE(SUM(amount_due_czk>0 AND amount_paid_czk=amount_due_czk),0) AS pay_paid,
 COALESCE(SUM(amount_paid_czk>amount_due_czk),0) AS pay_overpaid,
 COALESCE(SUM(amount_paid_czk=0 AND amount_due_czk=0),0) AS pay_none,
 COALESCE(SUM(overdue),0) AS pay_overdue,
 COALESCE(SUM(overdue OR amount_paid_czk>amount_due_czk),0) AS payment_attention,
 COALESCE(SUM(status='pending' OR overdue OR amount_paid_czk>amount_due_czk),0) AS reservation_attention,
 COALESCE(SUM(status IN ('pending','approved') AND accommodation_units>0 AND NOT EXISTS(SELECT 1 FROM reservation_accommodation ra WHERE ra.reservation_id=r.id)),0) AS legacy_allocations,
 COALESCE(SUM(status IN ('pending','approved') AND accommodation='Bez ubytování'),0) AS no_accommodation
 FROM r
)
SELECT
 metrics.reservations,
 metrics.people,
 metrics.cars,
 metrics.status_pending,
 metrics.status_approved,
 metrics.status_rejected,
 metrics.status_cancelled,
 metrics.status_draft,
 metrics.attendance_full_weekend,
 metrics.attendance_saturday_only,
 metrics.attendance_day_visit,
 metrics.show_yes,
 metrics.show_no,
 metrics.show_maybe,
 metrics.amount_due,
 metrics.amount_paid,
 metrics.active_paid,
 metrics.inactive_paid,
 metrics.remaining,
 metrics.applied,
 metrics.overpayments,
 metrics.pay_unpaid,
 metrics.pay_underpaid,
 metrics.pay_paid,
 metrics.pay_overpaid,
 metrics.pay_none,
 metrics.pay_overdue,
 metrics.payment_attention,
 metrics.reservation_attention,
 metrics.legacy_allocations,
 metrics.no_accommodation,
 (SELECT json_object('id',id,'year',year,'registration_status',registration_status,'is_current',is_current,'accommodation_capacity',accommodation_capacity,'reservation_capacity',reservation_capacity,'full_weekend_nights',full_weekend_nights,'saturday_only_nights',saturday_only_nights,'booking_commitment_czk',booking_commitment_czk,'booking_due_at',booking_due_at,'booking_paid_czk',booking_paid_czk,'event_end_at',event_end_at,'venue_name',venue_name,'currency',currency,'payment_deadline',payment_deadline,'payment_test_mode',payment_test_mode,'admin_revision',admin_revision,'accommodation_revision',accommodation_revision) FROM selected) AS event_json,
 (SELECT json_group_array(json_object('id',id,'name',name,'kind',kind,'inventoryMode',inventory_mode,'unitsTotal',CASE WHEN inventory_mode='limited' THEN units_total ELSE NULL END,'capacityPerUnit',capacity_per_unit,'confirmedUnits',confirmed,'pendingUnits',pending,'confirmedPeople',people)) FROM occupancy) AS occupancy_json,
 (SELECT json_object('pending',COUNT(CASE WHEN status='pending' THEN 1 END),'approved',COUNT(CASE WHEN status='approved' THEN 1 END),'rejected',COUNT(CASE WHEN status='rejected' THEN 1 END),'total',COUNT(*),'oldestPendingAt',MIN(CASE WHEN status='pending' THEN created_at END)) FROM gallery_submissions) AS gallery_json,
 (SELECT json_object('attendancePending',COUNT(CASE WHEN attendance_status='pending' THEN 1 END),'snsPending',COUNT(CASE WHEN sns_status='pending' THEN 1 END),'pending',COUNT(CASE WHEN attendance_status='pending' OR sns_status='pending' THEN 1 END),'total',COUNT(*),'oldestPendingAt',MIN(CASE WHEN attendance_status='pending' OR sns_status='pending' THEN submitted_at END)) FROM united_history_claims) AS history_json,
 (SELECT COUNT(*) FROM members) AS members,
 (SELECT COUNT(*) FROM members WHERE status='active') AS active_members,
 (SELECT COUNT(*) FROM member_onboarding o WHERE member_profile_created_at IS NULL AND NOT EXISTS(SELECT 1 FROM members m WHERE m.id=o.firebase_uid)) AS incomplete
FROM metrics
`;

// One bounded event query extends the accepted Stage 2 summary without loading a queue.
// The unique pending-request index prevents duplicate request rows for one reservation.
export const ADMIN_RESERVATION_APPROVALS_SQL = `
SELECT
  COUNT(CASE WHEN r.status='pending' AND pending_request.id IS NULL THEN 1 END) AS approval_new,
  COUNT(CASE WHEN pending_request.request_type='change' THEN 1 END) AS approval_changes,
  COUNT(CASE WHEN pending_request.request_type='cancellation' THEN 1 END) AS approval_cancellations,
  COUNT(CASE WHEN r.status='pending' OR pending_request.id IS NOT NULL THEN 1 END) AS approval_total,
  COUNT(CASE WHEN r.status='pending' OR pending_request.id IS NOT NULL OR r.amount_paid_czk>r.amount_due_czk OR
    (r.status='approved' AND r.amount_due_czk>r.amount_paid_czk AND e.payment_deadline IS NOT NULL AND
      julianday(CASE WHEN length(e.payment_deadline)=10 THEN e.payment_deadline||'T23:59:59Z' ELSE e.payment_deadline END)<julianday(?))
    THEN 1 END) AS attention_total
FROM reservations r
JOIN events e ON e.id=r.event_id
LEFT JOIN reservation_requests pending_request
  ON pending_request.reservation_id=r.id AND pending_request.status='pending'
WHERE r.event_id=COALESCE(NULLIF(?,''),(SELECT id FROM events ORDER BY is_current DESC,year DESC LIMIT 1))
`;

export async function getAdminSummary(env, url, origin, now = new Date()) {
  const eventId = url.searchParams.get('eventId') || '';
  if (eventId && !/^[a-z0-9_-]{1,128}$/i.test(eventId)) return json({error:'invalid_event'},400,origin);
  const [summaryResult,approvalResult] = await env.DB.batch([
    env.DB.prepare(ADMIN_SUMMARY_SQL).bind(eventId, now.toISOString()),
    env.DB.prepare(ADMIN_RESERVATION_APPROVALS_SQL).bind(now.toISOString(),eventId),
  ]);
  const row=summaryResult.results?.[0]||{},approval=approvalResult.results?.[0]||{};
  const event = JSON.parse(row.event_json || 'null');
  if (!event && eventId) return json({error:'event_not_found'},404,origin);
  const occupancy = JSON.parse(row.occupancy_json || '[]');
  const gallery = JSON.parse(row.gallery_json), history = JSON.parse(row.history_json);
  const n = key => Number(row[key] || 0);
  const sum = (key, kind) => occupancy.filter(item=>!kind||item.kind===kind).reduce((total,item)=>total+item[key],0);
  const payments = { paid:n('pay_paid'),unpaid:n('pay_unpaid'),underpaid:n('pay_underpaid'),overpaid:n('pay_overpaid'),
    notRequired:n('pay_none'),overdue:n('pay_overdue'),amountDueCzk:n('amount_due'),amountPaidCzk:n('amount_paid'),
    activePaidCzk:n('active_paid'),inactivePaidCzk:n('inactive_paid'),appliedToActiveCzk:n('applied'),
    amountRemainingCzk:n('remaining'),overpaymentCzk:n('overpayments') };
  return json({ok:true,event:publicAdminEvent(event),
    context:{eventId:event?.id||null,communityScope:'global',financeSource:'reservation'},
    freshness:{generatedAt:now.toISOString(),businessUpdatedAt:null,consistency:'single-primary-batch'},
    overview:{reservations:n('reservations'),people:n('people'),cars:n('cars'),
      statuses:Object.fromEntries(['pending','approved','rejected','cancelled','draft'].map(status=>[status,n('status_'+status)])),
      attendance:{fullWeekend:n('attendance_full_weekend'),saturdayOnly:n('attendance_saturday_only'),dayVisit:n('attendance_day_visit')},
      showShine:{yes:n('show_yes'),no:n('show_no'),maybe:n('show_maybe')},
      accommodation:{units:sum('confirmedUnits'),pendingUnits:sum('pendingUnits'),confirmedPeople:sum('confirmedPeople'),
        none:n('no_accommodation'),cabin:sum('confirmedUnits','cabin'),tent:sum('confirmedUnits','tent'),legacyUnclassified:n('legacy_allocations'),
        limitedUnitsTotal:occupancy.filter(item=>item.unitsTotal!==null).reduce((total,item)=>total+item.unitsTotal,0),
        hasUnlimited:occupancy.some(item=>item.unitsTotal===null),options:occupancy},
      payments,gallery,history},
    community:{members:n('members'),activeMembers:n('active_members'),incompleteObserved:n('incomplete')},
    attention:{reservations:Number(approval.attention_total||0),payments:n('payment_attention'),gallery:gallery.pending,history:history.pending,
      reservationApprovals:{newReservations:Number(approval.approval_new||0),changes:Number(approval.approval_changes||0),cancellations:Number(approval.approval_cancellations||0),total:Number(approval.approval_total||0)}},
  },200,origin);
}
