-- Additive only: no existing reservation, allocation, price, payment or QR changes.
CREATE TABLE event_preliminary_settings (
  event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 1,
  write_token TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE preliminary_reservations (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('active','cancelled','converted')),
  preferences_json TEXT NOT NULL CHECK(json_valid(preferences_json)),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(member_id,event_id)
);
CREATE INDEX idx_preliminary_event_status ON preliminary_reservations(event_id,status,updated_at DESC,id);
INSERT INTO schema_migrations(id,description) VALUES('2026-09-19-preliminary-reservations','Explicit non-binding member interest, separate from reservations');
