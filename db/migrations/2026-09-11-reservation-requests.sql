-- Forward-only reservation change/cancellation requests.
-- Apply after 2026-09-08-admin-preferences. No historical request rows are invented.
PRAGMA foreign_keys = ON;

CREATE TABLE reservation_requests (
  id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK(request_type IN ('change','cancellation')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  original_json TEXT NOT NULL CHECK(json_valid(original_json)),
  proposed_json TEXT CHECK(proposed_json IS NULL OR json_valid(proposed_json)),
  member_note TEXT,
  admin_comment TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at TEXT,
  decided_by TEXT REFERENCES members(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX reservation_requests_one_pending
  ON reservation_requests(reservation_id) WHERE status='pending';
CREATE INDEX reservation_requests_reservation_history
  ON reservation_requests(reservation_id,created_at DESC,id);
CREATE INDEX reservation_requests_admin_queue
  ON reservation_requests(status,created_at DESC,id);

-- Public decision text is intentionally separate from reservations.review_note,
-- which remains an internal Admin note and is never returned to members.
CREATE TABLE reservation_member_comments (
  reservation_id TEXT PRIMARY KEY REFERENCES reservations(id) ON DELETE CASCADE,
  member_comment TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT REFERENCES members(id) ON DELETE SET NULL
);

CREATE TRIGGER admin_version_reservation_requests_insert AFTER INSERT ON reservation_requests
BEGIN
  INSERT INTO admin_resource_versions(resource_type,resource_id,revision)
  VALUES('reservation',NEW.reservation_id,1)
  ON CONFLICT(resource_type,resource_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER admin_version_reservation_requests_update AFTER UPDATE ON reservation_requests
BEGIN
  INSERT INTO admin_resource_versions(resource_type,resource_id,revision)
  VALUES('reservation',NEW.reservation_id,1)
  ON CONFLICT(resource_type,resource_id) DO UPDATE SET revision=revision+1;
END;

INSERT INTO schema_migrations(id,description)
VALUES('2026-09-11-reservation-requests','Member reservation requests, public decision comments and review history');
