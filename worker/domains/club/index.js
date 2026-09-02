import { json } from "../../http/responses.js";
import { clean } from "../../utils/text.js";
import { deriveMemberRating, deriveUnitedAchievements } from "./achievements.js";
import { attachHistoryEvidence } from "./history.js";
import { profilePointStatement } from "./points.js";

const UNITED_REWARD_THRESHOLD = 12;

async function completeMemberHistory(env, auth, origin) {
  const results = await env.DB.batch([
    env.DB.prepare("UPDATE members SET history_completed_at = COALESCE(history_completed_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(auth.uid),
    profilePointStatement(env, auth.uid),
  ]);
  if (!results[0]?.meta?.changes) return json({ ok: false, error: "member_not_found", message: "Členský profil nebyl nalezen." }, 404, origin);
  return json({ ok: true }, 200, origin);
}

async function getUnitedClub(env, auth, origin) {
  const member = await env.DB.prepare("SELECT id, name, email, member_code, history_completed_at FROM members WHERE id = ? LIMIT 1").bind(auth.uid).first();
  if (!member) return json({ ok: false, error: "member_not_found", message: "Členský profil nebyl nalezen." }, 404, origin);
  const rows = await env.DB.prepare(`
    SELECT
      e.id AS event_id, e.year AS event_year, e.event_end_at,
      c.id, c.attendance_status, c.attendance_review_note, c.attendance_reviewed_at,
      c.sns_competed, c.sns_category, c.sns_placement, c.sns_best_of_best, c.sns_best_exhaust,
      c.sns_status, c.sns_review_note, c.sns_reviewed_at, c.submitted_at, c.updated_at
    FROM events e
    LEFT JOIN united_history_claims c ON c.event_id = e.id AND c.member_id = ?
    ORDER BY e.year DESC
  `).bind(auth.uid).all();
  const history = (rows.results || []).map(row => ({
    id: row.id || null,
    eventId: row.event_id,
    eventYear: Number(row.event_year || 0),
    eventEndAt: row.event_end_at || null,
    concluded: !!row.event_end_at && row.event_end_at < new Date().toISOString().slice(0, 10),
    attendance: { status: row.attendance_status || "not_claimed", reviewNote: row.attendance_review_note || "", reviewedAt: row.attendance_reviewed_at || null },
    showShine: { competed: !!row.sns_competed, category: row.sns_category || "", placement: row.sns_placement ? Number(row.sns_placement) : null, bestOfBest: !!row.sns_best_of_best, bestExhaust: !!row.sns_best_exhaust, status: row.sns_status || "not_claimed", reviewNote: row.sns_review_note || "", reviewedAt: row.sns_reviewed_at || null },
    submittedAt: row.submitted_at || null,
    updatedAt: row.updated_at || null,
    evidence: [],
  }));
  await attachHistoryEvidence(env, history.filter(item => item.id), false);
  const pointRow = await env.DB.prepare(`
    SELECT COALESCE(SUM(delta), 0) AS available, COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0) AS lifetime
    FROM united_points_ledger WHERE member_id = ?
  `).bind(auth.uid).first();
  const photoRow = await env.DB.prepare("SELECT COUNT(*) AS count FROM gallery_submissions WHERE member_id = ? AND status = 'approved'").bind(auth.uid).first();
  const carRow = await env.DB.prepare("SELECT COUNT(*) AS count FROM cars WHERE member_id = ?").bind(auth.uid).first();
  const approvedPhotoCount = Number(photoRow?.count || 0);
  const available = Number(pointRow?.available || 0);
  const lifetime = Number(pointRow?.lifetime || 0);
  const derived = deriveUnitedAchievements(history, approvedPhotoCount);
  const approvedYears = history.filter(item => item.attendance.status === "approved").map(item => item.eventYear);
  const profileCriteria = {
    requiredFields: !!(clean(member.name) && clean(member.email) && clean(member.member_code)),
    historyReviewed: !!member.history_completed_at,
    hasCar: Number(carRow?.count || 0) > 0,
    approvedPhotos: approvedPhotoCount,
  };
  return json({
    ok: true,
    points: { available, lifetime },
    rewardThreshold: UNITED_REWARD_THRESHOLD,
    rating: deriveMemberRating(lifetime),
    memberSince: approvedYears.length ? Math.min(...approvedYears) : null,
    historyCompletedAt: member.history_completed_at || null,
    history,
    approvedPhotoCount,
    profileCompletion: { ...profileCriteria, complete: profileCriteria.requiredFields && profileCriteria.historyReviewed && profileCriteria.hasCar && approvedPhotoCount >= 5 },
    achievements: derived.achievements,
    featuredAchievements: derived.featured,
  }, 200, origin);
}

export {
  completeMemberHistory,
  deriveMemberRating,
  deriveUnitedAchievements,
  getUnitedClub,
};
