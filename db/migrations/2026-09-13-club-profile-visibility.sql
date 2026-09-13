-- Club-profile privacy is opt-out. Existing and new members remain visible by default.
ALTER TABLE members ADD COLUMN hide_on_club INTEGER NOT NULL DEFAULT 0
  CHECK (hide_on_club IN (0, 1));

CREATE INDEX members_club_visibility
  ON members(status, hide_on_club, created_at DESC, id);

INSERT INTO schema_migrations(id, description)
VALUES('2026-09-13-club-profile-visibility', 'Add server-enforced United Club profile visibility');
