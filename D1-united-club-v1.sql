-- United Club v1: reviewed history claims, private evidence and immutable Points.
-- This migration intentionally does not seed historical claims or points.

ALTER TABLE events ADD COLUMN event_end_at TEXT;
ALTER TABLE members ADD COLUMN history_completed_at TEXT;

CREATE TABLE IF NOT EXISTS united_history_claims (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  attendance_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (attendance_status IN ('pending', 'approved', 'rejected')),
  attendance_review_note TEXT,
  attendance_reviewed_by TEXT,
  attendance_reviewed_at TEXT,
  sns_competed INTEGER NOT NULL DEFAULT 0 CHECK (sns_competed IN (0, 1)),
  sns_category TEXT,
  sns_placement INTEGER CHECK (sns_placement IN (1, 2, 3)),
  sns_best_of_best INTEGER NOT NULL DEFAULT 0 CHECK (sns_best_of_best IN (0, 1)),
  sns_best_exhaust INTEGER NOT NULL DEFAULT 0 CHECK (sns_best_exhaust IN (0, 1)),
  sns_status TEXT NOT NULL DEFAULT 'not_claimed'
    CHECK (sns_status IN ('not_claimed', 'pending', 'approved', 'rejected')),
  sns_review_note TEXT,
  sns_reviewed_by TEXT,
  sns_reviewed_at TEXT,
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (member_id, event_id),
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (attendance_reviewed_by) REFERENCES members(id) ON DELETE SET NULL,
  FOREIGN KEY (sns_reviewed_by) REFERENCES members(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS united_history_evidence (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (claim_id) REFERENCES united_history_claims(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS united_points_ledger (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  delta INTEGER NOT NULL CHECK (delta <> 0),
  source_type TEXT NOT NULL,
  source_key TEXT NOT NULL,
  reason TEXT NOT NULL,
  event_id TEXT,
  related_object_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (member_id, source_key),
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_united_history_claims_attendance
  ON united_history_claims(attendance_status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_united_history_claims_sns
  ON united_history_claims(sns_status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_united_history_claims_member
  ON united_history_claims(member_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_united_history_evidence_claim
  ON united_history_evidence(claim_id, sort_order, created_at);
CREATE INDEX IF NOT EXISTS idx_united_points_member
  ON united_points_ledger(member_id, created_at DESC);

CREATE TRIGGER IF NOT EXISTS united_points_ledger_no_update
BEFORE UPDATE ON united_points_ledger
BEGIN
  SELECT RAISE(ABORT, 'united_points_ledger is immutable');
END;

CREATE TRIGGER IF NOT EXISTS united_points_ledger_no_delete
BEFORE DELETE ON united_points_ledger
BEGIN
  SELECT RAISE(ABORT, 'united_points_ledger is immutable');
END;
