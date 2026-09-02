import { cors } from "../../http/cors.js";
import { readJsonObject } from "../../http/request.js";
import { json } from "../../http/responses.js";
import { clean } from "../../utils/text.js";
import { extensionFor, validateImageFile } from "../media.js";
import {
  attendancePointStatements,
  profilePointStatement,
  showShinePointStatements,
} from "./points.js";

const MAX_HISTORY_EVIDENCE = 4;
const SHOW_SHINE_CATEGORIES = new Set(["sedan", "coupe", "touring", "cabrio", "compact", "z3", "mpower"]);

async function getAdminHistoryCounts(env) {
  const row = await env.DB.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN c.attendance_status = 'pending' THEN 1 ELSE 0 END), 0) AS attendance_pending,
      COALESCE(SUM(CASE WHEN c.sns_status = 'pending' THEN 1 ELSE 0 END), 0) AS sns_pending,
      COALESCE(SUM(CASE WHEN c.attendance_status = 'pending' OR c.sns_status = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
      COALESCE(SUM(CASE WHEN c.attendance_status = 'approved' OR c.sns_status = 'approved' THEN 1 ELSE 0 END), 0) AS approved,
      COALESCE(SUM(CASE WHEN c.attendance_status = 'rejected' OR c.sns_status = 'rejected' THEN 1 ELSE 0 END), 0) AS rejected,
      MAX(CASE WHEN c.attendance_status = 'pending' OR c.sns_status = 'pending' THEN e.year END) AS latest_pending_year,
      MAX(e.year) AS latest_year,
      COUNT(*) AS total
    FROM united_history_claims c
    JOIN events e ON e.id = c.event_id
  `).first();
  const attendancePending = Number(row?.attendance_pending || 0);
  const snsPending = Number(row?.sns_pending || 0);
  const pending = Number(row?.pending || 0);
  const latestPendingYear = row?.latest_pending_year == null ? null : Number(row.latest_pending_year);
  const latestYear = row?.latest_year == null ? null : Number(row.latest_year);
  let latestYearPending = 0;
  if (latestPendingYear != null) {
    const latest = await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM united_history_claims c
      JOIN events e ON e.id = c.event_id
      WHERE e.year = ? AND (c.attendance_status = 'pending' OR c.sns_status = 'pending')
    `).bind(latestPendingYear).first();
    latestYearPending = Number(latest?.count || 0);
  }
  return {
    attendancePending,
    snsPending,
    pending,
    approved: Number(row?.approved || 0),
    rejected: Number(row?.rejected || 0),
    total: Number(row?.total || 0),
    latestPendingYear,
    latestYear,
    latestYearPending,
    olderPending: Math.max(0, pending - latestYearPending),
  };
}

async function getAdminHistoryClaims(env, url, origin) {
  const q = clean(url.searchParams.get("q")).slice(0, 120);
  const status = clean(url.searchParams.get("status") || "pending");
  const claimType = clean(url.searchParams.get("type") || "all");
  const requestedYear = clean(url.searchParams.get("year"));
  const page = Math.max(1, Math.min(10000, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1));
  const pageSize = Math.max(12, Math.min(50, Number.parseInt(url.searchParams.get("pageSize") || "24", 10) || 24));
  if (!["all", "pending", "approved", "rejected"].includes(status)) {
    return json({ ok: false, error: "invalid_status", message: "Neplatný filtr stavu." }, 400, origin);
  }
  if (!["all", "attendance", "show_shine", "best_of_best", "best_exhaust"].includes(claimType)) {
    return json({ ok: false, error: "invalid_claim_type", message: "Neplatný filtr typu žádosti." }, 400, origin);
  }
  if (requestedYear && requestedYear !== "all" && !/^\d{4}$/.test(requestedYear)) {
    return json({ ok: false, error: "invalid_year", message: "Neplatný filtr ročníku." }, 400, origin);
  }

  const counts = await getAdminHistoryCounts(env);
  const defaultYear = counts.latestPendingYear ?? counts.latestYear;
  const selectedYear = requestedYear === "all" ? null : requestedYear ? Number(requestedYear) : defaultYear;
  const yearsResult = await env.DB.prepare(`
    SELECT e.year,
      COUNT(*) AS total,
      SUM(CASE WHEN c.attendance_status = 'pending' OR c.sns_status = 'pending' THEN 1 ELSE 0 END) AS pending
    FROM united_history_claims c
    JOIN events e ON e.id = c.event_id
    GROUP BY e.year
    ORDER BY e.year DESC
  `).all();
  const years = (yearsResult.results || []).map(row => ({ year: Number(row.year), total: Number(row.total || 0), pending: Number(row.pending || 0) }));

  const where = [`(
    ? = '' OR lower(m.name) LIKE '%' || lower(?) || '%'
    OR lower(COALESCE(m.nickname, '')) LIKE '%' || lower(?) || '%'
    OR lower(m.email) LIKE '%' || lower(?) || '%'
    OR lower(m.member_code) LIKE '%' || lower(?) || '%'
  )`];
  const bindings = [q, q, q, q, q];
  if (selectedYear != null) { where.push("e.year = ?"); bindings.push(selectedYear); }

  const statusColumn = claimType === "attendance" ? "c.attendance_status" : "c.sns_status";
  if (status !== "all") {
    if (claimType === "all") {
      where.push("(c.attendance_status = ? OR c.sns_status = ?)");
      bindings.push(status, status);
    } else {
      where.push(`${statusColumn} = ?`);
      bindings.push(status);
    }
  }
  if (claimType === "show_shine") where.push("c.sns_competed = 1");
  if (claimType === "best_of_best") where.push("c.sns_competed = 1 AND c.sns_best_of_best = 1");
  if (claimType === "best_exhaust") where.push("c.sns_competed = 1 AND c.sns_best_exhaust = 1");

  const whereSql = where.join(" AND ");
  const totalRow = await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM united_history_claims c
    JOIN events e ON e.id = c.event_id
    JOIN members m ON m.id = c.member_id
    WHERE ${whereSql}
  `).bind(...bindings).first();
  const filteredTotal = Number(totalRow?.count || 0);
  const totalPages = Math.max(1, Math.ceil(filteredTotal / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;

  const rows = await env.DB.prepare(`
    SELECT
      c.*, e.year AS event_year, e.event_end_at,
      m.name AS member_name, m.nickname AS member_nickname,
      m.email AS member_email, m.member_code
    FROM united_history_claims c
    JOIN events e ON e.id = c.event_id
    JOIN members m ON m.id = c.member_id
    WHERE ${whereSql}
    ORDER BY
      CASE WHEN c.attendance_status = 'pending' OR c.sns_status = 'pending' THEN 0 ELSE 1 END,
      e.year DESC,
      c.submitted_at DESC
    LIMIT ? OFFSET ?
  `).bind(...bindings, pageSize, offset).all();
  const claims = (rows.results || []).map(publicAdminHistoryClaim);
  await attachHistoryEvidence(env, claims, true);
  return json({
    ok: true,
    claims,
    counts,
    facets: { years },
    filters: { status, type: claimType, year: selectedYear == null ? "all" : String(selectedYear), q },
    pagination: { page: safePage, pageSize, total: filteredTotal, totalPages },
  }, 200, origin);
}

function publicAdminHistoryClaim(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    eventYear: Number(row.event_year || 0),
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
    attendance: { status: row.attendance_status, reviewNote: row.attendance_review_note || "", reviewedAt: row.attendance_reviewed_at || null },
    showShine: {
      competed: !!row.sns_competed,
      category: row.sns_category || "",
      placement: row.sns_placement ? Number(row.sns_placement) : null,
      bestOfBest: !!row.sns_best_of_best,
      bestExhaust: !!row.sns_best_exhaust,
      status: row.sns_status,
      reviewNote: row.sns_review_note || "",
      reviewedAt: row.sns_reviewed_at || null,
    },
    member: { id: row.member_id, name: row.member_name || "", nickname: row.member_nickname || "", email: row.member_email || "", memberCode: row.member_code || "" },
    evidence: [],
  };
}

async function attachHistoryEvidence(env, claims, admin = false) {
  if (!claims.length) return claims;
  const ids = claims.map(item => item.id);
  const placeholders = ids.map(() => "?").join(",");
  const rows = await env.DB.prepare(`
    SELECT id, claim_id, mime_type, size_bytes, sort_order, created_at
    FROM united_history_evidence
    WHERE claim_id IN (${placeholders})
    ORDER BY sort_order, created_at
  `).bind(...ids).all();
  const byClaim = new Map(claims.map(item => [item.id, item]));
  for (const row of rows.results || []) {
    const claim = byClaim.get(row.claim_id);
    if (claim) claim.evidence.push({ id: row.id, mimeType: row.mime_type, sizeBytes: Number(row.size_bytes || 0), createdAt: row.created_at, imageUrl: `${admin ? "/api/admin" : "/api"}/history/evidence/${encodeURIComponent(row.id)}` });
  }
  return claims;
}

async function historyEvidenceMedia(env, evidenceId, memberId, origin) {
  const row = memberId
    ? await env.DB.prepare("SELECT r2_key, mime_type FROM united_history_evidence WHERE id = ? AND member_id = ? LIMIT 1").bind(evidenceId, memberId).first()
    : await env.DB.prepare("SELECT r2_key, mime_type FROM united_history_evidence WHERE id = ? LIMIT 1").bind(evidenceId).first();
  if (!row) return json({ ok: false, error: "evidence_not_found", message: "Důkazní fotografie nebyla nalezena." }, 404, origin);
  const object = await env.MEDIA.get(row.r2_key);
  if (!object) return json({ ok: false, error: "media_not_found", message: "Soubor důkazu nebyl nalezen." }, 404, origin);
  const headers = new Headers({ "Content-Type": row.mime_type || "image/jpeg", "Cache-Control": "private, no-store" });
  return cors(new Response(object.body, { status: 200, headers }), origin);
}

async function patchAdminHistoryClaim(request, env, auth, claimId, component, origin) {
  const parsed = await readJsonObject(request, origin);
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  if (Object.keys(body).some(key => !new Set(["status", "reviewNote"]).has(key))) {
    return json({ ok: false, error: "invalid_fields", message: "Lze změnit pouze stav a důvod rozhodnutí." }, 400, origin);
  }
  const status = clean(body.status);
  const reviewNote = clean(body.reviewNote).slice(0, 1000);
  if (!["approved", "rejected"].includes(status)) return json({ ok: false, error: "invalid_status", message: "Rozhodnutí musí být schváleno nebo zamítnuto." }, 400, origin);
  if (status === "rejected" && !reviewNote) return json({ ok: false, error: "rejection_reason_required", message: "Při zamítnutí je důvod povinný." }, 400, origin);

  const claim = await env.DB.prepare(`
    SELECT c.*, e.year AS event_year
    FROM united_history_claims c JOIN events e ON e.id = c.event_id
    WHERE c.id = ? LIMIT 1
  `).bind(claimId).first();
  if (!claim) return json({ ok: false, error: "claim_not_found", message: "Žádost nebyla nalezena." }, 404, origin);
  if (component === "sns" && claim.sns_status === "not_claimed") return json({ ok: false, error: "sns_not_claimed", message: "Show & Shine nebylo nárokováno." }, 409, origin);
  if (component === "sns" && status === "approved" && claim.attendance_status !== "approved") {
    return json({ ok: false, error: "attendance_not_approved", message: "Nejdřív schval docházku na United." }, 409, origin);
  }
  const currentStatus = component === "attendance" ? claim.attendance_status : claim.sns_status;
  const currentNote = (component === "attendance" ? claim.attendance_review_note : claim.sns_review_note) || "";
  if (currentStatus === status && currentNote === reviewNote) return json({ ok: true, unchanged: true }, 200, origin);
  if (currentStatus === "approved") {
    return json({ ok: false, error: "approved_history_locked", message: "Schválený výsledek je uzamčený. Destruktivní oprava vyžaduje samostatný Admin reversal workflow." }, 409, origin);
  }

  const statusColumn = component === "attendance" ? "attendance_status" : "sns_status";
  const noteColumn = component === "attendance" ? "attendance_review_note" : "sns_review_note";
  const byColumn = component === "attendance" ? "attendance_reviewed_by" : "sns_reviewed_by";
  const atColumn = component === "attendance" ? "attendance_reviewed_at" : "sns_reviewed_at";
  const oldState = JSON.stringify({ component, status: currentStatus, reviewNote: currentNote });
  const newState = JSON.stringify({ component, status, reviewNote });
  const statements = [
    env.DB.prepare(`UPDATE united_history_claims SET ${statusColumn} = ?, ${noteColumn} = ?, ${byColumn} = ?, ${atColumn} = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(status, reviewNote || null, auth.uid, claimId),
    env.DB.prepare(`
      INSERT INTO admin_actions (id, admin_member_id, action_type, entity_type, entity_id, old_state_json, new_state_json, note, created_at)
      VALUES (?, ?, ?, 'united_history_claim', ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(crypto.randomUUID(), auth.uid, `history_${component}_reviewed`, claimId, oldState, newState, reviewNote || null),
  ];
  if (status === "approved" && component === "attendance") statements.push(...attendancePointStatements(env, claim), profilePointStatement(env, claim.member_id));
  if (status === "approved" && component === "sns") statements.push(...showShinePointStatements(env, claim));
  const results = await env.DB.batch(statements);
  if (!results[0]?.meta?.changes) throw new Error("History claim was not updated");
  return json({ ok: true, claimId, component, status, reviewNote }, 200, origin);
}

function formBoolean(value) {
  return ["1", "true", "yes", "on"].includes(clean(value).toLowerCase());
}

function parseShowShineClaim(form, origin) {
  const competed = formBoolean(form.get("snsCompeted"));
  if (!competed) return { value: { competed: false, category: null, placement: null, bestOfBest: false, bestExhaust: false, status: "not_claimed" } };
  const category = clean(form.get("snsCategory")).toLowerCase();
  const rawPlacement = clean(form.get("snsPlacement"));
  const placement = rawPlacement ? Number(rawPlacement) : null;
  if (!SHOW_SHINE_CATEGORIES.has(category)) return { response: json({ ok: false, error: "invalid_sns_category", message: "Vyber platnou Show & Shine kategorii." }, 400, origin) };
  if (placement !== null && ![1, 2, 3].includes(placement)) return { response: json({ ok: false, error: "invalid_sns_placement", message: "Umístění může být pouze 1., 2. nebo 3. místo." }, 400, origin) };
  return { value: { competed: true, category, placement, bestOfBest: formBoolean(form.get("snsBestOfBest")), bestExhaust: formBoolean(form.get("snsBestExhaust")), status: "pending" } };
}

async function submitHistoryClaim(request, env, auth, origin) {
  let form;
  try { form = await request.formData(); } catch { return json({ ok: false, error: "invalid_form", message: "Formulář se nepodařilo přečíst." }, 400, origin); }
  const eventId = clean(form.get("eventId"));
  const event = await env.DB.prepare(`
    SELECT id, year, event_end_at FROM events
    WHERE id = ? AND event_end_at IS NOT NULL AND date(event_end_at) < date('now')
    LIMIT 1
  `).bind(eventId).first();
  if (!event) return json({ ok: false, error: "event_not_concluded", message: "Historii lze upravit jen u skutečně skončeného ročníku." }, 409, origin);
  const parsedSns = parseShowShineClaim(form, origin);
  if (parsedSns.response) return parsedSns.response;
  const sns = parsedSns.value;
  const existing = await env.DB.prepare("SELECT * FROM united_history_claims WHERE member_id = ? AND event_id = ? LIMIT 1").bind(auth.uid, eventId).first();

  if (existing?.attendance_status === "approved") {
    if (!sns.competed) return json({ ok: false, error: "attendance_locked", message: "Schválenou docházku už nelze odebrat. Lze pouze doplnit Show & Shine." }, 409, origin);
    if (["pending", "approved"].includes(existing.sns_status)) return json({ ok: false, error: "sns_locked", message: "Show & Shine už čeká na kontrolu nebo je schválené." }, 409, origin);
    await env.DB.prepare(`
      UPDATE united_history_claims
      SET sns_competed = 1, sns_category = ?, sns_placement = ?, sns_best_of_best = ?, sns_best_exhaust = ?,
          sns_status = 'pending', sns_review_note = NULL, sns_reviewed_by = NULL, sns_reviewed_at = NULL,
          submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND member_id = ?
    `).bind(sns.category, sns.placement, sns.bestOfBest ? 1 : 0, sns.bestExhaust ? 1 : 0, existing.id, auth.uid).run();
    return json({ ok: true, claimId: existing.id, attendanceStatus: "approved", snsStatus: "pending" }, 200, origin);
  }
  if (existing?.attendance_status === "pending") return json({ ok: false, error: "claim_pending", message: "Tento ročník už čeká na kontrolu." }, 409, origin);

  const files = form.getAll("files");
  if (!files.length || files.length > MAX_HISTORY_EVIDENCE) return json({ ok: false, error: "evidence_required", message: `Přilož 1 až ${MAX_HISTORY_EVIDENCE} důkazní fotografie.` }, 400, origin);
  for (const file of files) {
    const validation = validateImageFile(file);
    if (validation) return json({ ok: false, error: "invalid_evidence", message: validation }, 400, origin);
  }

  const claimId = existing?.id || crypto.randomUUID();
  const uploaded = [];
  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const evidenceId = crypto.randomUUID();
      const key = `history-proof/${auth.uid}/${claimId}/${evidenceId}.${extensionFor(file.type)}`;
      await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { owner: auth.uid, kind: "history-proof", claimId, evidenceId } });
      uploaded.push({ id: evidenceId, key, file, index });
    }
    const statements = [];
    if (existing) {
      statements.push(env.DB.prepare(`
        UPDATE united_history_claims
        SET attendance_status = 'pending', attendance_review_note = NULL, attendance_reviewed_by = NULL, attendance_reviewed_at = NULL,
            sns_competed = ?, sns_category = ?, sns_placement = ?, sns_best_of_best = ?, sns_best_exhaust = ?, sns_status = ?,
            sns_review_note = NULL, sns_reviewed_by = NULL, sns_reviewed_at = NULL,
            submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND member_id = ?
      `).bind(sns.competed ? 1 : 0, sns.category, sns.placement, sns.bestOfBest ? 1 : 0, sns.bestExhaust ? 1 : 0, sns.status, claimId, auth.uid));
      statements.push(env.DB.prepare("DELETE FROM united_history_evidence WHERE claim_id = ? AND member_id = ?").bind(claimId, auth.uid));
    } else {
      statements.push(env.DB.prepare(`
        INSERT INTO united_history_claims (
          id, member_id, event_id, attendance_status,
          sns_competed, sns_category, sns_placement, sns_best_of_best, sns_best_exhaust, sns_status
        ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)
      `).bind(claimId, auth.uid, eventId, sns.competed ? 1 : 0, sns.category, sns.placement, sns.bestOfBest ? 1 : 0, sns.bestExhaust ? 1 : 0, sns.status));
    }
    for (const item of uploaded) {
      statements.push(env.DB.prepare(`INSERT INTO united_history_evidence (id, claim_id, member_id, r2_key, mime_type, size_bytes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(item.id, claimId, auth.uid, item.key, item.file.type, item.file.size, item.index));
    }
    const previous = existing ? await env.DB.prepare("SELECT r2_key FROM united_history_evidence WHERE claim_id = ? AND member_id = ?").bind(claimId, auth.uid).all() : { results: [] };
    await env.DB.batch(statements);
    for (const item of previous.results || []) {
      try { await env.MEDIA.delete(item.r2_key); } catch (error) { console.warn("Unable to delete replaced history evidence", error); }
    }
  } catch (error) {
    for (const item of uploaded) {
      try { await env.MEDIA.delete(item.key); } catch (cleanupError) { console.warn("Unable to clean up history evidence", cleanupError); }
    }
    throw error;
  }
  return json({ ok: true, claimId, attendanceStatus: "pending", snsStatus: sns.status }, existing ? 200 : 201, origin);
}

export {
  attachHistoryEvidence,
  getAdminHistoryClaims,
  getAdminHistoryCounts,
  historyEvidenceMedia,
  patchAdminHistoryClaim,
  submitHistoryClaim,
};
