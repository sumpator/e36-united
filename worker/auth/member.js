import { json } from "../http/responses.js";

export const ACTIVE_MEMBER_STATUS = "active";

export async function findMemberAuthorizationRecord(env, auth) {
  return await env.DB.prepare(`
    SELECT id, member_code, role, status
    FROM members
    WHERE id = ?
    LIMIT 1
  `).bind(auth.uid).first();
}

export async function requireActiveMember(env, auth) {
  const member = await findMemberAuthorizationRecord(env, auth);
  return member?.status === ACTIVE_MEMBER_STATUS ? member : null;
}

export function activeMemberForbidden(origin) {
  return json({
    ok: false,
    error: "active_member_required",
    message: "Aktivní členství je vyžadováno.",
  }, 403, origin);
}
