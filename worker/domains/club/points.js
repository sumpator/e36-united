function ledgerInsertStatement(env, memberId, delta, sourceType, sourceKey, reason, eventId = null, relatedObjectId = null) {
  return env.DB.prepare(`
    INSERT OR IGNORE INTO united_points_ledger (
      id, member_id, delta, source_type, source_key, reason, event_id, related_object_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), memberId, delta, sourceType, sourceKey, reason, eventId, relatedObjectId);
}

function thresholdPointStatement(env, memberId, { delta, sourceType, sourceKey, reason, countSql, threshold }) {
  return env.DB.prepare(`
    INSERT OR IGNORE INTO united_points_ledger (
      id, member_id, delta, source_type, source_key, reason
    )
    SELECT ?, ?, ?, ?, ?, ?
    WHERE (${countSql}) >= ?
  `).bind(crypto.randomUUID(), memberId, delta, sourceType, sourceKey, reason, memberId, threshold);
}

function attendancePointStatements(env, claim) {
  return [
    ledgerInsertStatement(env, claim.member_id, 1, "attendance", `attendance:event:${claim.event_id}`, `Schválená účast na United ${claim.event_year}`, claim.event_id, claim.id),
    thresholdPointStatement(env, claim.member_id, {
      delta: 3,
      sourceType: "attendance_milestone",
      sourceKey: "attendance:milestone:3",
      reason: "Milník 3 schválených United",
      countSql: "SELECT COUNT(*) FROM united_history_claims WHERE member_id = ? AND attendance_status = 'approved'",
      threshold: 3,
    }),
    thresholdPointStatement(env, claim.member_id, {
      delta: 3,
      sourceType: "attendance_milestone",
      sourceKey: "attendance:milestone:5",
      reason: "Milník 5 schválených United",
      countSql: "SELECT COUNT(*) FROM united_history_claims WHERE member_id = ? AND attendance_status = 'approved'",
      threshold: 5,
    }),
  ];
}

function galleryPointStatements(env, memberId) {
  const countSql = "SELECT COUNT(*) FROM gallery_submissions WHERE member_id = ? AND status = 'approved'";
  return [
    thresholdPointStatement(env, memberId, { delta: 1, sourceType: "community_photo_milestone", sourceKey: "community-photos:5", reason: "5 schválených komunitních fotek", countSql, threshold: 5 }),
    thresholdPointStatement(env, memberId, { delta: 1, sourceType: "community_photo_milestone", sourceKey: "community-photos:25", reason: "25 schválených komunitních fotek", countSql, threshold: 25 }),
    thresholdPointStatement(env, memberId, { delta: 3, sourceType: "community_photo_milestone", sourceKey: "community-photos:50", reason: "50 schválených komunitních fotek", countSql, threshold: 50 }),
  ];
}

function profilePointStatement(env, memberId) {
  return env.DB.prepare(`
    INSERT OR IGNORE INTO united_points_ledger (
      id, member_id, delta, source_type, source_key, reason
    )
    SELECT ?, ?, 1, 'profile_completion', 'profile:complete', 'Kompletní United profil'
    WHERE EXISTS (
      SELECT 1 FROM members m
      WHERE m.id = ?
        AND trim(COALESCE(m.name, '')) <> ''
        AND trim(COALESCE(m.email, '')) <> ''
        AND trim(COALESCE(m.member_code, '')) <> ''
        AND m.history_completed_at IS NOT NULL
    )
      AND EXISTS (SELECT 1 FROM cars WHERE member_id = ?)
      AND (SELECT COUNT(*) FROM gallery_submissions WHERE member_id = ? AND status = 'approved') >= 5
  `).bind(crypto.randomUUID(), memberId, memberId, memberId, memberId);
}

function showShinePointStatements(env, claim) {
  const statements = [];
  const placement = Number(claim.sns_placement || 0);
  if ([1, 2, 3].includes(placement)) {
    const delta = placement === 1 ? 3 : placement === 2 ? 2 : 1;
    statements.push(ledgerInsertStatement(env, claim.member_id, delta, "show_shine_placement", `sns:placement:event:${claim.event_id}`, `Show & Shine ${placement}. místo · ${claim.event_year}`, claim.event_id, claim.id));
  }
  if (claim.sns_best_of_best) {
    statements.push(ledgerInsertStatement(env, claim.member_id, 1, "show_shine_award", `sns:best-of-best:event:${claim.event_id}`, `Best of the Best · ${claim.event_year}`, claim.event_id, claim.id));
  }
  if (claim.sns_best_exhaust) {
    statements.push(ledgerInsertStatement(env, claim.member_id, 1, "show_shine_award", `sns:best-exhaust:event:${claim.event_id}`, `Best Exhaust · ${claim.event_year}`, claim.event_id, claim.id));
  }
  return statements;
}

export {
  attendancePointStatements,
  galleryPointStatements,
  profilePointStatement,
  showShinePointStatements,
};
