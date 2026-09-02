import { json } from "../http/responses.js";
import { clean } from "../utils/text.js";

async function bootstrapMember(request, env, auth, origin, profilePointStatement) {
  if (!auth.email) return json({ ok: false, error: "Firebase account has no email" }, 400, origin);
  let body = {};
  try { body = await request.json(); } catch {}
  const name = clean(body.name || auth.name || auth.email.split("@")[0]);
  const nickname = clean(body.nickname || "");
  const phone = clean(body.phone || "");
  if (name.length < 2 || name.length > 80) return json({ ok: false, error: "Invalid name" }, 400, origin);
  if (nickname.length > 40) return json({ ok: false, error: "Invalid nickname" }, 400, origin);
  if (phone.length > 30) return json({ ok: false, error: "Invalid phone" }, 400, origin);

  const existing = auth.member === undefined
    ? await env.DB.prepare("SELECT id, member_code FROM members WHERE id = ? LIMIT 1").bind(auth.uid).first()
    : auth.member;
  const memberCode = existing?.member_code || await createMemberCode(auth.uid);

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO members (id, member_code, email, name, nickname, phone, role, status, email_verified, last_login_at)
      VALUES (?, ?, ?, ?, ?, ?, 'member', 'active', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        email = excluded.email,
        name = excluded.name,
        nickname = excluded.nickname,
        phone = excluded.phone,
        email_verified = excluded.email_verified,
        updated_at = CURRENT_TIMESTAMP,
        last_login_at = CURRENT_TIMESTAMP
    `).bind(auth.uid, memberCode, auth.email.toLowerCase(), name, nickname || null, phone || null, auth.emailVerified ? 1 : 0),
    profilePointStatement(env, auth.uid),
  ]);

  return await getMember(env, auth, origin);
}

async function getMember(env, auth, origin) {
  const member = await env.DB.prepare(`
    SELECT id, member_code, email, name, nickname, phone, role, status, email_verified, created_at, updated_at
    FROM members WHERE id = ? LIMIT 1
  `).bind(auth.uid).first();

  if (!member) {
    return json({ ok: true, authenticated: true, profileExists: false, firebase: { uid: auth.uid, email: auth.email, emailVerified: auth.emailVerified, name: auth.name || "" } }, 200, origin);
  }

  const emailChanged = auth.email && member.email.toLowerCase() !== auth.email.toLowerCase();
  const verifiedChanged = !!member.email_verified !== !!auth.emailVerified;
  if (emailChanged || verifiedChanged) {
    await env.DB.prepare("UPDATE members SET email = ?, email_verified = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(auth.email.toLowerCase(), auth.emailVerified ? 1 : 0, auth.uid).run();
    member.email = auth.email.toLowerCase();
    member.email_verified = auth.emailVerified ? 1 : 0;
  }

  return json({ ok: true, authenticated: true, profileExists: true, member: publicMember(member) }, 200, origin);
}

async function createMemberCode(uid) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(uid));
  const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 10).toUpperCase();
  return `EU-${hex}`;
}

function publicMember(member) {
  return {
    id: member.id,
    memberCode: member.member_code,
    email: member.email,
    name: member.name,
    nickname: member.nickname || "",
    phone: member.phone || "",
    role: member.role,
    status: member.status,
    emailVerified: !!member.email_verified,
    createdAt: member.created_at,
    updatedAt: member.updated_at,
  };
}

export { bootstrapMember, getMember };
