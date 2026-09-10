// Page-bounded projection: independent subqueries avoid multiplying requests by photos.
// Uses existing owner indexes and the same primary/photo ordering as Member 360.
export function memberCardsSql(size){
  return `SELECT m.id AS memberId,
    (SELECT COUNT(*) FROM united_history_claims h WHERE h.member_id=m.id AND h.attendance_status='approved') AS attendances,
    (SELECT COUNT(*) FROM reservations r WHERE r.member_id=m.id AND r.event_id=? AND r.status='pending') AS reservationPending,
    (SELECT r.status FROM reservations r WHERE r.member_id=m.id AND r.event_id=? ORDER BY r.created_at DESC,r.id LIMIT 1) AS reservationStatus,
    (SELECT COUNT(*) FROM united_history_claims h WHERE h.member_id=m.id AND h.attendance_status='pending') AS attendancePending,
    (SELECT COUNT(*) FROM united_history_claims h WHERE h.member_id=m.id AND h.sns_status='pending') AS snsPending,
    (SELECT COUNT(*) FROM gallery_submissions g WHERE g.member_id=m.id AND g.status='pending') AS photoPending,
    c.id AS carId,p.id AS photoId,p.created_at AS photoVersion
    FROM members m
    LEFT JOIN cars c ON c.id=(SELECT id FROM cars WHERE member_id=m.id AND is_primary=1 ORDER BY created_at,id LIMIT 1)
    LEFT JOIN car_photos p ON p.id=(SELECT id FROM car_photos WHERE car_id=c.id ORDER BY sort_order,id LIMIT 1)
    WHERE m.id IN (${Array(size).fill('?').join(',')})`;
}
export async function memberCardSummaries(env,ids,eventId){
  ids=[...new Set(ids)].filter(id=>/^[a-z0-9_-]{1,128}$/i.test(id||''));
  if(!ids.length)return new Map();
  const {results=[]}=await env.DB.prepare(memberCardsSql(ids.length)).bind(eventId||'',eventId||'',...ids).all();
  return new Map(results.map(r=>[r.memberId,{
    attendances:Number(r.attendances),eventId:eventId||null,
    reservationStatus:eventId?r.reservationStatus||null:undefined,
    pending:{reservations:eventId?Number(r.reservationPending):null,attendance:Number(r.attendancePending),sns:Number(r.snsPending),photos:Number(r.photoPending)},
    photo:r.photoId?{id:r.photoId,version:r.photoVersion,mediaPath:`/api/admin/members/${encodeURIComponent(r.memberId)}/media/cars/${encodeURIComponent(r.carId)}/${encodeURIComponent(r.photoId)}`} :null,
  }]));
}
