// One rule for both jury work and the own-car public-vote exception.
// The same SQL is also used inside writes: a revoked role cannot win a read/write race.
export const JUDGE_SQL = `SELECT 1 FROM members m WHERE m.id=? AND m.status='active'
  AND (m.role='admin' OR EXISTS(SELECT 1 FROM event_live_judges j WHERE j.event_id=? AND j.member_id=m.id))`;
export async function isEventJudge(env, memberId, eventId) {
  return !!await env.DB.prepare(JUDGE_SQL).bind(memberId, eventId).first();
}
