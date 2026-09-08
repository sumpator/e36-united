import { validatePlannerDraft } from '../../../planner-state.js';
import { json } from '../../http/responses.js';
import { getRequestedAdminEvent } from '../events.js';

const draftKeys = new Set(['version','draftId','source','eventYear','eventId','createdAt','expiresAt','arrival','departure','nights','attendanceType','accommodation','accommodationOptionId','accommodationUnits','crew','showShine']);

// Bound bytes even when Content-Length is absent or untrusted.
export async function readTrackingBody(request, limit = 4096) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error('invalid_tracking_payload');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('invalid_tracking_payload');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error('tracking_payload_too_large'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid_tracking_payload');
    return body;
  } finally { reader.releaseLock(); }
}

export async function trackPlannerHandoff(request, env, auth, origin) {
  let body;
  try { body = await readTrackingBody(request); } catch { return json({ error: 'invalid_tracking_payload' }, 400, origin); }
  const candidate = body.draft;
  if (Object.keys(body).some(key => key !== 'draft') || !candidate || typeof candidate !== 'object' || Object.keys(candidate).some(key => !draftKeys.has(key))) return json({ error: 'invalid_planner_draft' }, 400, origin);
  const draft = validatePlannerDraft(candidate);
  if (!draft) return json({ error: 'invalid_planner_draft' }, 400, origin);
  return persistPlannerHandoff(draft,env,auth,origin);
}

async function persistPlannerHandoff(draft,env,auth,origin) {
  const event = draft.eventId
    ? await env.DB.prepare('SELECT id, year FROM events WHERE id = ?').bind(draft.eventId).first()
    : await env.DB.prepare('SELECT id, year FROM events WHERE year = ?').bind(draft.eventYear).first();
  if (!event || Number(event.year) !== draft.eventYear) return json({ error: 'planner_event_not_found' }, 400, origin);
  const now = new Date().toISOString(), payload = JSON.stringify({ ...draft, eventId: event.id });
  const statements = [env.DB.prepare(`INSERT INTO public_planner_handoffs
    (draft_id,event_id,event_year,created_at,expires_at,payload_json) VALUES (?,?,?,?,?,?)
    ON CONFLICT(draft_id) DO NOTHING`).bind(draft.draftId,event.id,draft.eventYear,now,draft.expiresAt,payload)];
  if (auth) statements.push(env.DB.prepare(`UPDATE public_planner_handoffs
    SET member_id=?, member_claimed_at=COALESCE(member_claimed_at,?), member_portal_opened_at=COALESCE(member_portal_opened_at,?)
    WHERE draft_id=? AND event_id=? AND payload_json=? AND (member_id IS NULL OR member_id=?)`)
    .bind(auth.uid,now,now,draft.draftId,event.id,payload,auth.uid));
  const results = await env.DB.batch(statements);
  if (auth && !results[1]?.meta?.changes) return json({ error: 'planner_claim_conflict' }, 409, origin);
  // Anonymous callers cannot read identity or claim state from this endpoint.
  return json({ ok: true }, 200, origin);
}

export async function trackOnboarding(request, env, auth, origin) {
  let body;
  try { body = await readTrackingBody(request, 128); } catch { return json({ error: 'invalid_onboarding_event' }, 400, origin); }
  if (Object.keys(body).some(key => key !== 'stage') || !['seen','profile','portal'].includes(body.stage)) return json({ error: 'invalid_onboarding_event' }, 400, origin);
  const profile = await env.DB.prepare('SELECT id, status FROM members WHERE id = ?').bind(auth.uid).first();
  if (profile && profile.status !== 'active') return json({ error: 'member_inactive' }, 403, origin);
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO member_onboarding
    (firebase_uid,email,firebase_account_seen_at,member_profile_created_at,first_portal_loaded_at,updated_at)
    VALUES (?,?,?,?,?,?) ON CONFLICT(firebase_uid) DO UPDATE SET email=excluded.email,
    member_profile_created_at=COALESCE(member_onboarding.member_profile_created_at,excluded.member_profile_created_at),
    first_portal_loaded_at=COALESCE(member_onboarding.first_portal_loaded_at,excluded.first_portal_loaded_at),updated_at=excluded.updated_at`)
    .bind(auth.uid,auth.email||'',now,profile?now:null,profile&&body.stage==='portal'?now:null,now).run();
  return json({ ok: true }, 200, origin);
}

export async function markProfileCompletion(env, uid) {
  // Only update a forward-observed identity, never backfill existing accounts.
  try { await env.DB.prepare(`UPDATE member_onboarding SET member_profile_created_at=COALESCE(member_profile_created_at,?), updated_at=? WHERE firebase_uid=?`)
    .bind(new Date().toISOString(),new Date().toISOString(),uid).run(); }
  catch { console.warn('onboarding_profile_tracking_unavailable'); }
}

export async function linkPlannerReservation(env, { draftId, uid, eventId, reservationId, ownedDraft = null }) {
  if (!/^[0-9a-f-]{36}$/i.test(draftId || '')) return;
  try {
    // A fast submit can overtake the client's best-effort claim. The server's UID-scoped
    // saved draft is captured before reservation consumption and safely closes that race.
    const draft=validatePlannerDraft(ownedDraft);
    if(draft?.draftId===draftId&&draft.eventId===eventId)await persistPlannerHandoff(draft,env,{uid},'');
    await env.DB.prepare(`UPDATE public_planner_handoffs SET reservation_id=?,reservation_created_at=COALESCE(reservation_created_at,?)
      WHERE draft_id=? AND member_id=? AND event_id=?
      AND EXISTS (SELECT 1 FROM reservations WHERE id=? AND member_id=? AND event_id=?)`)
      .bind(reservationId,new Date().toISOString(),draftId,uid,eventId,reservationId,uid,eventId).run();
  } catch { console.warn('planner_conversion_tracking_unavailable'); }
}

export async function getAdminFunnel(env, url, origin) {
  const event = await getRequestedAdminEvent(env, url);
  if (!event && url.searchParams.has('eventId')) return json({ error: 'event_not_found' }, 404, origin);
  const eventId = event?.id || '';
  const [members,incomplete,plans,incompleteRows,claimedRows,anonymousRows] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS count FROM members').first(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM member_onboarding WHERE member_profile_created_at IS NULL AND NOT EXISTS (SELECT 1 FROM members WHERE members.id=member_onboarding.firebase_uid)').first(),
    env.DB.prepare(`SELECT COUNT(*) AS created, COALESCE(SUM(member_claimed_at IS NOT NULL),0) AS claimed,
      COALESCE(SUM(member_portal_opened_at IS NOT NULL),0) AS opened, COALESCE(SUM(reservation_created_at IS NOT NULL),0) AS converted,
      COALESCE(SUM(member_claimed_at IS NULL),0) AS unclaimed,
      COALESCE(SUM(member_claimed_at IS NOT NULL AND reservation_created_at IS NULL),0) AS claimedWithoutReservation
      FROM public_planner_handoffs WHERE event_id=?`).bind(eventId).first(),
    env.DB.prepare('SELECT email,firebase_account_seen_at FROM member_onboarding WHERE member_profile_created_at IS NULL AND NOT EXISTS (SELECT 1 FROM members WHERE members.id=member_onboarding.firebase_uid) ORDER BY firebase_account_seen_at DESC LIMIT 50').all(),
    env.DB.prepare(`SELECT h.created_at,h.payload_json,m.name,m.email FROM public_planner_handoffs h
      LEFT JOIN members m ON m.id=h.member_id WHERE h.event_id=? AND h.member_claimed_at IS NOT NULL AND h.reservation_created_at IS NULL ORDER BY h.created_at DESC LIMIT 50`).bind(eventId).all(),
    env.DB.prepare(`SELECT created_at,payload_json FROM public_planner_handoffs WHERE event_id=? AND member_claimed_at IS NULL ORDER BY created_at DESC LIMIT 50`).bind(eventId).all(),
  ]);
  return json({ ok: true, eventId: event?.id || null, forwardOnly: true, detailLimit: 50,
    counts: { members: members?.count||0, incomplete: incomplete?.count||0, ...plans },
    details: { incomplete: incompleteRows.results||[], claimedWithoutReservation: claimedRows.results||[], unclaimed: anonymousRows.results||[] },
  }, 200, origin);
}
