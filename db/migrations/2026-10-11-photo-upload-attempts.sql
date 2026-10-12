-- Additive: existing photographs, IDs, timestamps and references are untouched.
CREATE TABLE member_gallery_upload_attempts (
 attempt_id TEXT PRIMARY KEY,
 upload_id TEXT NOT NULL,
 member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 content_sha256 TEXT NOT NULL,
 r2_key TEXT NOT NULL UNIQUE,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','committed','failed')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 expires_at TEXT NOT NULL,
 cleanup_checked_at TEXT
);
CREATE INDEX member_gallery_upload_identity ON member_gallery_upload_attempts(member_id,upload_id);
CREATE INDEX member_gallery_upload_pending ON member_gallery_upload_attempts(member_id,state,expires_at);
CREATE INDEX IF NOT EXISTS gallery_member_upload_window ON gallery_submissions(member_id,created_at);
-- Also protects in-flight requests from the previous Worker during rollout.
-- LIVE inserts have event_id and retain their existing independent policy.
CREATE TRIGGER member_gallery_daily_limit BEFORE INSERT ON gallery_submissions
WHEN NEW.event_id IS NULL AND
 (SELECT COUNT(*) FROM gallery_submissions WHERE member_id=NEW.member_id AND created_at>=datetime('now','-1 day'))>=24
BEGIN SELECT RAISE(ABORT,'member_gallery_daily_limit'); END;
INSERT INTO schema_migrations(id,description) VALUES('2026-10-11-photo-upload-attempts','Fenced member gallery uploads and atomic rolling 24-hour quota');
