export async function requireAdmin(env, auth) {
  const member = await env.DB.prepare(`
    SELECT id, role, status
    FROM members
    WHERE id = ?
  `).bind(auth.uid).first();

  return member?.role === "admin" && member?.status === "active" ? member : null;
}
