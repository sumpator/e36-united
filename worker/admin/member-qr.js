// Pseudonymous identification only. Never a credential, entitlement or event ticket.
export const MEMBER_QR_PREFIX = 'E36U1:';
export function newMemberQrToken() {
  return [...crypto.getRandomValues(new Uint8Array(24))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
export function parseMemberQr(payload) {
  return typeof payload === 'string' && /^E36U1:[a-f0-9]{48}$/.test(payload||'') ? payload.slice(MEMBER_QR_PREFIX.length) : null;
}
export function memberQrInsert(env, memberId) {
  return env.DB.prepare('INSERT INTO member_qr_identities(member_id,token) VALUES (?,?) ON CONFLICT(member_id) DO NOTHING').bind(memberId,newMemberQrToken());
}
// Explicit one-time provisioning boundary, NOT called by a read/login/refresh.
// A later production rollout must authorize this separately after the forward migration.
export async function provisionMemberQrBatch(env, limit=100) {
  const rows=await env.DB.prepare('SELECT m.id FROM members m LEFT JOIN member_qr_identities q ON q.member_id=m.id WHERE q.member_id IS NULL ORDER BY m.id LIMIT ?').bind(Math.min(100,Math.max(1,limit))).all();
  if(rows.results.length)await env.DB.batch(rows.results.map(row=>memberQrInsert(env,row.id)));
  return {provisioned:rows.results.length};
}
