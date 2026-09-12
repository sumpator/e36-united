-- Member acknowledgement is request-specific and server-persisted.
-- Existing decided requests intentionally keep the natural NULL default.
ALTER TABLE reservation_requests ADD COLUMN member_acknowledged_at TEXT;

INSERT INTO schema_migrations(id,description)
VALUES('2026-09-12-reservation-request-acknowledgement','Persist member acknowledgement of an approved reservation change');
